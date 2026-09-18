// listbot's job queue: tags waiting for the box to resolve them.
//
// Copied from buildthis's queue rather than shared with it (house style, and
// the right call here — the two have different payloads and listbot's KV
// namespace holds OAuth sessions that buildthis has no business near).
//
// The flow. A tag arrives, the watcher enqueues a job here with everything the
// agent needs — the tag text, the thread, who the subject is, and what lists the
// tagger already has. The box claims it (POST /next-job), runs the agent, and
// reports an intent back (POST /outcome). THEN this Worker does the write.
//
// Why that split: the box is where a model reads a stranger's post text, and the
// Worker is where the OAuth tokens are. Keeping them apart means a confused or
// prompt-injected agent returns a wrong intent about one tag, which the Worker
// validates before acting, rather than holding a credential.

import type { KVNamespace } from "./store.js";

const JOB_PREFIX = "job:";

// Long enough to survive a box outage, short enough that a job nobody ever
// finishes disappears rather than lingering. A tag is not worth retrying for
// days: the user has moved on.
const JOB_TTL = 60 * 60 * 6;

// A job the box claimed but never reported on — the box died mid-run, or was
// restarted. After this it's re-served so the tag isn't silently dropped.
const CLAIM_TIMEOUT_MS = 10 * 60 * 1000;

const MAX_ATTEMPTS = 2;

export interface JobSubject {
  did: string;
  handle: string;
  displayName?: string;
  description?: string;
  recentPosts?: string[];
}

export interface JobList {
  name: string;
  memberCount: number;
  sampleMembers: string[];
}

export interface JobPayload {
  // What the box dispatches on. See box-poll.sh.
  kind: "listbot";
  mentionUri: string;
  mentionCid: string;
  rootUri: string;
  rootCid: string;
  tagText: string;
  tagger: { did: string; handle: string; displayName?: string };
  // Absent on a top-level tag ("make me a list for X") — no post being replied
  // to means nobody to add, but the list can still be made.
  subject?: JobSubject;
  // People this tag obviously refers to: the parent author first (when there is
  // one), then anyone the tagger @-mentioned. A fast path, not a fence — the
  // agent can also name someone it found in `follows` or via search, and the
  // Worker resolves whatever it names.
  candidates: JobSubject[];
  // WHO THE TAGGER FOLLOWS. The single highest-value thing in this payload.
  //
  // People refer to accounts the way they talk: "add fleetingbits", not
  // "add @fleetingbits.bsky.social". That shorthand is only resolvable against
  // a set of people, and the tagger's follows is overwhelmingly the right set —
  // it's who they talk about. Handle and display name both, because "add Paul"
  // is just as normal as "add fleetingbits".
  //
  // Prefetched rather than left to the agent to look up: it's one call the
  // Worker is already authenticated for, and it turns the common case from a
  // multi-step search into a lookup the agent does in its head.
  follows: { did: string; handle: string; displayName?: string }[];
  thread: { author: string; handle: string; did: string; text: string }[];
  lists: JobList[];
  outcomeUrl: string;
}

export interface QueueJob extends JobPayload {
  status: "queued" | "claimed";
  enqueuedAt: string;
  claimedAt?: string;
  attempts: number;
}

// Idempotent on mention uri: a tag already queued or in flight is left alone,
// so a re-run of the watcher can't double-enqueue.
export async function enqueueJob(kv: KVNamespace, payload: JobPayload): Promise<boolean> {
  try {
    const key = JOB_PREFIX + payload.mentionUri;
    if (await kv.get(key)) return true;
    const job: QueueJob = {
      ...payload,
      status: "queued",
      enqueuedAt: new Date().toISOString(),
      attempts: 1,
    };
    await kv.put(key, JSON.stringify(job), { expirationTtl: JOB_TTL });
    return true;
  } catch (err) {
    console.error(`enqueueJob failed for ${payload.mentionUri}: ${err}`);
    return false;
  }
}

