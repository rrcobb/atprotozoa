// derivatives Worker — derivatives.bisks.net (also bisks.net/derivatives)
//
// dave.9000ish.uk, in the thread where guestbet.bisks.net got built as a
// live betting market on simcluster-guests' guest vote: "might as well...
// create a site where users can bet on whether a given bisks site will have
// a secondary market site built to trade on, and track the odds in real
// time. also allow users to keep track of their money."
//
// guestbet already *is* exactly that kind of secondary market, spun off
// simcluster-guests. So the question this site asks, once per non-hidden
// bisks.net site, is: "will this one get its own guestbet?" Every site is a
// standing yes/no pari-mutuel market, seeded from the bundled candidate
// manifest (src/candidates.json, generated from every sites/*/site.json at
// build time). Odds move in real time as people bet play money.
//
// There's no artificial clock, because unlike a podcast vote this event is
// real, rare, and has no natural deadline — so a market only resolves the
// moment it's actually true. Real, meaning: an alarm polls the public repo
// (api.github.com/repos/rrcobb/atprotozoa/contents/sites) every
// SCAN_INTERVAL_MS for newly-added site directories, and when one shows up,
// checks its site.json blurb for a mention of an existing candidate's name
// — the same signal a human skimming the gallery would use (guestbet's own
// blurb literally contains the string "simcluster-guests"). A hit pays out
// yes-bettors pari-mutuel and retires that market to the resolved list; the
// new site also joins the board as a fresh market of its own, so the board
// keeps growing as the zoo does. Most markets will probably just sit there
// accumulating bets forever — that's the joke, and it's an honest one.
//
// One Durable Object ("global") holds it all: markets, bets, per-client
// play-money balances. Same single-writer shape as sites/guestbet's Market
// DO this was copied from, minus the repeating-round clock (nothing here
// needs to force-resolve on a timer) — the alarm is repurposed to drive the
// GitHub scan on a slow interval instead of closing a betting round.
//
// No login: the page mints an opaque id into localStorage and sends it as
// X-Client-Id, same anonymous-identity shape as guestbet.

import CANDIDATES from "./candidates.json";

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

// Mounted at both derivatives.bisks.net (root) and bisks.net/derivatives
// (path route kept for parity with sibling sites) — strip the prefix only
// when it's actually there. See notes/40-new-site-playbook.md: stripping
// unconditionally breaks the subdomain, where the prefix never shows up.
const PREFIX = "/derivatives";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith(PREFIX + "/") || url.pathname === PREFIX) {
      url.pathname = url.pathname.slice(PREFIX.length) || "/";
    }
    if (url.pathname.startsWith("/api/")) {
      const id = env.MARKET.idFromName("global");
      const stub = env.MARKET.get(id);
      return stub.fetch(new Request(url, request));
    }
    return env.ASSETS.fetch(new Request(url, request));
  },
};

// ---- config --------------------------------------------------------------
const SELF_SITE = "derivatives";
const GITHUB_REPO = "rrcobb/atprotozoa";
const GITHUB_CONTENTS_URL = `https://api.github.com/repos/${GITHUB_REPO}/contents/sites`;
const RAW_BASE = `https://raw.githubusercontent.com/${GITHUB_REPO}/main/sites`;
const SCAN_INTERVAL_MS = 20 * 60 * 1000; // stay well under GitHub's 60 req/hr unauthenticated cap
const START_BALANCE = 1000;
const MIN_BET = 10;
const BET_COOLDOWN_MS = 1500;
const STIPEND_AMOUNT = 100;
const STIPEND_THRESHOLD = 50;
const STIPEND_COOLDOWN_MS = 30 * 60 * 1000;
// Flat virtual prior so a brand new market shows sane odds instead of 0/0 —
// no live signal to seed it proportionally to (unlike guestbet's upvotes),
// so every market starts at the same ~24% implied "yes", then moves for
// real as people bet. Seed coins never pay out.
const SEED_YES = 12;
const SEED_NO = 38;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

interface Candidate {
  site: string;
  title: string;
  blurb: string;
  url: string;
}

interface ResolvedInfo {
  derivative: string;
  derivativeTitle: string;
  derivativeUrl: string;
  evidence: string;
  resolvedAt: number;
  totalRealPool: number;
  paidOut: number;
  winners: number;
}

interface MarketEntry {
  title: string;
  blurb: string;
  url: string;
  poolYes: number;
  poolNo: number;
  seedYes: number;
  seedNo: number;
  addedAt: number;
  bets: Record<string, { yes: number; no: number }>;
  resolved: ResolvedInfo | null;
}

function freshMarket(title: string, blurb: string, url: string, addedAt: number): MarketEntry {
  return {
    title,
    blurb,
    url,
    poolYes: 0,
    poolNo: 0,
    seedYes: SEED_YES,
    seedNo: SEED_NO,
    addedAt,
    bets: {},
    resolved: null,
  };
}

interface RemoteSiteJson {
  name?: string;
  title?: string;
  blurb?: string;
  url?: string;
  hidden?: boolean;
}

