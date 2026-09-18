// listbot — maintain your own Bluesky lists by tagging.
//
//   fetch()     -> the landing page, the OAuth sign-in flow, /status.json,
//                  and the handle-verification endpoint.
//   scheduled() -> the watcher: poll the bot's mentions, parse each into an
//                  add/remove, and act in the tagger's OWN repo with their
//                  stored OAuth session.
//
// The loop: sign in once here, then reply "@listbot.bisks.net bots" under any
// post and that post's author lands on your list called "bots". The bot never
// decides who belongs on a list; it only does what its owner tagged.
//
// See notes/88-listbot.md.

import {
  importClientKeys,
  generateDpopKey,
  importDpopKey,
  dpopFetch,
  clientAssertion,
  pkcePair,
  bytesToB64url,
  type ClientKeys,
  type DpopKey,
} from "./oauth.js";
import {
  putSession,
  getSession,
  deleteSession,
  countSessions,
  putLoginState,
  takeLoginState,
  createBrowserSession,
  browserSessionDid,
  deleteBrowserSession,
  readCookie,
  sessionCookie,
  clearedCookie,
  COOKIE_NAME,
  type StoredSession,
  type KVNamespace,
} from "./store.js";
import {
  addToList,
  removeFromList,
  listWebUrl,
  readLists,
  hydrateMembers,
  deleteListItem,
  deleteList,
  type ActingSession,
  type ListWithMembers,
} from "./lists.js";
// .mjs on purpose: it's pure logic with unit tests that import it directly.
import { parseCommand } from "./command.mjs";

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  STATE: KVNamespace;

  // vars
  BOT_DID: string;
  BOT_IDENTIFIER: string;
  BOT_HANDLE: string;
  // Every handle the bot answers to, comma-separated, including BOT_HANDLE.
  // Exists because the account is created on a .bsky.social handle and switches
  // to the bisks.net one later: during the switch both are live in people's
  // muscle memory and in older posts, and a mention facet resolves by DID
  // regardless. Stripping only the current handle would leave the other one
  // sitting in the text and turn "@listbot.bsky.social bots" into a list named
  // "@listbot.bsky.social bots".
  BOT_HANDLE_ALIASES: string;
  SITE_URL: string;
  CLIENT_KEY_KID: string;
  CLIENT_PUBLIC_JWK: string;

  // secrets
  BOT_APP_PASSWORD: string;
  CLIENT_PRIVATE_KEY: string;
  SESSION_ENC_KEY: string;
}

const PDS = "https://bsky.social";
const APPVIEW = "https://public.api.bsky.app";
const PLC_DIRECTORY = "https://plc.directory";

// Exactly what the bot does on a user's behalf, and nothing else: create and
// delete lists and list memberships. No posting, no following, no reading DMs,
// no transition:generic. Per notes/50-oauth-scopes.md this string must be
// byte-identical to the one in the client metadata below — they're generated
// from this constant precisely so they can't drift.
const SCOPE = [
  "atproto",
  "repo:app.bsky.graph.list?action=create&action=update&action=delete",
  "repo:app.bsky.graph.listitem?action=create&action=delete",
].join(" ");

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Handle verification for @listbot.bisks.net. Kept first and simple.
    if (url.pathname === "/.well-known/atproto-did") {
      return new Response(env.BOT_DID, {
        headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-cache" },
      });
    }

    // The confidential client's identity documents. client-metadata.json is
    // what the PDS fetches to learn who we are; jwks.json carries the public
    // half of the key we sign client assertions with. Both are public by
    // design — they're how a PDS verifies us, not how we authenticate.
    if (url.pathname === "/client-metadata.json") {
      return json(clientMetadata(env));
    }
    if (url.pathname === "/jwks.json") {
      return json({ keys: [publicJwk(env)] });
    }

    // The catalog document notes/ideas/other-bots.md asks every bot here to
    // publish on day one. CORS-open, no secrets, no user identities.
    if (url.pathname === "/status.json") {
      return handleStatus(env);
    }

    if (url.pathname === "/login" && request.method === "POST") {
      return handleLogin(request, env).catch((err) => errorPage(String(err)));
    }
    if (url.pathname === "/callback") {
      return handleCallback(request, env).catch((err) => errorPage(String(err)));
    }

    // The signed-in UI: see your lists, take someone off, delete a list. The
    // undo surface for a bot that acts while you're not looking.
    if (url.pathname === "/lists") {
      return handleListsPage(request, env).catch((err) => errorPage(String(err)));
    }
    if (url.pathname === "/lists/remove" && request.method === "POST") {
      return handleRemoveMember(request, env).catch((err) => errorPage(String(err)));
    }
    if (url.pathname === "/lists/delete" && request.method === "POST") {
      return handleDeleteList(request, env).catch((err) => errorPage(String(err)));
    }
    if (url.pathname === "/logout" && request.method === "POST") {
      return handleLogout(request, env);
    }

    return env.ASSETS.fetch(request);
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runWatcher(env));
  },
};

