// Encrypted session storage.
//
// WHAT PROTECTS THESE TOKENS. `notes/11-durable-objects.md` says plainly that
// KV is not an authentication boundary, and that is just as true here — KV is
// the filing cabinet, not the lock. What actually protects a user's refresh
// token is SESSION_ENC_KEY, a Worker secret that never appears in KV, in this
// repo, or in any response this Worker serves. Anyone holding that secret AND
// the KV contents can act on every signed-in user's PDS, within the scope
// listbot asked for. Anyone holding only the KV contents gets ciphertext.
//
// That is the whole security model, and it is worth being blunt about its
// limits: it is encryption at rest against a KV-only compromise, not against a
// compromise of the Worker itself. A Worker that can decrypt for its cron can
// decrypt for an attacker who controls it.
//
// AES-GCM, 256-bit, a fresh 12-byte IV per write (never reused — GCM fails
// catastrophically on IV reuse, and randomly generating 96 bits per record is
// the standard way to avoid it at this volume).

export interface StoredSession {
  did: string;
  handle: string;
  pdsUrl: string;
  // The token endpoint that issued these, so refresh goes back to the right
  // authorization server rather than re-resolving it every tick.
  tokenEndpoint: string;
  issuer: string;
  refreshToken: string;
  accessToken: string;
  // Epoch ms. Treated as advisory — a 401 triggers a refresh regardless.
  accessExpiresAt: number;
  // The session's DPoP keypair. Must persist across refreshes: the PDS binds
  // the refresh token to this key's thumbprint, so a new key means a dead
  // session.
  dpopPrivateJwk: JsonWebKey;
  dpopPublicJwk: { kty: string; crv: string; x: string; y: string };
  // Last nonce the AS/PDS handed us. Saves a round trip; safe to be stale.
  dpopNonce?: string;
  createdAt: number;
  updatedAt: number;
}

const SESSION_PREFIX = "session:";

async function aesKey(secret: string): Promise<CryptoKey> {
  // The secret is a passphrase of arbitrary length; SHA-256 gives AES-GCM the
  // 256 bits it wants. Not a KDF with a work factor, deliberately — this is a
  // high-entropy generated secret, not a human-chosen password, so stretching
  // would buy nothing.
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

async function encrypt(secret: string, plaintext: string): Promise<string> {
  const key = await aesKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  // iv || ciphertext, base64. The IV is not secret; it only has to be unique.
  const bytes = new Uint8Array(iv.length + ct.byteLength);
  bytes.set(iv, 0);
  bytes.set(new Uint8Array(ct), iv.length);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

async function decrypt(secret: string, encoded: string): Promise<string> {
  const bin = atob(encoded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const key = await aesKey(secret);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: bytes.slice(0, 12) },
    key,
    bytes.slice(12),
  );
  return new TextDecoder().decode(plain);
}

export async function putSession(
  kv: KVNamespace,
  secret: string,
  session: StoredSession,
): Promise<void> {
  // KV.put only accepts strings (notes/11's third gotcha — three sites shipped
  // this bug). encrypt() returns one, so this stays honest by construction.
  await kv.put(
    SESSION_PREFIX + session.did,
    await encrypt(secret, JSON.stringify({ ...session, updatedAt: Date.now() })),
  );
}

export async function getSession(
  kv: KVNamespace,
  secret: string,
  did: string,
): Promise<StoredSession | null> {
  const raw = await kv.get(SESSION_PREFIX + did);
  if (!raw) return null;
  try {
    return JSON.parse(await decrypt(secret, raw)) as StoredSession;
  } catch (err) {
    // A decrypt failure means the stored blob doesn't match the current
    // SESSION_ENC_KEY — almost always a rotated secret. Treat it as "no
    // session" so the user is asked to sign in again, rather than throwing and
    // wedging the whole watcher tick on one bad record.
    console.error(`session decrypt failed for ${did}: ${err}`);
    return null;
  }
}

export async function deleteSession(kv: KVNamespace, did: string): Promise<void> {
  await kv.delete(SESSION_PREFIX + did);
}

// Count only — used by /status.json, which must never expose who is signed in.
export async function countSessions(kv: KVNamespace): Promise<number> {
  let count = 0;
  let cursor: string | undefined;
  do {
    const page = await kv.list({ prefix: SESSION_PREFIX, cursor });
    count += page.keys.length;
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return count;
}

// --- short-lived login state -------------------------------------------------

// The in-flight OAuth handshake: PKCE verifier and DPoP key between /login and
// /callback. Encrypted with the same secret (it holds a DPoP private key), and
// TTL'd tight because a handshake either completes in a minute or is abandoned.
export interface LoginState {
  verifier: string;
  dpopPrivateJwk: JsonWebKey;
  dpopPublicJwk: { kty: string; crv: string; x: string; y: string };
  did: string;
  handle: string;
  pdsUrl: string;
  issuer: string;
  tokenEndpoint: string;
  dpopNonce?: string;
  createdAt: number;
}

const LOGIN_PREFIX = "login:";
const LOGIN_TTL_SECONDS = 600;

export async function putLoginState(
  kv: KVNamespace,
  secret: string,
  stateToken: string,
  state: LoginState,
): Promise<void> {
  await kv.put(LOGIN_PREFIX + stateToken, await encrypt(secret, JSON.stringify(state)), {
    expirationTtl: LOGIN_TTL_SECONDS,
  });
}

export async function takeLoginState(
  kv: KVNamespace,
  secret: string,
  stateToken: string,
): Promise<LoginState | null> {
  const raw = await kv.get(LOGIN_PREFIX + stateToken);
  if (!raw) return null;
  // Single-use: delete before returning, so a replayed callback can't reuse a
  // verifier even if the first one is still in flight.
  await kv.delete(LOGIN_PREFIX + stateToken);
  try {
    return JSON.parse(await decrypt(secret, raw)) as LoginState;
  } catch (err) {
    console.error(`login state decrypt failed: ${err}`);
    return null;
  }
}

export interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string; cursor?: string }): Promise<{
    keys: { name: string }[];
    list_complete: boolean;
    cursor?: string;
  }>;
}

