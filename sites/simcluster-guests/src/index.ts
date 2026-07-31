// simcluster-guests Worker — simcluster-guests.bisks.net
//
// @riziles.bsky.social asked for a site to track requests for guests on
// @brennan.computer's "Simcluster" podcast, with some latitude on how people
// submit them. The design: a public suggestion board. Anyone can name a
// guest they want to hear + say why; anyone can upvote a suggestion someone
// else already made. Suggesting a name that's already on the board counts as
// an upvote instead of a duplicate row, so the board naturally sorts into
// "who the audience actually wants" rather than a flat list of one-off asks.
//
// No login required — this is meant to be a two-second, no-friction ask from
// a podcast audience, not an atproto-auth flow. Light anti-spam is IP-based
// (see the DO below): a cooldown on new submissions, and one upvote per
// IP/entry per hour, mirroring sites/ideahose's upvote debounce. That's a
// soft deterrent, not a security boundary — good enough for a fan board, not
// meant to survive a determined attacker.
//
// All state lives in ONE Durable Object (name "global") — the submission
// list + vote/rate-limit bookkeeping is exactly the "single-writer rolling
// state" case notes/10-architecture.md calls out DOs for. Shape borrowed
// from sites/ideahose / sites/ratioed, minus the firehose-watching half —
// this board is fed directly by the page's own form, not the Jetstream.

interface DurableObjectId {
  toString(): string;
}
interface DurableObjectStub {
  fetch(request: Request): Promise<Response>;
}
interface DurableObjectNamespace {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): DurableObjectStub;
}
interface DurableObjectStorage {
  get<T = unknown>(key: string): Promise<T | undefined>;
  put(entries: Record<string, unknown>): Promise<void>;
}
interface DurableObjectState {
  storage: DurableObjectStorage;
  blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T>;
}

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  BOARD: DurableObjectNamespace;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      const id = env.BOARD.idFromName("global");
      const stub = env.BOARD.get(id);
      return stub.fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};

// ---- config ------------------------------------------------------------
const MAX_ENTRIES = 400; // evict the lowest-scoring entry past this
const MAX_ALSO_SUGGESTED = 8; // cap the "also asked for by" receipts list
const MAX_NOTES = 4; // cap distinct "why" notes kept per entry
const SUBMIT_COOLDOWN_MS = 20 * 1000; // per-IP, between new-guest submissions
const UPVOTE_COOLDOWN_MS = 60 * 60 * 1000; // per-IP-per-entry, same shape as sites/ideahose

