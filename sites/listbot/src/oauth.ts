// Confidential-client atproto OAuth, server-side.
//
// Every other OAuth site in this repo is a PUBLIC client: the browser holds the
// session, `token_endpoint_auth_method` is "none", and there is no jwks. That
// works because those sites only ever write while the user is looking at them.
//
// listbot can't do that. The user tags the bot on Bluesky and walks away; the
// write to their PDS happens minutes later, on a cron tick, with nobody's
// browser open. So the Worker has to hold a refresh token and mint access
// tokens on its own — which makes it a CONFIDENTIAL client, and that means
// three things this repo hasn't done before:
//
//   1. A client assertion. The token endpoint authenticates us with a
//      private_key_jwt signed by a key we publish at /jwks.json, instead of the
//      "none" method browser clients use.
//   2. A per-session DPoP keypair, held server-side and persisted, because DPoP
//      proofs must be signed by the same key across refreshes.
//   3. Encryption at rest for the refresh token (see store.ts).
//
// Both signing keys are ES256 (P-256) — the curve WebCrypto implements
// natively, same reason sites/builtbybot signs labels with it.

export interface ClientKeys {
  // The client assertion key. Only the private half lives here — the matching
  // public JWK is served at /jwks.json from a var, since the private key is
  // imported non-extractable and WebCrypto can't recover a public half from it.
  privateKey: CryptoKey;
  kid: string;
}

// --- key import -------------------------------------------------------------

function b64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 ? "=".repeat(4 - (b64.length % 4)) : "";
  const bin = atob(b64 + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// The client key arrives as a Worker secret: base64url PKCS#8, the same shape
// audit/labeler-keygen.mjs prints for the labeler. `audit/listbot-keygen.mjs`
// produces this one and prints the matching public JWK.
export async function importClientKeys(pkcs8B64url: string, kid: string): Promise<ClientKeys> {
  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    b64urlToBytes(pkcs8B64url),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  return { privateKey, kid };
}

// --- JWT signing ------------------------------------------------------------

function jwtPart(obj: unknown): string {
  return bytesToB64url(new TextEncoder().encode(JSON.stringify(obj)));
}

async function signES256(
  key: CryptoKey,
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
): Promise<string> {
  const signingInput = `${jwtPart(header)}.${jwtPart(payload)}`;
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(signingInput),
  );
  // JWS wants raw r||s, which is exactly what WebCrypto returns for ECDSA.
  // (Unlike the labeler's atproto signatures, JWS has no low-S requirement —
  // verifiers accept either, so there's no toLowS here.)
  return `${signingInput}.${bytesToB64url(new Uint8Array(sig))}`;
}

// --- client assertion -------------------------------------------------------

// private_key_jwt: proves to the PDS's token endpoint that we're the client
// named by client_id, by signing a short-lived JWT with the key whose public
// half is at /jwks.json.
export async function clientAssertion(
  keys: ClientKeys,
  clientId: string,
  audience: string,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return signES256(
    keys.privateKey,
    { alg: "ES256", kid: keys.kid, typ: "JWT" },
    {
      iss: clientId,
      sub: clientId,
      aud: audience,
      jti: crypto.randomUUID(),
      iat: now,
      exp: now + 60,
    },
  );
}

// --- DPoP -------------------------------------------------------------------

export interface DpopKey {
  privateKey: CryptoKey;
  publicJwk: { kty: string; crv: string; x: string; y: string };
}

export async function generateDpopKey(): Promise<DpopKey & { privateJwk: JsonWebKey }> {
  const pair = (await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const publicJwk = (await crypto.subtle.exportKey("jwk", pair.publicKey)) as {
    kty: string;
    crv: string;
    x: string;
    y: string;
  };
  const privateJwk = (await crypto.subtle.exportKey("jwk", pair.privateKey)) as JsonWebKey;
  return {
    privateKey: pair.privateKey,
    // Only the four members a JWK thumbprint is computed over, in the order
    // RFC 7638 requires. Exporting the whole JWK here would put `key_ops` and
    // `ext` into the proof's `jwk` header, which some PDSes reject.
    publicJwk: { kty: publicJwk.kty, crv: publicJwk.crv, x: publicJwk.x, y: publicJwk.y },
    privateJwk,
  };
}

export async function importDpopKey(privateJwk: JsonWebKey, publicJwk: DpopKey["publicJwk"]): Promise<DpopKey> {
  const privateKey = await crypto.subtle.importKey(
    "jwk",
    privateJwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  return { privateKey, publicJwk };
}

// The access token hash claim (`ath`) binds a DPoP proof to one access token.
async function sha256B64url(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return bytesToB64url(new Uint8Array(digest));
}

// A DPoP proof is a JWT signed by the session's DPoP key, naming the exact
// method+URL being called. `nonce` comes from the server's DPoP-Nonce header —
// atproto PDSes require it and signal a missing/stale one with a 401 carrying
// `use_dpop_nonce`, which is why dpopFetch below always retries once.
export async function dpopProof(
  key: DpopKey,
  method: string,
  url: string,
  nonce?: string,
  accessToken?: string,
): Promise<string> {
  const payload: Record<string, unknown> = {
    jti: crypto.randomUUID(),
    htm: method,
    // The proof covers the URL without query or fragment.
    htu: url.split("?")[0].split("#")[0],
    iat: Math.floor(Date.now() / 1000),
  };
  if (nonce) payload.nonce = nonce;
  if (accessToken) payload.ath = await sha256B64url(accessToken);
  return signES256(
    key.privateKey,
    { alg: "ES256", typ: "dpop+jwt", jwk: key.publicJwk },
    payload,
  );
}

// Any DPoP-authenticated request. Handles the nonce dance: the server hands out
// a nonce in a response header and rejects proofs that don't carry the current
// one, so the first call of a session (and any call after the nonce rotates)
// takes two round trips. Returns the response plus whatever nonce the server
// last gave us, so the caller can persist it and skip the retry next time.
export async function dpopFetch(
  key: DpopKey,
  init: { method: string; url: string; headers?: Record<string, string>; body?: string },
  opts: { nonce?: string; accessToken?: string } = {},
): Promise<{ res: Response; nonce?: string }> {
  let nonce = opts.nonce;

  const attempt = async (): Promise<Response> => {
    const proof = await dpopProof(key, init.method, init.url, nonce, opts.accessToken);
    const headers: Record<string, string> = { ...(init.headers ?? {}), DPoP: proof };
    if (opts.accessToken) headers.authorization = `DPoP ${opts.accessToken}`;
    return fetch(init.url, { method: init.method, headers, body: init.body });
  };

  let res = await attempt();
  const offered = res.headers.get("DPoP-Nonce");
  if (offered && offered !== nonce) {
    nonce = offered;
    // Retry only when the rejection was actually about the nonce. A 401 for a
    // dead token is not retryable here — that's the refresh path's job.
    if (res.status === 400 || res.status === 401) {
      const body = await res.clone().text();
      if (body.includes("use_dpop_nonce")) {
        res = await attempt();
        nonce = res.headers.get("DPoP-Nonce") ?? nonce;
      }
    }
  }
  return { res, nonce };
}

// --- PKCE -------------------------------------------------------------------

export async function pkcePair(): Promise<{ verifier: string; challenge: string }> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const verifier = bytesToB64url(bytes);
  return { verifier, challenge: await sha256B64url(verifier) };
}

export { bytesToB64url, b64urlToBytes };
