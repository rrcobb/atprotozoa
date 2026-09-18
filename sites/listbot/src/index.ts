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
  readListSummaries,
  readListPage,
  deleteListItem,
  deleteList,
  ensureList,
  setListPurpose,
  renameList,
  findListRkey,
  type ActingSession,
  type ListSummary,
  type ListPage,
  type ListMember,
} from "./lists.js";
// .mjs on purpose: it's pure logic with unit tests that import it directly.
import { parseCommand } from "./command.mjs";
import {
  enqueueJob,
  claimNextJob,
  getJob,
  retireJob,
  queueStats,
  checkRateLimit,
  type JobPayload,
  type JobSubject,
  type QueueJob,
  type AgentIntent,
  type IntentStep,
} from "./queue.js";

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
  // How many tags one account may spend per window. Every tag is a Sonnet run
  // on a subscription, so this is a budget guard, not a safety one — a tagger
  // can only ever edit their own lists. Vars rather than constants so the
  // ceiling can be tuned without a deploy.
  RATE_LIMIT_TAGS: string;
  RATE_LIMIT_WINDOW_MINUTES: string;
  // Backpressure: how many tags may be waiting on the box before listbot starts
  // turning new ones away. Queue DEPTH rather than a headcount, because depth is
  // the thing that actually says listbot is falling behind. 0 or unset = no cap.
  MAX_QUEUE_DEPTH: string;

  // secrets
  BOT_APP_PASSWORD: string;
  CLIENT_PRIVATE_KEY: string;
  SESSION_ENC_KEY: string;
  // Shared secret the BOX presents to claim a job (POST /next-job). Without it
  // the endpoint rejects — fail closed, same as buildthis.
  QUEUE_TOKEN: string;
  // Shared secret the box presents when reporting an agent's answer
  // (POST /outcome). Separate from QUEUE_TOKEN so the two capabilities —
  // "read the queue" and "assert what a tag meant" — aren't one credential.
  OUTCOME_SECRET: string;
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
    // /lists/<rkey> — one list's members. Not a route table: /lists/remove and
    // /lists/delete are POSTs and are matched below, and an rkey is never one
    // of those words.
    if (url.pathname.startsWith("/lists/") && request.method === "GET") {
      const rkey = url.pathname.slice("/lists/".length);
      if (rkey && !rkey.includes("/")) {
        return handleListPage(request, env, rkey).catch((err) => errorPage(String(err)));
      }
    }
    if (url.pathname === "/lists/purpose" && request.method === "POST") {
      return handleSetPurpose(request, env).catch((err) => errorPage(String(err)));
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

    // The box claims a tag to resolve here, and reports the agent's answer
    // there. Both authed by their own shared secret; see Env.
    if (url.pathname === "/next-job" && request.method === "POST") {
      return handleNextJob(request, env);
    }
    if (url.pathname === "/outcome" && request.method === "POST") {
      return handleOutcome(request, env).catch((err) => json({ error: String(err) }, 500));
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
  // The at:// uri of a post this tag QUOTES, if any. A quote is often the whole
  // referent — "add this person" means the quoted author, and the quoted text
  // is usually how you tell which list.
  quotedUri?: string;
  // Everyone the TAGGER mentioned in this tag, bot excluded, as DIDs.
  //
  // From the post's facets, not from the text: Bluesky resolved these handles
  // to DIDs when the tag was composed, so this is what the tagger actually
  // linked. A handle written as bare text — by them or by anyone whose post the
  // agent reads — is not in here.
  //
  // Optional because handleOutcome rebuilds a Mention from a stored job just to
  // post a reply; nothing on that path looks at who was mentioned.
  mentionedDids?: string[];
}

interface PostRecord {
  text?: string;
  embed?: unknown;
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

  // A reply directly under one of the bot's OWN posts counts as talking to it,
  // whether or not it repeats the @mention.
  //
  // This is how a conversation works. listbot answers, you say "ok cool add
  // fleetingbits", and you are plainly still talking to it — nobody re-@s
  // someone mid-thread. Requiring the mention meant that reply never reached
  // the watcher at all, so the bot looked like it was ignoring you in a thread
  // it had just spoken in. buildthis hit the same thing (notes/80) and fixed it
  // the same way.
  //
  // It's scoped to the bot's own posts on purpose: a reply somewhere else in a
  // thread the bot happens to be in isn't addressed to it.
  // Is this post ADDRESSED to the bot?
  //
  // Not "is the bot in this thread" — a reply notification arrives for any post
  // in a thread the bot has spoken in, including people talking to each other.
  // The bot has no business weighing in on those.
  //
  // Addressed means one of:
  //   - it @mentions us (a `mention` notification, or a facet on a reply)
  //   - it replies directly to something we said
  //   - it continues a run of posts by the same person that began by addressing
  //     us, and nobody else has spoken since
  //
  // That last one is the conversational case, and it's what two of Rob's tags
  // hit: "ok cool add fleetingbits" replied to the bot without repeating the
  // @mention, and "yea have another go at adding fleetingbits" replied to his
  // OWN previous message. Both were plainly still talking to the bot, and both
  // were dropped in silence. Nobody re-@s someone mid-conversation.
  //
  // The check is cheap because the notification carries the parent: if the
  // parent is ours, or the parent is the tagger's own post whose parent is
  // ours, they're still in the exchange. Anyone else replying in the thread
  // fails all three tests and is correctly ignored.
  const isOurs = (uri?: string) => Boolean(uri && uri.includes(`/${session.did}/`));

  const addressedToUs = async (n: {
    author: { did: string };
    record?: unknown;
  }): Promise<boolean> => {
    const rec = (n.record ?? {}) as PostRecord;
    if (mentionsUs(rec)) return true;
    const parent = rec.reply?.parent?.uri;
    if (isOurs(parent)) return true;
    if (!parent) return false;

    // A run of their own posts that began by addressing us.
    //
    // Walk up while the posts are still theirs, and ask whether the thing the
    // run started from was ours. Someone talking to us doesn't re-@ on every
    // message and doesn't always reply to our post directly — they reply to
    // their own last one, three or four deep.
    //
    // Stopping at the first post that ISN'T theirs is what keeps this from
    // over-firing: the moment anyone else speaks, the exchange has moved on and
    // a later reply isn't ours to answer.
    //
    // This replaces a fixed one-level lookup, which was wrong both ways — it
    // stopped listening at the third message in a conversation, and "the post
    // two above is ours" isn't the same question as "is this run still with
    // us".
    let cursor: string | undefined = parent;
    for (let hop = 0; hop < MAX_EXCHANGE_HOPS; hop++) {
      if (!cursor) return false;
      // Someone else's post ends the run. If it's ours the run was with us.
      if (!cursor.includes(`/${n.author.did}/`)) return isOurs(cursor);
      cursor = await parentOfPost(session, cursor);
    }
    return false;
  };

  const out: typeof j.notifications = [];
  for (const n of j.notifications) {
    if (n.reason === "mention") {
      out.push(n);
      continue;
    }
    if (n.reason !== "reply") continue;
    if (await addressedToUs(n)) out.push(n);
  }

  return out
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
        mentionedDids: mentionedDids(rec, session.did),
        quotedUri: quotedUri(rec),
      };
    });
}

// How far up a run of someone's own posts to walk before giving up. Each hop is
// one AppView call and only happens when the cheap checks miss, so this is a
// runaway guard rather than a budget — a conversation deeper than this is rare
// and the tagger can always @ the bot again.
const MAX_EXCHANGE_HOPS = 6;

// The URI a post was replying to. One AppView call, used only when deciding
// whether someone's follow-up to their own message is still part of an exchange
// with the bot.
async function parentOfPost(
  session: BotSession,
  uri: string,
): Promise<string | undefined> {
  try {
    const u = new URL(`${APPVIEW}/xrpc/app.bsky.feed.getPosts`);
    u.searchParams.set("uris", uri);
    const res = await fetch(u.toString(), {
      headers: { authorization: `Bearer ${session.accessJwt}` },
    });
    if (!res.ok) return undefined;
    const j = (await res.json()) as {
      posts?: { record?: { reply?: { parent?: { uri?: string } } } }[];
    };
    return j.posts?.[0]?.record?.reply?.parent?.uri;
  } catch {
    return undefined;
  }
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
      mentionedDids: mentionedDids(rec, session.did),
      quotedUri: quotedUri(rec),
    };
  });
}

