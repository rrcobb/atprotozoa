// chickenjack Worker — chickenjack.bisks.net
//
// @brennan.computer asked for "a massively multiplayer blackjack game where
// the dealer is on a fixed world-time clock and anyone can jump in and out
// of the site, is given cards, can bet and play and stack up their winnings
// for as long as they like. maintain a top chicken leaderboard if feasible."
//
// The dealer's clock is real wall-clock time, not a countdown any player
// starts: a fresh hand begins every ROUND_MS, anchored to the Unix epoch
// (currentId = floor(now / ROUND_MS)), so every visitor anywhere sees the
// exact same phase at the exact same instant — copied from
// sites/simcluster-lottery's nextBoundary trick, simplified to one clock.
// With ROUND_MS = 60_000 that lands a new hand exactly on the minute, UTC,
// forever: "the dealer deals on the minute" is literally true, not a slogan.
//
// One hand per round: everyone who bets before the 20s betting window closes
// gets two cards from one shared shoe and plays their own hand against the
// same dealer hand — a real casino-table shape (many players, one dealer),
// not players-vs-players. Hit/stand/double for 20s, then the dealer reveals
// and draws to 17, every hand settles, and results sit on screen for the
// last 20s before the next hand deals. Drop by any time; nothing requires
// showing up at a specific second except placing a bet before betting closes.
//
// One KV snapshot holds the shared shoe, every player's hand for the live
// round, play-money balances, and lifetime net winnings. State is deliberately
// eventual and non-authoritative: this is a toy table, not a financial ledger.
// No login: the page mints an opaque id into localStorage and sends it as
// X-Client-Id, so clearing storage gets a fresh play-money seat.

interface KVNamespace {
  get<T = unknown>(key: string, type: "json"): Promise<T | null>;
  put(key: string, value: string): Promise<void>;
}

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  TABLE_STATE: KVNamespace;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      return new TableStore(env.TABLE_STATE).fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};

// ---- config ----------------------------------------------------------
const ROUND_MS = 60_000; // one hand per minute, anchored to the epoch
const BET_MS = 20_000; // 0-20s: betting window
const RESOLVE_AT = 40_000; // 20-40s: hit/stand/double; dealer resolves at 40s
// 40-60s: results on screen, next hand deals at the top of the minute

const DECKS = 6;
const START_BALANCE = 500;
const MIN_BET = 10;
const MAX_BET = 500;
const STIPEND_AMOUNT = 150;
const STIPEND_THRESHOLD = MIN_BET;
const STIPEND_COOLDOWN_MS = 20 * 60 * 1000;
const HISTORY_MAX = 20;
const MAX_SEATS_SHOWN = 200;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// ---- cards -------------------------------------------------------------
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const SUITS = ["♠", "♥", "♦", "♣"];

interface Card {
  r: string;
  s: string;
}

