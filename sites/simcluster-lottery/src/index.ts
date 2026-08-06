// simcluster lottery Worker — served at the root of simcluster-lottery.bisks.net.
//
// @fromthewestmeadow.com: "simcluster lottery where you can come buy tickets
// and there are hourly daily and weekly draws that track your wallet balance
// with oauth login with balance reset monthly and a leader board for wallet
// balances with the goal to make the most money." Play money only, same
// "toy, not a casino" compromise as sites/notgambling — chips can't be
// bought or cashed out for anything real, and the whole point of the
// monthly reset is that nobody's balance is meant to last past a month
// anyway. Sign in with Bluesky (bare `atproto` scope, no PDS writes — see
// public/lib/oauth.js) to attribute a wallet to your DID instead of an
// anonymous localStorage id, so the leaderboard means something.
//
// One Durable Object ("global") holds every wallet, all three draws'
// ticket pools, resolution history, and the leaderboard — same
// single-writer shape as sites/guestbet's Market DO, extended to three
// independently-clocked draws instead of one. Each draw is a real lottery:
// every ticket bought is one entry, a single winner is drawn weighted by
// tickets held, and the winner takes the whole pot (ticket revenue for that
// round — no house cut, since "the house" here is nobody). A storage alarm
// resolves whichever draw is soonest due; every request also defensively
// resolves any draw whose clock has already run out, so a missed/late
// alarm (dev environment, cold start) can't wedge a round — same pattern
// guestbet's Market.maybeResolve() uses.
//
// No cookie, no server-side session lookup: identity is whatever DID the
// client's completed OAuth login handed it, same trust level the rest of
// this repo already accepts for play money (see guestbet's own comment on
// this). Someone editing devtools to claim another DID could nudge that
// wallet, but there's nothing real to steal — it resets every month.

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
  LOTTERY: DurableObjectNamespace;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      const stub = env.LOTTERY.get(env.LOTTERY.idFromName("global"));
      return stub.fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};

// ---- config ----------------------------------------------------------------

type DrawKind = "hourly" | "daily" | "weekly";
const KINDS: DrawKind[] = ["hourly", "daily", "weekly"];

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const STEP_MS: Record<DrawKind, number> = { hourly: HOUR, daily: DAY, weekly: WEEK };
const PRICE: Record<DrawKind, number> = { hourly: 5, daily: 20, weekly: 75 };

const START_BALANCE = 1000;
const MAX_TICKETS_PER_BUY = 500;
const STIPEND_AMOUNT = 150;
const STIPEND_THRESHOLD = 25;
const STIPEND_COOLDOWN_MS = 20 * 60 * 1000;
const HISTORY_MAX = 40;
const LEADERBOARD_SIZE = 25;
const MONTHLY_CHAMPIONS_MAX = 12;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function safeJson(request: Request): Promise<any> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function cleanStr(s: unknown, max: number): string {
  return typeof s === "string" ? s.trim().slice(0, max) : "";
}

function isDid(s: unknown): s is string {
  return typeof s === "string" && s.startsWith("did:") && s.length <= 200;
}

// Next wall-clock boundary of `step` ms, aligned to the Unix epoch — e.g.
// step=HOUR always lands on :00, step=DAY always lands on 00:00 UTC. Doesn't
// need to be a specific weekday for "weekly" to make sense, just a fixed,
// predictable 7-day cadence.
function nextBoundary(now: number, step: number): number {
  let t = Math.floor(now / step) * step;
  while (t <= now) t += step;
  return t;
}

function nextMonthBoundary(now: number): number {
  const d = new Date(now);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  return m === 11 ? Date.UTC(y + 1, 0, 1) : Date.UTC(y, m + 1, 1);
}

function monthKey(now: number): string {
  const d = new Date(now);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// crypto-random integer in [0, max). Fine at this scale — nobody's auditing
// a play-money raffle for statistical bias.
function randomInt(max: number): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] % max;
}

// ---- state shapes ------------------------------------------------------------

interface Draw {
  id: number;
  kind: DrawKind;
  startedAt: number;
  resolvesAt: number;
  price: number;
  tickets: Record<string, number>; // did -> ticket count this round
  ticketTotal: number;
}

