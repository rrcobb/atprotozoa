// guestbet Worker — guestbet.bisks.net
//
// @norvid-studies.bsky.social, replying to @wariziles's "go vote for
// @demigirlboss on simcluster-guests.bisks.net, she's got a lead on
// @andymasley": "is there not a betting market set up for this yet? create
// a site where users can bet on the winner of this podcast vote and track
// the odds in real time. also allow users to keep track of their money."
//
// "This podcast vote" is the live guest-request board at
// simcluster-guests.bisks.net (see sites/simcluster-guests) — anyone can
// suggest a guest for @brennan.computer's Simcluster podcast or upvote one
// already suggested. That board never formally closes (Brennan just books
// someone off it eventually), so there's no single terminal event to settle
// a one-shot bet against. Instead this runs as a repeating market: every
// ROUND_MS the Market DO fetches the live board and pays out everyone
// holding whoever's leading at that instant, then opens a fresh round. It's
// honestly framed as "who's leading when the clock hits zero," not a claim
// this predicts who Brennan actually books.
//
// Odds are pari-mutuel — pool-for-guest / total-pool — seeded with a small
// virtual stake proportional to each guest's live upvote count (SEED_FACTOR)
// so a brand new round already shows sane odds instead of 0/0, then move
// for real as people bet. Only real (non-seed) money changes hands at
// resolution. One Durable Object ("global") holds pools, bets, per-client
// play-money balances, and round history — same single-writer shape as
// simcluster-guests's GuestBoard DO this was copied from, plus a storage
// alarm to resolve rounds on schedule.
//
// No login: the page mints an opaque id into localStorage and sends it as
// X-Client-Id. That's enough identity for "track your own money" without an
// atproto-auth flow — same risk profile as the rest of this repo (someone
// can clear localStorage and get a fresh 1000 coins; it's play money for a
// fan community, not a security boundary).

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
  setAlarm(scheduledTime: number): Promise<void>;
}
interface DurableObjectState {
  storage: DurableObjectStorage;
  blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T>;
}

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  MARKET: DurableObjectNamespace;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      const id = env.MARKET.idFromName("global");
      const stub = env.MARKET.get(id);
      return stub.fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};

// ---- config --------------------------------------------------------------
const SOURCE_BOARD_URL = "https://simcluster-guests.bisks.net/api/board";
const BOARD_CACHE_MS = 10_000; // don't hammer the upstream board on every poll
const ROUND_MS = 6 * 60 * 60 * 1000; // a fresh "who's leading right now" round every 6h
const START_BALANCE = 1000;
const SEED_FACTOR = 8; // virtual coins per live upvote, display-odds only, never paid out
const MIN_BET = 10;
const MAX_CANDIDATES = 12; // how many of the live board's entries are offered as bettable
const BET_COOLDOWN_MS = 1500; // per-client, guards double-submit
const STIPEND_AMOUNT = 100;
const STIPEND_THRESHOLD = 50;
const STIPEND_COOLDOWN_MS = 30 * 60 * 1000;
const HISTORY_MAX = 20;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

interface BoardEntry {
  id: string;
  guest: string;
  upvotes: number;
}

interface RoundState {
  id: number;
  startedAt: number;
  resolvesAt: number;
  pools: Record<string, number>; // guestId -> real coins wagered
  names: Record<string, string>; // guestId -> display name at time of first bet
  bets: Record<string, Record<string, number>>; // clientId -> guestId -> stake
}

interface HistoryEntry {
  id: number;
  startedAt: number;
  resolvedAt: number;
  winnerId: string | null;
  winnerName: string | null;
  winnerUpvotes: number | null;
  totalRealPool: number;
  paidOut: number;
  winners: number;
  refunded: boolean;
}

function freshRound(id: number, now: number): RoundState {
  return { id, startedAt: now, resolvesAt: now + ROUND_MS, pools: {}, names: {}, bets: {} };
}

export class Market {
  private state: DurableObjectState;
  private ready: Promise<void>;
  private balances: Map<string, number> = new Map();
  private round: RoundState = freshRound(1, 0);
  private history: HistoryEntry[] = [];
  private lastStipend: Map<string, number> = new Map();
  private lastBetAt: Map<string, number> = new Map();
  private boardCache: { data: BoardEntry[]; fetchedAt: number; stale: boolean } = {
    data: [],
    fetchedAt: 0,
    stale: true,
  };

  constructor(state: DurableObjectState) {
    this.state = state;
    this.ready = this.state.blockConcurrencyWhile(async () => {
      const balances = await this.state.storage.get<[string, number][]>("balances");
      if (balances) this.balances = new Map(balances);
      const round = await this.state.storage.get<RoundState>("round");
      const now = Date.now();
      this.round = round ?? freshRound(1, now);
      const history = await this.state.storage.get<HistoryEntry[]>("history");
      if (history) this.history = history;
      const lastStipend = await this.state.storage.get<[string, number][]>("lastStipend");
      if (lastStipend) this.lastStipend = new Map(lastStipend);
      await this.state.storage.setAlarm(this.round.resolvesAt);
    });
  }