export async function getJob(kv: KVNamespace, mentionUri: string): Promise<QueueJob | null> {
  const raw = await kv.get(JOB_PREFIX + mentionUri);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as QueueJob;
  } catch {
    return null;
  }
}

export async function retireJob(kv: KVNamespace, mentionUri: string): Promise<void> {
  await kv.delete(JOB_PREFIX + mentionUri).catch(() => {});
}

// Claim the oldest queued job. Also re-serves a job whose claim went stale —
// a box that died mid-run would otherwise strand the tag until its TTL, and the
// person who tagged just gets silence.
export async function claimNextJob(kv: KVNamespace): Promise<QueueJob | null> {
  const list = await kv.list({ prefix: JOB_PREFIX });
  const jobs: QueueJob[] = [];
  for (const k of list.keys) {
    const raw = await kv.get(k.name);
    if (!raw) continue;
    try {
      jobs.push(JSON.parse(raw) as QueueJob);
    } catch {
      // skip a corrupt job rather than wedge the queue
    }
  }

  const now = Date.now();
  const claimable = jobs.filter((j) => {
    if (j.status === "queued") return true;
    if (j.status !== "claimed") return false;
    const claimed = new Date(j.claimedAt ?? j.enqueuedAt).getTime();
    if (isNaN(claimed)) return false;
    // Stale claim, and only if it has an attempt left.
    return now - claimed > CLAIM_TIMEOUT_MS && (j.attempts ?? 1) < MAX_ATTEMPTS;
  });
  if (!claimable.length) return null;

  claimable.sort((a, b) => (a.enqueuedAt < b.enqueuedAt ? -1 : 1));
  const job = claimable[0];

  const wasStale = job.status === "claimed";
  const updated: QueueJob = {
    ...job,
    status: "claimed",
    claimedAt: new Date().toISOString(),
    attempts: wasStale ? (job.attempts ?? 1) + 1 : (job.attempts ?? 1),
  };
  await kv.put(JOB_PREFIX + job.mentionUri, JSON.stringify(updated), {
    expirationTtl: JOB_TTL,
  });
  return updated;
}

// What the agent hands back. Validated in index.ts before anything is written —
// this is a claim from a process that read a stranger's text, not an
// instruction.
//
// The agent may name a person, and the Worker resolves whatever it names.
// An earlier design let it pick only by index into a Worker-built list, which
// is a stronger property — but it made "add fleetingbits" impossible, and that
// is the main thing people want from this bot. The right price here: a listitem
// lands in the tagger's OWN list, the reply says exactly who was added, and one
// tap undoes it. So the guarantee is that a name the agent invented fails to
// resolve and is reported, rather than quietly becoming a record.
// One thing to do. A whole intent is this plus the bookkeeping fields below —
// most tags are exactly one of these, which is why the common case stays flat
// rather than becoming an array of one.
export interface IntentStep {
  action: "add" | "remove" | "create";
  subjectIndex?: number;
  subjectHandle?: string;
  subjectHandles?: string[];
  list?: string;
  listExists?: boolean;
  purpose?: "curatelist" | "modlist";
}

export interface AgentIntent {
  // "create" makes an empty list and adds nobody — for a tag with no subject.
  // "answer" writes nothing at all: it's a question answered in the thread.
  // "say" is a plain conversational reply — someone addressed the bot without
  // asking for a list operation. "none" is for when nobody is talking TO it.
  action: "add" | "remove" | "create" | "answer" | "say" | "ask" | "none" | "failed";
  // More than one thing in a single tag: "add them to ceramics and make me a
  // mute list for that other guy". Walked in order by the Worker.
  //
  // When this is set, `action` is "add"/"remove"/"create" describing the FIRST
  // step and the flat fields mirror it, so anything reading only the flat shape
  // still does something sensible rather than nothing.
  //
  // A step carries no `reply` on purpose. One tag gets one reply, composed by
  // the Worker from what actually happened — an agent writing a line per step
  // would post a thread at someone who asked for one thing.
  steps?: IntentStep[];
  // Who to act on. Either an index into `candidates` (the fast path, when the
  // tagger pointed at someone directly), or a handle/DID the agent worked out —
  // from `follows`, the thread, or a search it ran.
  subjectIndex?: number;
  subjectHandle?: string;
  // For "add everyone in this thread" / "add both of them".
  subjectHandles?: string[];
  list?: string;
  listExists?: boolean;
  // Which kind of list to make. A curatelist (the default) feeds list-feeds and
  // starter packs; a modlist is what a mute or a block can point at. Both live
  // in the user's own repo either way — see notes/88.
  purpose?: "curatelist" | "modlist";
  reply?: string;
  confidence?: "high" | "medium" | "low";
  reasoning?: string;
  reason?: string;
}

