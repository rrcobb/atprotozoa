// buildthis Worker — handle endpoint + the mention-watcher.
//
// Two entrypoints (see notes/80-buildthis-bot.md):
//   fetch()     -> serves /.well-known/atproto-did (Bluesky handle verification)
//                  and the static landing page for everything else.
//   scheduled() -> the watcher: every couple minutes, poll the bot's mentions,
//                  gate on Rob's mutuals + the daily/per-person budget, and fire
//                  a repository_dispatch that builds the idea. Non-mutuals get a
//                  one-time reply that tags Rob.

interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  STATE: KVNamespace;

  BOT_DID: string;
  ROB_DID: string;
  BOT_IDENTIFIER: string;
  GITHUB_REPO: string;

  MAX_BRIEF_CHARS: string;

  // secrets
  BOT_APP_PASSWORD: string;
  GITHUB_TOKEN: string;
  // Shared secret the builder presents on POST /outcome so a random caller can't
  // forge build outcomes into the event log. Set with `wrangler secret put
  // OUTCOME_SECRET` here and `gh secret set OUTCOME_SECRET` for the Action.
  OUTCOME_SECRET: string;
}

const PDS = "https://bsky.social";
const APPVIEW = "https://public.api.bsky.app";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Bluesky handle verification: the bot's DID as plain text, nothing else.
    // Kept FIRST and unchanged — this is the bot's critical handle endpoint.
    if (url.pathname === "/.well-known/atproto-did") {
      return new Response(env.BOT_DID, {
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "no-cache",
        },
      });
    }

    // Read endpoint for the logs site (logs.bisks.net). Returns the tag/outcome
    // event log as JSON, newest first. Read-only, CORS-open (public data — it's
    // the same tags/outcomes already visible on Bluesky), so logs.bisks.net can
    // fetch it cross-origin. The KV binding stays on this one worker (house style:
    // one site = one worker); logs.bisks.net is a pure reader of this endpoint.
    if (url.pathname === "/logs.json") {
      return handleLogsRead(env);
    }

    // Outcome sink for the builder (GitHub Action). The build's final step POSTs
    // its result here — built site name / success|failure / reply text — keyed by
    // the mention uri, so it merges onto the same event the watcher started.
    // Authenticated by a shared secret so a random caller can't forge outcomes.
    if (url.pathname === "/outcome" && request.method === "POST") {
      return handleOutcomePost(request, env);
    }

    return env.ASSETS.fetch(request);
  },

  // Cron entrypoint. Wrapped so a thrown error is logged, not swallowed — a
  // failed tick should be visible in `wrangler tail`, and the next tick retries.
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runWatcher(env));
  },
};

