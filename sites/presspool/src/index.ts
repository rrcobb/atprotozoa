// presspool Worker — presspool.bisks.net
//
// @shimmermathlabs.com tagged the bot on a post quoting
// @fromthewestmeadow.com's original idea — a site with one button labeled "do
// not press this button" (built as sites/dontpressit). The ask: build a
// betting market on WHEN that button gets pressed. Don't encourage anyone to
// press it. Make it clear that betting here and then going to press the
// button yourself to cash in is grounds for punishment.
//
// v1 shipped against dontpressit's original one-shot shape: exactly one
// button, first press anywhere ends it for everyone, forever, no reset. This
// market mirrored that — resolve pari-mutuel exactly once, then close
// permanently.
//
// v2, this file: dontpressit was rebuilt (see sites/dontpressit/src/index.ts)
// into a round system — the button never stops. Every round carries a name
// pulled from @fromthewestmeadow.com's followers; pressing it "graduates"
// that name forever and immediately starts the next round. There is no
// terminal state to mirror anymore, so this market doesn't have one either:
// it tracks whichever dontpressit round is currently live, takes bets on how
// long THAT round survives, and the instant dontpressit's roundNumber
// advances (detected by polling its public /api/state), resolves the round
// that just ended pari-mutuel and opens a fresh board for the new one — same
// balances and leaderboard carried forward, same six time buckets, just
// looping instead of stopping. dontpressit.bisks.net/api/state is public and
// CORS-open; this Worker polls it server-side (no CORS concerns for a
// server-to-server fetch — that header only governs browser access) and now
// returns { roundNumber, currentName, roundStartedAt, futileClicks, visits,
// totalGraduated, graduated }.
//
// One Durable Object ("global") holds pools, bets, balances, and round
// tracking, checked defensively on every request (so a quiet market still
// advances promptly once someone loads the page) plus a backup alarm every
// few minutes so it can advance even with zero traffic. No login: the page
// mints an opaque id into localStorage and sends it as X-Client-Id, same
// anonymous-identity shape as sites/guestbet, which this was originally
// copied from — closest lineage (a DO pari-mutuel market with repeating
// rounds and no login).

interface KVNamespace {
  get<T = unknown>(key: string, type: "json"): Promise<T | null>;
  put(key: string, value: unknown): Promise<void>;
}

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  MARKET_STATE: KVNamespace;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      return new MarketStore(env.MARKET_STATE).fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};

// ---- config --------------------------------------------------------------
const SOURCE_STATE_URL = "https://dontpressit.bisks.net/api/state";
const STATE_CACHE_MS = 15_000; // don't hammer the upstream DO on every poll
const ALARM_INTERVAL_MS = 5 * 60 * 1000; // advance promptly even with zero visitors
const START_BALANCE = 1000;
const MIN_BET = 10;
const BET_COOLDOWN_MS = 1500; // per-client, guards double-submit
const STIPEND_AMOUNT = 100;
const STIPEND_THRESHOLD = 50;
const STIPEND_COOLDOWN_MS = 30 * 60 * 1000;
const ACTIVITY_MAX = 15;
const RESULTS_HISTORY_MAX = 10;

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

interface BucketDef {
  id: string;
  label: string;
  flavor: string;
  minMs: number;
  maxMs: number; // Infinity for the open-ended last bucket
}

// Measured from the current round's start (dontpressit's roundStartedAt),
// not from whenever this market itself first opened — every round gets its
// own clock. Six buckets, open-ended at the top because a round might run a
// very long time before anyone cracks.
const BUCKETS: BucketDef[] = [
  { id: "rash", label: "within the hour", flavor: "someone's thumb slips almost immediately", minMs: 0, maxMs: HOUR },
  { id: "today", label: "later today", flavor: "a cooler head, same day", minMs: HOUR, maxMs: DAY },
  { id: "week", label: "this week", flavor: "it takes a few days to wear someone down", minMs: DAY, maxMs: 7 * DAY },
  { id: "month", label: "this month", flavor: "a slow bleed of willpower", minMs: 7 * DAY, maxMs: 30 * DAY },
  { id: "season", label: "within a season", flavor: "the long game", minMs: 30 * DAY, maxMs: 180 * DAY },
  { id: "forever", label: "180+ days (maybe never)", flavor: "this round holds the line, allegedly", minMs: 180 * DAY, maxMs: Infinity },
];

