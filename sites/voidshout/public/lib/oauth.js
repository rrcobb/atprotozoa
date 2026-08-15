// oauth.js — browser-side atproto OAuth (public client), for voidshout.bisks.net.
//
// Copied and trimmed from sites/hyperobject/public/lib/oauth.js (same repo),
// itself descended from trigrams/mino.mobi's flow. Public client:
//   - token_endpoint_auth_method: none  → no client_assertion anywhere
//   - PKCE + DPoP only (see oauth-jwt.js)
//   - transient auth state → sessionStorage; the logged-in session → IndexedDB
//
// Scope is narrow `repo:` grants, one per collection this app actually
// writes to (see notes/50-oauth-scopes.md) — never the broad
// `transition:generic`. Reads (listRecords/getRecord against a PDS) are
// public and unauthenticated, so they don't need a scope grant at all; only
// writes go through dpopFetch. Alongside the five net.bisks.void.* grants,
// two `app.bsky.feed.*` create-only grants let /shout/'s "post directly" and
// "repost" buttons write a REAL Bluesky post/repost to the signed-in
// member's own repo — create-only, since neither button ever edits or
// deletes one. This SCOPE string must stay byte-identical with
// client-metadata.json's `scope` field or the PDS rejects the authorize
// request outright.

import {
  generateDPoPKeyPair,
  serializeDPoPKeyPair,
  deserializeDPoPKeyPair,
  createDPoPProof,
  generateCodeVerifier,
  computeCodeChallenge,
  generateState,
  jwtExp,
} from "./oauth-jwt.js";

const ORIGIN = location.origin; // https://voidshout.bisks.net (or localhost in dev)
export const MOUNT = ""; // canonical host is voidshout.bisks.net — no path mount
export const CLIENT_ID = `${ORIGIN}${MOUNT}/client-metadata.json`;
export const REDIRECT_URI = `${ORIGIN}${MOUNT}/`; // must be listed in client-metadata.json
export const SCOPE =
  "atproto repo:net.bisks.void.shout?action=create&action=delete " +
  "repo:net.bisks.void.echo?action=create&action=delete " +
  "repo:net.bisks.void.murmur?action=create&action=delete " +
  "repo:net.bisks.void.vote repo:net.bisks.void.participation " +
  "repo:app.bsky.feed.post?action=create repo:app.bsky.feed.repost?action=create";

const BSKY_PUBLIC_API = "https://api.bsky.app";
const PLC_DIR = "https://plc.directory";

// --- identity resolution (handle -> DID -> PDS -> auth server) ---------------
// Exported: shared across every voidshout page that needs to resolve a
// stranger's handle/PDS (profile view, vote-geography, echo-tree authors)
// without duplicating this dance five times.

export async function resolveHandle(handle) {
  const r = await fetch(
    `${BSKY_PUBLIC_API}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`,
  );
  if (!r.ok) return null;
  return (await r.json()).did || null;
}

export async function resolveDidDoc(did) {
  try {
    if (did.startsWith("did:plc:")) {
      const r = await fetch(`${PLC_DIR}/${did}`);
      if (r.ok) return await r.json();
    } else if (did.startsWith("did:web:")) {
      const domain = did.replace("did:web:", "").split(":").join("/");
      const r = await fetch(`https://${domain}/.well-known/did.json`);
      if (r.ok) return await r.json();
    }
  } catch {}
  return null;
}

// DID -> handle, via the DID doc's alsoKnownAs (`at://<handle>`). Always
// re-resolved live, never cached long-term — a profile must show the
// *current* handle even after the owner renames.
export async function resolveHandleForDid(did) {
  const doc = await resolveDidDoc(did);
  const aka = (doc?.alsoKnownAs || []).find((a) => a.startsWith("at://"));
  if (aka) return aka.slice("at://".length);
  return did;
}

export function pdsFromDoc(doc) {
  const svc = (doc?.service || []).find(
    (s) => s.id === "#atproto_pds" || s.type === "AtprotoPersonalDataServer",
  );
  return svc?.serviceEndpoint || null;
}

export async function resolvePds(did) {
  const doc = await resolveDidDoc(did);
  return pdsFromDoc(doc);
}

async function fetchJson(url) {
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`fetch ${url} failed (${r.status})`);
  return r.json();
}

async function discoverAuthServer(pdsUrl) {
  const resource = await fetchJson(
    `${pdsUrl.replace(/\/$/, "")}/.well-known/oauth-protected-resource`,
  );
  const authServerUrl = (resource.authorization_servers || [])[0];
  if (!authServerUrl) throw new Error("PDS advertises no authorization server");
  const metadata = await fetchJson(
    `${authServerUrl.replace(/\/$/, "")}/.well-known/oauth-authorization-server`,
  );
  return { authServerUrl, metadata };
}