  private async persist(): Promise<void> {
    await this.state.storage.put({
      balances: Array.from(this.balances.entries()),
      round: this.round,
      history: this.history,
      lastStipend: Array.from(this.lastStipend.entries()),
    });
  }

  private getBalance(clientId: string): number {
    if (!this.balances.has(clientId)) this.balances.set(clientId, START_BALANCE);
    return this.balances.get(clientId)!;
  }

  private async fetchBoard(): Promise<{ data: BoardEntry[]; stale: boolean }> {
    const now = Date.now();
    if (now - this.boardCache.fetchedAt < BOARD_CACHE_MS) {
      return { data: this.boardCache.data, stale: this.boardCache.stale };
    }
    try {
      const r = await fetch(SOURCE_BOARD_URL);
      if (!r.ok) throw new Error("http " + r.status);
      const body = await r.json<{ entries?: BoardEntry[] }>();
      const data = (body.entries || []).map((e) => ({ id: e.id, guest: e.guest, upvotes: e.upvotes || 0 }));
      this.boardCache = { data, fetchedAt: now, stale: false };
    } catch {
      // Upstream hiccup — keep serving the last good snapshot rather than
      // breaking the market; just flag it so the UI can say so.
      this.boardCache = { ...this.boardCache, fetchedAt: now, stale: true };
    }
    return { data: this.boardCache.data, stale: this.boardCache.stale };
  }

  // Resolves the round if its clock has run out, then opens the next one.
  // Called defensively on every request in addition to the alarm, so a
  // missed/late alarm (dev environment, cold start) can't wedge a round.
  private async maybeResolve(board: BoardEntry[]): Promise<HistoryEntry | null> {
    const now = Date.now();
    if (now < this.round.resolvesAt) return null;

    const byId = new Map(board.map((e) => [e.id, e]));
    let winnerId: string | null = null;
    let winnerUpvotes = -1;
    for (const e of board) {
      if (e.upvotes > winnerUpvotes) {
        winnerUpvotes = e.upvotes;
        winnerId = e.id;
      }
    }
    // Fall back to whatever the market itself remembers, in the rare case
    // the source board is unreachable at resolution time.
    if (winnerId === null) {
      let best = -1;
      for (const [gid, pool] of Object.entries(this.round.pools)) {
        if (pool > best) {
          best = pool;
          winnerId = gid;
        }
      }
    }

    const totalRealPool = Object.values(this.round.pools).reduce((a, b) => a + b, 0);
    const winnerPool = winnerId ? this.round.pools[winnerId] || 0 : 0;
    let paidOut = 0;
    let winners = 0;
    const refunded = winnerPool <= 0;

    for (const [clientId, stakes] of Object.entries(this.round.bets)) {
      if (refunded) {
        const total = Object.values(stakes).reduce((a, b) => a + b, 0);
        if (total > 0) this.balances.set(clientId, this.getBalance(clientId) + total);
        continue;
      }
      const stake = winnerId ? stakes[winnerId] || 0 : 0;
      if (stake > 0) {
        const payout = Math.round((stake / winnerPool) * totalRealPool);
        this.balances.set(clientId, this.getBalance(clientId) + payout);
        paidOut += payout;
        winners++;
      }
    }

    const entry: HistoryEntry = {
      id: this.round.id,
      startedAt: this.round.startedAt,
      resolvedAt: now,
      winnerId,
      winnerName: winnerId ? byId.get(winnerId)?.guest ?? this.round.names[winnerId] ?? null : null,
      winnerUpvotes: winnerId ? byId.get(winnerId)?.upvotes ?? null : null,
      totalRealPool,
      paidOut,
      winners,
      refunded,
    };
    this.history.unshift(entry);
    if (this.history.length > HISTORY_MAX) this.history.length = HISTORY_MAX;

    this.round = freshRound(this.round.id + 1, now);
    await this.state.storage.setAlarm(this.round.resolvesAt);
    return entry;
  }

  async alarm(): Promise<void> {
    await this.ready;
    const { data } = await this.fetchBoard();
    await this.maybeResolve(data);
    await this.persist();
  }

