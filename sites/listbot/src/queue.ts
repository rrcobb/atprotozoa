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
  subject: JobSubject;
  thread: { author: string; text: string }[];
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
// instruction. Note there's no subject field: the subject was decided by the
// Worker when it enqueued the job and the agent cannot change it.
export interface AgentIntent {
  action: "add" | "remove" | "ask" | "none" | "failed";
  list?: string;
  listExists?: boolean;
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