function hash32(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildShoe(seed: number): Card[] {
  const shoe: Card[] = [];
  for (let d = 0; d < DECKS; d++) {
    for (const s of SUITS) for (const r of RANKS) shoe.push({ r, s });
  }
  const rand = mulberry32(seed);
  for (let i = shoe.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [shoe[i], shoe[j]] = [shoe[j], shoe[i]];
  }
  return shoe;
}

function cardValue(r: string): number {
  if (r === "A") return 11;
  if (r === "K" || r === "Q" || r === "J") return 10;
  return parseInt(r, 10);
}

function handTotal(cards: Card[]): number {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    total += cardValue(c.r);
    if (c.r === "A") aces++;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return total;
}

function isBlackjack(cards: Card[]): boolean {
  return cards.length === 2 && handTotal(cards) === 21;
}

// ---- game state ----------------------------------------------------------
type HandStatus = "playing" | "stand" | "bust";
type Outcome = "blackjack" | "win" | "push" | "lose" | "bust";

interface PlayerHand {
  clientId: string;
  nickname: string;
  cards: Card[];
  bet: number;
  doubled: boolean;
  status: HandStatus;
  joinedAt: number;
  outcome?: Outcome;
  payout?: number;
}

interface DealerFinal {
  cards: Card[];
  total: number;
  blackjack: boolean;
  bust: boolean;
}

interface RoundState {
  id: number;
  startedAt: number;
  shoe: Card[];
  drawIndex: number;
  dealerCards: Card[];
  players: Record<string, PlayerHand>;
  order: string[];
  resolved: boolean;
  dealerFinal: DealerFinal | null;
}

interface HistoryEntry {
  id: number;
  startedAt: number;
  dealerTotal: number;
  dealerBlackjack: boolean;
  dealerBust: boolean;
  playerCount: number;
  totalWagered: number;
  topWinner: { nickname: string; net: number } | null;
}

interface LifetimeStats {
  handsPlayed: number;
  handsWon: number;
  netProfit: number;
  biggestWin: number;
}

function freshStats(): LifetimeStats {
  return { handsPlayed: 0, handsWon: 0, netProfit: 0, biggestWin: 0 };
}

function freshRound(id: number, startedAt: number): RoundState {
  const seed = hash32(`chickenjack:${id}`);
  const shoe = buildShoe(seed);
  return {
    id,
    startedAt,
    shoe,
    drawIndex: 2,
    dealerCards: [shoe[0], shoe[1]],
    players: {},
    order: [],
    resolved: false,
    dealerFinal: null,
  };
}

function drawCard(round: RoundState): Card {
  if (round.drawIndex >= round.shoe.length) {
    // Extremely unlikely (312-card shoe, 20s betting window) but never wedge
    // a live hand on an empty shoe — top up with a freshly seeded batch.
    round.shoe = round.shoe.concat(buildShoe(hash32(`chickenjack:${round.id}:extra:${round.shoe.length}`)));
  }
  return round.shoe[round.drawIndex++];
}

function defaultNickname(clientId: string): string {
  return "chick-" + clientId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 5).toLowerCase();
}

function sanitizeNickname(raw: unknown, clientId: string): string {
  const s = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ").slice(0, 20) : "";
  return s || defaultNickname(clientId);
}

export class TableStore {
  private state: KVNamespace;
  private ready: Promise<void>;
  private balances: Map<string, number> = new Map();
  private nicknames: Map<string, string> = new Map();
  private lifetime: Map<string, LifetimeStats> = new Map();
  private lastStipend: Map<string, number> = new Map();
  private history: HistoryEntry[] = [];
  private round: RoundState = freshRound(0, 0);

  constructor(state: KVNamespace) {
    this.state = state;
    const kv = state;
    this.ready = (async () => {
      const snapshot = await kv.get<{
        balances?: [string, number][];
        nicknames?: [string, string][];
        lifetime?: [string, LifetimeStats][];
        lastStipend?: [string, number][];
        history?: HistoryEntry[];
        round?: RoundState;
      }>("state", "json");
      if (snapshot?.balances) this.balances = new Map(snapshot.balances);
      if (snapshot?.nicknames) this.nicknames = new Map(snapshot.nicknames);
      if (snapshot?.lifetime) this.lifetime = new Map(snapshot.lifetime);
      if (snapshot?.lastStipend) this.lastStipend = new Map(snapshot.lastStipend);
      if (snapshot?.history) this.history = snapshot.history;
      const now = Date.now();
      const currentId = Math.floor(now / ROUND_MS);
      this.round = snapshot?.round ?? freshRound(currentId, currentId * ROUND_MS);
      const changed = this.ensureCurrent(now);
      if (!snapshot || changed) await this.persist();
    })();
  }

  private async persist(): Promise<void> {
    await this.state.put("state", JSON.stringify({
      balances: Array.from(this.balances.entries()),
      nicknames: Array.from(this.nicknames.entries()),
      lifetime: Array.from(this.lifetime.entries()),
      lastStipend: Array.from(this.lastStipend.entries()),
      history: this.history,
      round: this.round,
    }));
  }