const GUEST_MAX = 100;
const REASON_MAX = 400;
const NAME_MAX = 60;
const MAX_ALT_SPELLINGS = 6; // capped list of other spellings folded into an entry

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// Trimmed from sites/ideahose's looksLikeSpam — same idea, applied to
// submitted guest/reason text instead of firehose posts.
function looksLikeSpam(text: string): boolean {
  if (/https?:\/\//i.test(text) && text.length < 40) return true; // bare link drop
  if (/shop now|buy now|amzn\.to|onelink\.to|prime members|\$\d+\.\d{2}\b/i.test(text)) return true;
  const hashtags = (text.match(/#/g) || []).length;
  if (hashtags >= 4) return true;
  return false;
}

// Aggressive fuzzy key: strips spacing/punctuation/diacritics entirely, so
// "demi girlboss", "demi-girlboss" and "demigirlboss" collapse to the same
// key up front. Real misspellings (a swapped or dropped letter) still slip
// past this and need the edit-distance check below.
function aggressiveNorm(raw: string): string {
  return raw
    .trim()
    .replace(/^@/, "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

// Iterative Levenshtein — small inputs (name-length strings), no need for
// anything fancier than the classic DP with a rolling row.
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[n];
}

// How many edits we'll tolerate before two names count as "the same
// candidate, spelled differently" — scales with length so short names still
// require an exact (or punctuation-only) match, avoiding false merges like
// "sam" vs "pam".
function fuzzyThreshold(len: number): number {
  if (len <= 4) return 0;
  if (len <= 7) return 1;
  if (len <= 12) return 2;
  return 3;
}

function isFuzzyMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const shorter = Math.min(a.length, b.length);
  const threshold = fuzzyThreshold(shorter);
  if (threshold === 0) return false;
  if (Math.abs(a.length - b.length) > threshold) return false;
  return levenshtein(a, b) <= threshold;
}

function clean(raw: unknown, max: number): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/[\r\n\t]+/g, " ").trim().slice(0, max);
}

interface Entry {
  id: string;
  guest: string; // display form, as first submitted
  guestNorm: string; // fuzzy dedupe key (aggressiveNorm of guest)
  altSpellings: string[]; // other spellings folded into this entry, capped
  notes: string[]; // distinct "why" reasons, newest first
  alsoSuggestedBy: string[]; // display handles/names of later submitters, capped
  submittedBy: string; // first submitter's handle/name, if given
  upvotes: number;
  createdAt: number;
  lastActivity: number;
}

function scoreEntry(e: Entry): number {
  return e.upvotes;
}

export class GuestBoard {
  private state: DurableObjectState;
  private ready: Promise<void>;
  private entries: Map<string, Entry> = new Map();
  private recentSubmits: Map<string, number> = new Map(); // ip -> last submit ts
  private recentVotes: Map<string, number> = new Map(); // `${ip}|${id}` -> ts

  constructor(state: DurableObjectState) {
    this.state = state;
    this.ready = this.state.blockConcurrencyWhile(async () => {
      const entries = await this.state.storage.get<Entry[]>("entries");
      for (const e of entries ?? []) {
        if (!e.altSpellings) e.altSpellings = [];
        e.guestNorm = aggressiveNorm(e.guest);
        this.entries.set(e.id, e);
      }
      // One-time (well, every-boot) self-heal: a name entered under a few
      // slightly different spellings before this fuzzy check existed ends up
      // as separate entries splitting the vote. Fold those back together now
      // that we can recognize them as the same candidate.
      if (this.mergeFuzzyDuplicates()) await this.persist();
    });
  }

  private async persist(): Promise<void> {
    await this.state.storage.put({ entries: Array.from(this.entries.values()) });
  }

  // Merges b's votes/notes/credit into whichever of (a, b) has more votes,
  // keeping that one as the canonical entry and recording the other's
  // spelling as an altSpelling so the merge stays visible on the board.
  private mergeInto(a: Entry, b: Entry): void {
    const [keep, drop] = a.upvotes >= b.upvotes ? [a, b] : [b, a];
    keep.upvotes += drop.upvotes;
    keep.createdAt = Math.min(keep.createdAt, drop.createdAt);
    keep.lastActivity = Math.max(keep.lastActivity, drop.lastActivity);
    for (const n of drop.notes) {
      if (!keep.notes.includes(n)) keep.notes.unshift(n);
    }
    keep.notes = keep.notes.slice(0, MAX_NOTES);
    const credits = [drop.submittedBy, ...drop.alsoSuggestedBy].filter(
      (w) => w && w !== keep.submittedBy && !keep.alsoSuggestedBy.includes(w)
    );
    keep.alsoSuggestedBy = [...keep.alsoSuggestedBy, ...credits].slice(0, MAX_ALSO_SUGGESTED);
    const alts = [drop.guest, ...drop.altSpellings].filter(
      (s) => s !== keep.guest && !keep.altSpellings.includes(s)
    );
    keep.altSpellings = [...keep.altSpellings, ...alts].slice(0, MAX_ALT_SPELLINGS);
    keep.guestNorm = aggressiveNorm(keep.guest);
    this.entries.delete(drop.id);
    this.entries.set(keep.id, keep);
  }

  // Repeatedly scans for the first fuzzy-matching pair and merges it, until
  // no pair matches. O(n^2) per pass but the board caps at MAX_ENTRIES and
  // this only runs on DO boot / after a merge, not per request.
  private mergeFuzzyDuplicates(): boolean {
    let mergedAny = false;
    let mergedThisPass = true;
    while (mergedThisPass) {
      mergedThisPass = false;
      const list = Array.from(this.entries.values());
      for (let i = 0; i < list.length && !mergedThisPass; i++) {
        for (let j = i + 1; j < list.length; j++) {
          if (!isFuzzyMatch(list[i].guestNorm, list[j].guestNorm)) continue;
          this.mergeInto(list[i], list[j]);
          mergedThisPass = true;
          mergedAny = true;
          break;
        }
      }
    }
    return mergedAny;
  }

  private board() {
    return Array.from(this.entries.values())
      .sort((a, b) => scoreEntry(b) - scoreEntry(a) || b.lastActivity - a.lastActivity)
      .map((e) => ({
        id: e.id,
        guest: e.guest,
        altSpellings: e.altSpellings,
        notes: e.notes,
        alsoSuggestedBy: e.alsoSuggestedBy,
        submittedBy: e.submittedBy,
        upvotes: e.upvotes,
        createdAt: e.createdAt,
        lastActivity: e.lastActivity,
      }));
  }

  async fetch(request: Request): Promise<Response> {
    await this.ready;
    const url = new URL(request.url);
    const ip = request.headers.get("cf-connecting-ip") || "anon";

    if (url.pathname === "/api/board" && request.method === "GET") {
      return json({ count: this.entries.size, entries: this.board() });
    }

    if (url.pathname === "/api/submit" && request.method === "POST") {
      let body: any = {};
      try {
        body = await request.json();
      } catch {
        return json({ error: "bad json" }, 400);
      }

      const guestRaw = clean(body.guest, GUEST_MAX);
      const reason = clean(body.reason, REASON_MAX);
      const submittedBy = clean(body.submittedBy, NAME_MAX).replace(/^@/, "");

      if (!guestRaw) return json({ error: "name a guest" }, 400);
      if (looksLikeSpam(guestRaw) || (reason && looksLikeSpam(reason))) {
        return json({ error: "that looked like spam, try rephrasing" }, 400);
      }

      const lastSubmit = this.recentSubmits.get(ip) || 0;
      if (Date.now() - lastSubmit < SUBMIT_COOLDOWN_MS) {
        return json({ error: "slow down a moment before submitting again" }, 429);
      }
      this.recentSubmits.set(ip, Date.now());

      const guestNorm = aggressiveNorm(guestRaw);
      const now = Date.now();

      // Exact (punctuation/case/spacing-insensitive) match first...
      let existing: Entry | undefined;
      for (const e of this.entries.values()) {
        if (e.guestNorm === guestNorm) {
          existing = e;
          break;
        }
      }
      // ...then fall back to a fuzzy match, so a typo'd or slightly
      // differently spelled re-entry of an existing candidate still counts
      // as a vote for them instead of splitting into a new row.
      if (!existing) {
        for (const e of this.entries.values()) {
          if (isFuzzyMatch(e.guestNorm, guestNorm)) {
            existing = e;
            break;
          }
        }
      }

      if (existing) {
        existing.upvotes++;
        existing.lastActivity = now;
        if (reason && !existing.notes.includes(reason)) {
          existing.notes.unshift(reason);
          if (existing.notes.length > MAX_NOTES) existing.notes.length = MAX_NOTES;
        }
        if (submittedBy && !existing.alsoSuggestedBy.includes(submittedBy) && submittedBy !== existing.submittedBy) {
          existing.alsoSuggestedBy.unshift(submittedBy);
          if (existing.alsoSuggestedBy.length > MAX_ALSO_SUGGESTED) existing.alsoSuggestedBy.length = MAX_ALSO_SUGGESTED;
        }
        if (guestRaw !== existing.guest && !existing.altSpellings.includes(guestRaw)) {
          existing.altSpellings.unshift(guestRaw);
          if (existing.altSpellings.length > MAX_ALT_SPELLINGS) existing.altSpellings.length = MAX_ALT_SPELLINGS;
        }
        await this.persist();
        return json({ ok: true, id: existing.id, merged: true, upvotes: existing.upvotes });
      }

      if (this.entries.size >= MAX_ENTRIES) {
        let worstId: string | null = null;
        let worstScore = Infinity;
        for (const e of this.entries.values()) {
          const s = scoreEntry(e);
          if (s < worstScore) {
            worstScore = s;
            worstId = e.id;
          }
        }
        if (worstId) this.entries.delete(worstId);
      }

      const entry: Entry = {
        id: crypto.randomUUID(),
        guest: guestRaw,
        guestNorm,
        altSpellings: [],
        notes: reason ? [reason] : [],
        alsoSuggestedBy: [],
        submittedBy,
        upvotes: 1,
        createdAt: now,
        lastActivity: now,
      };
      this.entries.set(entry.id, entry);
      await this.persist();
      return json({ ok: true, id: entry.id, merged: false, upvotes: entry.upvotes });
    }

    if (url.pathname === "/api/upvote" && request.method === "POST") {
      let body: any = {};
      try {
        body = await request.json();
      } catch {
        return json({ error: "bad json" }, 400);
      }
      const id = typeof body.id === "string" ? body.id : "";
      const entry = this.entries.get(id);
      if (!entry) return json({ error: "not found" }, 404);

      const voteKey = `${ip}|${id}`;
      const last = this.recentVotes.get(voteKey) || 0;
      if (Date.now() - last < UPVOTE_COOLDOWN_MS) {
        return json({ ok: true, upvotes: entry.upvotes, alreadyVoted: true });
      }
      this.recentVotes.set(voteKey, Date.now());
      entry.upvotes++;
      entry.lastActivity = Date.now();
      if (this.recentVotes.size > 20000) this.recentVotes.clear();
      await this.persist();
      return json({ ok: true, upvotes: entry.upvotes });
    }

    return json({ error: "not found" }, 404);
  }
}
