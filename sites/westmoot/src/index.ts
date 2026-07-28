// westmoot Worker — bisks.net/westmoot
//
// @words.bsky.social's idea, tagged to @buildthis.bisks.net: "a sentient
// website that coordinates and plans a west coast gathering of the
// simcluster." This is that site. Everyone who opens the page votes on a
// west-coast city and a weekend and can RSVP with a handle; no login, no
// organizer. Once enough distinct people agree, the site itself declares the
// plan — it doesn't ask permission, it just decides and tells you.
//
// All shared state (votes, RSVPs, the running "thoughts" log, the eventual
// declaration) lives in ONE Durable Object instance (id "global") — the
// single-writer guarantee a shared plan actually needs. Copied the DO/env
// shape pattern from sites/the-place (no @cloudflare/workers-types
// dependency — house style: self-contained deps — these are just the narrow
// slice this file touches, hand-declared the same way).

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
interface Declared {
  cityId: string;
  dateId: string;
  ts: number;
}
interface State {
  cities: Option[];
  weekends: Weekend[];
  cityVotes: Record<string, string>; // clientId -> cityId
  dateVotes: Record<string, string>; // clientId -> weekendId
  rsvps: Record<string, Rsvp>; // clientId -> rsvp
  log: LogEntry[];
  declared: Declared | null;
  version: number;
}

const SEED_CITIES: Option[] = [
  { id: "sf", label: "San Francisco" },
  { id: "oak", label: "Oakland" },
  { id: "la", label: "Los Angeles" },
  { id: "sd", label: "San Diego" },
  { id: "pdx", label: "Portland" },
  { id: "sea", label: "Seattle" },
];
const MAX_CITIES = 10;
const QUORUM = 4; // distinct voters needed on an axis before the site will decide
const LOG_CAP = 80;
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
// while people are mid-vote.
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

function tally(votes: Record<string, string>): Map<string, number> {
  const m = new Map<string, number>();
  for (const id of Object.values(votes)) m.set(id, (m.get(id) ?? 0) + 1);
  return m;
}

function leaderOf(votes: Record<string, string>): { id: string; count: number; second: number } | null {
  const m = tally(votes);
  if (m.size === 0) return null;
  const sorted = [...m.entries()].sort((a, b) => b[1] - a[1]);
  return { id: sorted[0][0], count: sorted[0][1], second: sorted[1]?.[1] ?? 0 };
}

// Mounted at bisks.net/westmoot/ — strip the mount prefix before routing, so
// the /api/* check, the DO, and ASSETS all see root-relative paths. The
// client prefixes its own /api calls with /westmoot (see public/index.html's
// MOUNT const). See notes/40-new-site-playbook.md.
const PREFIX = "/westmoot";

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
    cityVotes: {},
    dateVotes: {},
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
        this.log("the graph is quiet. i'm awake now. someone should vote.", true);
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

  private maybeDeclare() {
    if (this.s.declared) return;
    const cityLead = leaderOf(this.s.cityVotes);
    const dateLead = leaderOf(this.s.dateVotes);
    if (!cityLead || !dateLead) return;
    const cityVoters = Object.keys(this.s.cityVotes).length;
    const dateVoters = Object.keys(this.s.dateVotes).length;
    if (
      cityVoters >= QUORUM &&
      dateVoters >= QUORUM &&
      cityLead.count > cityLead.second &&
      dateLead.count > dateLead.second
    ) {
      this.s.declared = { cityId: cityLead.id, dateId: dateLead.id, ts: Date.now() };
      this.log(
        `i've seen enough. ${cityVoters + dateVoters} votes in, and the pattern's clear: ` +
          `${this.labelFor("city", cityLead.id)}, ${this.labelFor("date", dateLead.id)}. ` +
          `it's decided. tell your moots.`,
        true,
      );
    } else if (cityVoters === QUORUM - 1 || dateVoters === QUORUM - 1) {
      this.log("one more vote and I can commit to something.");
    }
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

    if (url.pathname === "/api/vote") return this.handleVote(body);
    if (url.pathname === "/api/city") return this.handleAddCity(body);
    if (url.pathname === "/api/rsvp") return this.handleRsvp(body);
    return json({ error: "not found" }, 404);
  }

  private view() {
    return {
      cities: this.s.cities,
      weekends: this.s.weekends,
      cityTally: Object.fromEntries(tally(this.s.cityVotes)),
      dateTally: Object.fromEntries(tally(this.s.dateVotes)),
      cityVoters: Object.keys(this.s.cityVotes).length,
      dateVoters: Object.keys(this.s.dateVotes).length,
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

  private async handleVote(body: { client?: unknown; kind?: unknown; id?: unknown }): Promise<Response> {
    if (this.s.declared) return json({ error: "already decided", ...this.view() }, 409);
    const client = String(body.client || "").slice(0, 64);
    const kind = body.kind === "city" || body.kind === "date" ? body.kind : null;
    const id = String(body.id || "").slice(0, 32);
    if (!client || !kind || !id) return json({ error: "bad vote" }, 400);
    const pool = kind === "city" ? this.s.cities : this.s.weekends;
    if (!pool.some((o) => o.id === id)) return json({ error: "unknown option" }, 400);

    const votes = kind === "city" ? this.s.cityVotes : this.s.dateVotes;
    if (votes[client] === id) return json(this.view());
    votes[client] = id;
    this.log(`${this.voterLabel(client)} ${kind === "city" ? "leans toward" : "is eyeing"} ${this.labelFor(kind, id)}.`);
    this.maybeDeclare();
    await this.persist();
    return json(this.view());
  }

  private async handleAddCity(body: { client?: unknown; label?: unknown }): Promise<Response> {
    if (this.s.declared) return json({ error: "already decided", ...this.view() }, 409);
    const label = String(body.label || "").trim().slice(0, 40);
    const client = String(body.client || "").slice(0, 64);
    if (!label || !client) return json({ error: "bad city" }, 400);
    const existing = this.s.cities.find((c) => c.label.toLowerCase() === label.toLowerCase());
    if (existing) {
      this.s.cityVotes[client] = existing.id;
      this.log(`${this.voterLabel(client)} leans toward ${existing.label}.`);
      this.maybeDeclare();
      await this.persist();
      return json(this.view());
    }
    if (this.s.cities.length >= MAX_CITIES) return json({ error: "too many options already" }, 400);
    let id = slugify(label);
    while (this.s.cities.some((c) => c.id === id)) id += "x";
    this.s.cities.push({ id, label });
    this.s.cityVotes[client] = id;
    this.log(`a new option enters the graph: ${label}.`);
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