interface Profile {
  handle: string;
  displayName: string;
  avatar: string;
}

interface HistoryEntry {
  id: number;
  kind: DrawKind;
  resolvedAt: number;
  winnerDid: string | null;
  winnerHandle: string | null;
  pot: number;
  ticketsSold: number;
  participants: number;
}

interface LifetimeStats {
  spent: number;
  won: number;
  ticketsBought: number;
  wins: number;
}

interface MonthlyChampion {
  month: string;
  did: string;
  handle: string;
  balance: number;
}

function freshStats(): LifetimeStats {
  return { spent: 0, won: 0, ticketsBought: 0, wins: 0 };
}

function freshDraw(kind: DrawKind, id: number, now: number): Draw {
  return {
    id,
    kind,
    startedAt: now,
    resolvesAt: nextBoundary(now, STEP_MS[kind]),
    price: PRICE[kind],
    tickets: {},
    ticketTotal: 0,
  };
}

// ---- the Lottery Durable Object ----------------------------------------------

export class Lottery {
  private state: DurableObjectState;
  private ready: Promise<void>;

  private balances: Map<string, number> = new Map();
  private profiles: Map<string, Profile> = new Map();
  private draws: Record<DrawKind, Draw>;
  private history: HistoryEntry[] = [];
  private lifetime: Map<string, LifetimeStats> = new Map();
  private lastStipend: Map<string, number> = new Map();
  private monthlyChampions: MonthlyChampion[] = [];
  private lastResetMonth = "";

  constructor(state: DurableObjectState) {
    this.state = state;
    const now = Date.now();
    this.draws = {
      hourly: freshDraw("hourly", 1, now),
      daily: freshDraw("daily", 1, now),
      weekly: freshDraw("weekly", 1, now),
    };

    this.ready = this.state.blockConcurrencyWhile(async () => {
      const balances = await this.state.storage.get<[string, number][]>("balances");
      if (balances) this.balances = new Map(balances);
      const profiles = await this.state.storage.get<[string, Profile][]>("profiles");
      if (profiles) this.profiles = new Map(profiles);
      const draws = await this.state.storage.get<Record<DrawKind, Draw>>("draws");
      if (draws) this.draws = draws;
      const history = await this.state.storage.get<HistoryEntry[]>("history");
      if (history) this.history = history;
      const lifetime = await this.state.storage.get<[string, LifetimeStats][]>("lifetime");
      if (lifetime) this.lifetime = new Map(lifetime);
      const lastStipend = await this.state.storage.get<[string, number][]>("lastStipend");
      if (lastStipend) this.lastStipend = new Map(lastStipend);
      const monthlyChampions = await this.state.storage.get<MonthlyChampion[]>("monthlyChampions");
      if (monthlyChampions) this.monthlyChampions = monthlyChampions;
      const lastResetMonth = await this.state.storage.get<string>("lastResetMonth");
      this.lastResetMonth = lastResetMonth || monthKey(Date.now());

      this.advance(Date.now());
      await this.persist();
      await this.armAlarm();
    });
  }

  private async persist(): Promise<void> {
    await this.state.storage.put({
      balances: Array.from(this.balances.entries()),
      profiles: Array.from(this.profiles.entries()),
      draws: this.draws,
      history: this.history,
      lifetime: Array.from(this.lifetime.entries()),
      lastStipend: Array.from(this.lastStipend.entries()),
      monthlyChampions: this.monthlyChampions,
      lastResetMonth: this.lastResetMonth,
    });
  }

  private async armAlarm(): Promise<void> {
    const next = Math.min(this.draws.hourly.resolvesAt, this.draws.daily.resolvesAt, this.draws.weekly.resolvesAt);
    await this.state.storage.setAlarm(next);
  }

  private getBalance(did: string): number {
    if (!this.balances.has(did)) this.balances.set(did, START_BALANCE);
    return this.balances.get(did)!;
  }

  private getStats(did: string): LifetimeStats {
    if (!this.lifetime.has(did)) this.lifetime.set(did, freshStats());
    return this.lifetime.get(did)!;
  }