// --- session storage (IndexedDB) ---------------------------------------------

const DB_NAME = "voidshout-oauth";
const STORE = "session";

function idb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbGet(key) {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
    tx.onsuccess = () => resolve(tx.result ?? null);
    tx.onerror = () => reject(tx.error);
  });
}
async function idbSet(key, value) {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite").objectStore(STORE).put(value, key);
    tx.onsuccess = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
async function idbDel(key) {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite").objectStore(STORE).delete(key);
    tx.onsuccess = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getSession() {
  return idbGet("current");
}
export async function clearSession() {
  return idbDel("current");
}

// --- login: start the flow ---------------------------------------------------

export async function login(handleOrDid) {
  const did = handleOrDid.startsWith("did:")
    ? handleOrDid
    : await resolveHandle(handleOrDid);
  if (!did) throw new Error("could not resolve handle");
  const pdsUrl = await resolvePds(did);
  if (!pdsUrl) throw new Error("could not resolve PDS");

  const { metadata } = await discoverAuthServer(pdsUrl);

  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await computeCodeChallenge(codeVerifier);
  const state = generateState();
  const dpop = await generateDPoPKeyPair();
  const dpopSerialized = await serializeDPoPKeyPair(dpop);

  const parEndpoint = metadata.pushed_authorization_request_endpoint;
  const parBody = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state,
    scope: SCOPE,
    login_hint: handleOrDid,
  });

  let dpopProof = await createDPoPProof(dpop, "POST", parEndpoint);
  let parRes = await fetch(parEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", DPoP: dpopProof },
    body: parBody.toString(),
  });
  if (parRes.status === 400 || parRes.status === 401) {
    const nonce = parRes.headers.get("DPoP-Nonce");
    if (nonce) {
      dpopProof = await createDPoPProof(dpop, "POST", parEndpoint, nonce);
      parRes = await fetch(parEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", DPoP: dpopProof },
        body: parBody.toString(),
      });
    }
  }
  if (!parRes.ok) {
    const err = await parRes.text().catch(() => "");
    throw new Error(`PAR failed (${parRes.status}): ${err.slice(0, 300)}`);
  }
  const parData = await parRes.json();
  const dpopNonce = parRes.headers.get("DPoP-Nonce");

  sessionStorage.setItem(
    `oauth:${state}`,
    JSON.stringify({
      codeVerifier,
      dpop: dpopSerialized,
      did,
      pdsUrl,
      tokenEndpoint: metadata.token_endpoint,
      issuer: metadata.issuer,
      dpopNonce: dpopNonce || null,
      returnTo: location.pathname + location.search,
    }),
  );

  const authUrl =
    `${metadata.authorization_endpoint}?` +
    new URLSearchParams({ request_uri: parData.request_uri, client_id: CLIENT_ID });
  location.href = authUrl.toString();
}

// --- callback: exchange code for tokens --------------------------------------

export async function completeLoginIfCallback() {
  const params = new URLSearchParams(location.search);
  const code = params.get("code");
  const state = params.get("state");
  const oauthErr = params.get("error");
  if (oauthErr) {
    cleanUrl();
    throw new Error(`authorization failed: ${oauthErr}`);
  }
  if (!code || !state) return null;

  const stashed = sessionStorage.getItem(`oauth:${state}`);
  if (!stashed) {
    cleanUrl();
    throw new Error("oauth state not found (already used or wrong tab)");
  }
  sessionStorage.removeItem(`oauth:${state}`);
  const s = JSON.parse(stashed);
  const dpop = await deserializeDPoPKeyPair(s.dpop);

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: REDIRECT_URI,
    code_verifier: s.codeVerifier,
    client_id: CLIENT_ID,
  });

  let dpopProof = await createDPoPProof(
    dpop,
    "POST",
    s.tokenEndpoint,
    s.dpopNonce || undefined,
  );
  let res = await fetch(s.tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", DPoP: dpopProof },
    body: body.toString(),
  });
  if (res.status === 400 || res.status === 401) {
    const nonce = res.headers.get("DPoP-Nonce");
    if (nonce) {
      dpopProof = await createDPoPProof(dpop, "POST", s.tokenEndpoint, nonce);
      res = await fetch(s.tokenEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", DPoP: dpopProof },
        body: body.toString(),
      });
    }
  }
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    cleanUrl();
    throw new Error(`token exchange failed (${res.status}): ${err.slice(0, 300)}`);
  }
  const tokens = await res.json();
  if (tokens.sub !== s.did) throw new Error("DID mismatch after token exchange");

  const finalNonce = res.headers.get("DPoP-Nonce") || s.dpopNonce || null;
  const handle = await resolveHandleForDid(tokens.sub);

  const session = {
    did: tokens.sub,
    handle,
    pdsUrl: s.pdsUrl,
    tokenEndpoint: s.tokenEndpoint,
    accessJwt: tokens.access_token,
    refreshJwt: tokens.refresh_token,
    accessExpiresAt:
      jwtExp(tokens.access_token) ||
      Math.floor(Date.now() / 1000) + (tokens.expires_in || 3600),
    dpop: s.dpop,
    dpopNonce: finalNonce,
    scope: tokens.scope || SCOPE,
  };
  await idbSet("current", session);
  history.replaceState({}, "", s.returnTo || `${MOUNT}/`);
  return session;
}