// --- client identity ---------------------------------------------------------

function publicJwk(env: Env): Record<string, unknown> {
  // Stored as a var rather than derived, because the private key is imported
  // non-extractable and WebCrypto can't recover a public half from it. Public
  // values only — x/y/crv are not secret.
  const jwk = JSON.parse(env.CLIENT_PUBLIC_JWK) as Record<string, unknown>;
  return { ...jwk, kid: env.CLIENT_KEY_KID, use: "sig", alg: "ES256" };
}

function clientMetadata(env: Env): Record<string, unknown> {
  const site = env.SITE_URL.replace(/\/$/, "");
  return {
    client_id: `${site}/client-metadata.json`,
    client_name: "listbot — bisks.net",
    client_uri: site,
    redirect_uris: [`${site}/callback`],
    // The one scope string, shared with the authorize request below — see SCOPE.
    scope: SCOPE,
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    application_type: "web",
    // The confidential half: we authenticate to the token endpoint by signing
    // an assertion with the key published at /jwks.json, which is what lets us
    // refresh a session with no browser present.
    token_endpoint_auth_method: "private_key_jwt",
    token_endpoint_auth_signing_alg: "ES256",
    jwks_uri: `${site}/jwks.json`,
    dpop_bound_access_tokens: true,
  };
}

async function clientKeys(env: Env): Promise<ClientKeys> {
  return importClientKeys(env.CLIENT_PRIVATE_KEY, env.CLIENT_KEY_KID);
}

// --- identity resolution -----------------------------------------------------

async function resolveHandleToDid(handle: string): Promise<string | null> {
  const clean = handle.trim().replace(/^@/, "");
  if (clean.startsWith("did:")) return clean;
  try {
    const res = await fetch(
      `${APPVIEW}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(clean)}`,
    );
    if (!res.ok) return null;
    return ((await res.json()) as { did?: string }).did ?? null;
  } catch {
    return null;
  }
}

async function didDocument(did: string): Promise<Record<string, unknown> | null> {
  try {
    if (did.startsWith("did:plc:")) {
      const res = await fetch(`${PLC_DIRECTORY}/${did}`);
      return res.ok ? ((await res.json()) as Record<string, unknown>) : null;
    }
    if (did.startsWith("did:web:")) {
      const domain = did.slice("did:web:".length).replace(/:/g, "/");
      const res = await fetch(`https://${domain}/.well-known/did.json`);
      return res.ok ? ((await res.json()) as Record<string, unknown>) : null;
    }
  } catch {}
  return null;
}

async function resolvePds(did: string): Promise<string | null> {
  const doc = await didDocument(did);
  const services = (doc?.service ?? []) as { id?: string; type?: string; serviceEndpoint?: string }[];
  const svc = services.find(
    (s) => s.id === "#atproto_pds" || s.type === "AtprotoPersonalDataServer",
  );
  return svc?.serviceEndpoint ?? null;
}

interface AuthServerMeta {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  pushed_authorization_request_endpoint?: string;
}

// The PDS names its authorization server; the AS publishes the endpoints. Two
// hops, both required — a PDS and its AS are not always the same host.
async function resolveAuthServer(pdsUrl: string): Promise<AuthServerMeta> {
  const base = pdsUrl.replace(/\/$/, "");
  const protectedRes = await fetch(`${base}/.well-known/oauth-protected-resource`);
  if (!protectedRes.ok) throw new Error(`oauth-protected-resource: ${protectedRes.status}`);
  const issuer = ((await protectedRes.json()) as { authorization_servers?: string[] })
    .authorization_servers?.[0];
  if (!issuer) throw new Error("PDS names no authorization server");

  const metaRes = await fetch(`${issuer.replace(/\/$/, "")}/.well-known/oauth-authorization-server`);
  if (!metaRes.ok) throw new Error(`oauth-authorization-server: ${metaRes.status}`);
  const meta = (await metaRes.json()) as AuthServerMeta;
  if (!meta.authorization_endpoint || !meta.token_endpoint) {
    throw new Error("authorization server metadata is missing endpoints");
  }
  return meta;
}

// --- sign-in -----------------------------------------------------------------