  private getBalance(clientId: string): number {
    if (!this.balances.has(clientId)) this.balances.set(clientId, START_BALANCE);
    return this.balances.get(clientId)!;
  }

  private getStats(clientId: string): LifetimeStats {
    if (!this.lifetime.has(clientId)) this.lifetime.set(clientId, freshStats());
    return this.lifetime.get(clientId)!;
  }

  private getNickname(clientId: string): string {
    return this.nicknames.get(clientId) || defaultNickname(clientId);
  }

  // Idempotent: safe to call on every request. Resolves the dealer's hand
  // once the play window closes, and rolls over to a brand-new round once
  // the minute turns, regardless of whether anyone was watching either
  // moment happen.
  private ensureCurrent(now: number): boolean {
    const currentId = Math.floor(now / ROUND_MS);
    if (this.round.id !== currentId) {
      if (!this.round.resolved) this.resolveDealer();
      this.round = freshRound(currentId, currentId * ROUND_MS);
      return true;
    }
    const elapsed = now - this.round.startedAt;
    if (elapsed >= RESOLVE_AT && !this.round.resolved) {
      this.resolveDealer();
      return true;
    }
    return false;
  }

  private settleHand(hand: PlayerHand, dealerTotal: number, dealerBJ: boolean, dealerBust: boolean): { outcome: Outcome; payout: number } {
    if (hand.status === "bust") return { outcome: "bust", payout: 0 };
    const total = handTotal(hand.cards);
    const playerBJ = isBlackjack(hand.cards);
    if (playerBJ && dealerBJ) return { outcome: "push", payout: hand.bet };
    if (playerBJ) return { outcome: "blackjack", payout: Math.floor(hand.bet * 2.5) };
    if (dealerBJ) return { outcome: "lose", payout: 0 };
    if (dealerBust) return { outcome: "win", payout: hand.bet * 2 };
    if (total > dealerTotal) return { outcome: "win", payout: hand.bet * 2 };
    if (total === dealerTotal) return { outcome: "push", payout: hand.bet };
    return { outcome: "lose", payout: 0 };
  }

  private resolveDealer(): void {
    const round = this.round;
    for (const cid of round.order) {
      const hand = round.players[cid];
      if (hand.status === "playing") hand.status = "stand";
    }
    while (handTotal(round.dealerCards) < 17) {
      round.dealerCards.push(drawCard(round));
    }
    const dealerTotal = handTotal(round.dealerCards);
    const dealerBJ = isBlackjack(round.dealerCards);
    const dealerBust = dealerTotal > 21;

    let totalWagered = 0;
    let topWinner: { nickname: string; net: number } | null = null;
    for (const cid of round.order) {
      const hand = round.players[cid];
      totalWagered += hand.bet;
      const { outcome, payout } = this.settleHand(hand, dealerTotal, dealerBJ, dealerBust);
      hand.outcome = outcome;
      hand.payout = payout;
      const net = payout - hand.bet;
      this.balances.set(cid, this.getBalance(cid) + payout);
      const stats = this.getStats(cid);
      stats.handsPlayed += 1;
      stats.netProfit += net;
      if (net > 0) {
        stats.handsWon += 1;
        if (net > stats.biggestWin) stats.biggestWin = net;
      }
      if (!topWinner || net > topWinner.net) topWinner = { nickname: hand.nickname, net };
    }

    round.dealerFinal = { cards: round.dealerCards, total: dealerTotal, blackjack: dealerBJ, bust: dealerBust };
    round.resolved = true;

    this.history.unshift({
      id: round.id,
      startedAt: round.startedAt,
      dealerTotal,
      dealerBlackjack: dealerBJ,
      dealerBust,
      playerCount: round.order.length,
      totalWagered,
      topWinner: topWinner && topWinner.net > 0 ? topWinner : null,
    });
    if (this.history.length > HISTORY_MAX) this.history.length = HISTORY_MAX;
  }

