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

function normalizeGuest(raw: string): string {
  return raw
    .trim()
    .replace(/^@/, "")
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function clean(raw: unknown, max: number): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/[\r\n\t]+/g, " ").trim().slice(0, max);
}

interface Entry {
  id: string;
  guest: string; // display form, as first submitted
  guestNorm: string; // dedupe key
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
      for (const e of entries ?? []) this.entries.set(e.id, e);
    });
  }

  private async persist(): Promise<void> {
    await this.state.storage.put({ entries: Array.from(this.entries.values()) });
  }

  private board() {
    return Array.from(this.entries.values())
      .sort((a, b) => scoreEntry(b) - scoreEntry(a) || b.lastActivity - a.lastActivity)
      .map((e) => ({
        id: e.id,
        guest: e.guest,
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

      const guestNorm = normalizeGuest(guestRaw);
      const now = Date.now();

      let existing: Entry | undefined;
      for (const e of this.entries.values()) {
        if (e.guestNorm === guestNorm) {
          existing = e;
          break;
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
