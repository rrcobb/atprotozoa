// constraintfund Worker — constraintfund.bisks.net
//
// @shimmermathlabs.com tagged the bot on a thread where @ver.ooo said "many
// people should be exploring the space of generative constraints that make
// things interesting, and there should be funding for that, tbh." This site
// makes that literal: a public board to nominate who should get funded to
// do that, with an optional message on why, and votes. Nominating someone
// already on the board just adds a vote instead of splitting into a new
// row, and near-identical entries (typos, punctuation, spacing) get folded
// together automatically so votes don't split there either — that merge was
// an explicit part of the ask.
//
// No login required — this is meant to be a two-second, no-friction
// nomination, not an atproto-auth flow. Light anti-spam is IP-based (see the
// DO below): a cooldown on new nominations, and one vote per IP/entry per
// hour, mirroring sites/ideahose's upvote debounce. That's a soft
// deterrent, not a security boundary.
//
// All state lives in ONE Durable Object (name "global") — the nomination
// list + vote/rate-limit bookkeeping is exactly the "single-writer rolling
// state" case notes/10-architecture.md calls out DOs for. Copied from
// sites/simcluster-guests (guest -> nominee, reason -> message), which in
// turn borrowed the shape from sites/ideahose / sites/ratioed.

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
const MAX_ALSO_NOMINATED = 8; // cap the "also nominated by" receipts list
const MAX_NOTES = 4; // cap distinct messages kept per entry
const SUBMIT_COOLDOWN_MS = 20 * 1000; // per-IP, between new nominations
const VOTE_COOLDOWN_MS = 60 * 60 * 1000; // per-IP-per-entry, same shape as sites/ideahose

const NOMINEE_MAX = 100;
const MESSAGE_MAX = 400;
const NAME_MAX = 60;
const MAX_ALT_SPELLINGS = 6; // capped list of other spellings folded into an entry

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// Trimmed from sites/ideahose's looksLikeSpam — same idea, applied to
// submitted nominee/message text instead of firehose posts.
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
// nominee, spelled differently" — scales with length so short names still
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
  nominee: string; // display form, as first submitted
  nomineeNorm: string; // fuzzy dedupe key (aggressiveNorm of nominee)
  altSpellings: string[]; // other spellings folded into this entry, capped
  notes: string[]; // distinct nomination messages, newest first
  alsoNominatedBy: string[]; // display handles/names of later nominators, capped
  nominatedBy: string; // first nominator's handle/name, if given
  votes: number;
  createdAt: number;
  lastActivity: number;
}

function scoreEntry(e: Entry): number {
  return e.votes;
}