async function handleLogin(request: Request, env: Env): Promise<Response> {
  const form = await request.formData();
  const handle = String(form.get("handle") ?? "").trim();
  if (!handle) return errorPage("Enter your handle.");

  const did = await resolveHandleToDid(handle);
  if (!did) return errorPage(`Couldn't resolve "${handle}".`);
  const pdsUrl = await resolvePds(did);
  if (!pdsUrl) return errorPage(`Couldn't find the PDS for ${did}.`);

  const meta = await resolveAuthServer(pdsUrl);
  const site = env.SITE_URL.replace(/\/$/, "");
  const clientId = `${site}/client-metadata.json`;
  const redirectUri = `${site}/callback`;

  const { verifier, challenge } = await pkcePair();
  const dpop = await generateDpopKey();
  const stateToken = bytesToB64url(crypto.getRandomValues(new Uint8Array(24)));

  // PAR: hand the authorization request to the AS over a back channel and get
  // a short handle for it, so the browser redirect carries no parameters worth
  // tampering with. atproto requires it.
  const parEndpoint = meta.pushed_authorization_request_endpoint;
  if (!parEndpoint) throw new Error("authorization server does not support PAR");

  const keys = await clientKeys(env);
  const body = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: SCOPE,
    state: stateToken,
    code_challenge: challenge,
    code_challenge_method: "S256",
    login_hint: handle,
    client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
    client_assertion: await clientAssertion(keys, clientId, meta.issuer),
  });

  const { res, nonce } = await dpopFetch(dpop, {
    method: "POST",
    url: parEndpoint,
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    return errorPage(`Authorization request rejected: ${res.status} ${await res.text()}`);
  }
  const { request_uri } = (await res.json()) as { request_uri: string };

  await putLoginState(env.STATE, env.SESSION_ENC_KEY, stateToken, {
    verifier,
    dpopPrivateJwk: dpop.privateJwk,
    dpopPublicJwk: dpop.publicJwk,
    did,
    handle: handle.replace(/^@/, ""),
    pdsUrl,
    issuer: meta.issuer,
    tokenEndpoint: meta.token_endpoint,
    dpopNonce: nonce,
    createdAt: Date.now(),
  });

  const authorize = new URL(meta.authorization_endpoint);
  authorize.searchParams.set("client_id", clientId);
  authorize.searchParams.set("request_uri", request_uri);
  return Response.redirect(authorize.toString(), 302);
}

async function handleCallback(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const stateToken = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  const oauthError = url.searchParams.get("error");
  if (oauthError) return errorPage(`Bluesky returned "${oauthError}".`);
  if (!stateToken || !code) return errorPage("That callback was missing its state or code.");

  const login = await takeLoginState(env.STATE, env.SESSION_ENC_KEY, stateToken);
  if (!login) return errorPage("That sign-in link expired or was already used. Try again.");

  const site = env.SITE_URL.replace(/\/$/, "");
  const clientId = `${site}/client-metadata.json`;
  const keys = await clientKeys(env);
  const dpopKey = await importDpopKey(login.dpopPrivateJwk, login.dpopPublicJwk);

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: `${site}/callback`,
    client_id: clientId,
    code_verifier: login.verifier,
    client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
    client_assertion: await clientAssertion(keys, clientId, login.issuer),
  });

  const { res, nonce } = await dpopFetch(
    dpopKey,
    {
      method: "POST",
      url: login.tokenEndpoint,
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    },
    { nonce: login.dpopNonce },
  );
  if (!res.ok) return errorPage(`Token exchange failed: ${res.status} ${await res.text()}`);

  const tok = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in?: number;
    sub?: string;
  };
  if (!tok.refresh_token) {
    // Without a refresh token the bot can't act later, which is the entire
    // point — better to say so than to store a session that dies in an hour.
    return errorPage("Bluesky didn't issue a refresh token, so the bot couldn't act later.");
  }

  await putSession(env.STATE, env.SESSION_ENC_KEY, {
    did: tok.sub ?? login.did,
    handle: login.handle,
    pdsUrl: login.pdsUrl,
    tokenEndpoint: login.tokenEndpoint,
    issuer: login.issuer,
    refreshToken: tok.refresh_token,
    accessToken: tok.access_token,
    accessExpiresAt: Date.now() + (tok.expires_in ?? 3600) * 1000,
    dpopPrivateJwk: login.dpopPrivateJwk,
    dpopPublicJwk: login.dpopPublicJwk,
    dpopNonce: nonce,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  // Log the browser in too, so they land on their lists rather than a dead end.
  const token = await createBrowserSession(env.STATE, tok.sub ?? login.did);
  return new Response(null, {
    status: 302,
    headers: { location: "/lists", "set-cookie": sessionCookie(token) },
  });
}

// --- token refresh -----------------------------------------------------------

// Mint a fresh access token from the stored refresh token. Every session write
// here re-encrypts, so a rotated refresh token (atproto rotates on each use)
// never falls out of sync with what's stored.
async function refreshSession(env: Env, session: StoredSession): Promise<StoredSession | null> {
  const site = env.SITE_URL.replace(/\/$/, "");
  const clientId = `${site}/client-metadata.json`;
  const keys = await clientKeys(env);
  const dpopKey = await importDpopKey(session.dpopPrivateJwk, session.dpopPublicJwk);

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: session.refreshToken,
    client_id: clientId,
    client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
    client_assertion: await clientAssertion(keys, clientId, session.issuer),
  });

  const { res, nonce } = await dpopFetch(
    dpopKey,
    {
      method: "POST",
      url: session.tokenEndpoint,
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    },
    { nonce: session.dpopNonce },
  );

  if (!res.ok) {
    const text = await res.text();
    console.error(`refresh failed for ${session.did}: ${res.status} ${text}`);
    // A refused refresh token is final — the user revoked the app, or it aged
    // out. Drop the session so the watcher stops retrying it every 2 minutes
    // and the user gets told to sign in again.
    if (res.status === 400 || res.status === 401) {
      await deleteSession(env.STATE, session.did);
    }
    return null;
  }

  const tok = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };
  const updated: StoredSession = {
    ...session,
    accessToken: tok.access_token,
    refreshToken: tok.refresh_token ?? session.refreshToken,
    accessExpiresAt: Date.now() + (tok.expires_in ?? 3600) * 1000,
    dpopNonce: nonce ?? session.dpopNonce,
    updatedAt: Date.now(),
  };
  await putSession(env.STATE, env.SESSION_ENC_KEY, updated);
  return updated;
}