  private touchProfile(did: string, handle: string, displayName: string, avatar: string): void {
    if (!handle) return;
    this.profiles.set(did, { handle, displayName: displayName || handle, avatar });
  }

  private handleFor(did: string | null): string | null {
    if (!did) return null;
    return this.profiles.get(did)?.handle || null;
  }

  // First-of-the-month rollover: snapshots whoever was on top before wiping
  // every balance back to START_BALANCE. Guarded so a brand-new DO (nothing
  // to snapshot yet) doesn't record a champion of nobody.
  private checkMonthlyReset(now: number): boolean {
    const ym = monthKey(now);
    if (!this.lastResetMonth) {
      this.lastResetMonth = ym;
      return false;
    }
    if (this.lastResetMonth === ym) return false;

    if (this.balances.size > 0) {
      let bestDid: string | null = null;
      let bestBal = -Infinity;
      for (const [did, bal] of this.balances) {
        if (bal > bestBal) {
          bestBal = bal;
          bestDid = did;
        }
      }
      if (bestDid) {
        this.monthlyChampions.unshift({
          month: this.lastResetMonth,
          did: bestDid,
          handle: this.handleFor(bestDid) || bestDid,
          balance: bestBal,
        });
        if (this.monthlyChampions.length > MONTHLY_CHAMPIONS_MAX) {
          this.monthlyChampions.length = MONTHLY_CHAMPIONS_MAX;
        }
      }
    }

    this.balances.clear();
    this.lastResetMonth = ym;
    return true;
  }

  private pickWinner(draw: Draw): string | null {
    if (draw.ticketTotal <= 0) return null;
    const r = randomInt(draw.ticketTotal);
    let acc = 0;
    for (const [did, count] of Object.entries(draw.tickets)) {
      acc += count;
      if (r < acc) return did;
    }
    return null;
  }

  // Resolves a draw as many times as its clock has fallen behind (handles a
  // long-asleep DO catching up on several missed rounds at once), then opens
  // a fresh round each time. Called on every request AND from alarm() —
  // whichever gets there first wins, the other is a no-op.
  private resolveDrawIfDue(kind: DrawKind, now: number): boolean {
    let changed = false;
    while (now >= this.draws[kind].resolvesAt) {
      const draw = this.draws[kind];
      const winnerDid = this.pickWinner(draw);
      const pot = draw.ticketTotal * draw.price;

      if (winnerDid) {
        this.balances.set(winnerDid, this.getBalance(winnerDid) + pot);
        const stats = this.getStats(winnerDid);
        stats.won += pot;
        stats.wins += 1;
      }

      this.history.unshift({
        id: draw.id,
        kind,
        resolvedAt: now,
        winnerDid,
        winnerHandle: this.handleFor(winnerDid),
        pot,
        ticketsSold: draw.ticketTotal,
        participants: Object.keys(draw.tickets).length,
      });
      if (this.history.length > HISTORY_MAX) this.history.length = HISTORY_MAX;

      this.draws[kind] = freshDraw(kind, draw.id + 1, now);
      changed = true;
    }
    return changed;
  }

  // Runs monthly reset + all three draws' due-check. Returns whether
  // anything changed (worth a persist + alarm re-arm).
  private advance(now: number): boolean {
    let changed = this.checkMonthlyReset(now);
    for (const kind of KINDS) {
      if (this.resolveDrawIfDue(kind, now)) changed = true;
    }
    return changed;
  }

  async alarm(): Promise<void> {
    await this.ready;
    if (this.advance(Date.now())) await this.persist();
    await this.armAlarm();
  }

  private drawView(kind: DrawKind, did: string | null) {
    const d = this.draws[kind];
    return {
      id: d.id,
      kind,
      price: d.price,
      startedAt: d.startedAt,
      resolvesAt: d.resolvesAt,
      ticketTotal: d.ticketTotal,
      pot: d.ticketTotal * d.price,
      participants: Object.keys(d.tickets).length,
      yourTickets: did ? d.tickets[did] || 0 : 0,
    };
  }