export class FundBoard {
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
        e.nomineeNorm = aggressiveNorm(e.nominee);
        this.entries.set(e.id, e);
      }
      // One-time (well, every-boot) self-heal: a name entered under a few
      // slightly different spellings before this fuzzy check existed ends up
      // as separate entries splitting the vote. Fold those back together now
      // that we can recognize them as the same nominee.
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
    const [keep, drop] = a.votes >= b.votes ? [a, b] : [b, a];
    keep.votes += drop.votes;
    keep.createdAt = Math.min(keep.createdAt, drop.createdAt);
    keep.lastActivity = Math.max(keep.lastActivity, drop.lastActivity);
    for (const n of drop.notes) {
      if (!keep.notes.includes(n)) keep.notes.unshift(n);
    }
    keep.notes = keep.notes.slice(0, MAX_NOTES);
    const credits = [drop.nominatedBy, ...drop.alsoNominatedBy].filter(
      (w) => w && w !== keep.nominatedBy && !keep.alsoNominatedBy.includes(w)
    );
    keep.alsoNominatedBy = [...keep.alsoNominatedBy, ...credits].slice(0, MAX_ALSO_NOMINATED);
    const alts = [drop.nominee, ...drop.altSpellings].filter(
      (s) => s !== keep.nominee && !keep.altSpellings.includes(s)
    );
    keep.altSpellings = [...keep.altSpellings, ...alts].slice(0, MAX_ALT_SPELLINGS);
    keep.nomineeNorm = aggressiveNorm(keep.nominee);
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
          if (!isFuzzyMatch(list[i].nomineeNorm, list[j].nomineeNorm)) continue;
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
        nominee: e.nominee,
        altSpellings: e.altSpellings,
        notes: e.notes,
        alsoNominatedBy: e.alsoNominatedBy,
        nominatedBy: e.nominatedBy,
        votes: e.votes,
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

    if (url.pathname === "/api/nominate" && request.method === "POST") {
      let body: any = {};
      try {
        body = await request.json();
      } catch {
        return json({ error: "bad json" }, 400);
      }

      const nomineeRaw = clean(body.nominee, NOMINEE_MAX);
      const message = clean(body.message, MESSAGE_MAX);
      const nominatedBy = clean(body.nominatedBy, NAME_MAX).replace(/^@/, "");

      if (!nomineeRaw) return json({ error: "name a nominee" }, 400);
      if (looksLikeSpam(nomineeRaw) || (message && looksLikeSpam(message))) {
        return json({ error: "that looked like spam, try rephrasing" }, 400);
      }

      const lastSubmit = this.recentSubmits.get(ip) || 0;
      if (Date.now() - lastSubmit < SUBMIT_COOLDOWN_MS) {
        return json({ error: "slow down a moment before nominating again" }, 429);
      }
      this.recentSubmits.set(ip, Date.now());

      const nomineeNorm = aggressiveNorm(nomineeRaw);
      const now = Date.now();

      // Exact (punctuation/case/spacing-insensitive) match first...
      let existing: Entry | undefined;
      for (const e of this.entries.values()) {
        if (e.nomineeNorm === nomineeNorm) {
          existing = e;
          break;
        }
      }
      // ...then fall back to a fuzzy match, so a typo'd or slightly
      // differently spelled re-entry of an existing nominee still counts as
      // a vote for them instead of splitting into a new row. This is the
      // "merge obviously identical entries" part of the ask.
      if (!existing) {
        for (const e of this.entries.values()) {
          if (isFuzzyMatch(e.nomineeNorm, nomineeNorm)) {
            existing = e;
            break;
          }
        }
      }

      if (existing) {
        existing.votes++;
        existing.lastActivity = now;
        if (message && !existing.notes.includes(message)) {
          existing.notes.unshift(message);
          if (existing.notes.length > MAX_NOTES) existing.notes.length = MAX_NOTES;
        }
        if (nominatedBy && !existing.alsoNominatedBy.includes(nominatedBy) && nominatedBy !== existing.nominatedBy) {
          existing.alsoNominatedBy.unshift(nominatedBy);
          if (existing.alsoNominatedBy.length > MAX_ALSO_NOMINATED) existing.alsoNominatedBy.length = MAX_ALSO_NOMINATED;
        }
        if (nomineeRaw !== existing.nominee && !existing.altSpellings.includes(nomineeRaw)) {
          existing.altSpellings.unshift(nomineeRaw);
          if (existing.altSpellings.length > MAX_ALT_SPELLINGS) existing.altSpellings.length = MAX_ALT_SPELLINGS;
        }
        await this.persist();
        return json({ ok: true, id: existing.id, merged: true, votes: existing.votes });
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
        nominee: nomineeRaw,
        nomineeNorm,
        altSpellings: [],
        notes: message ? [message] : [],
        alsoNominatedBy: [],
        nominatedBy,
        votes: 1,
        createdAt: now,
        lastActivity: now,
      };
      this.entries.set(entry.id, entry);
      await this.persist();
      return json({ ok: true, id: entry.id, merged: false, votes: entry.votes });
    }

    if (url.pathname === "/api/vote" && request.method === "POST") {
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
      if (Date.now() - last < VOTE_COOLDOWN_MS) {
        return json({ ok: true, votes: entry.votes, alreadyVoted: true });
      }
      this.recentVotes.set(voteKey, Date.now());
      entry.votes++;
      entry.lastActivity = Date.now();
      if (this.recentVotes.size > 20000) this.recentVotes.clear();
      await this.persist();
      return json({ ok: true, votes: entry.votes });
    }

    return json({ error: "not found" }, 404);
  }
}