export interface QueueStats {
  queued: number;
  claimed: number;
  oldestQueuedAgeMin: number | null;
}

export async function queueStats(kv: KVNamespace): Promise<QueueStats> {
  const list = await kv.list({ prefix: JOB_PREFIX });
  let queued = 0;
  let claimed = 0;
  let oldest: number | null = null;
  const now = Date.now();
  for (const k of list.keys) {
    const raw = await kv.get(k.name);
    if (!raw) continue;
    try {
      const job = JSON.parse(raw) as QueueJob;
      if (job.status === "queued") {
        queued++;
        const t = new Date(job.enqueuedAt).getTime();
        if (!isNaN(t) && (oldest === null || t < oldest)) oldest = t;
      } else if (job.status === "claimed") {
        claimed++;
      }
    } catch {}
  }
  return {
    queued,
    claimed,
    oldestQueuedAgeMin: oldest === null ? null : Math.round((now - oldest) / 60000),
  };
}

// --- rate limiting -----------------------------------------------------------
//
// Every tag is a Sonnet run on a subscription, which makes a tag cost something
// real — the same rate-limited capacity buildthis needs to build things. This
// caps what one account can spend.
//
// Not a safety control: a tagger can only ever edit their own lists, so this is
// about budget, not blast radius. It bounds an enthusiastic user as much as a
// hostile one, which is the common case and worth bounding either way.
//
// A fixed window, not a sliding one. It's cruder — someone can spend two
// windows' worth across a boundary — but it's one KV read and one write instead
// of a list scan per tag, and the imprecision doesn't matter for a budget guard.

const RATE_PREFIX = "rate:";

export interface RateLimit {
  allowed: boolean;
  used: number;
  limit: number;
  resetsInMin: number;
}

export async function checkRateLimit(
  kv: KVNamespace,
  did: string,
  limit: number,
  windowMinutes: number,
): Promise<RateLimit> {
  const windowMs = windowMinutes * 60 * 1000;
  const windowStart = Math.floor(Date.now() / windowMs) * windowMs;
  const key = `${RATE_PREFIX}${did}:${windowStart}`;
  const resetsInMin = Math.max(1, Math.ceil((windowStart + windowMs - Date.now()) / 60000));

  let used = 0;
  try {
    const raw = await kv.get(key);
    used = raw ? parseInt(raw, 10) || 0 : 0;
  } catch (err) {
    // A KV failure must not become a free pass OR a wall. Treat it as allowed
    // and log: the alternative is a bot that silently stops working whenever KV
    // hiccups, which is worse than briefly over-spending.
    console.error(`rate limit read failed for ${did}: ${err}`);
    return { allowed: true, used: 0, limit, resetsInMin };
  }

  if (used >= limit) return { allowed: false, used, limit, resetsInMin };

  try {
    // TTL just past the window so the key cleans itself up.
    await kv.put(key, String(used + 1), {
      expirationTtl: Math.ceil((windowMs * 2) / 1000),
    });
  } catch (err) {
    console.error(`rate limit write failed for ${did}: ${err}`);
  }
  return { allowed: true, used: used + 1, limit, resetsInMin };
}