// The DIDs a tag's facets point at, minus the bot itself.
//
// Facets are how atproto records a mention: Bluesky resolved the handle to a
// DID when the post was composed. So this says who the TAGGER linked, and it
// can't be forged by writing a handle as plain text — in the tag, in a parent
// post, or in anyone's bio.
function mentionedDids(rec: PostRecord, botDid: string): string[] {
  const out: string[] = [];
  for (const f of rec.facets ?? []) {
    for (const feat of f.features ?? []) {
      if (feat.$type !== "app.bsky.richtext.facet#mention") continue;
      if (!feat.did || feat.did === botDid) continue;
      if (!out.includes(feat.did)) out.push(feat.did);
    }
  }
  return out;
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

  // DMs, same tick. Best-effort: a chat outage must not stop tags working.
  try {
    await runDmWatcher(env, session);
  } catch (err) {
    console.error(`dm watcher failed: ${err}`);
  }

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

  // Two cases need no agent and no round trip: a tag asking for help, and a tag
  // with no text. Everything else goes to the agent, so there's one path to
  // reason about and one place the behavior lives.
  const command = parseCommand(m.text, botHandles(env));
  if (command.kind === "help") {
    await reply(bot, m, HELP_TEXT);
    return;
  }

  const found = await actingSession(env, m.authorDid);
  if (!found) {
    // The most common first contact: someone saw the bot and tagged it before
    // signing up. Say what to do, and nothing else — the site and the profile
    // both explain the rest, and a reply is not the place for reassurance
    // nobody asked for.
    await reply(
      bot,
      m,
      `sign up once at ${env.SITE_URL} and i'll build and manage lists for you.`,
    );
    return;
  }

  // A tag with no parent post has nobody to add by default — but it can still be
  // a perfectly clear instruction ("make me a list for X"), and it can name
  // someone outright. Those go to the agent rather than being refused: the first
  // real tag anyone sent was exactly this, and "tag me in a REPLY" would have
  // been a correct answer to a question the person didn't ask.
  let subject: { did: string; handle: string } | null = null;
  if (m.parentUri) {
    subject = await parentAuthor(bot, m.parentUri);
    if (!subject) {
      await reply(bot, m, `i couldn't work out whose post that was — try again?`);
      return;
    }
    // Your own post isn't a subject — nobody tagging their own thread means
    // "add me". Drop it as the default and let the agent work out who they
    // meant from the text, the thread, and who they follow.
    //
    // There is deliberately NO refusal here any more. It used to reply "that's
    // your own post — reply to someone else's, or tell me who to add" whenever
    // the tag carried no @-mention facet, which told Rob to do the thing he had
    // just done: "yea have another go at adding fleetingbits" names the person
    // in plain text, and since the follows resolution landed the agent can find
    // them without a facet. Counting facets stopped being a way to answer "did
    // they name anyone" — only the agent can answer that now.
    //
    // Same shape of mistake as the 64-char cap and the mention stripping: the
    // Worker deciding a tag is unanswerable before the thing that understands
    // tags has read it.
    if (subject.did === m.authorDid) subject = null;
  }

  // Backpressure. listbot rides on the box's idle time — box-poll.sh claims at
  // most one job per pass with buildthis first, so a build never waits behind a
  // tag. What that priority does NOT bound is listbot's own backlog: if tags
  // arrive faster than idle time drains them, they pile up and every tagger
  // waits longer with no sign anything is wrong.
  //
  // So the ceiling is queue DEPTH, which is the direct measure of falling
  // behind — not a headcount of who signed in, which measures nothing. Under
  // the limit, a burst just queues and is slow. Over it, new tags are refused
  // with a reply that says to try again, because silence for twenty minutes
  // reads as broken while "busy, come back" reads as busy.
  const maxDepth = parseInt(env.MAX_QUEUE_DEPTH ?? "0", 10) || 0;
  if (maxDepth > 0) {
    const stats = await queueStats(env.STATE).catch(() => null);
    // A failed read skips the check rather than blocking: this smooths load, it
    // isn't a boundary, same posture as the rate limit.
    if (stats && stats.queued >= maxDepth) {
      await reply(
        bot,
        m,
        `i'm backed up (${stats.queued} waiting) — give me a few minutes and tag me again.`,
      );
      return;
    }
  }

  // Spend check, after the cheap rejections above and before the expensive part.
  // Deliberately here rather than at the top of the function: a tag that was
  // going to be refused anyway shouldn't consume someone's budget.
  const rate = await checkRateLimit(
    env.STATE,
    m.authorDid,
    parseInt(env.RATE_LIMIT_TAGS ?? "100", 10) || 100,
    parseInt(env.RATE_LIMIT_WINDOW_MINUTES ?? "60", 10) || 60,
  );
  if (!rate.allowed) {
    await reply(
      bot,
      m,
      `that's ${rate.limit} tags in an hour, which is my limit — try again in ${rate.resetsInMin}m. your lists are fine: ${env.SITE_URL}/lists`,
    );
    return;
  }

  // Hand it to the box. Everything the agent needs travels with the job: it
  // makes no authenticated call, holds no credential, and can't reach a token.
  //
  // Who can be added is decided HERE. The default subject is the parent post's
  // author; anyone the tagger @-mentioned is an additional candidate, resolved
  // from the tag's facets. The agent picks from that fixed set by INDEX and
  // never names anyone, so no text it reads — a parent post, a bio, the tag
  // itself — can introduce a person who isn't already on this list.
  const { lists } = await readListSummaries(found.acting, APPVIEW).catch(() => ({
    lists: [] as ListSummary[],
  }));

  // The post this tag quotes, if any. Both halves matter: the author is usually
  // who to add, the text is usually how you tell which list.
  const quoted = await quotedPost(bot, m.quotedUri);
  const payload: JobPayload = {
    kind: "listbot",
    mentionUri: m.uri,
    mentionCid: m.cid,
    rootUri: m.rootUri,
    rootCid: m.rootCid,
    tagText: m.text,
    tagger: { did: m.authorDid, handle: found.session.handle },
    // Absent on a top-level tag: there's no post being replied to, so there's
    // nobody to add. The agent can still make a list.
    subject: subject ? await describeSubject(bot, subject) : undefined,
    // Everyone this tag may add, in order. The parent author is index 0 when
    // there is one, so an agent that says nothing about who gets the same
    // person it always did.
    candidates: await describeCandidates(
      bot,
      subject,
      m.mentionedDids ?? [],
      quoted?.did,
    ),
    // The thread above the tag, plus the post it quotes if it quotes one. A
    // quote is context in exactly the way a parent post is — often more so,
    // since quoting something and saying "add this person" makes the quoted
    // post the whole referent.
    thread: [
      ...(m.parentUri ? await threadContext(bot, m.parentUri) : []),
      ...(quoted
        ? [{
            author: quoted.handle,
            handle: quoted.handle,
            did: quoted.did,
            text: `[quoted post] ${quoted.text}`,
          }]
        : []),
    ],
    // Who the tagger follows — the set that makes "add fleetingbits" resolvable.
    follows: await taggerFollows(bot, m.authorDid),
    lists: lists.map((l) => ({
      name: l.name,
      memberCount: l.memberCount ?? 0,
      // Names and counts only. Sample members used to ride along so the agent
      // could see what kind of list it was, but that meant reading every
      // listitem in the repo on every tag — and the name plus the thread turns
      // out to carry the decision anyway.
      sampleMembers: [],
    })),
    outcomeUrl: `${env.SITE_URL}/outcome`,
  };

  if (!(await enqueueJob(env.STATE, payload))) {
    await reply(bot, m, `something went wrong queueing that, sorry — try again?`);
  }
}

// Everyone this tag is allowed to add: the parent post's author first, then
// anyone the tagger @-mentioned.
//
// The ORDER is the contract — the agent answers with an index into this array,
// so index 0 is the person a tag has always added and an agent that doesn't
// mention a subject gets exactly the old behavior.
//
// Mentions come from the tag's facets, so they're handles the tagger actually
// linked while composing. A handle typed as bare text anywhere — including in
// the tag — never lands here.
async function describeCandidates(
  bot: BotSession,
  parentAuthor: { did: string; handle: string } | null,
  mentioned: string[],
  quotedDid?: string,
): Promise<JobSubject[]> {
  const dids: { did: string; handle: string }[] = [];
  if (parentAuthor) dids.push(parentAuthor);
  // The author of a quoted post. "@listbot add this person" while quoting
  // someone means them, and before this they weren't reachable at all.
  if (quotedDid && !dids.some((d) => d.did === quotedDid)) {
    dids.push({ did: quotedDid, handle: quotedDid });
  }
  for (const did of mentioned) {
    if (!dids.some((d) => d.did === did)) dids.push({ did, handle: did });
  }
  if (!dids.length) return [];

  const out: JobSubject[] = [];
  for (const d of dids) {
    out.push(await describeSubject(bot, d));
  }
  return out;
}

