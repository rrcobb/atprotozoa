// presspool Worker — presspool.bisks.net
//
// @shimmermathlabs.com tagged the bot on a post quoting
// @fromthewestmeadow.com's original idea — a site with one button labeled "do
// not press this button" (built as sites/dontpressit: exactly one button,
// shared by every visitor on earth, and the first press anywhere ends it for
// everyone, forever — no reset). The ask here: build a betting market on WHEN
// that button gets pressed. Don't encourage anyone to press it. Make it clear
// that betting here and then going to press the button yourself to cash in is
// grounds for punishment.
//
// dontpressit.bisks.net/api/state is public and CORS-open — it returns
// { pressed, pressedAt, futileClicks, visits }. This Worker polls it
// server-side (no CORS concerns for a server-to-server fetch; that header
// only governs browser access). Bettors stake play money on one of six time
// buckets measured from EPOCH, the moment this market's Durable Object was
// first created — "within the hour", ... "180+ days (maybe never)". The
// instant the source flips to pressed, the market resolves exactly once:
// whichever bucket contains (pressedAt - epoch) wins, and the real pool
// splits pari-mutuel across everyone holding that bucket. If nobody backed
// the winning bucket, every stake is refunded. After that the market is
// closed forever, same as the button it's watching — there is no next round,
// and no reset route.
//
// One Durable Object ("global") holds pools, bets, balances, and the
// resolution, checked defensively on every request (so a quiet market still
// resolves promptly once someone loads the page) plus a backup alarm every
// few minutes so it can resolve even with zero traffic. No login: the page
// mints an opaque id into localStorage and sends it as X-Client-Id, same
// anonymous-identity shape as sites/guestbet, which this was copied from —
// closest lineage (a DO pari-mutuel market with no login) — with guestbet's
// repeating-round logic replaced by this one-shot terminal resolution.

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
const SOURCE_STATE_URL = "https://dontpressit.bisks.net/api/state";
const STATE_CACHE_MS = 15_000; // don't hammer the upstream DO on every poll
const ALARM_INTERVAL_MS = 5 * 60 * 1000; // resolve promptly even with zero visitors
const START_BALANCE = 1000;
const MIN_BET = 10;
const BET_COOLDOWN_MS = 1500; // per-client, guards double-submit
const STIPEND_AMOUNT = 100;
const STIPEND_THRESHOLD = 50;
const STIPEND_COOLDOWN_MS = 30 * 60 * 1000;
const ACTIVITY_MAX = 15;

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

interface BucketDef {
  id: string;
  label: string;
  flavor: string;
  minMs: number;
  maxMs: number; // Infinity for the open-ended last bucket
}