async function runWatcher(env: Env): Promise<void> {
  const session = await login(env);

  // Pull recent mentions. We page a little in case a burst arrived, but the
  // seen-cursor + per-id dedup below is what actually prevents double-handling.
  const mentions = await recentMentions(session);
  if (mentions.length === 0) return;

  for (const m of mentions) {
    // Dedup: skip anything we've already acted on. Keyed by the notification's
    // own uri so a re-list can't re-trigger a build.
    const handledKey = `handled:${m.uri}`;
    if (await env.STATE.get(handledKey)) continue;

    // Log the tag the moment we see it, before any gate. Keyed by the mention
    // uri so subsequent steps (gate, dispatch, and later the build outcome) merge
    // into the SAME record rather than duplicating. See recordEvent + notes on
    // the logs site (sites/logs). Best-effort: a KV write must never abort a tick.
    await recordEvent(env, m.uri, {
      mentionUri: m.uri,
      mentionCid: m.cid,
      authorHandle: m.authorHandle,
      authorDid: m.authorDid,
      text: m.text.slice(0, 600),
      isReply: m.isReply,
    });

    // Rob himself is always allowed (he owns the bot — he's not a "mutual" to be
    // checked; a self-relationship has neither following nor followedBy). Everyone
    // else must be a mutual of Rob's.
    const isAllowed =
      m.authorDid === env.ROB_DID || (await robMutual(env, m.authorDid));

    if (!isAllowed) {
      // Gate result: non-mutual. No dispatch will happen on this path.
      await recordEvent(env, m.uri, { mutual: false, dispatched: false });

      // Reply once, ever, tagging Rob so he can pick it up by hand. The
      // "replied-nonmutual" marker is per-author (not per-post) so someone can't
      // make the bot spam-tag Rob by mentioning it repeatedly.
      const nmKey = `nonmutual-replied:${m.authorDid}`;
      if (!(await env.STATE.get(nmKey))) {
        await replyToPost(
          session,
          m,
          `hi! i only build for @bisks.net's mutuals — tagging @bisks.net so they can take a look.`,
          { "bisks.net": env.ROB_DID },
        );
        await env.STATE.put(nmKey, "1", { expirationTtl: 60 * 60 * 24 * 30 });
      }
      await env.STATE.put(handledKey, "1", { expirationTtl: 60 * 60 * 24 * 7 });
      continue;
    }

    // Gate result: mutual — this tag will be built.
    await recordEvent(env, m.uri, { mutual: true });

    // A mutual: acknowledge the request with a like before doing anything else,
    // so it's visibly clear the bot saw the tag and is working on the build in the
    // background. Guarded by a per-post marker so a dispatch retry (or a re-list)
    // can't stack duplicate likes on the same post.
    const likedKey = `liked:${m.uri}`;
    if (!(await env.STATE.get(likedKey))) {
      await likePost(session, m);
      await env.STATE.put(likedKey, "1", { expirationTtl: 60 * 60 * 24 * 30 });
    }

    // Dispatch the build. There is NO build-count or per-person gate — spend is
    // bounded entirely by the provider spend cap (Rob's call: dollars are the only
    // ceiling). The brief is the tagging post's text; if the tag was a reply, we
    // prepend the ancestor posts so "build this ☝️" resolves to what it points at.
    // All treated as a feature description, not harness instructions.
    const ancestors = await threadContext(session, m);
    const brief = buildBrief(m.text, ancestors, num(env.MAX_BRIEF_CHARS));
    const dispatched = await dispatchBuild(env, {
      brief,
      authorHandle: m.authorHandle,
      // The mention uri keys the event record; the builder echoes it back on the
      // outcome POST so the build result lands on the SAME record.
      mentionUri: m.uri,
      // Everything the reply step needs to answer in-thread.
      replyRootUri: m.rootUri,
      replyRootCid: m.rootCid,
      replyParentUri: m.uri,
      replyParentCid: m.cid,
    });

    // Record whether the dispatch actually left, so a dispatch failure is visible
    // in the timeline rather than looking like a build that silently never ran.
    await recordEvent(env, m.uri, { dispatched });

    if (dispatched) {
      // Only mark handled if the dispatch actually left. A failed dispatch stays
      // un-handled so the next tick retries it.
      await env.STATE.put(handledKey, "1", { expirationTtl: 60 * 60 * 24 * 7 });
    }
  }
}

// --- Event log -------------------------------------------------------------
//
// The bot's tags-and-outcomes timeline. One record per mention, keyed by the
// mention uri (`event:<uri>` in the STATE KV), accumulated across the steps the
// watcher already runs (seen -> gate -> dispatch) and finished by the builder's
// outcome POST. The logs site (sites/logs) reads these via GET /logs.json.
//
// KV, not D1: the store is already here (buildthis has STATE), the record set is
// small (bounded by the handled-mention window), and "list keys + get each +
// sort in the reader" gives an ordered, readable timeline without a schema. D1
// would be nicer for ad-hoc queries, but there are none — just "show them all,
// newest first," which KV does fine.

const EVENT_PREFIX = "event:";
// Events outlive the 7-day `handled:` dedup window so the timeline stays readable
// after a tag stops being re-checkable. 30 days is plenty for a toy log.
const EVENT_TTL = 60 * 60 * 24 * 30;

interface LogEvent {
  mentionUri: string;
  mentionCid?: string;
  authorHandle?: string;
  authorDid?: string;
  text?: string;
  isReply?: boolean;
  firstSeen: string; // ISO — set once, the timeline sort key
  updatedAt: string; // ISO — last write
  mutual?: boolean; // gate result; undefined until gated
  dispatched?: boolean; // true fired / false failed-or-non-mutual / undefined pre-gate
  // Filled by the builder's outcome POST. builtName is "<site>" or "<site>/<path>".
  outcome?: {
    status: "success" | "failure";
    builtName?: string;
    url?: string;
    replyText?: string;
    at: string; // ISO
  };
}