// What the agent gets told about the person being added. Public profile data,
// fetched from the AppView — no auth, nothing the tagger couldn't see.
async function describeSubject(
  bot: BotSession,
  subject: { did: string; handle: string },
): Promise<JobSubject> {
  const out: JobPayload["subject"] = { did: subject.did, handle: subject.handle };
  try {
    const u = new URL(`${APPVIEW}/xrpc/app.bsky.actor.getProfile`);
    u.searchParams.set("actor", subject.did);
    const res = await fetch(u.toString(), {
      headers: { authorization: `Bearer ${bot.accessJwt}` },
    });
    if (res.ok) {
      const p = (await res.json()) as { displayName?: string; description?: string };
      out.displayName = p.displayName;
      out.description = p.description;
    }
  } catch {}

  // A few recent posts, so "do it" can resolve against what someone actually
  // posts rather than just their bio.
  try {
    const u = new URL(`${APPVIEW}/xrpc/app.bsky.feed.getAuthorFeed`);
    u.searchParams.set("actor", subject.did);
    u.searchParams.set("limit", "10");
    u.searchParams.set("filter", "posts_no_replies");
    const res = await fetch(u.toString(), {
      headers: { authorization: `Bearer ${bot.accessJwt}` },
    });
    if (res.ok) {
      const j = (await res.json()) as { feed?: { post?: { record?: { text?: string } } }[] };
      out.recentPosts = (j.feed ?? [])
        .map((f) => f.post?.record?.text)
        .filter((t): t is string => Boolean(t))
        .slice(0, 8);
    }
  } catch {}

  return out;
}

// The posts above the tag, oldest first. Context for a tag like "do it", which
// only makes sense against what was being discussed.
async function threadContext(
  bot: BotSession,
  parentUri: string,
): Promise<{ author: string; handle: string; did: string; text: string }[]> {
  try {
    const u = new URL(`${APPVIEW}/xrpc/app.bsky.feed.getPostThread`);
    u.searchParams.set("uri", parentUri);
    u.searchParams.set("parentHeight", "10");
    u.searchParams.set("depth", "0");
    const res = await fetch(u.toString(), {
      headers: { authorization: `Bearer ${bot.accessJwt}` },
    });
    if (!res.ok) return [];
    const j = (await res.json()) as { thread?: ThreadNode };

    // DIDs ride along, so "add the person who posted the chart" is answerable
    // from the thread alone rather than needing a second lookup.
    const chain: { author: string; handle: string; did: string; text: string }[] = [];
    let node: ThreadNode | undefined = j.thread;
    while (node?.post) {
      const handle = node.post.author?.handle ?? "someone";
      // Embeds appended to the text, so a quoted post, an image's alt text or a
      // link card is visible to the agent rather than silently missing.
      const described = describeEmbed(node.post.embed);
      const text = [node.post.record?.text ?? "", ...described].filter(Boolean).join("\n");
      chain.push({
        author: handle,
        handle,
        did: node.post.author?.did ?? "",
        text,
      });
      node = node.parent;
      if (chain.length >= 10) break;
    }
    return chain.reverse();
  } catch {
    return [];
  }
}

// Who the tagger follows, for resolving how people actually refer to accounts.
//
// "add fleetingbits" is not a handle, it's how someone talks. It only resolves
// against a set of people, and who you follow is overwhelmingly the right set —
// it's who you talk about. Display names come too, because "add Paul" is just
// as normal as "add fleetingbits".
//
// Capped at 2000. Someone following more than that has a long tail the agent
// can still reach with a search, and the whole point of prefetching is to make
// the COMMON case a lookup rather than a multi-step hunt.
const MAX_FOLLOWS = 2000;

async function taggerFollows(
  bot: BotSession,
  did: string,
): Promise<{ did: string; handle: string; displayName?: string }[]> {
  const out: { did: string; handle: string; displayName?: string }[] = [];
  let cursor: string | undefined;
  try {
    for (let page = 0; page < 20 && out.length < MAX_FOLLOWS; page++) {
      const u = new URL(`${APPVIEW}/xrpc/app.bsky.graph.getFollows`);
      u.searchParams.set("actor", did);
      u.searchParams.set("limit", "100");
      if (cursor) u.searchParams.set("cursor", cursor);
      const res = await fetch(u.toString(), {
        headers: { authorization: `Bearer ${bot.accessJwt}` },
      });
      if (!res.ok) break;
      const j = (await res.json()) as {
        follows?: { did: string; handle: string; displayName?: string }[];
        cursor?: string;
      };
      for (const f of j.follows ?? []) {
        out.push({ did: f.did, handle: f.handle, displayName: f.displayName });
      }
      cursor = j.cursor;
      if (!cursor) break;
    }
  } catch (err) {
    // Best-effort: without follows the agent falls back to search, which is
    // slower but works. A failure here must not cost the tag.
    console.error(`follows fetch failed for ${did}: ${err}`);
  }
  return out;
}

// Turn whatever the agent named into a real account.
//
// The agent may hand back a handle, a partial handle, or a DID it found in the
// follows list or a search. This is the step that decides whether that becomes
// a record: it resolves, or the tag fails and says so. A name the agent
// invented has nowhere to land.
//
// Order matters — cheap and certain first:
//   1. already a DID
//   2. exact handle among the people the Worker prefetched
//   3. resolveHandle, for a full handle the agent got right
//   4. handle prefix among follows ("fleetingbits" -> fleetingbits.bsky.social)
//   5. display-name match among follows ("Paul")
async function resolvePerson(
  bot: BotSession,
  named: string,
  pools: { did: string; handle: string; displayName?: string }[][],
): Promise<{ did: string; handle: string } | null> {
  const want = named.trim().replace(/^@/, "").toLowerCase();
  if (!want) return null;
  if (want.startsWith("did:")) return { did: named.trim(), handle: named.trim() };

  const all = pools.flat();

  const exact = all.find((p) => p.handle.toLowerCase() === want);
  if (exact) return { did: exact.did, handle: exact.handle };

  if (want.includes(".")) {
    const did = await resolveHandleToDid(want);
    if (did) return { did, handle: want };
  }

  // "fleetingbits" -> "fleetingbits.bsky.social". Only when it's unambiguous:
  // two matches means asking is better than picking.
  const prefix = all.filter((p) => p.handle.toLowerCase().split(".")[0] === want);
  if (prefix.length === 1) return { did: prefix[0].did, handle: prefix[0].handle };

  const byName = all.filter((p) => (p.displayName ?? "").toLowerCase() === want);
  if (byName.length === 1) return { did: byName[0].did, handle: byName[0].handle };

  return null;
}

interface ThreadNode {
  post?: {
    author?: { handle?: string; did?: string };
    record?: { text?: string };
    // The HYDRATED embed view. Embeds are only reachable here, never on
    // `record` — buildthis learned this the hard way and says so at its own
    // getPostThread call. listbot read only `record.text`, so a tag that quoted
    // someone arrived with the quote invisible: "@listbot can you add colin to
    // the ai news list" quoting Colin's post got back "which colin? there's no
    // thread to go on", which was true of what the agent could see.
    embed?: EmbedView;
  };
  parent?: ThreadNode;
}

interface EmbedView {
  $type?: string;
  images?: { alt?: string }[];
  alt?: string;
  external?: { uri?: string; title?: string; description?: string };
  record?: QuotedRecord & { record?: QuotedRecord };
  media?: EmbedView;
}

interface QuotedRecord {
  uri?: string;
  author?: { handle?: string; did?: string };
  value?: { text?: string };
}

// Describe an embed as bracketed lines, so the agent sees what a reader sees.
// Copied from buildthis's describeEmbed (see sites/buildthis/src/index.ts),
// which handles the shapes that actually turn up: images, link cards, quote
// posts, and a quote carrying media.
function describeEmbed(embed: EmbedView | undefined, depth = 0): string[] {
  if (!embed || depth > 1) return [];
  const t = embed.$type ?? "";
  const out: string[] = [];

  if (t.startsWith("app.bsky.embed.images")) {
    for (const img of embed.images ?? []) {
      const alt = (img.alt ?? "").trim();
      out.push(alt ? `[image, alt text: ${alt}]` : `[image, no alt text]`);
    }
  } else if (t.startsWith("app.bsky.embed.video")) {
    const alt = (embed.alt ?? "").trim();
    out.push(alt ? `[video, alt text: ${alt}]` : `[video, no alt text]`);
  } else if (t.startsWith("app.bsky.embed.external")) {
    const e = embed.external;
    if (e?.uri) {
      const bits = [e.title, e.description].map((x) => (x ?? "").trim()).filter(Boolean);
      out.push(`[link: ${e.uri}${bits.length ? ` — ${bits.join(" — ")}` : ""}]`);
    }
  } else if (t.startsWith("app.bsky.embed.record")) {
    const rec = embed.record?.record ?? embed.record;
    const handle = rec?.author?.handle;
    const text = (rec?.value?.text ?? "").trim();
    if (handle || text) {
      out.push(`[quoting @${handle ?? "someone"}: ${text}]`);
    }
    out.push(...describeEmbed(embed.media, depth + 1));
  }
  return out;
}