// A session ready to act. Refreshes ahead of expiry rather than waiting for a
// 401, since the watcher is a cron and there's no user to retry for us.
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

async function actingSession(env: Env, did: string): Promise<{ session: StoredSession; acting: ActingSession } | null> {
  let stored = await getSession(env.STATE, env.SESSION_ENC_KEY, did);
  if (!stored) return null;
  if (Date.now() > stored.accessExpiresAt - REFRESH_MARGIN_MS) {
    const refreshed = await refreshSession(env, stored);
    if (!refreshed) return null;
    stored = refreshed;
  }
  const dpopKey = await importDpopKey(stored.dpopPrivateJwk, stored.dpopPublicJwk);
  return {
    session: stored,
    acting: {
      did: stored.did,
      pdsUrl: stored.pdsUrl,
      accessToken: stored.accessToken,
      dpopKey,
      dpopNonce: stored.dpopNonce,
    },
  };
}

// --- the watcher -------------------------------------------------------------

interface BotSession {
  accessJwt: string;
  did: string;
}

// The BOT's own session, from its app password. Separate from and unrelated to
// the per-user OAuth sessions above: this one only reads the bot's own
// notifications and posts the bot's own replies. It can't touch anyone's lists.
async function botLogin(env: Env): Promise<BotSession> {
  const res = await fetch(`${PDS}/xrpc/com.atproto.server.createSession`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ identifier: env.BOT_IDENTIFIER, password: env.BOT_APP_PASSWORD }),
  });
  if (!res.ok) throw new Error(`createSession failed: ${res.status} ${await res.text()}`);
  const j = (await res.json()) as { accessJwt: string; did: string };
  return { accessJwt: j.accessJwt, did: j.did };
}

interface Mention {
  uri: string;
  cid: string;
  authorDid: string;
  authorHandle: string;
  text: string;
  rootUri: string;
  rootCid: string;
  parentUri?: string;
  indexedAt?: string;
}

interface PostRecord {
  text?: string;
  reply?: { root?: { uri: string; cid: string }; parent?: { uri: string; cid: string } };
  facets?: { features?: { $type?: string; did?: string }[] }[];
}

