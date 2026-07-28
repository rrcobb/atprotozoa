// eastmoot Worker — bisks.net/eastmoot
//
// @shibbi.me tagged @buildthis.bisks.net in a reply to @words.bsky.social's
// westmoot ask: "do this but for east coast, and make it 10x better than the
// west coast one." Same premise as sites/westmoot — a self-narrating meetup
// planner for the simcluster; no organizer, no login, everyone votes and the
// site declares the plan once it's sure. The "10x better" is the decision
// engine: westmoot picks a plurality leader once a quorum of single-choice
// votes forms. This site runs real instant-runoff ranked-choice voting on
// BOTH axes (city and weekend) — you rank your preferences, and when quorum
// is met the site runs the actual elimination rounds and logs them, so the
// runoff itself is visible, not just its outcome.
//
// All shared state (ballots, RSVPs, the running "thoughts" log, the eventual
// declaration) lives in ONE Durable Object instance (id "global") — the
// single-writer guarantee a shared plan actually needs. Structure copied
// from sites/westmoot (no @cloudflare/workers-types dependency — house
// style: self-contained deps — these are just the narrow slice this file
// touches, hand-declared the same way).

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
  put(key: string, value: unknown): Promise<void>;
}
interface DurableObjectState {
  storage: DurableObjectStorage;
  blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T>;
}

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  CLUSTER: DurableObjectNamespace;
}

// ── shared types ────────────────────────────────────────────────────────
interface Option {
  id: string;
  label: string;
}
interface Weekend extends Option {
  start: string; // ISO date, the Friday
}
interface Rsvp {
  handle: string;
  displayName: string;
  avatar: string;
  note: string;
  ts: number;
}
interface LogEntry {
  ts: number;
  text: string;
  big?: boolean;
}
interface RunoffRoundView {
  counts: { id: string; label: string; count: number }[];
  total: number;
  eliminated: string | null;
}
interface Declared {
  cityId: string;
  dateId: string;
  ts: number;
  cityRounds: RunoffRoundView[];
  dateRounds: RunoffRoundView[];
}
interface State {
  cities: Option[];
  weekends: Weekend[];
  cityBallots: Record<string, string[]>; // clientId -> ranked city ids, best first
  dateBallots: Record<string, string[]>; // clientId -> ranked weekend ids, best first
  rsvps: Record<string, Rsvp>; // clientId -> rsvp
  log: LogEntry[];
  declared: Declared | null;
  version: number;
}

const SEED_CITIES: Option[] = [
  { id: "nyc", label: "New York City" },
  { id: "bos", label: "Boston" },
  { id: "dc", label: "Washington, DC" },
  { id: "phl", label: "Philadelphia" },
  { id: "atl", label: "Atlanta" },
  { id: "mia", label: "Miami" },
];
const MAX_CITIES = 10;
const QUORUM = 4; // distinct ranked ballots needed on an axis before the site will run the runoff
const LOG_CAP = 100;
const COOLDOWN_MS = 1200;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmtRange(fri: Date, nowYear: number): string {
  const sun = new Date(fri);
  sun.setUTCDate(fri.getUTCDate() + 2);
  const y = fri.getUTCFullYear();
  const suffix = y !== nowYear ? ` '${String(y).slice(2)}` : "";
  if (fri.getUTCMonth() === sun.getUTCMonth()) {
    return `${MONTHS[fri.getUTCMonth()]} ${fri.getUTCDate()}–${sun.getUTCDate()}${suffix}`;
  }
  return `${MONTHS[fri.getUTCMonth()]} ${fri.getUTCDate()} – ${MONTHS[sun.getUTCMonth()]} ${sun.getUTCDate()}${suffix}`;
}

// Six upcoming weekends, starting ~2 weeks out (enough lead time to actually
// plan travel), spaced three weeks apart so the options don't crowd a month.
// Computed once, at first boot, from the real current date, then stored —
// deliberately not recomputed later so the options don't drift underfoot
// while people are mid-vote. (Same recipe as sites/westmoot.)
function buildWeekends(now: Date): Weekend[] {
  const nowYear = now.getUTCFullYear();
  let cur = new Date(now);
  cur.setUTCDate(cur.getUTCDate() + 14);
  const day = cur.getUTCDay();
  cur.setUTCDate(cur.getUTCDate() + ((5 - day + 7) % 7)); // roll forward to a Friday
  const out: Weekend[] = [];
  for (let i = 0; i < 6; i++) {
    out.push({ id: "w" + i, label: fmtRange(cur, nowYear), start: cur.toISOString().slice(0, 10) });
    cur = new Date(cur);
    cur.setUTCDate(cur.getUTCDate() + 21);
  }
  return out;
}