  private buildState(did: string | null) {
    const leaderboardEntries = Array.from(this.balances.entries()).sort((a, b) => b[1] - a[1]);
    const leaderboard = leaderboardEntries.slice(0, LEADERBOARD_SIZE).map(([entryDid, balance], i) => ({
      did: entryDid,
      handle: this.handleFor(entryDid) || entryDid.slice(0, 12),
      balance,
      rank: i + 1,
    }));
    let yourRank: number | null = null;
    if (did) {
      const idx = leaderboardEntries.findIndex(([d]) => d === did);
      if (idx >= 0) yourRank = idx + 1;
    }

    const stats = did ? this.lifetime.get(did) || freshStats() : null;

    return {
      now: Date.now(),
      loggedIn: !!did,
      balance: did ? this.getBalance(did) : null,
      yourRank,
      yourStats: stats
        ? { spent: stats.spent, won: stats.won, net: stats.won - stats.spent, ticketsBought: stats.ticketsBought, wins: stats.wins }
        : null,
      canClaimStipend: did
        ? this.getBalance(did) < STIPEND_THRESHOLD && Date.now() - (this.lastStipend.get(did) || 0) > STIPEND_COOLDOWN_MS
        : false,
      draws: {
        hourly: this.drawView("hourly", did),
        daily: this.drawView("daily", did),
        weekly: this.drawView("weekly", did),
      },
      history: this.history.slice(0, 20),
      leaderboard,
      monthlyChampions: this.monthlyChampions.slice(0, 6),
      nextMonthlyReset: nextMonthBoundary(Date.now()),
    };
  }

  async fetch(request: Request): Promise<Response> {
    await this.ready;
    const url = new URL(request.url);
    const now = Date.now();
    if (this.advance(now)) {
      await this.persist();
      await this.armAlarm();
    }

    if (url.pathname === "/api/state" && request.method === "GET") {
      const did = url.searchParams.get("did");
      return json(this.buildState(isDid(did) ? did : null));
    }

    if (url.pathname === "/api/buy" && request.method === "POST") {
      const body = await safeJson(request);
      const did = body?.did;
      if (!isDid(did)) return json({ error: "sign in first" }, 400);
      const kind = body?.kind as DrawKind;
      if (!KINDS.includes(kind)) return json({ error: "pick a valid draw" }, 400);
      const count = Math.floor(Number(body?.count));
      if (!Number.isFinite(count) || count < 1 || count > MAX_TICKETS_PER_BUY) {
        return json({ error: `tickets: 1 to ${MAX_TICKETS_PER_BUY} at a time` }, 400);
      }

      const handle = cleanStr(body?.handle, 80);
      const displayName = cleanStr(body?.displayName, 100);
      const avatar = cleanStr(body?.avatar, 500);
      if (!handle) return json({ error: "missing handle" }, 400);
      this.touchProfile(did, handle, displayName, avatar);

      const draw = this.draws[kind];
      const cost = draw.price * count;
      const balance = this.getBalance(did);
      if (cost > balance) return json({ error: "not enough coins for that many tickets" }, 400);

      this.balances.set(did, balance - cost);
      draw.tickets[did] = (draw.tickets[did] || 0) + count;
      draw.ticketTotal += count;

      const stats = this.getStats(did);
      stats.spent += cost;
      stats.ticketsBought += count;

      await this.persist();
      return json(this.buildState(did));
    }

    if (url.pathname === "/api/stipend" && request.method === "POST") {
      const body = await safeJson(request);
      const did = body?.did;
      if (!isDid(did)) return json({ error: "sign in first" }, 400);
      const handle = cleanStr(body?.handle, 80);
      if (handle) this.touchProfile(did, handle, cleanStr(body?.displayName, 100), cleanStr(body?.avatar, 500));

      const balance = this.getBalance(did);
      if (balance >= STIPEND_THRESHOLD) return json({ error: "you're not broke yet" }, 400);
      const last = this.lastStipend.get(did) || 0;
      if (Date.now() - last < STIPEND_COOLDOWN_MS) return json({ error: "already topped up recently" }, 429);

      this.lastStipend.set(did, Date.now());
      this.balances.set(did, balance + STIPEND_AMOUNT);
      await this.persist();
      return json(this.buildState(did));
    }

    return json({ error: "not found" }, 404);
  }
}