// Same two-rail discovery as buildthis (notes/80): listNotifications every
// tick, plus a periodic searchPosts sweep. Both rails exist because each has
// been seen to silently drop mentions the other caught — a reply landing on one
// of our own posts arrives as reason "reply" rather than "mention", and Bluesky
// has dropped an author's mentions from notifications account-wide while the
// posts stayed live and searchable.
async function recentMentions(session: BotSession): Promise<Mention[]> {
  const res = await fetch(`${PDS}/xrpc/app.bsky.notification.listNotifications?limit=40`, {
    headers: { authorization: `Bearer ${session.accessJwt}` },
  });
  if (!res.ok) throw new Error(`listNotifications failed: ${res.status} ${await res.text()}`);
  const j = (await res.json()) as {
    notifications: {
      uri: string;
      cid: string;
      author: { did: string; handle: string };
      reason: string;
      record?: unknown;
      indexedAt?: string;
    }[];
  };

  const mentionsUs = (rec: PostRecord): boolean =>
    (rec.facets ?? []).some((f) =>
      (f.features ?? []).some(
        (feat) =>
          feat.$type === "app.bsky.richtext.facet#mention" && feat.did === session.did,
      ),
    );

  return j.notifications
    .filter((n) => {
      if (n.reason === "mention") return true;
      if (n.reason !== "reply") return false;
      return mentionsUs((n.record ?? {}) as PostRecord);
    })
    .map((n) => {
      const rec = (n.record ?? {}) as PostRecord;
      return {
        uri: n.uri,
        cid: n.cid,
        authorDid: n.author.did,
        authorHandle: n.author.handle,
        text: rec.text ?? "",
        rootUri: rec.reply?.root?.uri ?? n.uri,
        rootCid: rec.reply?.root?.cid ?? n.cid,
        parentUri: rec.reply?.parent?.uri,
        indexedAt: n.indexedAt,
      };
    });
}

const SWEEP_EVERY_N = 5;
const SWEEP_TICK_KEY = "watcher:sweep-tick";

async function bumpSweepTick(env: Env): Promise<number> {
  try {
    const raw = await env.STATE.get(SWEEP_TICK_KEY);
    const n = (raw ? parseInt(raw, 10) || 0 : 0) + 1;
    await env.STATE.put(SWEEP_TICK_KEY, String(n));
    return n;
  } catch (err) {
    console.error(`bumpSweepTick failed: ${err}`);
    return 1;
  }
}

// Every handle the bot answers to. BOT_HANDLE first (it's the one we advertise),
// then the aliases, deduped. Also carries the bare "listbot" so a tag that drops
// the domain still parses.
function botHandles(env: Env): string[] {
  const aliases = (env.BOT_HANDLE_ALIASES ?? "")
    .split(",")
    .map((h) => h.trim().replace(/^@/, ""))
    .filter(Boolean);
  return [...new Set([env.BOT_HANDLE, ...aliases, "listbot"])];
}

async function searchMentionSweep(session: BotSession, env: Env): Promise<Mention[]> {
  const u = new URL(`${PDS}/xrpc/app.bsky.feed.searchPosts`);
  // `mentions` is the precise filter (it resolves by DID); `q` is required
  // alongside it, so it takes the CURRENT handle — the one live posts contain.
  u.searchParams.set("q", env.BOT_HANDLE);
  u.searchParams.set("mentions", env.BOT_DID);
  u.searchParams.set("sort", "latest");
  u.searchParams.set("limit", "25");
  const res = await fetch(u.toString(), {
    headers: { authorization: `Bearer ${session.accessJwt}` },
  });
  if (!res.ok) throw new Error(`searchPosts failed: ${res.status} ${await res.text()}`);
  const j = (await res.json()) as {
    posts: { uri: string; cid: string; author: { did: string; handle: string }; record?: unknown; indexedAt?: string }[];
  };
  return j.posts.map((p) => {
    const rec = (p.record ?? {}) as PostRecord;
    return {
      uri: p.uri,
      cid: p.cid,
      authorDid: p.author.did,
      authorHandle: p.author.handle,
      text: rec.text ?? "",
      rootUri: rec.reply?.root?.uri ?? p.uri,
      rootCid: rec.reply?.root?.cid ?? p.cid,
      parentUri: rec.reply?.parent?.uri,
      indexedAt: p.indexedAt,
    };
  });
}

const HANDLED_PREFIX = "handled:";
const HANDLED_TTL = 60 * 60 * 24 * 14;