function bucketFor(deltaMs: number): BucketDef {
  return BUCKETS.find((b) => deltaMs >= b.minMs && deltaMs < b.maxMs) ?? BUCKETS[BUCKETS.length - 1];
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

interface RoundName {
  handle: string;
  displayName: string;
  avatar: string;
}
interface GraduatedEntry {
  handle: string;
  displayName: string;
  avatar: string;
  roundNumber: number;
  endedAt: number;
  visits: number;
  futileClicks: number;
}
interface SourceState {
  roundNumber: number;
  currentName: RoundName | null;
  roundStartedAt: number;
  totalGraduated: number;
  graduated: GraduatedEntry[];
}

interface RoundResult {
  roundNumber: number;
  name: RoundName | null;
  roundStartedAt: number;
  endedAt: number;
  winningBucketId: string;
  totalRealPool: number;
  paidOut: number;
  winners: number;
  refunded: boolean;
}

interface LifetimeStats {
  wagered: number;
  won: number;
}

interface ActivityEntry {
  bucketId: string;
  amount: number;
  clientShort: string;
  ts: number;
}

function freshStats(): LifetimeStats {
  return { wagered: 0, won: 0 };
}

export class MarketStore {
  private state: KVNamespace;
  private ready: Promise<void>;

  // The dontpressit round this market is currently taking bets on.
  private trackedRoundNumber = 0; // 0 = not yet synced with the source
  private trackedRoundStartedAt = 0;
  private trackedName: RoundName | null = null;

  private balances: Map<string, number> = new Map();
  private pools: Record<string, number> = {};
  private bets: Record<string, Record<string, number>> = {};
  private lastStipend: Map<string, number> = new Map();
  private lastBetAt: Map<string, number> = new Map();
  private lifetime: Map<string, LifetimeStats> = new Map();
  private activity: ActivityEntry[] = [];

  private lastResult: RoundResult | null = null;
  private resultsHistory: RoundResult[] = [];

  private sourceCache: { data: SourceState; fetchedAt: number; stale: boolean } = {
    data: { roundNumber: 0, currentName: null, roundStartedAt: 0, totalGraduated: 0, graduated: [] },
    fetchedAt: 0,
    stale: true,
  };

  constructor(state: KVNamespace) {
    this.state = state;
    this.ready = (async () => {
      const snapshot = await this.state.get<any>("state", "json");
      const trackedRoundNumber = snapshot?.trackedRoundNumber;
      this.trackedRoundNumber = trackedRoundNumber ?? 0;
      const trackedRoundStartedAt = snapshot?.trackedRoundStartedAt;
      this.trackedRoundStartedAt = trackedRoundStartedAt ?? 0;
      const trackedName = snapshot?.trackedName;
      this.trackedName = trackedName ?? null;
      const balances = snapshot?.balances;
      if (balances) this.balances = new Map(balances);
      const pools = snapshot?.pools;
      if (pools) this.pools = pools;
      const bets = snapshot?.bets;
      if (bets) this.bets = bets;
      const lastStipend = snapshot?.lastStipend;
      if (lastStipend) this.lastStipend = new Map(lastStipend);
      const lifetime = snapshot?.lifetime;
      if (lifetime) this.lifetime = new Map(lifetime);
      const activity = snapshot?.activity;
      if (activity) this.activity = activity;
      const lastResult = snapshot?.lastResult;
      this.lastResult = lastResult ?? null;
      const resultsHistory = snapshot?.resultsHistory;
      this.resultsHistory = resultsHistory ?? [];

      if (this.trackedRoundNumber === 0) {
        // First boot (or storage wiped): sync onto whatever round dontpressit
        // is on right now rather than guessing. If the source is unreachable
        // at boot, this stays 0 and betting is refused until a later poll
        // succeeds — see the /api/bet guard below.
        const { data, stale } = await this.fetchSourceState();
        if (!stale && data.roundNumber > 0) {
          this.trackedRoundNumber = data.roundNumber;
          this.trackedRoundStartedAt = data.roundStartedAt;
          this.trackedName = data.currentName;
          await this.persist();
        }
      }

    });
  }

  private async persist(): Promise<void> {
    await this.state.put("state", {
      trackedRoundNumber: this.trackedRoundNumber,
      trackedRoundStartedAt: this.trackedRoundStartedAt,
      trackedName: this.trackedName,
      balances: Array.from(this.balances.entries()),
      pools: this.pools,
      bets: this.bets,
      lastStipend: Array.from(this.lastStipend.entries()),
      lifetime: Array.from(this.lifetime.entries()),
      activity: this.activity,
      lastResult: this.lastResult,
      resultsHistory: this.resultsHistory,
    });
  }

  private getBalance(clientId: string): number {
    if (!this.balances.has(clientId)) this.balances.set(clientId, START_BALANCE);
    return this.balances.get(clientId)!;
  }

  private getStats(clientId: string): LifetimeStats {
    if (!this.lifetime.has(clientId)) this.lifetime.set(clientId, freshStats());
    return this.lifetime.get(clientId)!;
  }

  private async fetchSourceState(): Promise<{ data: SourceState; stale: boolean }> {
    const now = Date.now();
    if (now - this.sourceCache.fetchedAt < STATE_CACHE_MS) {
      return { data: this.sourceCache.data, stale: this.sourceCache.stale };
    }
    try {
      const r = await fetch(SOURCE_STATE_URL);
      if (!r.ok) throw new Error("http " + r.status);
      const body = await r.json<Partial<SourceState>>();
      const data: SourceState = {
        roundNumber: Number(body.roundNumber) || 0,
        currentName: body.currentName ?? null,
        roundStartedAt: Number(body.roundStartedAt) || 0,
        totalGraduated: Number(body.totalGraduated) || 0,
        graduated: Array.isArray(body.graduated) ? body.graduated : [],
      };
      this.sourceCache = { data, fetchedAt: now, stale: false };
    } catch {
      // Upstream hiccup — keep serving the last good snapshot rather than
      // breaking the market; just flag it so the UI can say so.
      this.sourceCache = { ...this.sourceCache, fetchedAt: now, stale: true };
    }
    return { data: this.sourceCache.data, stale: this.sourceCache.stale };
  }

  // Pays out the round that just ended, pari-mutuel, then wipes the board
  // for the next one. Balances, lifetime stats, and the leaderboard are not
  // reset — only the per-round pools/bets/activity are.
  private resolveRound(endedAt: number): void {
    const deltaMs = Math.max(0, endedAt - this.trackedRoundStartedAt);
    const winningBucketId = bucketFor(deltaMs).id;
    const totalRealPool = Object.values(this.pools).reduce((a, b) => a + b, 0);
    const winnerPool = this.pools[winningBucketId] || 0;
    const refunded = winnerPool <= 0;
    let paidOut = 0;
    let winners = 0;

    for (const [clientId, stakes] of Object.entries(this.bets)) {
      if (refunded) {
        const total = Object.values(stakes).reduce((a, b) => a + b, 0);
        if (total > 0) this.balances.set(clientId, this.getBalance(clientId) + total);
        continue;
      }
      const stake = stakes[winningBucketId] || 0;
      if (stake > 0) {
        const payout = Math.round((stake / winnerPool) * totalRealPool);
        this.balances.set(clientId, this.getBalance(clientId) + payout);
        paidOut += payout;
        winners++;
        const stats = this.getStats(clientId);
        stats.won += payout;
      }
    }

    const result: RoundResult = {
      roundNumber: this.trackedRoundNumber,
      name: this.trackedName,
      roundStartedAt: this.trackedRoundStartedAt,
      endedAt,
      winningBucketId,
      totalRealPool,
      paidOut,
      winners,
      refunded,
    };
    this.lastResult = result;
    this.resultsHistory.unshift(result);
    if (this.resultsHistory.length > RESULTS_HISTORY_MAX) this.resultsHistory.length = RESULTS_HISTORY_MAX;

    this.pools = {};
    this.bets = {};
    this.activity = [];
  }

  // Checked defensively on every request (in addition to the backup alarm)
  // so a round change can't be missed by a late/cold-started alarm. Returns
  // true if state changed and needs persisting.
  private async maybeAdvance(): Promise<boolean> {
    const { data: source, stale } = await this.fetchSourceState();
    if (stale) return false;

    if (this.trackedRoundNumber === 0) {
      if (source.roundNumber <= 0) return false;
      this.trackedRoundNumber = source.roundNumber;
      this.trackedRoundStartedAt = source.roundStartedAt;
      this.trackedName = source.currentName;
      return true;
    }

    if (source.roundNumber === this.trackedRoundNumber) return false;

    // The round we were tracking ended somewhere between our last poll and
    // this one — dontpressit has already moved on. Its graduated log only
    // keeps the last 12 entries, so if this market was quiet long enough to
    // fall further behind than that, fall back to "now" as an approximation
    // rather than losing the round's payout entirely.
    const grad = source.graduated.find((g) => g.roundNumber === this.trackedRoundNumber);
    this.resolveRound(grad ? grad.endedAt : Date.now());

    this.trackedRoundNumber = source.roundNumber;
    this.trackedRoundStartedAt = source.roundStartedAt;
    this.trackedName = source.currentName;
    return true;
  }

  private buildBuckets() {
    const totalPool = Object.values(this.pools).reduce((a, b) => a + b, 0);
    return BUCKETS.map((b) => {
      const pool = this.pools[b.id] || 0;
      return {
        id: b.id,
        label: b.label,
        flavor: b.flavor,
        pool,
        impliedPct: totalPool > 0 ? Math.round((pool / totalPool) * 1000) / 10 : 0,
        odds: pool > 0 ? Math.round((totalPool / pool) * 100) / 100 : null,
      };
    });
  }

  private async marketView(clientId: string) {
    const { stale } = await this.fetchSourceState();
    const changed = await this.maybeAdvance();
    if (changed) await this.persist();

    const balance = this.getBalance(clientId);
    const yourBets = this.bets[clientId] || {};
    const totalRealPool = Object.values(this.pools).reduce((a, b) => a + b, 0);
    const stats = this.lifetime.get(clientId) || freshStats();

    return {
      synced: this.trackedRoundNumber > 0,
      round: { number: this.trackedRoundNumber, startedAt: this.trackedRoundStartedAt, name: this.trackedName },
      sourceStale: stale,
      lastResult: this.lastResult,
      buckets: this.buildBuckets(),
      totalRealPool,
      balance,
      yourBets,
      yourStats: {
        wagered: stats.wagered,
        won: stats.won,
        net: stats.won - stats.wagered,
      },
      activity: this.activity.slice(0, ACTIVITY_MAX),
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

      const bucketId = typeof body.bucketId === "string" ? body.bucketId : "";
      const amount = Math.floor(Number(body.amount));

      if (!BUCKETS.some((b) => b.id === bucketId)) return json({ error: "pick a real bucket" }, 400);
      if (!Number.isFinite(amount) || amount < MIN_BET) {
        return json({ error: `bets start at ${MIN_BET} coins` }, 400);
      }

      // Re-sync against the real round, synchronously, before touching any
      // money — a stale cached round number must never let a bet slip in
      // after the real round has already turned over.
      const wasSynced = this.trackedRoundNumber > 0;
      const changed = await this.maybeAdvance();
      if (changed) {
        await this.persist();
        return json(
          wasSynced
            ? { error: "that round just ended — the board reset, place your bet on the new one" }
            : { error: "still syncing with dontpressit — try again in a moment" },
          400,
        );
      }
      if (this.trackedRoundNumber === 0) {
        return json({ error: "still syncing with dontpressit — try again in a moment" }, 400);
      }

      const balance = this.getBalance(clientId);
      if (amount > balance) return json({ error: "not enough coins" }, 400);

      this.lastBetAt.set(clientId, Date.now());
      this.balances.set(clientId, balance - amount);
      this.pools[bucketId] = (this.pools[bucketId] || 0) + amount;
      if (!this.bets[clientId]) this.bets[clientId] = {};
      this.bets[clientId][bucketId] = (this.bets[clientId][bucketId] || 0) + amount;

      const stats = this.getStats(clientId);
      stats.wagered += amount;

      this.activity.unshift({ bucketId, amount, clientShort: clientId.slice(0, 6), ts: Date.now() });
      if (this.activity.length > ACTIVITY_MAX) this.activity.length = ACTIVITY_MAX;

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