// Merge `patch` into the event keyed by `mentionUri`, preserving firstSeen and
// bumping updatedAt. Best-effort: any failure is logged, never thrown, so a KV
// hiccup can't abort a watcher tick or a build.
async function recordEvent(
  env: Env,
  mentionUri: string,
  patch: Partial<LogEvent>,
): Promise<void> {
  try {
    const key = `${EVENT_PREFIX}${mentionUri}`;
    const now = new Date().toISOString();
    const existing = await env.STATE.get(key);
    const prev: Partial<LogEvent> = existing ? JSON.parse(existing) : {};
    const merged: LogEvent = {
      ...prev,
      ...patch,
      mentionUri,
      firstSeen: prev.firstSeen ?? now,
      updatedAt: now,
    };
    await env.STATE.put(key, JSON.stringify(merged), { expirationTtl: EVENT_TTL });
  } catch (err) {
    console.error(`recordEvent failed for ${mentionUri}: ${err}`);
  }
}

// GET /logs.json — every event, newest first (by firstSeen). CORS-open so the
// logs site can read it cross-origin. This is public data (the same tags and
// replies are already on Bluesky), so no auth on the read.
async function handleLogsRead(env: Env): Promise<Response> {
  const cors = {
    "access-control-allow-origin": "*",
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-cache",
  };
  try {
    const events: LogEvent[] = [];
    // The event set is small; a single list() page (1000 keys) covers it well
    // past the 30-day TTL, so we don't paginate.
    const list = await env.STATE.list({ prefix: EVENT_PREFIX });
    for (const k of list.keys) {
      const raw = await env.STATE.get(k.name);
      if (raw) {
        try {
          events.push(JSON.parse(raw) as LogEvent);
        } catch {
          // Skip a corrupt record rather than failing the whole read.
        }
      }
    }
    events.sort((a, b) => (a.firstSeen < b.firstSeen ? 1 : -1)); // newest first
    return new Response(JSON.stringify({ events }), { headers: cors });
  } catch (err) {
    console.error(`logs read failed: ${err}`);
    return new Response(JSON.stringify({ events: [], error: "read failed" }), {
      status: 500,
      headers: cors,
    });
  }
}

// POST /outcome — the builder reports a finished build. Body:
//   { mentionUri, status: "success"|"failure", builtName?, url?, replyText? }
// Authenticated by the shared OUTCOME_SECRET (Authorization: Bearer <secret>).
// Merges an `outcome` onto the event the watcher started for that mention.
async function handleOutcomePost(request: Request, env: Env): Promise<Response> {
  const auth = request.headers.get("authorization") || "";
  const expected = `Bearer ${env.OUTCOME_SECRET}`;
  // Guard against a misconfig where the secret is unset — never accept then.
  if (!env.OUTCOME_SECRET || auth !== expected) {
    return new Response("unauthorized", { status: 401 });
  }
  let body: {
    mentionUri?: string;
    status?: string;
    builtName?: string;
    url?: string;
    replyText?: string;
  };
  try {
    body = await request.json();
  } catch {
    return new Response("bad json", { status: 400 });
  }
  if (!body.mentionUri || (body.status !== "success" && body.status !== "failure")) {
    return new Response("bad request", { status: 400 });
  }
  await recordEvent(env, body.mentionUri, {
    outcome: {
      status: body.status,
      builtName: body.builtName || undefined,
      url: body.url || undefined,
      replyText: body.replyText || undefined,
      at: new Date().toISOString(),
    },
  });
  return new Response(JSON.stringify({ ok: true }), {
    headers: { "content-type": "application/json" },
  });
}

// --- Bluesky ---------------------------------------------------------------

interface Session {
  accessJwt: string;
  did: string;
}

async function login(env: Env): Promise<Session> {
  const res = await fetch(`${PDS}/xrpc/com.atproto.server.createSession`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      identifier: env.BOT_IDENTIFIER,
      password: env.BOT_APP_PASSWORD,
    }),
  });
  if (!res.ok) {
    throw new Error(`createSession failed: ${res.status} ${await res.text()}`);
  }
  const j = (await res.json()) as { accessJwt: string; did: string };
  return { accessJwt: j.accessJwt, did: j.did };
}

