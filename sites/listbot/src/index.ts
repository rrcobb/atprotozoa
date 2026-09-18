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

    // Their own follow-up to their own message: still theirs to us, provided
    // the message before it was in this exchange with the bot.
    if (!parent.includes(`/${n.author.did}/`)) return false;
    const grandparent = await parentOfPost(session, parent);
    return isOurs(grandparent);
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
      };
    });
}

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
    // Your own post is not a subject — "add me to my own list" isn't what
    // anyone means by tagging their own thread. But it's only a dead end if
    // they also didn't name anyone: "@listbot add @alice to ceramics" under
    // your own post is a perfectly sensible way to use this.
    if (subject.did === m.authorDid) {
      subject = null;
      if (!m.mentionedDids?.length) {
        await reply(
          bot,
          m,
          `that's your own post — reply to someone else's, or tell me who to add.`,
        );
        return;
      }
    }
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
    candidates: await describeCandidates(bot, subject, m.mentionedDids ?? []),
    thread: m.parentUri ? await threadContext(bot, m.parentUri) : [],
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
): Promise<JobSubject[]> {
  const dids: { did: string; handle: string }[] = [];
  if (parentAuthor) dids.push(parentAuthor);
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
      chain.push({
        author: handle,
        handle,
        did: node.post.author?.did ?? "",
        text: node.post.record?.text ?? "",
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
  post?: { author?: { handle?: string; did?: string }; record?: { text?: string } };
  parent?: ThreadNode;
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

async function reply(bot: BotSession, m: Mention, text: string): Promise<void> {
  const facets = buildFacets(text);
  const record = {
    $type: "app.bsky.feed.post",
    text,
    createdAt: new Date().toISOString(),
    ...(facets.length ? { facets } : {}),
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
    : `<p>no lists yet. reply to someone's post with <code>@${escapeHtml(env.BOT_HANDLE)} cool posters</code> — or any name — and they'll land on a list called that.</p>`;

  return page(
    "your lists",
    `${whoBar(handle)}
${flashNote(flash)}
${body}
<p class="fine">these live in your own repo. anything you change here changes it there.</p>`,
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
  if (intent.action === "answer") {
    const text = safeReply(intent.reply);
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
  action: "add" | "remove" | "create" | "noop";
  listName: string;
  listUri?: string;
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

    if (o.action === "create") {
      parts.push(
        o.alreadyThere
          ? `you've already got "${o.listName}"`
          : `made you a list called "${o.listName}"`,
      );
      continue;
    }

    const who = o.done.map((d) => `@${d.handle}`).join(", ");
    if (o.done.length) {
      if (o.action === "add") {
        parts.push(
          o.alreadyThere && o.done.length === 1
            ? `@${o.done[0].handle} was already on "${o.listName}"`
            : `added ${who} to "${o.listName}"`,
        );
      } else {
        parts.push(
          o.notThere && o.done.length === 1
            ? `@${o.done[0].handle} wasn't on "${o.listName}"`
            : `took ${who} off "${o.listName}"`,
        );
      }
    }
    if (o.failedPeople.length) {
      problems.push(`couldn't do ${o.failedPeople.map((f) => `@${f.handle}`).join(", ")}`);
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
  const linkable = [...outcomes].reverse().find((o) => o.listUri);
  if (linkable?.listUri) text += `\n${listWebUrl(taggerDid, linkable.listUri)}`;
  return text;
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
const MAX_REPLY_CHARS = 280;

function safeReply(text: string | undefined): string | null {
  if (!text) return null;
  let t = text.replace(/\s+/g, " ").trim();
  if (!t) return null;
  // Strip URLs — the only link in a reply should be the one we add.
  t = t.replace(/https?:\/\/\S+/g, "").trim();
  if (t.length > MAX_REPLY_CHARS) t = t.slice(0, MAX_REPLY_CHARS - 1).trimEnd() + "…";
  return t || null;
}