  private buildCandidates(board: BoardEntry[]) {
    const sorted = [...board].sort((a, b) => b.upvotes - a.upvotes);
    const top = sorted.slice(0, MAX_CANDIDATES);
    const topIds = new Set(top.map((e) => e.id));
    // Keep any guest the market already has real bets on visible, even if
    // they've since fallen out of the live board's top N — a bettor's
    // position shouldn't just vanish from the page.
    const extra: BoardEntry[] = [];
    for (const gid of Object.keys(this.round.pools)) {
      if (topIds.has(gid)) continue;
      const onBoard = board.find((e) => e.id === gid);
      extra.push(onBoard ?? { id: gid, guest: this.round.names[gid] || "(unknown)", upvotes: 0 });
    }
    const candidates = [...top, ...extra];

    const displayPools = candidates.map((c) => {
      const real = this.round.pools[c.id] || 0;
      const seed = c.upvotes * SEED_FACTOR;
      return { c, real, seed, display: real + seed };
    });
    const totalDisplay = displayPools.reduce((a, b) => a + b.display, 0) || 1;

    return displayPools
      .map(({ c, real, seed, display }) => ({
        id: c.id,
        guest: c.guest,
        upvotes: c.upvotes,
        realPool: real,
        seedPool: seed,
        impliedPct: Math.round((display / totalDisplay) * 1000) / 10,
        odds: Math.round((totalDisplay / Math.max(1, display)) * 100) / 100,
      }))
      .sort((a, b) => b.upvotes - a.upvotes || b.realPool - a.realPool);
  }

  private async marketView(clientId: string) {
    const { data: board, stale } = await this.fetchBoard();
    const resolved = await this.maybeResolve(board);
    if (resolved) await this.persist();

    const balance = this.getBalance(clientId);
    const yourBets = this.round.bets[clientId] || {};
    const totalRealPool = Object.values(this.round.pools).reduce((a, b) => a + b, 0);

    return {
      round: {
        id: this.round.id,
        startedAt: this.round.startedAt,
        resolvesAt: this.round.resolvesAt,
        msRemaining: Math.max(0, this.round.resolvesAt - Date.now()),
      },
      candidates: this.buildCandidates(board),
      totalRealPool,
      balance,
      yourBets,
      history: this.history.slice(0, 5),
      boardStale: stale,
      boardCount: board.length,
      canClaimStipend:
        balance < STIPEND_THRESHOLD &&
        Date.now() - (this.lastStipend.get(clientId) || 0) > STIPEND_COOLDOWN_MS,
      leaderboard: Array.from(this.balances.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([id, bal]) => ({ id: id.slice(0, 8), balance: bal })),
    };
  }

  async fetch(request: Request): Promise<Response> {
    await this.ready;
    const url = new URL(request.url);
    const clientId = (request.headers.get("x-client-id") || "").trim().slice(0, 80);

    if (url.pathname === "/api/market" && request.method === "GET") {
      if (!clientId) return json({ error: "missing client id" }, 400);
      return json(await this.marketView(clientId));
    }

    if (url.pathname === "/api/bet" && request.method === "POST") {
      if (!clientId) return json({ error: "missing client id" }, 400);

      const last = this.lastBetAt.get(clientId) || 0;
      if (Date.now() - last < BET_COOLDOWN_MS) {
        return json({ error: "one at a time — try again in a moment" }, 429);
      }

      let body: any = {};
      try {
        body = await request.json();
      } catch {
        return json({ error: "bad json" }, 400);
      }

      const guestId = typeof body.guestId === "string" ? body.guestId : "";
      const guestName = typeof body.guestName === "string" ? body.guestName.slice(0, 100) : "";
      const amount = Math.floor(Number(body.amount));

      if (!guestId) return json({ error: "pick a guest" }, 400);
      if (!Number.isFinite(amount) || amount < MIN_BET) {
        return json({ error: `bets start at ${MIN_BET} coins` }, 400);
      }

      const { data: board } = await this.fetchBoard();
      const resolved = await this.maybeResolve(board);
      if (resolved) await this.persist();

      const onBoard = board.find((e) => e.id === guestId);
      const alreadyInMarket = Boolean(this.round.names[guestId]);
      if (!onBoard && !alreadyInMarket) {
        return json({ error: "that guest isn't on the live board" }, 400);
      }

      const balance = this.getBalance(clientId);
      if (amount > balance) return json({ error: "not enough coins" }, 400);

      this.lastBetAt.set(clientId, Date.now());
      this.balances.set(clientId, balance - amount);
      this.round.pools[guestId] = (this.round.pools[guestId] || 0) + amount;
      if (!this.round.names[guestId]) this.round.names[guestId] = onBoard?.guest || guestName || guestId;
      if (!this.round.bets[clientId]) this.round.bets[clientId] = {};
      this.round.bets[clientId][guestId] = (this.round.bets[clientId][guestId] || 0) + amount;

      await this.persist();
      return json(await this.marketView(clientId));
    }

    if (url.pathname === "/api/stipend" && request.method === "POST") {
      if (!clientId) return json({ error: "missing client id" }, 400);
      const balance = this.getBalance(clientId);
      const last = this.lastStipend.get(clientId) || 0;
      if (balance >= STIPEND_THRESHOLD) return json({ error: "you're not broke yet" }, 400);
      if (Date.now() - last < STIPEND_COOLDOWN_MS) {
        return json({ error: "already spotted you recently" }, 429);
      }
      this.lastStipend.set(clientId, Date.now());
      this.balances.set(clientId, balance + STIPEND_AMOUNT);
      await this.persist();
      return json(await this.marketView(clientId));
    }

    return json({ error: "not found" }, 404);
  }
}