// Measured from EPOCH — the moment this market opened, not from whenever
// dontpressit itself first went up. Six buckets, open-ended at the top
// because the button might never get pressed, and that has to be a bettable
// (if permanently unresolved) outcome.
const BUCKETS: BucketDef[] = [
  { id: "rash", label: "within the hour", flavor: "someone's thumb slips almost immediately", minMs: 0, maxMs: HOUR },
  { id: "today", label: "later today", flavor: "a cooler head, same day", minMs: HOUR, maxMs: DAY },
  { id: "week", label: "this week", flavor: "it takes a few days to wear someone down", minMs: DAY, maxMs: 7 * DAY },
  { id: "month", label: "this month", flavor: "a slow bleed of willpower", minMs: 7 * DAY, maxMs: 30 * DAY },
  { id: "season", label: "within a season", flavor: "the long game", minMs: 30 * DAY, maxMs: 180 * DAY },
  { id: "forever", label: "180+ days (maybe never)", flavor: "humanity holds the line, allegedly", minMs: 180 * DAY, maxMs: Infinity },
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

interface ButtonState {
  pressed: boolean;
  pressedAt: number | null;
}

interface Resolution {
  pressedAt: number;
  winningBucketId: string | null;
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

export class Market {
  private state: DurableObjectState;
  private ready: Promise<void>;
  private epoch = 0;
  private balances: Map<string, number> = new Map();
  private pools: Record<string, number> = {};
  private bets: Record<string, Record<string, number>> = {};
  private lastStipend: Map<string, number> = new Map();
  private lastBetAt: Map<string, number> = new Map();
  private lifetime: Map<string, LifetimeStats> = new Map();
  private activity: ActivityEntry[] = [];
  private resolution: Resolution | null = null;
  private buttonCache: { data: ButtonState; fetchedAt: number; stale: boolean } = {
    data: { pressed: false, pressedAt: null },
    fetchedAt: 0,
    stale: true,
  };

  constructor(state: DurableObjectState) {
    this.state = state;
    this.ready = this.state.blockConcurrencyWhile(async () => {
      const epoch = await this.state.storage.get<number>("epoch");
      this.epoch = epoch ?? Date.now();
      const balances = await this.state.storage.get<[string, number][]>("balances");
      if (balances) this.balances = new Map(balances);
      const pools = await this.state.storage.get<Record<string, number>>("pools");
      if (pools) this.pools = pools;
      const bets = await this.state.storage.get<Record<string, Record<string, number>>>("bets");
      if (bets) this.bets = bets;
      const lastStipend = await this.state.storage.get<[string, number][]>("lastStipend");
      if (lastStipend) this.lastStipend = new Map(lastStipend);
      const lifetime = await this.state.storage.get<[string, LifetimeStats][]>("lifetime");
      if (lifetime) this.lifetime = new Map(lifetime);
      const activity = await this.state.storage.get<ActivityEntry[]>("activity");
      if (activity) this.activity = activity;
      const resolution = await this.state.storage.get<Resolution>("resolution");
      this.resolution = resolution ?? null;
      await this.state.storage.put({ epoch: this.epoch });
      if (!this.resolution) await this.state.storage.setAlarm(Date.now() + ALARM_INTERVAL_MS);
    });
  }

  private async persist(): Promise<void> {
    await this.state.storage.put({
      epoch: this.epoch,
      balances: Array.from(this.balances.entries()),
      pools: this.pools,
      bets: this.bets,
      lastStipend: Array.from(this.lastStipend.entries()),
      lifetime: Array.from(this.lifetime.entries()),
      activity: this.activity,
      resolution: this.resolution,
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

  private async fetchButtonState(): Promise<{ data: ButtonState; stale: boolean }> {
    const now = Date.now();
    if (now - this.buttonCache.fetchedAt < STATE_CACHE_MS) {
      return { data: this.buttonCache.data, stale: this.buttonCache.stale };
    }
    try {
      const r = await fetch(SOURCE_STATE_URL);
      if (!r.ok) throw new Error("http " + r.status);
      const body = await r.json<{ pressed?: boolean; pressedAt?: number | null }>();
      const data: ButtonState = { pressed: Boolean(body.pressed), pressedAt: body.pressedAt ?? null };
      this.buttonCache = { data, fetchedAt: now, stale: false };
    } catch {
      // Upstream hiccup — keep serving the last good snapshot rather than
      // breaking the market; just flag it so the UI can say so.
      this.buttonCache = { ...this.buttonCache, fetchedAt: now, stale: true };
    }
    return { data: this.buttonCache.data, stale: this.buttonCache.stale };
  }

  // Resolves the market exactly once, the instant the source button flips to
  // pressed. Called defensively on every request (in addition to the backup
  // alarm) so resolution can't be missed by a late/cold-started alarm.
  private async maybeResolve(button: ButtonState): Promise<boolean> {
    if (this.resolution) return false;
    if (!button.pressed || button.pressedAt == null) return false;

    const deltaMs = Math.max(0, button.pressedAt - this.epoch);
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

    this.resolution = {
      pressedAt: button.pressedAt,
      winningBucketId,
      totalRealPool,
      paidOut,
      winners,
      refunded,
    };
    return true;
  }

  async alarm(): Promise<void> {
    await this.ready;
    const { data } = await this.fetchButtonState();
    const justResolved = await this.maybeResolve(data);
    await this.persist();
    if (!justResolved) await this.state.storage.setAlarm(Date.now() + ALARM_INTERVAL_MS);
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
        won: this.resolution ? this.resolution.winningBucketId === b.id : null,
      };
    });
  }

  private async marketView(clientId: string) {
    const { data: button, stale } = await this.fetchButtonState();
    const justResolved = await this.maybeResolve(button);
    if (justResolved) await this.persist();

    const balance = this.getBalance(clientId);
    const yourBets = this.bets[clientId] || {};
    const totalRealPool = Object.values(this.pools).reduce((a, b) => a + b, 0);
    const stats = this.lifetime.get(clientId) || freshStats();

    return {
      epoch: this.epoch,
      now: Date.now(),
      button: { pressed: button.pressed, pressedAt: button.pressedAt, stale },
      resolution: this.resolution,
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
        !this.resolution &&
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
      if (this.resolution) return json({ error: "market's closed — the button was already pressed" }, 400);

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

      // Re-check the real button, synchronously, before touching any money —
      // a stale cached "unpressed" must never let a bet slip in after the
      // real press just because the periodic check hasn't run yet.
      const { data: button } = await this.fetchButtonState();
      const justResolved = await this.maybeResolve(button);
      if (justResolved) {
        await this.persist();
        return json({ error: "market's closed — the button was just pressed" }, 400);
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
      if (this.resolution) return json({ error: "market's closed" }, 400);
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