  private publicHand(hand: PlayerHand, clientId: string) {
    return {
      nickname: hand.nickname,
      bet: hand.bet,
      doubled: hand.doubled,
      cards: hand.cards,
      total: handTotal(hand.cards),
      status: hand.status,
      outcome: hand.outcome ?? null,
      payout: hand.payout ?? null,
      isYou: hand.clientId === clientId,
    };
  }

  private tableView(clientId: string) {
    const now = Date.now();
    this.ensureCurrent(now);
    const round = this.round;
    const elapsed = now - round.startedAt;
    const phase: "betting" | "playing" | "results" = elapsed < BET_MS ? "betting" : elapsed < RESOLVE_AT ? "playing" : "results";

    const you = round.players[clientId];
    const balance = this.getBalance(clientId);
    const stats = this.lifetime.get(clientId) || freshStats();

    const players = round.order.slice(0, MAX_SEATS_SHOWN).map((cid) => this.publicHand(round.players[cid], clientId));
    const overflow = Math.max(0, round.order.length - MAX_SEATS_SHOWN);

    const dealerRevealed = round.resolved;
    const dealer = {
      upCard: round.dealerCards[0] ?? null,
      cards: dealerRevealed ? round.dealerCards : round.dealerCards.slice(0, 1),
      total: dealerRevealed ? round.dealerFinal!.total : null,
      blackjack: dealerRevealed ? round.dealerFinal!.blackjack : false,
      bust: dealerRevealed ? round.dealerFinal!.bust : false,
      hidden: !dealerRevealed,
    };

    const leaderboard = Array.from(this.lifetime.entries())
      .filter(([, s]) => s.netProfit > 0)
      .sort((a, b) => b[1].netProfit - a[1].netProfit)
      .slice(0, 10)
      .map(([cid, s]) => ({
        nickname: this.getNickname(cid),
        netProfit: s.netProfit,
        handsPlayed: s.handsPlayed,
        handsWon: s.handsWon,
        isYou: cid === clientId,
      }));

    return {
      round: {
        id: round.id,
        startedAt: round.startedAt,
        phase,
        betEndsAt: round.startedAt + BET_MS,
        resolveAt: round.startedAt + RESOLVE_AT,
        roundEndsAt: round.startedAt + ROUND_MS,
        now,
      },
      dealer,
      players,
      overflow,
      you: {
        balance,
        nickname: this.getNickname(clientId),
        hasHand: Boolean(you),
        hand: you ? this.publicHand(you, clientId) : null,
        canJoin: phase === "betting" && !you && balance >= MIN_BET,
        canAct: phase === "playing" && Boolean(you) && you.status === "playing",
        canDouble: phase === "playing" && Boolean(you) && you.status === "playing" && you.cards.length === 2 && balance >= you.bet,
        canClaimStipend: balance < STIPEND_THRESHOLD && now - (this.lastStipend.get(clientId) || 0) > STIPEND_COOLDOWN_MS,
        stats: {
          handsPlayed: stats.handsPlayed,
          handsWon: stats.handsWon,
          netProfit: stats.netProfit,
          biggestWin: stats.biggestWin,
        },
      },
      leaderboard,
      topChicken: leaderboard[0] || null,
      history: this.history.slice(0, 10),
      minBet: MIN_BET,
      maxBet: MAX_BET,
    };
  }