interface Mention {
  uri: string;
  cid: string;
  authorDid: string;
  authorHandle: string;
  text: string;
  // Thread root: for a top-level mention the root IS this post; for a mention
  // inside a thread it's the thread's root. Both are filled from the record.
  rootUri: string;
  rootCid: string;
  // True when this mention is itself a reply — i.e. the person tagged the bot in
  // a reply to some other post ("@buildthis build this ☝️"). When set, we fetch
  // the ancestor posts so the brief includes what "this" refers to.
  isReply: boolean;
}

async function recentMentions(session: Session): Promise<Mention[]> {
  const res = await fetch(
    `${PDS}/xrpc/app.bsky.notification.listNotifications?limit=40`,
    { headers: { authorization: `Bearer ${session.accessJwt}` } },
  );
  if (!res.ok) {
    throw new Error(`listNotifications failed: ${res.status} ${await res.text()}`);
  }
  const j = (await res.json()) as { notifications: RawNotif[] };

  return j.notifications
    .filter((n) => n.reason === "mention")
    .map((n) => {
      const rec = (n.record ?? {}) as PostRecord;
      const root = rec.reply?.root;
      return {
        uri: n.uri,
        cid: n.cid,
        authorDid: n.author.did,
        authorHandle: n.author.handle,
        text: rec.text ?? "",
        rootUri: root?.uri ?? n.uri,
        rootCid: root?.cid ?? n.cid,
        isReply: Boolean(rec.reply),
      };
    });
}

// When the mention is a reply, walk the thread's ancestor chain (root -> ... ->
// the post being replied to) and return their text, oldest first, so the build
// brief can include what "this" / "☝️" points at. Best-effort: on any failure we
// return [] and the build just proceeds on the mention text alone.
async function threadContext(session: Session, m: Mention): Promise<string[]> {
  if (!m.isReply) return [];
  const u = new URL(`${APPVIEW}/xrpc/app.bsky.feed.getPostThread`);
  u.searchParams.set("uri", m.uri);
  u.searchParams.set("parentHeight", "10"); // walk up to 10 ancestors
  u.searchParams.set("depth", "0");
  const res = await fetch(u.toString(), {
    headers: { authorization: `Bearer ${session.accessJwt}` },
  });
  if (!res.ok) return [];
  const j = (await res.json()) as { thread?: ThreadNode };

  // Collect ancestors newest->oldest by following .parent, then reverse.
  const chain: string[] = [];
  let node = j.thread?.parent;
  while (node?.post) {
    const handle = node.post.author?.handle ?? "someone";
    const text = (node.post.record?.text ?? "").trim();
    if (text) chain.push(`@${handle}: ${text}`);
    node = node.parent;
  }
  return chain.reverse();
}

interface ThreadNode {
  post?: {
    author?: { handle?: string };
    record?: { text?: string };
  };
  parent?: ThreadNode;
}

interface RawNotif {
  uri: string;
  cid: string;
  reason: string;
  author: { did: string; handle: string };
  record?: unknown;
}
interface PostRecord {
  text?: string;
  reply?: { root?: { uri: string; cid: string } };
}

// Is `did` a mutual of Rob's? Uses the anonymous AppView — a mutual has BOTH
// `following` (Rob -> them) and `followedBy` (them -> Rob) on the relationship.
async function robMutual(env: Env, did: string): Promise<boolean> {
  const u = new URL(`${APPVIEW}/xrpc/app.bsky.graph.getRelationships`);
  u.searchParams.set("actor", env.ROB_DID);
  u.searchParams.append("others", did);
  const res = await fetch(u.toString());
  if (!res.ok) return false; // fail closed: unknown => not a mutual, don't build
  const j = (await res.json()) as {
    relationships: Array<{ following?: string; followedBy?: string }>;
  };
  const rel = j.relationships?.[0];
  return Boolean(rel?.following && rel?.followedBy);
}