export class Market {
  private state: DurableObjectState;
  private ready: Promise<void>;
  private balances: Map<string, number> = new Map();
  private markets: Map<string, MarketEntry> = new Map();
  private knownSiteDirs: Set<string> = new Set();
  private lastStipend: Map<string, number> = new Map();
  private lastBetAt: Map<string, number> = new Map();
  private lastScanAt = 0;

  constructor(state: DurableObjectState) {
    this.state = state;
    this.ready = this.state.blockConcurrencyWhile(async () => {
      const balances = await this.state.storage.get<[string, number][]>("balances");
      if (balances) this.balances = new Map(balances);

      const marketsArr = await this.state.storage.get<[string, MarketEntry][]>("markets");
      if (marketsArr) {
        this.markets = new Map(marketsArr);
      } else {
        const now = Date.now();
        for (const c of CANDIDATES as Candidate[]) {
          this.markets.set(c.site, freshMarket(c.title, c.blurb, c.url, now));
        }
        // Seed the one real historical example so the board isn't empty at
        // launch: guestbet already IS simcluster-guests' secondary market.
        const seed = this.markets.get("simcluster-guests");
        if (seed) {
          seed.resolved = {
            derivative: "guestbet",
            derivativeTitle: "guestbet",
            derivativeUrl: "https://guestbet.bisks.net/",
            evidence:
              "a live betting market on simcluster-guests.bisks.net's guest-request board for the Simcluster podcast",
            resolvedAt: now,
            totalRealPool: 0,
            paidOut: 0,
            winners: 0,
          };
        }
        this.knownSiteDirs = new Set([...(CANDIDATES as Candidate[]).map((c) => c.site), SELF_SITE, "guestbet"]);
      }

      const knownDirs = await this.state.storage.get<string[]>("knownSiteDirs");
      if (knownDirs) this.knownSiteDirs = new Set(knownDirs);

      const lastStipend = await this.state.storage.get<[string, number][]>("lastStipend");
      if (lastStipend) this.lastStipend = new Map(lastStipend);

      this.lastScanAt = (await this.state.storage.get<number>("lastScanAt")) || 0;
      await this.persist();
      // If an alarm was already pending (missed cold-start, dev reload)
      // this just reschedules it a little sooner — harmless.
      const nextAlarm = Math.max(Date.now() + 5_000, this.lastScanAt + SCAN_INTERVAL_MS);
      await this.state.storage.setAlarm(nextAlarm);
    });
  }

  private async persist(): Promise<void> {
    await this.state.storage.put({
      balances: Array.from(this.balances.entries()),
      markets: Array.from(this.markets.entries()),
      knownSiteDirs: Array.from(this.knownSiteDirs),
      lastStipend: Array.from(this.lastStipend.entries()),
      lastScanAt: this.lastScanAt,
    });
  }

  private getBalance(clientId: string): number {
    if (!this.balances.has(clientId)) this.balances.set(clientId, START_BALANCE);
    return this.balances.get(clientId)!;
  }

  private async fetchRemoteSiteJson(dir: string): Promise<RemoteSiteJson | null> {
    try {
      const r = await fetch(`${RAW_BASE}/${encodeURIComponent(dir)}/site.json`, {
        headers: { "User-Agent": "atprotozoa-derivatives-bot" },
      });
      if (!r.ok) return null;
      return await r.json<RemoteSiteJson>();
    } catch {
      return null;
    }
  }

  private resolveMarket(site: string, info: Omit<ResolvedInfo, "resolvedAt" | "totalRealPool" | "paidOut" | "winners">): void {
    const market = this.markets.get(site);
    if (!market || market.resolved) return;

    const totalReal = market.poolYes + market.poolNo;
    const yesReal = market.poolYes;
    let paidOut = 0;
    let winners = 0;

    if (yesReal > 0) {
      for (const [clientId, stake] of Object.entries(market.bets)) {
        if (stake.yes > 0) {
          const payout = Math.round((stake.yes / yesReal) * totalReal);
          this.balances.set(clientId, this.getBalance(clientId) + payout);
          paidOut += payout;
          winners++;
        }
      }
    } else if (totalReal > 0) {
      // Everyone bet "no" and it happened anyway — no counterparty pool to
      // win from, so refund every real stake rather than vaporize it.
      for (const [clientId, stake] of Object.entries(market.bets)) {
        const total = stake.yes + stake.no;
        if (total > 0) this.balances.set(clientId, this.getBalance(clientId) + total);
      }
    }

    market.resolved = { ...info, resolvedAt: Date.now(), totalRealPool: totalReal, paidOut, winners };
  }