function slugify(label: string): string {
  return (
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24) || "spot"
  );
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

// ── instant-runoff ranked-choice voting ────────────────────────────────
// The whole point of this site vs. westmoot: not "whoever has the most
// first-choice votes," but "whoever a majority of engaged voters can live
// with," found by repeatedly eliminating the weakest option and letting its
// ballots fall through to their next preference. Small N (<=10 options,
// realistically dozens of ballots) so brute-forcing every round each call is
// cheap — no need to cache.
function firstActiveChoice(ballot: string[], active: Set<string>): string | null {
  for (const id of ballot) if (active.has(id)) return id;
  return null;
}

function runoff(ballots: string[][], allIds: string[]): { winner: string | null; rounds: { counts: Record<string, number>; total: number; eliminated: string | null }[] } {
  const active = new Set(allIds);
  const rounds: { counts: Record<string, number>; total: number; eliminated: string | null }[] = [];
  if (active.size === 0) return { winner: null, rounds };
  while (true) {
    const counts = new Map<string, number>();
    for (const id of active) counts.set(id, 0);
    let total = 0;
    for (const ballot of ballots) {
      const choice = firstActiveChoice(ballot, active);
      if (choice) {
        counts.set(choice, (counts.get(choice) ?? 0) + 1);
        total++;
      }
    }
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));

    if (active.size === 1) {
      rounds.push({ counts: Object.fromEntries(sorted), total, eliminated: null });
      return { winner: sorted[0][0], rounds };
    }
    if (total === 0) {
      rounds.push({ counts: Object.fromEntries(sorted), total, eliminated: null });
      return { winner: null, rounds };
    }
    const top = sorted[0];
    if (top[1] * 2 > total) {
      rounds.push({ counts: Object.fromEntries(sorted), total, eliminated: null });
      return { winner: top[0], rounds };
    }
    // Eliminate the weakest; ties broken lexicographically by id for determinism.
    const lowestCount = sorted[sorted.length - 1][1];
    const loser = sorted.filter(([, c]) => c === lowestCount).map(([id]) => id).sort()[0];
    rounds.push({ counts: Object.fromEntries(sorted), total, eliminated: loser });
    active.delete(loser);
  }
}

// Mounted at bisks.net/eastmoot/ — strip the mount prefix before routing, so
// the /api/* check, the DO, and ASSETS all see root-relative paths. The
// client prefixes its own /api calls with /eastmoot (see public/index.html's
// MOUNT const). See notes/40-new-site-playbook.md.
const PREFIX = "/eastmoot";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === PREFIX) {
      url.pathname = PREFIX + "/";
      return Response.redirect(url.toString(), 308);
    }
    url.pathname = url.pathname.slice(PREFIX.length) || "/";
    const stripped = new Request(url, request);
    if (url.pathname.startsWith("/api/")) {
      const id = env.CLUSTER.idFromName("global");
      const stub = env.CLUSTER.get(id);
      return stub.fetch(stripped);
    }
    return env.ASSETS.fetch(stripped);
  },
};

export class Cluster {
  private state: DurableObjectState;
  private s: State = {
    cities: SEED_CITIES,
    weekends: [],
    cityBallots: {},
    dateBallots: {},
    rsvps: {},
    log: [],
    declared: null,
    version: 0,
  };
  private lastByIp = new Map<string, number>();
  private ready: Promise<void>;

  constructor(state: DurableObjectState) {
    this.state = state;
    this.ready = this.state.blockConcurrencyWhile(async () => {
      const saved = await this.state.storage.get<State>("state");
      if (saved) {
        this.s = saved;
      } else {
        this.s.weekends = buildWeekends(new Date());
        this.log("the graph is quiet out here. i'm awake now, and I don't do plurality — rank your preferences.", true);
        await this.persist();
      }
    });
  }

  private log(text: string, big = false) {
    this.s.log.unshift({ ts: Date.now(), text, big });
    if (this.s.log.length > LOG_CAP) this.s.log.length = LOG_CAP;
  }

  private async persist() {
    this.s.version++;
    await this.state.storage.put("state", this.s);
  }

  private voterLabel(clientId: string): string {
    const r = this.s.rsvps[clientId];
    return r?.handle ? "@" + r.handle : "someone in the graph";
  }

  private labelFor(kind: "city" | "date", id: string): string {
    if (kind === "city") return this.s.cities.find((c) => c.id === id)?.label ?? "?";
    return this.s.weekends.find((w) => w.id === id)?.label ?? "?";
  }