// The subject of a tag is the author of the post being replied to. Fetched from
// the AppView rather than trusted from the tag text, so "@listbot bots" under
// someone's post can only ever add THAT person.
async function parentAuthor(
  session: BotSession,
  parentUri: string,
): Promise<{ did: string; handle: string } | null> {
  const u = new URL(`${APPVIEW}/xrpc/app.bsky.feed.getPosts`);
  u.searchParams.set("uris", parentUri);
  try {
    const res = await fetch(u.toString(), {
      headers: { authorization: `Bearer ${session.accessJwt}` },
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { posts?: { author?: { did: string; handle: string } }[] };
    const author = j.posts?.[0]?.author;
    return author ? { did: author.did, handle: author.handle } : null;
  } catch {
    return null;
  }
}

async function runWatcher(env: Env): Promise<void> {
  const session = await botLogin(env);

  const mentions = await recentMentions(session);
  const tick = await bumpSweepTick(env);
  if (tick % SWEEP_EVERY_N === 0) {
    try {
      const swept = await searchMentionSweep(session, env);
      const seen = new Set(mentions.map((m) => m.uri));
      for (const m of swept) if (!seen.has(m.uri)) mentions.push(m);
    } catch (err) {
      console.error(`search sweep failed: ${err}`);
    }
  }

  for (const m of mentions) {
    const handledKey = HANDLED_PREFIX + m.uri;
    if (await env.STATE.get(handledKey)) continue;
    // Mark handled BEFORE acting. A tag that half-fails is better than one that
    // re-runs every two minutes; the reply says what happened either way.
    await env.STATE.put(handledKey, "1", { expirationTtl: HANDLED_TTL });

    try {
      await handleMention(env, session, m);
    } catch (err) {
      console.error(`handling ${m.uri} failed: ${err}`);
    }
  }
}

async function handleMention(env: Env, bot: BotSession, m: Mention): Promise<void> {
  if (m.authorDid === env.BOT_DID) return;

  const command = parseCommand(m.text, botHandles(env));
  if (command.kind === "none") return;
  if (command.kind === "help") {
    await reply(bot, m, HELP_TEXT);
    return;
  }

  const found = await actingSession(env, m.authorDid);
  if (!found) {
    await reply(bot, m, `you'll need to sign in first so i can edit your lists: ${env.SITE_URL}`);
    return;
  }

  if (command.kind === "lists") {
    await reply(bot, m, `your lists live at https://bsky.app/profile/${found.session.handle}/lists`);
    return;
  }

  if (!m.parentUri) {
    await reply(bot, m, `tag me in a REPLY to someone's post and i'll add that person to your list.`);
    return;
  }
  const subject = await parentAuthor(bot, m.parentUri);
  if (!subject) {
    await reply(bot, m, `i couldn't work out whose post that was — try again?`);
    return;
  }
  if (subject.did === m.authorDid) {
    await reply(bot, m, `that's your own post! tag me under someone else's.`);
    return;
  }

  const result =
    command.kind === "add"
      ? await addToList(found.acting, command.listName, subject.did)
      : await removeFromList(found.acting, command.listName, subject.did);

  // Persist whatever nonce the PDS last handed us, so the next tick skips a
  // round trip. Best-effort: a failed write here costs latency, not
  // correctness.
  if (result.nonce && result.nonce !== found.session.dpopNonce) {
    await putSession(env.STATE, env.SESSION_ENC_KEY, {
      ...found.session,
      dpopNonce: result.nonce,
    }).catch((err) => console.error(`nonce persist failed: ${err}`));
  }

  await reply(bot, m, replyText(command.kind, result, subject.handle, found.session.did));
}

function replyText(
  kind: "add" | "remove",
  result: { ok: boolean; created?: boolean; alreadyThere?: boolean; notThere?: boolean; listName?: string; listUri?: string; error?: string },
  subjectHandle: string,
  ownerDid: string,
): string {
  if (!result.ok) return `that didn't work, sorry — nothing changed on your lists.`;
  const name = result.listName ?? "";
  const link = result.listUri ? `\n${listWebUrl(ownerDid, result.listUri)}` : "";

  if (kind === "add") {
    if (result.alreadyThere) return `@${subjectHandle} is already on "${name}".${link}`;
    if (result.created) return `made you a list called "${name}" and added @${subjectHandle}.${link}`;
    return `added @${subjectHandle} to "${name}".${link}`;
  }
  if (result.notThere) return `@${subjectHandle} wasn't on "${name}", so nothing changed.`;
  return `took @${subjectHandle} off "${name}".${link}`;
}

const HELP_TEXT = `reply to someone's post with "@listbot.bisks.net <list name>" and i'll add them to your own list of that name (making it if it's new). "remove <list name>" takes them off. sign in once at listbot.bisks.net.`;

async function reply(bot: BotSession, m: Mention, text: string): Promise<void> {
  const record = {
    $type: "app.bsky.feed.post",
    text,
    createdAt: new Date().toISOString(),
    reply: {
      root: { uri: m.rootUri, cid: m.rootCid },
      parent: { uri: m.uri, cid: m.cid },
    },
  };
  const res = await fetch(`${PDS}/xrpc/com.atproto.repo.createRecord`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${bot.accessJwt}`,
    },
    body: JSON.stringify({ repo: bot.did, collection: "app.bsky.feed.post", record }),
  });
  if (!res.ok) {
    // A failed reply shouldn't abort the tick — the list edit already happened.
    console.error(`reply failed: ${res.status} ${await res.text()}`);
  }
}

// --- status ------------------------------------------------------------------

async function handleStatus(env: Env): Promise<Response> {
  const configured = Boolean(env.CLIENT_PRIVATE_KEY && env.SESSION_ENC_KEY && env.BOT_APP_PASSWORD);
  let signedIn: number | null = null;
  try {
    signedIn = await countSessions(env.STATE);
  } catch {}

  return json({
    name: "listbot",
    url: env.SITE_URL,
    // "live" only when it can actually act. An inert deploy says so rather
    // than advertising a loop that will never run.
    status: configured ? "live" : "not-configured",
    description:
      "maintain your own Bluesky lists by tagging. reply '@listbot.bisks.net <list name>' under a post and its author joins your list of that name.",
    bot: { did: env.BOT_DID, handle: env.BOT_HANDLE },
    // Counts only — never who. A list is the user's own business, and listbot
    // publishing its membership would undo the point of keeping it in their repo.
    signedInAccounts: signedIn,
    writes: {
      collections: ["app.bsky.graph.list", "app.bsky.graph.listitem"],
      target: "the tagging user's own PDS, via their own OAuth session",
      scope: SCOPE,
    },
    endpoints: {
      status: `${env.SITE_URL}/status.json`,
      clientMetadata: `${env.SITE_URL}/client-metadata.json`,
      jwks: `${env.SITE_URL}/jwks.json`,
    },
    notes: "notes/88-listbot.md in rrcobb/atprotozoa",
  });
}

// --- responses ---------------------------------------------------------------

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "cache-control": "no-cache",
    },
  });
}

function page(title: string, inner: string, status = 200): Response {
  return new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — listbot</title>
<link rel="stylesheet" href="/style.css">
<main><h1>listbot</h1>${inner}<p class="back"><a href="/">back</a></p></main>`,
    { status, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

function errorPage(message: string): Response {
  return page("couldn't sign in", `<p class="bad">${escapeHtml(message)}</p>`, 400);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

// --- the signed-in UI --------------------------------------------------------
//
// Why this exists: the bot acts minutes after a tag, while the user is doing
// something else. Anything that acts on your behalf while you're not looking
// needs a place to see what it did and undo it — and "go to the Bluesky app and
// find the list" is a context switch away from where the mistake was made.
//
// It needs no new permission. The OAuth grant already covers listitem delete,
// which is exactly what the remove button does.

// Resolve the browser cookie to a session ready to act, or null.
async function uiSession(
  request: Request,
  env: Env,
): Promise<{ session: StoredSession; acting: ActingSession } | null> {
  const did = await browserSessionDid(env.STATE, readCookie(request, COOKIE_NAME));
  if (!did) return null;
  return actingSession(env, did);
}

async function handleListsPage(request: Request, env: Env): Promise<Response> {
  const found = await uiSession(request, env);
  if (!found) return signInPrompt(env);

  const { lists, nonce } = await readLists(found.acting);
  await hydrateMembers(lists, APPVIEW);
  await persistNonce(env, found.session, nonce);

  const flash = new URL(request.url).searchParams.get("done");
  return listsPage(env, found.session.handle, lists, flash);
}

async function handleRemoveMember(request: Request, env: Env): Promise<Response> {
  const found = await uiSession(request, env);
  if (!found) return signInPrompt(env);

  const form = await request.formData();
  const rkey = String(form.get("rkey") ?? "");
  if (!rkey) return redirect("/lists");

  const result = await deleteListItem(found.acting, rkey);
  await persistNonce(env, found.session, result.nonce);
  return redirect(result.ok ? "/lists?done=removed" : "/lists?done=failed");
}

async function handleDeleteList(request: Request, env: Env): Promise<Response> {
  const found = await uiSession(request, env);
  if (!found) return signInPrompt(env);

  const form = await request.formData();
  const rkey = String(form.get("rkey") ?? "");
  if (!rkey) return redirect("/lists");

  const result = await deleteList(found.acting, rkey);
  await persistNonce(env, found.session, result.nonce);
  return redirect(result.ok ? "/lists?done=deleted" : "/lists?done=failed");
}

// Signing out drops the browser session only. The OAuth grant stays, because
// the point of the bot is that it keeps working after you close the tab —
// revoking it is a thing you do in Bluesky's own app settings, and saying so is
// better than offering a button that quietly means something else.
function handleLogout(request: Request, env: Env): Response {
  const token = readCookie(request, COOKIE_NAME);
  // Fire-and-forget: the cookie is cleared regardless, so a failed KV delete
  // leaves an orphan key that expires on its own rather than a logged-in user.
  void deleteBrowserSession(env.STATE, token);
  return new Response(null, {
    status: 302,
    headers: { location: "/", "set-cookie": clearedCookie() },
  });
}

async function persistNonce(
  env: Env,
  session: StoredSession,
  nonce?: string,
): Promise<void> {
  if (!nonce || nonce === session.dpopNonce) return;
  await putSession(env.STATE, env.SESSION_ENC_KEY, { ...session, dpopNonce: nonce }).catch(
    (err) => console.error(`nonce persist failed: ${err}`),
  );
}

function redirect(location: string): Response {
  return new Response(null, { status: 302, headers: { location } });
}

function signInPrompt(env: Env): Response {
  return page(
    "sign in",
    `<p>sign in to see and edit your lists.</p>
<form method="post" action="/login">
  <input name="handle" placeholder="your.handle" autocapitalize="off" autocorrect="off" spellcheck="false">
  <button type="submit">sign in</button>
</form>`,
  );
}

const FLASH: Record<string, string> = {
  removed: "took them off.",
  deleted: "deleted that list.",
  failed: "that didn't work — nothing changed.",
};

function listsPage(
  env: Env,
  handle: string,
  lists: ListWithMembers[],
  flash: string | null,
): Response {
  const note = flash && FLASH[flash]
    ? `<p class="${flash === "failed" ? "bad" : "good"}">${FLASH[flash]}</p>`
    : "";

  const body = lists.length
    ? lists.map((l) => renderList(handle, l)).join("")
    : `<p>no lists yet. reply to someone's post with <code>@${escapeHtml(env.BOT_HANDLE)} bots</code> — or any name — and they'll land on a list called that.</p>`;

  return page(
    "your lists",
    `<p class="who">signed in as <strong>${escapeHtml(handle)}</strong> ·
      <form method="post" action="/logout" class="inline"><button type="submit" class="linkish">sign out</button></form></p>
${note}
${body}
<p class="fine">these lists live in your own repo. removing someone here deletes the record from it — the same thing <code>remove</code> does when you tag me.</p>`,
  );
}

function renderList(ownerHandle: string, l: ListWithMembers): string {
  const members = l.members.length
    ? `<ul class="members">${l.members.map(renderMember).join("")}</ul>`
    : `<p class="empty">nobody on this one yet.</p>`;

  return `<section class="list">
  <h2>${escapeHtml(l.name)} <span class="count">${l.members.length}</span></h2>
  <p class="listlinks">
    <a href="https://bsky.app/profile/${escapeHtml(ownerHandle)}/lists/${escapeHtml(l.rkey)}">open in bluesky</a>
    <form method="post" action="/lists/delete" class="inline"
      onsubmit="return confirm('delete the list &quot;${escapeAttr(l.name)}&quot; and all ${l.members.length} of its members?')">
      <input type="hidden" name="rkey" value="${escapeAttr(l.rkey)}">
      <button type="submit" class="linkish danger">delete list</button>
    </form>
  </p>
  ${members}
</section>`;
}

function renderMember(m: { rkey: string; subjectDid: string; handle?: string; displayName?: string; avatar?: string }): string {
  const name = m.handle ?? m.subjectDid;
  const avatar = m.avatar
    ? `<img src="${escapeAttr(m.avatar)}" alt="" width="32" height="32">`
    : `<span class="noavatar"></span>`;
  const display = m.displayName ? `<span class="display">${escapeHtml(m.displayName)}</span>` : "";
  const profile = m.handle
    ? `<a href="https://bsky.app/profile/${escapeHtml(m.handle)}">@${escapeHtml(m.handle)}</a>`
    : `<span class="did">${escapeHtml(m.subjectDid)}</span>`;

  return `<li>
  ${avatar}
  <span class="names">${display}${profile}</span>
  <form method="post" action="/lists/remove" class="inline">
    <input type="hidden" name="rkey" value="${escapeAttr(m.rkey)}">
    <button type="submit" class="remove" title="take ${escapeAttr(name)} off this list">remove</button>
  </form>
</li>`;
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, "&quot;");
}