  // Polls the public repo for newly-added site directories and checks each
  // one's blurb for a mention of an existing candidate — the real signal
  // that a secondary/derivative market got built for it. Runs off the alarm
  // only (not on every request) to stay well clear of GitHub's unauth rate
  // limit even under load.
  private async scanForNewSites(): Promise<void> {
    let items: Array<{ name: string; type: string }>;
    try {
      const res = await fetch(GITHUB_CONTENTS_URL, {
        headers: { "User-Agent": "atprotozoa-derivatives-bot", Accept: "application/vnd.github+json" },
      });
      if (!res.ok) return; // rate-limited or hiccup — try again next alarm
      items = await res.json();
    } catch {
      return;
    }

    const dirs = items.filter((i) => i.type === "dir").map((i) => i.name);

    if (this.knownSiteDirs.size === 0) {
      // First-ever scan: just establish the baseline, nothing is "new" yet.
      this.knownSiteDirs = new Set(dirs);
      return;
    }

    const fresh = dirs.filter((d) => !this.knownSiteDirs.has(d));
    for (const dir of fresh) {
      this.knownSiteDirs.add(dir);
      if (dir === SELF_SITE) continue;

      const site = await this.fetchRemoteSiteJson(dir);
      if (!site || site.hidden) continue;

      const text = `${site.blurb || ""} ${site.name || dir} ${site.title || ""}`.toLowerCase();
      for (const [candidate, market] of this.markets) {
        if (market.resolved || candidate === dir) continue;
        if (text.includes(candidate.toLowerCase())) {
          this.resolveMarket(candidate, {
            derivative: dir,
            derivativeTitle: site.title || dir,
            derivativeUrl: site.url || `https://${dir}.bisks.net/`,
            evidence: site.blurb || "",
          });
        }
      }

      if (!this.markets.has(dir)) {
        this.markets.set(
          dir,
          freshMarket(site.title || dir, site.blurb || "", site.url || `https://${dir}.bisks.net/`, Date.now()),
        );
      }
    }
  }

  async alarm(): Promise<void> {
    await this.ready;
    await this.scanForNewSites();
    this.lastScanAt = Date.now();
    await this.persist();
    await this.state.storage.setAlarm(Date.now() + SCAN_INTERVAL_MS);
  }

  private marketView(clientId: string) {
    const balance = this.getBalance(clientId);
    const open: any[] = [];
    const resolved: any[] = [];

    for (const [site, m] of this.markets) {
      const yourBet = m.bets[clientId] || { yes: 0, no: 0 };
      const dispYes = m.poolYes + m.seedYes;
      const dispNo = m.poolNo + m.seedNo;
      const totalDisp = dispYes + dispNo || 1;
      const entry = {
        site,
        title: m.title,
        blurb: m.blurb,
        url: m.url,
        poolYes: m.poolYes,
        poolNo: m.poolNo,
        totalRealPool: m.poolYes + m.poolNo,
        impliedYesPct: Math.round((dispYes / totalDisp) * 1000) / 10,
        yourYes: yourBet.yes,
        yourNo: yourBet.no,
        addedAt: m.addedAt,
        resolved: m.resolved,
      };
      if (m.resolved) resolved.push(entry);
      else open.push(entry);
    }

    open.sort((a, b) => b.totalRealPool - a.totalRealPool || b.addedAt - a.addedAt || a.site.localeCompare(b.site));
    resolved.sort((a, b) => (b.resolved?.resolvedAt || 0) - (a.resolved?.resolvedAt || 0));

    return {
      balance,
      markets: open,
      resolved,
      totalMarkets: this.markets.size,
      lastScanAt: this.lastScanAt,
      nextScanInMs: Math.max(0, this.lastScanAt + SCAN_INTERVAL_MS - Date.now()),
      canClaimStipend:
        balance < STIPEND_THRESHOLD && Date.now() - (this.lastStipend.get(clientId) || 0) > STIPEND_COOLDOWN_MS,
      leaderboard: Array.from(this.balances.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([id, bal]) => ({ id: id.slice(0, 8), balance: bal })),
    };
  }

  async fetch(request: Request): Promise<Response> {
    await this.ready;
    const url = new URL(request.url);
    const clientId = (request.headers.get("x-client-id") || "").trim().slice(0, 80);

    if (url.pathname === "/api/market" && request.method === "GET") {
      if (!clientId) return json({ error: "missing client id" }, 400);
      return json(this.marketView(clientId));
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

      const site = typeof body.site === "string" ? body.site : "";
      const side = body.side === "yes" || body.side === "no" ? body.side : "";
      const amount = Math.floor(Number(body.amount));

      const market = this.markets.get(site);
      if (!market) return json({ error: "unknown market" }, 400);
      if (!side) return json({ error: "pick yes or no" }, 400);
      if (!Number.isFinite(amount) || amount < MIN_BET) {
        return json({ error: `bets start at ${MIN_BET} coins` }, 400);
      }
      if (market.resolved) return json({ error: "this market already resolved" }, 400);

      const balance = this.getBalance(clientId);
      if (amount > balance) return json({ error: "not enough coins" }, 400);

      this.lastBetAt.set(clientId, Date.now());
      this.balances.set(clientId, balance - amount);
      if (side === "yes") market.poolYes += amount;
      else market.poolNo += amount;
      if (!market.bets[clientId]) market.bets[clientId] = { yes: 0, no: 0 };
      market.bets[clientId][side] += amount;

      await this.persist();
      return json(this.marketView(clientId));
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
      return json(this.marketView(clientId));
    }

    return json({ error: "not found" }, 404);
  }
}