// The post a tag quotes: who wrote it, and what it says.
//
// Both matter, and for different reasons. The AUTHOR is usually the person to
// add — quoting someone and saying "add colin" means them. The TEXT is usually
// how you tell which list — quoting a post about ceramics and saying "add this
// person" says everything about where they go.
//
// The raw record on a notification carries neither: an app.bsky.embed.record is
// just a uri and a cid. So the quoted post is fetched. One call, only when the
// tag actually quotes something.
async function quotedPost(
  bot: BotSession,
  embedUri: string | undefined,
): Promise<{ did: string; handle: string; text: string } | null> {
  if (!embedUri) return null;
  try {
    const u = new URL(`${APPVIEW}/xrpc/app.bsky.feed.getPosts`);
    u.searchParams.set("uris", embedUri);
    const res = await fetch(u.toString(), {
      headers: { authorization: `Bearer ${bot.accessJwt}` },
    });
    if (!res.ok) return null;
    const j = (await res.json()) as {
      posts?: {
        author?: { did?: string; handle?: string };
        record?: { text?: string };
        embed?: EmbedView;
      }[];
    };
    const p = j.posts?.[0];
    if (!p?.author?.did || !p.author.handle) return null;
    // A quoted post can itself carry an image or a link, and that can be the
    // referent — "add whoever made this" under a quoted photo.
    const described = describeEmbed(p.embed);
    const text = [p.record?.text ?? "", ...described].filter(Boolean).join("\n");
    return { did: p.author.did, handle: p.author.handle, text };
  } catch {
    return null;
  }
}

// The at:// uri a post quotes, from its RAW record (what a notification gives
// us), rather than the hydrated view.
function quotedUri(rec: PostRecord): string | undefined {
  const embed = rec.embed as
    | { $type?: string; record?: { uri?: string; record?: { uri?: string } } }
    | undefined;
  if (!embed?.$type?.startsWith("app.bsky.embed.record")) return undefined;
  return embed.record?.record?.uri ?? embed.record?.uri;
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

// Rich-text facets, so a URL in a reply is actually clickable.
//
// atproto does NOT autolink: a post is plain text plus a `facets` array saying
// which byte ranges are links or mentions. Without a facet a URL renders as
// inert characters — which is exactly what every listbot reply did until now,
// including the list links on a successful add.
//
// Offsets are UTF-8 BYTE offsets, not character indices. Anything non-ASCII
// earlier in the text (an emoji, an accent, the em dashes this bot likes)
// shifts them, so both ends are measured by encoding the slice rather than by
// counting characters. Same approach as buildthis's reply.mjs.
interface Facet {
  index: { byteStart: number; byteEnd: number };
  features: { $type: string; uri?: string; did?: string }[];
}

function buildFacets(text: string): Facet[] {
  const enc = new TextEncoder();
  const byteOffset = (charIndex: number) => enc.encode(text.slice(0, charIndex)).length;
  const facets: Facet[] = [];

  // Links. Trailing punctuation is excluded so "see https://x.example." doesn't
  // put the full stop inside the link.
  const urlRe = /https?:\/\/[^\s]+/g;
  for (let m = urlRe.exec(text); m; m = urlRe.exec(text)) {
    const raw = m[0].replace(/[.,;:!?)\]}'"]+$/, "");
    const start = byteOffset(m.index);
    facets.push({
      index: { byteStart: start, byteEnd: start + enc.encode(raw).length },
      features: [{ $type: "app.bsky.richtext.facet#link", uri: raw }],
    });
  }

  return facets;
}

// Post the reply, as a thread when it doesn't fit in one post.
//
// Each part replies to the previous one, so it reads as a thread rather than a
// burst of separate posts. The thread root stays the original conversation's
// root, which is what keeps the whole exchange together in the app.
async function postOne(
  bot: BotSession,
  m: Mention,
  text: string,
  parent: { uri: string; cid: string },
): Promise<{ uri: string; cid: string } | null> {
  const facets = buildFacets(text);
  const record = {
    $type: "app.bsky.feed.post",
    text,
    createdAt: new Date().toISOString(),
    ...(facets.length ? { facets } : {}),
    reply: { root: { uri: m.rootUri, cid: m.rootCid }, parent },
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
    console.error(`reply failed: ${res.status} ${await res.text()}`);
    return null;
  }
  return (await res.json()) as { uri: string; cid: string };
}