  private startFor(id: string): string {
    return this.s.weekends.find((w) => w.id === id)?.start ?? "";
  }

  private roundsView(kind: "city" | "date", rounds: { counts: Record<string, number>; total: number; eliminated: string | null }[]): RunoffRoundView[] {
    return rounds.map((r) => ({
      total: r.total,
      eliminated: r.eliminated,
      counts: Object.entries(r.counts)
        .sort((a, b) => b[1] - a[1])
        .map(([id, count]) => ({ id, label: this.labelFor(kind, id), count })),
    }));
  }

  private narrateRunoff(kind: "city" | "date", noun: string, rounds: RunoffRoundView[], winnerId: string) {
    for (const r of rounds) {
      if (r.eliminated) {
        const lbl = this.labelFor(kind, r.eliminated);
        const c = r.counts.find((x) => x.id === r.eliminated);
        this.log(`runoff on ${noun}: ${lbl} has the fewest first-choice ballots (${c?.count ?? 0} of ${r.total}) — eliminated, its votes fall to next preference.`);
      }
    }
    const last = rounds[rounds.length - 1];
    const winCount = last.counts.find((x) => x.id === winnerId)?.count ?? 0;
    this.log(`runoff on ${noun} settles: ${this.labelFor(kind, winnerId)}, with ${winCount} of ${last.total} in the final round.`, true);
  }

  private maybeDeclare() {
    if (this.s.declared) return;
    const cityVoters = Object.keys(this.s.cityBallots).length;
    const dateVoters = Object.keys(this.s.dateBallots).length;
    if (cityVoters < QUORUM || dateVoters < QUORUM) {
      if (cityVoters === QUORUM - 1 || dateVoters === QUORUM - 1) {
        this.log("one more ranked ballot and I can run the runoff for real.");
      }
      return;
    }
    const cityIds = this.s.cities.map((c) => c.id);
    const dateIds = this.s.weekends.map((w) => w.id);
    const cityResult = runoff(Object.values(this.s.cityBallots), cityIds);
    const dateResult = runoff(Object.values(this.s.dateBallots), dateIds);
    if (!cityResult.winner || !dateResult.winner) return;

    const cityRounds = this.roundsView("city", cityResult.rounds);
    const dateRounds = this.roundsView("date", dateResult.rounds);
    this.log(`quorum's in on both axes. running the instant-runoff for real — no more previews.`, true);
    this.narrateRunoff("city", "where", cityRounds, cityResult.winner);
    this.narrateRunoff("date", "when", dateRounds, dateResult.winner);
    this.s.declared = {
      cityId: cityResult.winner,
      dateId: dateResult.winner,
      ts: Date.now(),
      cityRounds,
      dateRounds,
    };
    this.log(
      `it's decided: ${this.labelFor("city", cityResult.winner)}, ${this.labelFor("date", dateResult.winner)}. ` +
        `a real majority, not just a plurality. tell your moots — and tell the west coast we said hi.`,
      true,
    );
  }

  async fetch(request: Request): Promise<Response> {
    await this.ready;
    const url = new URL(request.url);

    if (url.pathname === "/api/state" && request.method === "GET") {
      return this.handleState();
    }
    if (request.method !== "POST") return json({ error: "not found" }, 404);

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return json({ error: "bad json" }, 400);
    }

    // Keyed on ip+client, not ip alone — a household or conference wifi with
    // several people voting within the same second shouldn't cool each other
    // down; this only throttles one actor hammering the API.
    const ip = request.headers.get("cf-connecting-ip") || "anon";
    const client = String(body.client || "").slice(0, 64);
    const cooldownKey = ip + ":" + client;
    const now = Date.now();
    const wait = COOLDOWN_MS - (now - (this.lastByIp.get(cooldownKey) ?? 0));
    if (wait > 0) return json({ error: "cooldown", retryMs: wait }, 429);
    this.lastByIp.set(cooldownKey, now);

