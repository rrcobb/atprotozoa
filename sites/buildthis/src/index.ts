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

  MAX_BUILDS_PER_DAY: string;
  MAX_BUILDS_PER_PERSON_PER_DAY: string;
  MAX_BRIEF_CHARS: string;

  // secrets
  BOT_APP_PASSWORD: string;
  GITHUB_TOKEN: string;
}

const PDS = "https://bsky.social";
const APPVIEW = "https://public.api.bsky.app";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Bluesky handle verification: the bot's DID as plain text, nothing else.
    if (url.pathname === "/.well-known/atproto-did") {
      return new Response(env.BOT_DID, {
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "no-cache",
        },
      });
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

    const isMutual = await robMutual(env, m.authorDid);

    if (!isMutual) {
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

    // Budget gate. Both counters are UTC-day scoped and expire on their own.
    const day = utcDayKey();
    const globalKey = `builds:${day}`;
    const personKey = `builds:${day}:${m.authorDid}`;
    const globalCount = numFromKv(await env.STATE.get(globalKey));
    const personCount = numFromKv(await env.STATE.get(personKey));

    if (globalCount >= num(env.MAX_BUILDS_PER_DAY)) {
      await replyToPost(
        session,
        m,
        `i've hit my build budget for today — try me again tomorrow!`,
      );
      await env.STATE.put(handledKey, "1", { expirationTtl: 60 * 60 * 24 * 7 });
      continue;
    }
    if (personCount >= num(env.MAX_BUILDS_PER_PERSON_PER_DAY)) {
      await replyToPost(
        session,
        m,
        `you've used up your builds for today — back tomorrow!`,
      );
      await env.STATE.put(handledKey, "1", { expirationTtl: 60 * 60 * 24 * 7 });
      continue;
    }

    // Dispatch the build. The brief is the post text, treated as a feature
    // description (not harness instructions) and length-capped.
    const brief = clampBrief(m.text, num(env.MAX_BRIEF_CHARS));
    const dispatched = await dispatchBuild(env, {
      brief,
      authorHandle: m.authorHandle,
      // Everything the reply step needs to answer in-thread.
      replyRootUri: m.rootUri,
      replyRootCid: m.rootCid,
      replyParentUri: m.uri,
      replyParentCid: m.cid,
    });

    if (dispatched) {
      // Only count + mark handled if the dispatch actually left. A failed
      // dispatch stays un-handled so the next tick retries it.
      await bumpCounter(env.STATE, globalKey);
      await bumpCounter(env.STATE, personKey);
      await env.STATE.put(handledKey, "1", { expirationTtl: 60 * 60 * 24 * 7 });
    }
  }
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
      };
    });
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
function numFromKv(s: string | null): number {
  return s ? num(s) : 0;
}
async function bumpCounter(kv: KVNamespace, key: string): Promise<void> {
  const next = numFromKv(await kv.get(key)) + 1;
  // Expire after ~2 days so day-keyed counters clean themselves up.
  await kv.put(key, String(next), { expirationTtl: 60 * 60 * 48 });
}
function utcDayKey(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}
function clampBrief(text: string, max: number): string {
  const t = text.trim();
  return t.length <= max ? t : t.slice(0, max);
}