// --- browser sessions, for the web UI ----------------------------------------
//
// A SEPARATE thing from the OAuth sessions above, and the distinction matters.
// An OAuth session is the bot's standing permission to act on a repo; a browser
// session is one logged-in tab. The cookie holds a random token and NOTHING
// else — no DID, no tokens — so a forged or tampered cookie can't name a repo
// to act on. The token is a KV key pointing at the DID, and a token we don't
// have is simply not logged in.
//
// Deliberately NOT a signed JWT carrying the DID: that would put the user's
// identity in something the browser holds, and a signing bug would become an
// account-takeover bug. A lookup table can't be forged, only guessed, and 256
// bits doesn't get guessed.

const BROWSER_PREFIX = "browser:";

// Long enough that people aren't re-authing constantly, short enough that an
// abandoned session on a shared machine goes away on its own.
const BROWSER_TTL = 60 * 60 * 24 * 30;

export const COOKIE_NAME = "listbot_session";

export async function createBrowserSession(
  kv: KVNamespace,
  did: string,
): Promise<string> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  await kv.put(BROWSER_PREFIX + token, did, { expirationTtl: BROWSER_TTL });
  return token;
}

export async function browserSessionDid(
  kv: KVNamespace,
  token: string | null,
): Promise<string | null> {
  if (!token) return null;
  // Guard the KV read: a token shaped wrong is a bad request, not a lookup.
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  return (await kv.get(BROWSER_PREFIX + token)) ?? null;
}

export async function deleteBrowserSession(
  kv: KVNamespace,
  token: string | null,
): Promise<void> {
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return;
  await kv.delete(BROWSER_PREFIX + token);
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}

// HttpOnly so script can't read it, Secure so it never crosses plaintext, and
// SameSite=Lax so another origin can't drive a state-changing POST with the
// user's cookie attached. Lax rather than Strict because the OAuth callback is
// a cross-site redirect back into this origin and Strict would drop the cookie
// on exactly that hop.
export function sessionCookie(token: string): string {
  return `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${BROWSER_TTL}`;
}

export function clearedCookie(): string {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

// --- the signed-in account cap -----------------------------------------------
//
// listbot shares one build box with buildthis, and the box runs ONE job at a
// time. So a listbot job doesn't merely consume capacity — it puts a build
// behind it in line. A listbot job is short (well under a minute against a
// build's five to thirteen), but the queue is the shared resource and an
// unbounded number of signed-in accounts is an unbounded queue.
//
// Hence a cap on how many people can sign in at all. It's a blunter instrument
// than a per-user rate limit and it's meant to be: the per-user limit bounds
// what one enthusiast spends, and this bounds how many enthusiasts there can be.
// Together they put a ceiling on listbot's total claim on the box.
//
// Deliberately NOT an allowlist. Whoever gets there first is as good a rule as
// any for a toy, and it needs no judgment about who deserves a list.

export async function atAccountCap(kv: KVNamespace, cap: number): Promise<boolean> {
  if (!cap || cap <= 0) return false; // 0 or unset = no cap
  try {
    return (await countSessions(kv)) >= cap;
  } catch (err) {
    // A KV failure here fails OPEN, same reasoning as the rate limit: a sign-in
    // page that breaks whenever KV hiccups is worse than briefly overshooting a
    // cap that exists to smooth load, not to enforce a boundary.
    console.error(`account cap check failed: ${err}`);
    return false;
  }
}