    if (url.pathname === "/api/rank") return this.handleRank(body);
    if (url.pathname === "/api/city") return this.handleAddCity(body);
    if (url.pathname === "/api/rsvp") return this.handleRsvp(body);
    return json({ error: "not found" }, 404);
  }

  private previewWinner(kind: "city" | "date"): { id: string; label: string } | null {
    const ballots = kind === "city" ? this.s.cityBallots : this.s.dateBallots;
    if (Object.keys(ballots).length === 0) return null;
    const ids = (kind === "city" ? this.s.cities : this.s.weekends).map((o) => o.id);
    const result = runoff(Object.values(ballots), ids);
    if (!result.winner) return null;
    return { id: result.winner, label: this.labelFor(kind, result.winner) };
  }

  private view() {
    return {
      cities: this.s.cities,
      weekends: this.s.weekends,
      cityBallots: this.s.cityBallots,
      dateBallots: this.s.dateBallots,
      cityVoters: Object.keys(this.s.cityBallots).length,
      dateVoters: Object.keys(this.s.dateBallots).length,
      cityPreview: this.s.declared ? null : this.previewWinner("city"),
      datePreview: this.s.declared ? null : this.previewWinner("date"),
      rsvps: Object.values(this.s.rsvps).sort((a, b) => a.ts - b.ts),
      log: this.s.log.slice(0, 40),
      declared: this.s.declared
        ? {
            ...this.s.declared,
            cityLabel: this.labelFor("city", this.s.declared.cityId),
            dateLabel: this.labelFor("date", this.s.declared.dateId),
            start: this.startFor(this.s.declared.dateId),
          }
        : null,
      quorum: QUORUM,
      version: this.s.version,
    };
  }

  private handleState(): Response {
    return json(this.view());
  }

  private async handleRank(body: { client?: unknown; kind?: unknown; order?: unknown }): Promise<Response> {
    if (this.s.declared) return json({ error: "already decided", ...this.view() }, 409);
    const client = String(body.client || "").slice(0, 64);
    const kind = body.kind === "city" || body.kind === "date" ? body.kind : null;
    if (!client || !kind || !Array.isArray(body.order)) return json({ error: "bad ranking" }, 400);

    const pool = kind === "city" ? this.s.cities : this.s.weekends;
    const validIds = new Set(pool.map((o) => o.id));
    const seen = new Set<string>();
    const order: string[] = [];
    for (const raw of body.order) {
      const id = String(raw).slice(0, 32);
      if (validIds.has(id) && !seen.has(id)) {
        seen.add(id);
        order.push(id);
      }
      if (order.length >= pool.length) break;
    }

    const ballots = kind === "city" ? this.s.cityBallots : this.s.dateBallots;
    const wasVoter = !!ballots[client];
    if (order.length === 0) {
      delete ballots[client];
    } else {
      ballots[client] = order;
      const top = this.labelFor(kind, order[0]);
      const rest = order.length > 1 ? ` (+${order.length - 1} more ranked)` : "";
      this.log(`${wasVoter ? "" : "new ballot — "}${this.voterLabel(client)} ranks ${top} first ${kind === "city" ? "for where" : "for when"}${rest}.`);
    }
    this.maybeDeclare();
    await this.persist();
    return json(this.view());
  }

  private async handleAddCity(body: { client?: unknown; label?: unknown }): Promise<Response> {
    if (this.s.declared) return json({ error: "already decided", ...this.view() }, 409);
    const label = String(body.label || "").trim().slice(0, 40);
    const client = String(body.client || "").slice(0, 64);
    if (!label || !client) return json({ error: "bad city" }, 400);
    let target = this.s.cities.find((c) => c.label.toLowerCase() === label.toLowerCase());
    if (!target) {
      if (this.s.cities.length >= MAX_CITIES) return json({ error: "too many options already" }, 400);
      let id = slugify(label);
      while (this.s.cities.some((c) => c.id === id)) id += "x";
      target = { id, label };
      this.s.cities.push(target);
      this.log(`a new option enters the graph: ${label}.`);
    }
    // Prepend as this client's new top choice — same courtesy as westmoot's
    // "suggesting a city votes for it," adapted to ranked ballots.
    const existing = (this.s.cityBallots[client] || []).filter((id) => id !== target!.id);
    this.s.cityBallots[client] = [target.id, ...existing];
    this.log(`${this.voterLabel(client)} ranks ${target.label} first for where.`);
    this.maybeDeclare();
    await this.persist();
    return json(this.view());
  }

  private async handleRsvp(body: {
    client?: unknown;
    handle?: unknown;
    displayName?: unknown;
    avatar?: unknown;
    note?: unknown;
  }): Promise<Response> {
    const client = String(body.client || "").slice(0, 64);
    const handle = String(body.handle || "").trim().replace(/^@/, "").slice(0, 120);
    if (!client || !handle) return json({ error: "bad rsvp" }, 400);
    const displayName = String(body.displayName || handle).slice(0, 120);
    const avatar = String(body.avatar || "").slice(0, 500);
    const note = String(body.note || "").slice(0, 140);
    const isNew = !this.s.rsvps[client];
    this.s.rsvps[client] = { handle, displayName, avatar, note, ts: Date.now() };
    this.log(isNew ? `@${handle} joined the cluster.` : `@${handle} updated their RSVP.`);
    await this.persist();
    return json(this.view());
  }
}