function cleanUrl() {
  const url = new URL(location.href);
  url.searchParams.delete("code");
  url.searchParams.delete("state");
  url.searchParams.delete("iss");
  history.replaceState({}, "", url.pathname + url.search);
}

// --- authenticated requests (DPoP-bound, with nonce retry) -------------------

export async function refreshSession(session) {
  const dpop = await deserializeDPoPKeyPair(session.dpop);
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: session.refreshJwt,
    client_id: CLIENT_ID,
  });
  const attempt = async (nonce) => {
    const proof = await createDPoPProof(dpop, "POST", session.tokenEndpoint, nonce);
    return fetch(session.tokenEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", DPoP: proof },
      body: body.toString(),
    });
  };
  let res = await attempt(session.dpopNonce || undefined);
  if (res.status === 400 || res.status === 401) {
    const nonce = res.headers.get("DPoP-Nonce");
    if (nonce) res = await attempt(nonce);
  }
  if (!res.ok) {
    throw new Error(`session refresh failed (${res.status}) — please sign in again`);
  }
  const tokens = await res.json();
  session.accessJwt = tokens.access_token;
  if (tokens.refresh_token) session.refreshJwt = tokens.refresh_token;
  session.accessExpiresAt =
    jwtExp(tokens.access_token) ||
    Math.floor(Date.now() / 1000) + (tokens.expires_in || 3600);
  session.dpopNonce = res.headers.get("DPoP-Nonce") || session.dpopNonce;
  // A token refresh happens roughly once an hour of active use — piggyback a
  // handle re-resolution here so a handle change eventually reaches the
  // signed-in user's own header instead of staying stale until they
  // manually re-login. Best-effort: never fail a refresh over this.
  try {
    const freshHandle = await resolveHandleForDid(session.did);
    if (freshHandle) session.handle = freshHandle;
  } catch {}
  await idbSet("current", session);
  return session;
}

// Make a DPoP-authenticated request to the user's PDS. Only needed for
// WRITES (createRecord/putRecord/deleteRecord/applyWrites) — repo reads are
// public and unauthenticated, so callers use plain fetch for those.
export async function dpopFetch(session, url, options = {}) {
  const method = options.method || "GET";

  const now = Math.floor(Date.now() / 1000);
  if (session.accessExpiresAt && session.accessExpiresAt <= now + 30) {
    await refreshSession(session);
  }

  const doFetch = async (nonce) => {
    const dpop = await deserializeDPoPKeyPair(session.dpop);
    const proof = await createDPoPProof(dpop, method, url, nonce, session.accessJwt);
    return fetch(url, {
      ...options,
      headers: {
        ...(options.headers || {}),
        Authorization: `DPoP ${session.accessJwt}`,
        DPoP: proof,
      },
    });
  };

  let res = await doFetch(session.dpopNonce || undefined);

  if (res.status === 401 || res.status === 400) {
    const nonce = res.headers.get("DPoP-Nonce");
    const errBody = await res.clone().text().catch(() => "");
    if (/invalid_token|expired/i.test(errBody)) {
      try {
        await refreshSession(session);
        res = await doFetch(session.dpopNonce || nonce || undefined);
      } catch {
        return res;
      }
    } else if (nonce && nonce !== session.dpopNonce) {
      session.dpopNonce = nonce;
      await idbSet("current", session);
      res = await doFetch(nonce);
    }
  }

  const rotated = res.headers.get("DPoP-Nonce");
  if (rotated && rotated !== session.dpopNonce) {
    session.dpopNonce = rotated;
    await idbSet("current", session);
  }
  return res;
}