// Reply where the request came from.
//
// A DM job carries "dm:<convoId>:<messageId>" in place of a post uri, so this
// is the one place that has to know the difference — every caller just says
// reply() and the answer goes back down the same channel. Answering a private
// message with a public post would be its own kind of bug.
async function reply(bot: BotSession, m: Mention, text: string): Promise<void> {
  if (m.uri.startsWith("dm:")) {
    const convoId = m.uri.split(":")[1];
    if (convoId) await sendDm(bot, convoId, text);
    return;
  }
  const parts = splitForPosts(text);
  if (!parts.length) return;

  let parent = { uri: m.uri, cid: m.cid };

  for (const part of parts) {
    const facets = buildFacets(part);
    const record = {
      $type: "app.bsky.feed.post",
      text: part,
      createdAt: new Date().toISOString(),
      ...(facets.length ? { facets } : {}),
      reply: {
        root: { uri: m.rootUri, cid: m.rootCid },
        parent,
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
      const body = await res.text();
      console.error(`reply failed: ${res.status} ${body}`);

      // A post the PDS rejects for length must not become silence. This is what
      // happened to Rob's "add all of them to the blocklist": eleven handles
      // plus the list link came to 349 graphemes, the PDS refused it, and the
      // work had already been done — eleven people added, no reply, no sign
      // anything had happened.
      //
      // splitForPosts sizes each part on its own, but composeReply appends the
      // list link AFTER that, so the combined length was never measured. Rather
      // than thread the link through the splitter, retry once without it: the
      // list is one tap away in the app, and losing the link is much better
      // than losing the answer.
      if (body.includes("grapheme too big") && part.includes("\n")) {
        const withoutLink = part.slice(0, part.lastIndexOf("\n")).trim();
        for (const shorter of splitForPosts(withoutLink)) {
          const retry = await postOne(bot, m, shorter, parent);
          if (!retry) return;
          parent = retry;
        }
        continue;
      }
      // Stop the thread rather than posting orphaned parts that don't follow
      // from anything.
      return;
    }
    const out = (await res.json()) as { uri: string; cid: string };
    parent = { uri: out.uri, cid: out.cid };
  }
}

// --- status ------------------------------------------------------------------

async function handleStatus(env: Env): Promise<Response> {
  const configured = Boolean(env.CLIENT_PRIVATE_KEY && env.SESSION_ENC_KEY && env.BOT_APP_PASSWORD);
  let signedIn: number | null = null;
  try {
    signedIn = await countSessions(env.STATE);
  } catch {}
  let queue: Awaited<ReturnType<typeof queueStats>> | null = null;
  try {
    queue = await queueStats(env.STATE);
  } catch {}

  return json({
    name: "listbot",
    url: env.SITE_URL,
    // "live" only when it can actually act. An inert deploy says so rather
    // than advertising a loop that will never run.
    status: configured ? "live" : "not-configured",
    description:
      "keeps your Bluesky lists for you. tag @listbot.bisks.net in a reply and say what you want — it makes lists, adds people, and takes them off.",
    bot: { did: env.BOT_DID, handle: env.BOT_HANDLE },
    // Counts only — never who. A list is the user's own business, and listbot
    // publishing its membership would undo the point of keeping it in their repo.
    signedInAccounts: signedIn,
    // Tags waiting on the box to work out what they meant. Counts only, no
    // content — same reasoning as signedInAccounts.
    queue,
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

  const { lists, nonce } = await readListSummaries(found.acting, APPVIEW);
  await persistNonce(env, found.session, nonce);

  const flash = new URL(request.url).searchParams.get("done");
  return listsPage(env, found.session.handle, lists, flash);
}

// /lists/<rkey> — one list's members, paginated.
async function handleListPage(request: Request, env: Env, rkey: string): Promise<Response> {
  const found = await uiSession(request, env);
  if (!found) return signInPrompt(env);

  const url = new URL(request.url);
  const { page, nonce } = await readListPage(
    found.acting,
    rkey,
    APPVIEW,
    url.searchParams.get("cursor") ?? undefined,
  );
  await persistNonce(env, found.session, nonce);
  if (!page) return page404();

  return listDetailPage(env, found.session.handle, page, url.searchParams.get("done"));
}

async function handleSetPurpose(request: Request, env: Env): Promise<Response> {
  const found = await uiSession(request, env);
  if (!found) return signInPrompt(env);

  const form = await request.formData();
  const rkey = String(form.get("rkey") ?? "");
  const want = String(form.get("purpose") ?? "");
  if (!rkey || (want !== "curatelist" && want !== "modlist")) return redirect("/lists");

  const result = await setListPurpose(found.acting, rkey, want);
  await persistNonce(env, found.session, result.nonce);
  return redirect(`/lists/${rkey}?done=${result.ok ? "purpose" : "failed"}`);
}

async function handleRemoveMember(request: Request, env: Env): Promise<Response> {
  const found = await uiSession(request, env);
  if (!found) return signInPrompt(env);

  const form = await request.formData();
  const rkey = String(form.get("rkey") ?? "");
  // Where to go back to — the list they were looking at.
  const listRkey = String(form.get("list") ?? "");
  if (!rkey) return redirect(listRkey ? `/lists/${listRkey}` : "/lists");

  const result = await deleteListItem(found.acting, rkey);
  await persistNonce(env, found.session, result.nonce);
  const where = listRkey ? `/lists/${listRkey}` : "/lists";
  return redirect(`${where}?done=${result.ok ? "removed" : "failed"}`);
}

async function handleDeleteList(request: Request, env: Env): Promise<Response> {
  const found = await uiSession(request, env);
  if (!found) return signInPrompt(env);

  const form = await request.formData();
  const rkey = String(form.get("rkey") ?? "");
  if (!rkey) return redirect("/lists");

  const result = await deleteList(found.acting, rkey);
  await persistNonce(env, found.session, result.nonce);
  // Back to the index either way — the list they were on may be gone.
  return redirect(`/lists?done=${result.ok ? "deleted" : "failed"}`);
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

function page404(): Response {
  return page("not found", `<p class="bad">no list with that id.</p>`, 404);
}

function signInPrompt(env: Env): Response {
  return page(
    "sign up",
    `<p>sign up to see and edit your lists.</p>
<form method="post" action="/login">
  <input name="handle" placeholder="your.handle" autocapitalize="off" autocorrect="off" spellcheck="false">
  <button type="submit">sign up</button>
</form>`,
  );
}

const FLASH: Record<string, string> = {
  removed: "took them off.",
  deleted: "deleted that list.",
  purpose: "changed what that list is for.",
  failed: "that didn't work — nothing changed.",
};

function flashNote(flash: string | null): string {
  if (!flash || !FLASH[flash]) return "";
  return `<p class="${flash === "failed" ? "bad" : "good"}">${FLASH[flash]}</p>`;
}

function whoBar(handle: string): string {
  return `<p class="who">signed in as <strong>${escapeHtml(handle)}</strong> ·
    <form method="post" action="/logout" class="inline"><button type="submit" class="linkish">sign out</button></form></p>`;
}

// /lists — names, kinds, counts. No members: this is the "what have I got"
// view, and loading every member of every list to render it was what made the
// old page slow.
function listsPage(
  env: Env,
  handle: string,
  lists: ListSummary[],
  flash: string | null,
): Response {
  const body = lists.length
    ? `<ul class="listindex">${lists.map(renderListRow).join("")}</ul>`
    : `<p>no lists yet. reply to someone's post with <code>@${escapeHtml(env.BOT_HANDLE)} cool posters</code> — or any name — and they'll land on a list called that.</p>
<p class="fine">you can also <a href="https://bsky.app/messages">DM @${escapeHtml(env.BOT_HANDLE)}</a> instead of tagging it. same bot, and better for anything you'd rather keep off a public thread.</p>`;

  return page(
    "your lists",
    `${whoBar(handle)}
${flashNote(flash)}
${body}
<p class="fine">these live in your own repo. anything you change here changes it there. you can tag <strong>@${escapeHtml(env.BOT_HANDLE)}</strong> under a post or DM it — either works.</p>`,
  );
}

function renderListRow(l: ListSummary): string {
  const count =
    l.memberCount === null
      ? `<span class="count">—</span>`
      : `<span class="count">${l.memberCount}</span>`;
  const kind =
    l.purpose === "modlist" ? `<span class="kind mod">mute/block</span>` : "";

  return `<li>
  <a class="listlink" href="/lists/${escapeAttr(l.rkey)}">
    <span class="listname">${escapeHtml(l.name)}</span>
    ${kind}
    ${count}
  </a>
  <form method="post" action="/lists/delete" class="inline"
    onsubmit="return confirm('delete &quot;${escapeAttr(l.name)}&quot; and everyone on it?')">
    <input type="hidden" name="rkey" value="${escapeAttr(l.rkey)}">
    <button type="submit" class="linkish danger">delete</button>
  </form>
</li>`;
}

// /lists/<rkey> — one list: its members, and the settings that belong to a
// list rather than to the collection of them.
function listDetailPage(
  env: Env,
  handle: string,
  l: ListPage,
  flash: string | null,
): Response {
  const members = l.members.length
    ? `<ul class="members">${l.members.map((m) => renderMember(m, l.rkey)).join("")}</ul>`
    : `<p class="empty">nobody on this one yet. tag me in a reply and tell me who to add.</p>`;

  const more = l.cursor
    ? `<p class="more"><a href="/lists/${escapeAttr(l.rkey)}?cursor=${encodeURIComponent(l.cursor)}">next page →</a></p>`
    : "";

  // The purpose toggle. A curatelist can't be muted or blocked at all, so this
  // is the difference between a list that can do what someone wants and one
  // that can't — worth an explanation rather than a bare switch.
  const otherPurpose = l.purpose === "modlist" ? "curatelist" : "modlist";
  const purposeNote =
    l.purpose === "modlist"
      ? `this is a <strong>mute/block list</strong> — you or anyone else can point a mute or a block at it.`
      : `this is a <strong>curation list</strong> — good for feeds and starter packs, but a mute or block can't point at it.`;

  return page(
    escapeHtml(l.name),
    `${whoBar(handle)}
<p class="crumb"><a href="/lists">← all lists</a></p>
${flashNote(flash)}
<h2 class="listtitle">${escapeHtml(l.name)}${
      l.memberCount !== null ? ` <span class="count">${l.memberCount}</span>` : ""
    }</h2>
<p class="listlinks">
  <a href="https://bsky.app/profile/${escapeHtml(handle)}/lists/${escapeAttr(l.rkey)}">open in bluesky</a>
</p>
${members}
${more}
<section class="settings">
  <p class="fine">${purposeNote}</p>
  <form method="post" action="/lists/purpose" class="inline">
    <input type="hidden" name="rkey" value="${escapeAttr(l.rkey)}">
    <input type="hidden" name="purpose" value="${otherPurpose}">
    <button type="submit" class="linkish">make it a ${
      otherPurpose === "modlist" ? "mute/block list" : "curation list"
    }</button>
  </form>
  <p class="fine">nobody is removed when you switch.</p>
  <form method="post" action="/lists/delete" class="inline"
    onsubmit="return confirm('delete &quot;${escapeAttr(l.name)}&quot; and everyone on it?')">
    <input type="hidden" name="rkey" value="${escapeAttr(l.rkey)}">
    <button type="submit" class="linkish danger">delete this list</button>
  </form>
</section>`,
  );
}

function renderMember(m: ListMember, listRkey: string): string {
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
    <input type="hidden" name="list" value="${escapeAttr(listRkey)}">
    <button type="submit" class="remove" title="take ${escapeAttr(name)} off this list">remove</button>
  </form>
</li>`;
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, "&quot;");
}

// --- the job queue -----------------------------------------------------------

// POST /next-job — the box claims the oldest tag waiting to be resolved.
async function handleNextJob(request: Request, env: Env): Promise<Response> {
  if (!env.QUEUE_TOKEN || request.headers.get("authorization") !== `Bearer ${env.QUEUE_TOKEN}`) {
    return new Response("unauthorized", { status: 401 });
  }
  const job = await claimNextJob(env.STATE);
  if (!job) return new Response(null, { status: 204 });
  return json(job);
}

// POST /outcome — the box reports what the agent decided. THIS is where the
// write happens, because this is where the tokens are.
//
// The intent is a claim from a process that read a stranger's post text, so it
// is validated, not trusted:
//   - a person the agent NAMES is resolved here, against the pools it was given
//     plus resolveHandle. A name it invented doesn't resolve, and the tag fails
//     saying so rather than writing something.
//   - the list name is checked against the user's actual lists when the agent
//     says it already exists.
//   - the reply text is posted as the bot, so it's length-capped and stripped
//     of anything that would make it a mention of someone uninvolved.
//   - every write lands in the TAGGER's own repo, under their own grant. That's
//     the backstop under all of it: the worst case is a row in your own list,
//     named in the reply, one tap from gone.
async function handleOutcome(request: Request, env: Env): Promise<Response> {
  if (!env.OUTCOME_SECRET || request.headers.get("authorization") !== `Bearer ${env.OUTCOME_SECRET}`) {
    return new Response("unauthorized", { status: 401 });
  }

  const body = (await request.json()) as { mentionUri?: string; intent?: AgentIntent };
  const mentionUri = body.mentionUri;
  const intent = body.intent;
  if (!mentionUri || !intent) return json({ error: "need mentionUri and intent" }, 400);

  const job = await getJob(env.STATE, mentionUri);
  if (!job) return json({ error: "no such job" }, 404);

  // Retire it first. A job that half-fails below is better than one the box can
  // claim again and re-run — the user gets a reply either way.
  await retireJob(env.STATE, mentionUri);

  const bot = await botLogin(env);
  const mention: Mention = {
    uri: job.mentionUri,
    cid: job.mentionCid,
    authorDid: job.tagger.did,
    authorHandle: job.tagger.handle,
    text: job.tagText,
    rootUri: job.rootUri,
    rootCid: job.rootCid,
  };

  if (intent.action === "none") return json({ ok: true, did: "nothing" });

  if (intent.action === "failed") {
    console.error(`agent failed on ${mentionUri}: ${intent.reason ?? "no reason"}`);
    await reply(bot, mention, `something went wrong working that out, sorry — nothing changed.`);
    return json({ ok: true, did: "reported failure" });
  }

  if (intent.action === "ask") {
    await reply(bot, mention, safeReply(intent.reply) ?? `which list did you mean?`);
    return json({ ok: true, did: "asked" });
  }

  // A question, answered in the thread. Writes nothing — so it needs no acting
  // session and no list name, and it falls out before every check below.
  // Someone asking "who's on ceramics?" deserves the answer, not a link to a
  // webpage.
  // A question answered, or a plain conversational reply. Neither writes
  // anything, so both stop here.
  //
  // `answer` uses the long form: "who's on that list" for a 35-member list is a
  // legitimately long answer, and reply() posts a thread rather than cutting it
  // off. `say` is conversational and should be one line anyway.
  if (intent.action === "answer" || intent.action === "say") {
    const text = intent.action === "answer" ? longReply(intent.reply) : safeReply(intent.reply);
    if (!text) {
      await reply(bot, mention, `i couldn't work that out, sorry.`);
      return json({ ok: true, did: "empty answer" });
    }
    await reply(bot, mention, text);
    return json({ ok: true, did: "answered" });
  }

  // One or more things to do. Most tags are one, and those arrive as the flat
  // fields with no `steps` — so the single step below IS the flat intent, and
  // the common path through this function is unchanged.
  const steps: IntentStep[] = intent.steps?.length
    ? intent.steps
    : [
        {
          action: intent.action as "add" | "remove" | "create",
          subjectIndex: intent.subjectIndex,
          subjectHandle: intent.subjectHandle,
          subjectHandles: intent.subjectHandles,
          list: intent.list,
          listExists: intent.listExists,
          purpose: intent.purpose,
        },
      ];

  const found = await actingSession(env, job.tagger.did);
  if (!found) {
    await reply(bot, mention, `sign up once at ${env.SITE_URL} and i'll build and manage lists for you.`);
    return json({ ok: true, did: "not signed in" });
  }

  const ctx: StepContext = { env, bot, job, acting: found };

  // Sequential, not parallel: every step writes to the same repo, a later step
  // may need the list an earlier one made, and each write returns a DPoP nonce
  // the next one has to carry.
  const outcomes: StepOutcome[] = [];
  for (const step of steps) {
    outcomes.push(await runStep(step, ctx));
  }

  // One tag, one reply. The agent's own wording wins when there was a single
  // step and it did exactly what the agent thought — that wording is most of
  // why the bot reads well. Anything else gets composed from what happened,
  // because an agent's one-liner can't be honest about a partial result.
  const single = outcomes.length === 1 ? outcomes[0] : null;
  const agentReply =
    single && single.usedAgentWording ? safeReply(intent.reply) : null;

  const text = agentReply
    ? agentReply + (single?.listUri ? `\n${listWebUrl(job.tagger.did, single.listUri)}` : "")
    : composeReply(outcomes, job.tagger.did);

  await reply(bot, mention, text);
  return json({
    ok: true,
    did: outcomes.map((o) => o.action).join("+"),
    steps: outcomes.length,
  });
}

// What one step needs, and what it did.

interface StepContext {
  env: Env;
  bot: BotSession;
  job: QueueJob;
  acting: { acting: ActingSession; session: StoredSession };
}

interface StepOutcome {
  action: "add" | "remove" | "create" | "deleteList" | "renameList" | "setPurpose" | "noop";
  // What a renamed list used to be called, so the reply can say both.
  previousName?: string;
  listName: string;
  listUri?: string;
  // Which kind of list this was. The reply names people on a curation list and
  // deliberately doesn't on a mute/block list — see composeReply.
  purpose: "curatelist" | "modlist";
  // Who it actually wrote, and who it couldn't.
  done: { handle: string }[];
  failedPeople: { handle: string }[];
  unresolved: string[];
  // Set when nothing was attempted — no list name, a name that didn't resolve.
  problem?: string;
  // "already on that list" / "wasn't on it" — true but not a failure.
  alreadyThere?: boolean;
  notThere?: boolean;
  created?: boolean;
  // Whether the agent's own reply text would be accurate for this outcome.
  usedAgentWording: boolean;
}

// Run one step: resolve who, then write.
//
// Returns what happened rather than replying, so the caller can say one honest
// thing about however many steps there were.
async function runStep(step: IntentStep, ctx: StepContext): Promise<StepOutcome> {
  const { env, bot, job, acting: found } = ctx;

  const base: StepOutcome = {
    action: "noop",
    listName: (step.list ?? "").trim(),
    purpose: step.purpose === "modlist" ? "modlist" : "curatelist",
    done: [],
    failedPeople: [],
    unresolved: [],
    usedAgentWording: false,
  };

  const listName = base.listName;
  if (!listName) {
    return { ...base, problem: "i couldn't work out which list you meant" };
  }

  const purpose = step.purpose === "modlist" ? "modlist" : "curatelist";

  // Who this acts on.
  //
  // Three ways the agent can answer, in order of directness: an index into the
  // candidates the Worker built (parent author, plus anyone @-mentioned), a
  // name it worked out from `follows` or the thread, or a list of names for
  // "add everyone in this thread".
  //
  // A NAME the agent gives is resolved here, against the same pools it was
  // given plus resolveHandle. It resolves or the step fails and says so — a
  // name the agent invented has nowhere to land.
  const candidates = job.candidates ?? (job.subject ? [job.subject] : []);
  const pools = [
    candidates.map((c) => ({ did: c.did, handle: c.handle, displayName: c.displayName })),
    job.follows ?? [],
    (job.thread ?? [])
      .filter((t) => t.did)
      .map((t) => ({ did: t.did, handle: t.handle })),
  ];

  const named = step.subjectHandles?.length
    ? step.subjectHandles
    : step.subjectHandle
      ? [step.subjectHandle]
      : [];

  let people: { did: string; handle: string }[] = [];
  const unresolved: string[] = [];

  if (named.length) {
    for (const n of named) {
      const person = await resolvePerson(bot, n, pools);
      if (person) people.push(person);
      else unresolved.push(n);
    }
  } else if (
    typeof step.subjectIndex === "number" &&
    Number.isInteger(step.subjectIndex) &&
    step.subjectIndex >= 0 &&
    step.subjectIndex < candidates.length
  ) {
    const c = candidates[step.subjectIndex];
    people = [{ did: c.did, handle: c.handle }];
  } else if (step.action !== "create" && candidates[0]) {
    people = [{ did: candidates[0].did, handle: candidates[0].handle }];
  }

  // Nothing the agent named resolved. Report the name it used — "i couldn't
  // find X" is actionable in a way that silence is not.
  if (!people.length && unresolved.length) {
    return { ...base, unresolved, problem: "unresolved" };
  }

  const persistNonceFrom = async (nonce?: string) => {
    if (nonce && nonce !== found.session.dpopNonce) {
      found.session.dpopNonce = nonce;
      await putSession(env.STATE, env.SESSION_ENC_KEY, found.session).catch((err) =>
        console.error(`nonce persist failed: ${err}`),
      );
    }
  };

  // Managing the list itself rather than who's on it. These act on a list the
  // agent NAMED, so the rkey is looked up here — the agent never handles rkeys.
  if (
    step.action === "deleteList" ||
    step.action === "renameList" ||
    step.action === "setPurpose"
  ) {
    const target = await findListRkey(found.acting, listName);
    if (!target) {
      return { ...base, problem: `you don't have a list called "${listName}"` };
    }

    if (step.action === "deleteList") {
      const r = await deleteList(found.acting, target.rkey);
      await persistNonceFrom(r.nonce);
      return r.ok
        ? { ...base, action: "deleteList", listName: target.name }
        : { ...base, problem: `couldn't delete "${target.name}"` };
    }

    if (step.action === "renameList") {
      const newName = (step.newName ?? "").trim();
      if (!newName) return { ...base, problem: "i didn't catch the new name" };
      const r = await renameList(found.acting, target.rkey, newName);
      await persistNonceFrom(r.nonce);
      return r.ok
        ? {
            ...base,
            action: "renameList",
            listName: newName,
            previousName: target.name,
            listUri: target.uri,
          }
        : { ...base, problem: `couldn't rename "${target.name}"` };
    }

    const r = await setListPurpose(found.acting, target.rkey, purpose);
    await persistNonceFrom(r.nonce);
    return r.ok
      ? { ...base, action: "setPurpose", listName: target.name, purpose, listUri: target.uri }
      : { ...base, problem: `couldn't change "${target.name}"` };
  }

  // "create" makes the list and adds nobody.
  if (step.action === "create" || !people.length) {
    const created = await ensureList(found.acting, listName, purpose);
    await persistNonceFrom(created.nonce);
    if (!created.ok) {
      return { ...base, action: "create", problem: "that didn't work" };
    }
    return {
      ...base,
      action: "create",
      listName: created.listName ?? listName,
      purpose,
      listUri: created.listUri,
      created: !created.alreadyThere,
      alreadyThere: created.alreadyThere,
      usedAgentWording: !created.alreadyThere,
    };
  }

  // Everyone named, not just the first — "add everyone in this thread" is a
  // normal thing to want, and doing one of four silently is worse than
  // refusing.
  const done: { handle: string }[] = [];
  const failedPeople: { handle: string }[] = [];
  let listUri: string | undefined;
  let finalName = listName;
  let alreadyThere = false;
  let notThere = false;

  for (const person of people) {
    const result =
      step.action === "add"
        ? await addToList(found.acting, listName, person.did, purpose)
        : await removeFromList(found.acting, listName, person.did);
    await persistNonceFrom(result.nonce);
    if (result.listUri) listUri = result.listUri;
    if (result.listName) finalName = result.listName;
    if (result.ok) {
      done.push({ handle: person.handle });
      if (result.alreadyThere) alreadyThere = true;
      if (result.notThere) notThere = true;
    } else {
      failedPeople.push({ handle: person.handle });
    }
  }

  return {
    action: step.action === "remove" ? "remove" : "add",
    listName: finalName,
    purpose,
    listUri,
    done,
    failedPeople,
    unresolved,
    alreadyThere,
    notThere,
    // The agent's wording is only safe when one person was acted on, it worked,
    // and nothing surprising happened.
    usedAgentWording:
      people.length === 1 &&
      done.length === 1 &&
      !failedPeople.length &&
      !unresolved.length &&
      !alreadyThere &&
      !notThere,
  };
}

// One reply for however many steps ran.
//
// Built from what actually happened, never from what was intended: a reply
// saying "added @alice" when the write failed is worse than a blunter accurate
// one.
function composeReply(outcomes: StepOutcome[], taggerDid: string): string {
  const parts: string[] = [];
  const problems: string[] = [];

  for (const o of outcomes) {
    if (o.problem === "unresolved") {
      const names = o.unresolved.map((n) => `"${n.replace(/^@/, "")}"`).join(" or ");
      problems.push(`i couldn't work out who ${names} is`);
      continue;
    }
    if (o.problem) {
      problems.push(o.problem);
      continue;
    }

    if (o.action === "deleteList") {
      parts.push(`deleted "${o.listName}"`);
      continue;
    }
    if (o.action === "renameList") {
      parts.push(
        o.previousName && o.previousName !== o.listName
          ? `renamed "${o.previousName}" to "${o.listName}"`
          : `renamed it to "${o.listName}"`,
      );
      continue;
    }
    if (o.action === "setPurpose") {
      parts.push(
        o.purpose === "modlist"
          ? `"${o.listName}" is a mute/block list now`
          : `"${o.listName}" is a curation list now`,
      );
      continue;
    }
    if (o.action === "create") {
      parts.push(
        o.alreadyThere
          ? `you've already got "${o.listName}"`
          : `made you a list called "${o.listName}"`,
      );
      continue;
    }

    // Don't name people the bot put on a mute or block list.
    //
    // The handles carry no mention facet, so nobody is notified — but the post
    // is still public, and it's still the BOT saying "these accounts belong on
    // a blocklist". The list itself is the user's own business; a reply naming
    // its members in the open is listbot's doing, and it isn't the bot's place
    // to publish that about anyone.
    //
    // Counts instead, with the link. The owner sees exactly who on the list
    // page, which is where that belongs.
    const quiet = o.purpose === "modlist";
    const n = o.done.length;
    const who = quiet
      ? n === 1
        ? "them"
        : `${n} accounts`
      : o.done.map((d) => `@${d.handle}`).join(", ");

    if (o.done.length) {
      if (o.action === "add") {
        parts.push(
          o.alreadyThere && n === 1
            ? quiet
              ? `they were already on "${o.listName}"`
              : `@${o.done[0].handle} was already on "${o.listName}"`
            : `added ${who} to "${o.listName}"`,
        );
      } else {
        parts.push(
          o.notThere && n === 1
            ? quiet
              ? `they weren't on "${o.listName}"`
              : `@${o.done[0].handle} wasn't on "${o.listName}"`
            : `took ${who} off "${o.listName}"`,
        );
      }
    }
    if (o.failedPeople.length) {
      problems.push(
        quiet
          ? `couldn't do ${o.failedPeople.length} of them`
          : `couldn't do ${o.failedPeople.map((f) => `@${f.handle}`).join(", ")}`,
      );
    }
    if (o.unresolved.length) {
      problems.push(
        `couldn't find ${o.unresolved.map((n) => `"${n.replace(/^@/, "")}"`).join(", ")}`,
      );
    }
  }

  let text = parts.length
    ? parts.join(" and ") + "."
    : "that didn't work, sorry — nothing changed on your lists.";
  if (problems.length) text += ` ${problems.join(", ")}.`;

  // One link, for the last list touched — several links in a reply is noise.
  //
  // Summarise the people rather than listing them when naming everyone would
  // push the post over. Eleven spam handles is 271 characters and reads as a
  // wall anyway; "added 11 accounts to X" is both shorter and easier to take
  // in. The list itself is one tap away through the link.
  // No link to a list that was just deleted — it 404s.
  const linkable = [...outcomes]
    .reverse()
    .find((o) => o.listUri && o.action !== "deleteList");
  const link = linkable?.listUri ? `\n${listWebUrl(taggerDid, linkable.listUri)}` : "";

  if (graphemes(text + link).length > MAX_REPLY_GRAPHEMES) {
    const summary: string[] = [];
    for (const o of outcomes) {
      if (o.problem || !o.done.length) continue;
      const n = o.done.length;
      const people = n === 1 ? `@${o.done[0].handle}` : `${n} accounts`;
      summary.push(
        o.action === "add"
          ? `added ${people} to "${o.listName}"`
          : o.action === "remove"
            ? `took ${people} off "${o.listName}"`
            : `made you a list called "${o.listName}"`,
      );
    }
    if (summary.length) {
      text = summary.join(" and ") + ".";
      if (problems.length) text += ` ${problems.join(", ")}.`;
    }
  }

  return text + link;
}

// The agent's reply text goes out as a post from the bot account, so it gets
// checked rather than posted as-is.
//
// The mention strip is the important one: an @handle in a post becomes a real
// notification for that person only if the bot facets it, and the bot doesn't —
// but it still READS as the bot talking about someone uninvolved, and a prompt
// injection that gets "@someone you should follow this scam" into a bot's voice
// is worth not shipping. The subject's own handle is added back by the caller
// through replyText, so nothing legitimate is lost.
// Bluesky's post limit is 300 GRAPHEMES. Counting with .length counts UTF-16
// code units instead, so an emoji costs 2 and anything outside the BMP
// miscounts — a reply full of emoji would get truncated well before the real
// limit. Intl.Segmenter counts what Bluesky counts.
//
// A little under 300 so the link the Worker appends always fits.
const MAX_REPLY_GRAPHEMES = 280;

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

function graphemes(text: string): string[] {
  return Array.from(segmenter.segment(text), (seg) => seg.segment);
}

function safeReply(text: string | undefined): string | null {
  if (!text) return null;
  let t = text.replace(/\s+/g, " ").trim();
  if (!t) return null;
  // Strip URLs — the only link in a reply should be the one we add.
  t = t.replace(/https?:\/\/\S+/g, "").trim();
  const g = graphemes(t);
  if (g.length > MAX_REPLY_GRAPHEMES) {
    t = g.slice(0, MAX_REPLY_GRAPHEMES - 1).join("").trimEnd() + "…";
  }
  return t || null;
}

// Same cleaning as safeReply but WITHOUT the length cap — for replies that are
// allowed to run to a thread. reply() does the splitting.
const MAX_THREAD_GRAPHEMES = 280 * 5;

function longReply(text: string | undefined): string | null {
  if (!text) return null;
  let t = text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (!t) return null;
  t = t.replace(/https?:\/\/\S+/g, "").trim();
  // A ceiling even here: five posts is a long answer and anything past it is
  // the agent having lost the plot, not a genuinely longer list.
  const g = graphemes(t);
  if (g.length > MAX_THREAD_GRAPHEMES) {
    t = g.slice(0, MAX_THREAD_GRAPHEMES - 1).join("").trimEnd() + "…";
  }
  return t || null;
}

// Split a long reply into posts that fit, breaking on sentence ends where it
// can and word boundaries otherwise.
//
// Truncation was fine when every reply was "added @alice to ceramics", and
// wrong the moment the bot could answer questions: "who's on that list?" for a
// 35-member list is a legitimately long answer, and cutting it mid-handle turns
// a good answer into a broken one. The prompt used to ask the agent to keep
// answers short, which is working around the limitation rather than fixing it.
export function splitForPosts(text: string, limit = MAX_REPLY_GRAPHEMES): string[] {
  const t = text.trim();
  if (!t) return [];
  if (graphemes(t).length <= limit) return [t];

  const parts: string[] = [];
  let rest = t;
  // Leave room for the " 1/4" counter the caller appends.
  const room = limit - 5;

  while (graphemes(rest).length > room) {
    const window = graphemes(rest).slice(0, room).join("");
    // Prefer a sentence end, then a comma or newline, then any space. Below
    // half the window a break point is doing more harm than a clean word cut.
    let cut = Math.max(
      window.lastIndexOf(". "),
      window.lastIndexOf("! "),
      window.lastIndexOf("? "),
      window.lastIndexOf("\n"),
    );
    if (cut < room / 2) cut = Math.max(window.lastIndexOf(", "), window.lastIndexOf(" "));
    if (cut < room / 2) cut = window.length;
    else cut += 1;

    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);

  // Number them, so a reader knows there's more and knows when it ended.
  return parts.length > 1
    ? parts.map((p, i) => `${p} ${i + 1}/${parts.length}`)
    : parts;
}

// --- DMs ---------------------------------------------------------------------
//
// The same bot, reached privately. A lot of what people ask for doesn't belong
// in a public thread: "delete my ceramics list", "who's on people I blocked",
// "add these six accounts". Tagging works and stays the front door, but a DM is
// the right place for anything about a list's contents.
//
// The chat API is a separate service (api.bsky.chat) reached through a proxy
// header, but it authenticates with the SAME app-password session the bot
// already uses — no new credential and no new scope. The bot's
// chat.bsky.actor.declaration record is set to allowIncoming: "all", without
// which only accounts it follows could message it.
//
// Everything after discovery is shared with tags: the same job, the same agent,
// the same writes. A DM is a different doorway, not a different bot.

const CHAT_SERVICE = "https://api.bsky.chat";
const CHAT_PROXY = "did:web:api.bsky.chat#bsky_chat";

// How far back to look in a conversation for context. The agent reads these the
// way it reads a thread.
const DM_HISTORY = 10;

async function chatFetch(
  bot: BotSession,
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<Response> {
  return fetch(`${CHAT_SERVICE}/xrpc/${path}`, {
    method: init?.method ?? "GET",
    headers: {
      authorization: `Bearer ${bot.accessJwt}`,
      "atproto-proxy": CHAT_PROXY,
      ...(init?.body ? { "content-type": "application/json" } : {}),
    },
    ...(init?.body ? { body: JSON.stringify(init.body) } : {}),
  });
}

interface ChatMessage {
  id: string;
  text?: string;
  sender?: { did?: string };
  sentAt?: string;
}

// Conversations with something unread. listConvos reports unreadCount, so this
// costs one call on a quiet tick.
async function unreadConvos(
  bot: BotSession,
): Promise<{ id: string; memberDid: string; memberHandle: string }[]> {
  const res = await chatFetch(bot, "chat.bsky.convo.listConvos?limit=20");
  if (!res.ok) {
    console.error(`listConvos failed: ${res.status} ${await res.text()}`);
    return [];
  }
  const j = (await res.json()) as {
    convos?: {
      id: string;
      unreadCount?: number;
      members?: { did: string; handle: string }[];
    }[];
  };
  const out: { id: string; memberDid: string; memberHandle: string }[] = [];
  for (const c of j.convos ?? []) {
    if (!c.unreadCount) continue;
    // A 1:1 conversation has two members; the other one is the person talking.
    const other = (c.members ?? []).find((m) => m.did !== bot.did);
    if (!other) continue;
    out.push({ id: c.id, memberDid: other.did, memberHandle: other.handle });
  }
  return out;
}

async function convoMessages(bot: BotSession, convoId: string): Promise<ChatMessage[]> {
  const res = await chatFetch(
    bot,
    `chat.bsky.convo.getMessages?convoId=${encodeURIComponent(convoId)}&limit=${DM_HISTORY}`,
  );
  if (!res.ok) {
    console.error(`getMessages failed: ${res.status} ${await res.text()}`);
    return [];
  }
  const j = (await res.json()) as { messages?: ChatMessage[] };
  // Newest first from the API; the agent reads oldest first like a thread.
  return (j.messages ?? []).slice().reverse();
}

async function sendDm(bot: BotSession, convoId: string, text: string): Promise<void> {
  // Same splitting as a reply: a long answer becomes several messages rather
  // than getting cut off.
  for (const part of splitForPosts(text)) {
    const facets = buildFacets(part);
    const res = await chatFetch(bot, "chat.bsky.convo.sendMessage", {
      method: "POST",
      body: {
        convoId,
        message: { text: part, ...(facets.length ? { facets } : {}) },
      },
    });
    if (!res.ok) {
      console.error(`sendMessage failed: ${res.status} ${await res.text()}`);
      return;
    }
  }
}

async function markRead(bot: BotSession, convoId: string): Promise<void> {
  const res = await chatFetch(bot, "chat.bsky.convo.updateRead", {
    method: "POST",
    body: { convoId },
  });
  if (!res.ok) console.error(`updateRead failed: ${res.status}`);
}

// Handle the unread messages in one conversation.
//
// This assembles the same job a tag does and hands it to the same agent. The
// differences are all in what a DM can't have: no parent post, so no default
// subject, and no thread — the conversation IS the thread.
async function handleConvo(
  env: Env,
  bot: BotSession,
  convo: { id: string; memberDid: string; memberHandle: string },
): Promise<void> {
  const messages = await convoMessages(bot, convo.id);
  const theirs = messages.filter((m) => m.sender?.did === convo.memberDid);
  const latest = theirs[theirs.length - 1];
  if (!latest?.text?.trim()) {
    await markRead(bot, convo.id);
    return;
  }

  // Keyed on the message id, so the same message can't be acted on twice — the
  // equivalent of the handled: marker on a tag.
  const handledKey = `${HANDLED_PREFIX}dm:${latest.id}`;
  if (await env.STATE.get(handledKey)) {
    await markRead(bot, convo.id);
    return;
  }
  await env.STATE.put(handledKey, "1", { expirationTtl: HANDLED_TTL });

  const found = await actingSession(env, convo.memberDid);
  if (!found) {
    await sendDm(
      bot,
      convo.id,
      `sign up once at ${env.SITE_URL} and i'll build and manage lists for you.`,
    );
    await markRead(bot, convo.id);
    return;
  }

  const rate = await checkRateLimit(
    env.STATE,
    convo.memberDid,
    parseInt(env.RATE_LIMIT_TAGS ?? "100", 10) || 100,
    parseInt(env.RATE_LIMIT_WINDOW_MINUTES ?? "60", 10) || 60,
  );
  if (!rate.allowed) {
    await sendDm(bot, convo.id, `that's my limit for the hour — try again in ${rate.resetsInMin}m.`);
    await markRead(bot, convo.id);
    return;
  }

  const { lists } = await readListSummaries(found.acting, APPVIEW).catch(() => ({
    lists: [] as ListSummary[],
  }));

  const payload: JobPayload = {
    kind: "listbot",
    // The convo id rides in mentionUri so /outcome can find its way back here.
    // A DM has no post to reply to, so this is an addressing token, not a URI.
    mentionUri: `dm:${convo.id}:${latest.id}`,
    mentionCid: "",
    rootUri: "",
    rootCid: "",
    tagText: latest.text,
    tagger: { did: convo.memberDid, handle: found.session.handle },
    // No parent post, so no default subject. Everyone has to be named, which
    // the agent is good at now.
    subject: undefined,
    candidates: [],
    // The conversation reads as the thread.
    thread: messages
      .filter((m) => m.text?.trim())
      .map((m) => {
        const mine = m.sender?.did === bot.did;
        return {
          author: mine ? env.BOT_HANDLE : convo.memberHandle,
          handle: mine ? env.BOT_HANDLE : convo.memberHandle,
          did: m.sender?.did ?? "",
          text: m.text ?? "",
        };
      }),
    follows: await taggerFollows(bot, convo.memberDid),
    lists: lists.map((l) => ({
      name: l.name,
      memberCount: l.memberCount ?? 0,
      sampleMembers: [],
    })),
    outcomeUrl: `${env.SITE_URL}/outcome`,
  };

  if (!(await enqueueJob(env.STATE, payload))) {
    await sendDm(bot, convo.id, `something went wrong queueing that, sorry — try again?`);
  }
  await markRead(bot, convo.id);
}

async function runDmWatcher(env: Env, bot: BotSession): Promise<void> {
  const convos = await unreadConvos(bot);
  for (const c of convos) {
    try {
      await handleConvo(env, bot, c);
    } catch (err) {
      console.error(`handling convo ${c.id} failed: ${err}`);
    }
  }
}