// `mentions` maps each @handle that appears in `text` to its DID, so the tag
// resolves to a real facet. Replies with no tags pass {} and get no facets.
async function replyToPost(
  session: Session,
  m: Mention,
  text: string,
  mentions: Record<string, string> = {},
): Promise<void> {
  const now = new Date().toISOString();
  const record = {
    $type: "app.bsky.feed.post",
    text,
    createdAt: now,
    reply: {
      root: { uri: m.rootUri, cid: m.rootCid },
      parent: { uri: m.uri, cid: m.cid },
    },
    facets: mentionFacets(text, mentions),
  };
  const res = await fetch(`${PDS}/xrpc/com.atproto.repo.createRecord`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${session.accessJwt}`,
    },
    body: JSON.stringify({
      repo: session.did,
      collection: "app.bsky.feed.post",
      record,
    }),
  });
  if (!res.ok) {
    // Don't throw — a failed reply shouldn't abort the whole tick. Log it.
    console.error(`reply failed: ${res.status} ${await res.text()}`);
  }
}

// Like a post — the bot's "working on it" acknowledgement. Creates an
// app.bsky.feed.like record pointing at the mention's strongRef (uri + cid).
// Best-effort like replyToPost: a failed like is logged, not thrown, so it can
// never abort the tick or block the build that follows.
async function likePost(session: Session, m: Mention): Promise<void> {
  const record = {
    $type: "app.bsky.feed.like",
    subject: { uri: m.uri, cid: m.cid },
    createdAt: new Date().toISOString(),
  };
  const res = await fetch(`${PDS}/xrpc/com.atproto.repo.createRecord`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${session.accessJwt}`,
    },
    body: JSON.stringify({
      repo: session.did,
      collection: "app.bsky.feed.like",
      record,
    }),
  });
  if (!res.ok) {
    console.error(`like failed: ${res.status} ${await res.text()}`);
  }
}

// Build a mention facet for each @handle in the text that we have a DID for, so
// the tag actually notifies. Uses UTF-8 BYTE offsets (atproto requires bytes,
// not JS char indices) — the lesson baked into mino's reply builder (notes/70).
// A handle with no DID in the map gets no facet (renders as plain text).
function mentionFacets(text: string, mentions: Record<string, string>): unknown[] {
  const enc = new TextEncoder();
  const facets: unknown[] = [];
  const re = /@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const handle = match[1];
    const did = mentions[handle];
    if (!did) continue;
    const before = enc.encode(text.slice(0, match.index)).length;
    const len = enc.encode(match[0]).length;
    facets.push({
      index: { byteStart: before, byteEnd: before + len },
      features: [{ $type: "app.bsky.richtext.facet#mention", did }],
    });
  }
  return facets;
}

// --- GitHub dispatch -------------------------------------------------------

interface BuildPayload {
  brief: string;
  authorHandle: string;
  mentionUri: string;
  replyRootUri: string;
  replyRootCid: string;
  replyParentUri: string;
  replyParentCid: string;
}

async function dispatchBuild(env: Env, payload: BuildPayload): Promise<boolean> {
  const res = await fetch(
    `https://api.github.com/repos/${env.GITHUB_REPO}/dispatches`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.GITHUB_TOKEN}`,
        accept: "application/vnd.github+json",
        "content-type": "application/json",
        "user-agent": "buildthis-bot",
      },
      body: JSON.stringify({ event_type: "buildthis", client_payload: payload }),
    },
  );
  if (!res.ok) {
    console.error(`dispatch failed: ${res.status} ${await res.text()}`);
    return false;
  }
  return true;
}

// --- small helpers ---------------------------------------------------------

function num(s: string): number {
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : 0;
}

// Assemble the build brief from the tagging post plus any ancestor posts (when
// the tag was a reply). The tagging post is the instruction ("build this"); the
// ancestors are the context it points at. We include the ancestor posts IN FULL —
// a Bluesky post is ~300 chars, so ≤10 of them is ~3000 chars (<1k tokens),
// trivial for the builder's context and not worth truncating mid-idea. The only
// bound on thread context is the 10-ancestor limit in threadContext(). The tag
// post keeps a generous cap purely as a sanity guard.
function buildBrief(tagText: string, ancestors: string[], max: number): string {
  const ask = tagText.trim().slice(0, max);
  if (ancestors.length === 0) return ask;
  const ctx = ancestors.join("\n").trim();
  return `The person tagged the bot in a reply. The post they tagged it in says:\n${ask}\n\nThe thread it's replying to, oldest first (this is the context "this" refers to):\n${ctx}`;
}