  async fetch(request: Request): Promise<Response> {
    await this.ready;
    const url = new URL(request.url);
    const clientId = (request.headers.get("x-client-id") || "").trim().slice(0, 80);
    if (!clientId) return json({ error: "missing client id" }, 400);

    if (url.pathname === "/api/state" && request.method === "GET") {
      const changed = this.ensureCurrent(Date.now());
      const view = this.tableView(clientId);
      if (changed) await this.persist();
      return json(view);
    }

    if (url.pathname === "/api/nickname" && request.method === "POST") {
      let body: any = {};
      try {
        body = await request.json();
      } catch {
        return json({ error: "bad json" }, 400);
      }
      this.ensureCurrent(Date.now());
      this.nicknames.set(clientId, sanitizeNickname(body.nickname, clientId));
      const round = this.round;
      if (round.players[clientId]) round.players[clientId].nickname = this.getNickname(clientId);
      await this.persist();
      return json(this.tableView(clientId));
    }

    if (url.pathname === "/api/bet" && request.method === "POST") {
      let body: any = {};
      try {
        body = await request.json();
      } catch {
        return json({ error: "bad json" }, 400);
      }
      this.ensureCurrent(Date.now());
      const round = this.round;
      const elapsed = Date.now() - round.startedAt;
      if (elapsed >= BET_MS) return json({ error: "betting's closed for this hand — next one deals soon" }, 400);
      if (round.players[clientId]) return json({ error: "you're already dealt in this hand" }, 400);

      const amount = Math.floor(Number(body.amount));
      if (!Number.isFinite(amount) || amount < MIN_BET) return json({ error: `bets start at ${MIN_BET} chips` }, 400);
      if (amount > MAX_BET) return json({ error: `table max is ${MAX_BET} chips` }, 400);
      const balance = this.getBalance(clientId);
      if (amount > balance) return json({ error: "not enough chips" }, 400);
      if (typeof body.nickname === "string" && body.nickname.trim()) {
        this.nicknames.set(clientId, sanitizeNickname(body.nickname, clientId));
      }

      this.balances.set(clientId, balance - amount);
      const cards = [drawCard(round), drawCard(round)];
      const hand: PlayerHand = {
        clientId,
        nickname: this.getNickname(clientId),
        cards,
        bet: amount,
        doubled: false,
        // A natural blackjack settles automatically at payout — no hit/stand
        // to make, so don't leave it actionable during the play window.
        status: isBlackjack(cards) ? "stand" : "playing",
        joinedAt: Date.now(),
      };
      round.players[clientId] = hand;
      round.order.push(clientId);

      await this.persist();
      return json(this.tableView(clientId));
    }

    if (url.pathname === "/api/hit" || url.pathname === "/api/stand" || url.pathname === "/api/double") {
      if (request.method !== "POST") return json({ error: "not found" }, 404);
      this.ensureCurrent(Date.now());
      const round = this.round;
      const elapsed = Date.now() - round.startedAt;
      const hand = round.players[clientId];
      if (!hand) return json({ error: "you're not dealt into this hand" }, 400);
      if (elapsed < BET_MS || elapsed >= RESOLVE_AT) return json({ error: "not your window to act" }, 400);
      if (hand.status !== "playing") return json({ error: "your hand's already settled" }, 400);

      if (url.pathname === "/api/stand") {
        hand.status = "stand";
      } else if (url.pathname === "/api/hit") {
        hand.cards.push(drawCard(round));
        const total = handTotal(hand.cards);
        if (total > 21) hand.status = "bust";
        else if (total === 21) hand.status = "stand";
      } else {
        if (hand.cards.length !== 2) return json({ error: "can only double on your first move" }, 400);
        const balance = this.getBalance(clientId);
        if (balance < hand.bet) return json({ error: "not enough chips to double" }, 400);
        this.balances.set(clientId, balance - hand.bet);
        hand.bet *= 2;
        hand.doubled = true;
        hand.cards.push(drawCard(round));
        const total = handTotal(hand.cards);
        hand.status = total > 21 ? "bust" : "stand";
      }

      await this.persist();
      return json(this.tableView(clientId));
    }

    if (url.pathname === "/api/stipend" && request.method === "POST") {
      const balance = this.getBalance(clientId);
      const last = this.lastStipend.get(clientId) || 0;
      if (balance >= STIPEND_THRESHOLD) return json({ error: "you're not broke yet" }, 400);
      if (Date.now() - last < STIPEND_COOLDOWN_MS) return json({ error: "already spotted you recently" }, 429);
      this.lastStipend.set(clientId, Date.now());
      this.balances.set(clientId, balance + STIPEND_AMOUNT);
      await this.persist();
      return json(this.tableView(clientId));
    }

    return json({ error: "not found" }, 404);
  }
}
