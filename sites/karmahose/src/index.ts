// karmahose Worker — karmahose.bisks.net
//
// @shimmermathlabs.com, quoted by @cee.wtf: ".oO a bot that lets people add
// or remove arbitrarily named points with this form of syntax: `socialcredit
// +1`" / "mormonism mentioned in a realistic context" (an example of an
// arbitrary, freeform point name — not just single words). @cee.wtf tagged
// the bot to build it, then replied "but like in a persistent and
// backgrounded manner" — so this isn't a form you fill in: one Durable
// Object watches the live Jetstream firehose for any post whose last line is
// `<name> +N` / `<name> -N` / `<name>++` / `<name>--`, and keeps a
// persistent, global tally per name. No signup, no target validation — any
// string is a valid name, same as sites/socialcredit is to specific people
// but for anything at all.
//
// Same shape as sites/quotehof and sites/vibepantheon: the DO owns the
// socket + the rolling state, an alarm is the reconnect/persist heartbeat,
// and profile hydration for the activity feed is best-effort off the public
// unauthenticated AppView (getProfiles).

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
  setAlarm(time: number | Date): Promise<void>;
}
interface DurableObjectState {
  storage: DurableObjectStorage;
  blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T>;
}

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  TALLY: DurableObjectNamespace;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      const id = env.TALLY.idFromName("global");
      const stub = env.TALLY.get(id);
      return stub.fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};

// ---- config ------------------------------------------------------------
const JETSTREAM_URL =
  "https://jetstream2.us-east.bsky.network/subscribe?wantedCollections=app.bsky.feed.post";
const APPVIEW = "https://public.api.bsky.app/xrpc";

const ALARM_MS = 30 * 1000; // reconnect heartbeat + periodic persist/hydrate tick
const MAX_NAMES = 3000; // safety valve: evict the least-recently-touched name past this
const MAX_FEED = 300; // global recent-activity log, newest first
const MAX_HISTORY_PER_NAME = 20; // per-name recent-delta log
const MAX_DELTA = 1000; // clamp a single post's swing so one skeet can't nuke the board
const MAX_NAME_LEN = 140;
const PROFILE_TTL_MS = 60 * 60 * 1000;
const MAX_PROFILE_FETCH_PER_TICK = 100; // 4 getProfiles batches of 25
const TOP_N = 30;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
  });
}

function normalizeKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

// The whole point of the syntax is that it reads like a command: a name,
// then a trailing delta. Only the post's LAST line is checked, so a longer
// post can still end with "... mormonism mentioned in a realistic context
// +1" as its final line. A required space between the name and the operator
// keeps this from lighting up on every stray "3-2" score or "gate-14".
const DELTA_RE = /^(.{1,140}?)\s+(\+\+|--|[+-]\d{1,6})$/;

function extractDelta(text: string): { name: string; delta: number } | null {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 400) return null;
  const lines = trimmed.split("\n");
  const last = lines[lines.length - 1].trim();
  const m = DELTA_RE.exec(last);
  if (!m) return null;
  const name = m[1].trim().replace(/\s+/g, " ");
  if (!name || name.length > MAX_NAME_LEN) return null;
  const op = m[2];
  let delta: number;
  if (op === "++") delta = 1;
  else if (op === "--") delta = -1;
  else delta = parseInt(op, 10);
  if (!Number.isFinite(delta) || delta === 0) return null;
  delta = Math.max(-MAX_DELTA, Math.min(MAX_DELTA, delta));
  return { name, delta };
}

interface HistoryPoint {
  delta: number;
  newScore: number;
  at: number;
  did: string;
}

interface NameEntry {
  key: string;
  display: string;
  score: number;
  posts: number;
  lastAt: number;
  lastDid: string;
  lastUri: string;
  history: HistoryPoint[];
}

interface FeedItem {
  key: string;
  display: string;
  delta: number;
  newScore: number;
  did: string;
  uri: string;
  at: number;
}

interface ProfileInfo {
  handle: string;
  displayName: string;
  avatar: string;
  fetchedAt: number;
}

export class KarmaTally {
  private state: DurableObjectState;
  private ready: Promise<void>;
  private names: Map<string, NameEntry> = new Map();
  private feed: FeedItem[] = [];
  private profiles: Map<string, ProfileInfo> = new Map();
  private totalPosts = 0;
  private lastUpdated = 0;
  private ws: any = null;
  private reconnectDelay = 1000;
  private dirty = false;

  constructor(state: DurableObjectState) {
    this.state = state;
    this.ready = this.state.blockConcurrencyWhile(async () => {
      const [names, feed, totalPosts, lastUpdated] = await Promise.all([
        this.state.storage.get<NameEntry[]>("names"),
        this.state.storage.get<FeedItem[]>("feed"),
        this.state.storage.get<number>("totalPosts"),
        this.state.storage.get<number>("lastUpdated"),
      ]);
      for (const n of names ?? []) this.names.set(n.key, n);
      this.feed = feed ?? [];
      this.totalPosts = totalPosts ?? 0;
      this.lastUpdated = lastUpdated ?? 0;
    });
    this.connectSocket().catch(() => {});
    this.state.storage.setAlarm(Date.now() + ALARM_MS).catch(() => {});
  }

  // ---- firehose ----------------------------------------------------------
  // Workers connect OUT to a WebSocket server via fetch() + an Upgrade
  // header (the documented Cloudflare pattern), not the browser-style
  // `new WebSocket(url)` constructor.
  private async connectSocket(): Promise<void> {
    try {
      const resp: any = await fetch(JETSTREAM_URL, { headers: { Upgrade: "websocket" } });
      const ws = resp.webSocket;
      if (!ws) throw new Error("jetstream didn't upgrade");
      ws.accept();
      this.ws = ws;
      this.reconnectDelay = 1000;
      ws.addEventListener("message", (ev: any) => {
        try {
          this.handleMessage(String(ev.data));
        } catch {
          // one bad message shouldn't kill the stream
        }
      });
      ws.addEventListener("close", () => {
        if (this.ws === ws) this.ws = null;
        this.scheduleReconnect();
      });
      ws.addEventListener("error", () => {
        try {
          ws.close();
        } catch {
          // already closing
        }
      });
    } catch {
      this.ws = null;
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    const delay = this.reconnectDelay;
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000);
    setTimeout(() => {
      this.connectSocket().catch(() => {});
    }, delay);
  }

  private wsOpen(): boolean {
    return !!this.ws && this.ws.readyState === 1; // WebSocket.OPEN
  }

  private handleMessage(raw: string): void {
    let evt: any;
    try {
      evt = JSON.parse(raw);
    } catch {
      return;
    }
    if (evt.kind !== "commit") return;
    const commit = evt.commit;
    if (!commit || commit.operation !== "create") return;
    if (commit.collection && commit.collection !== "app.bsky.feed.post") return;
    const rec = commit.record;
    if (!rec || typeof rec.text !== "string") return;

    const hit = extractDelta(rec.text);
    if (!hit) return;

    const now = Date.now();
    const did: string = evt.did;
    const uri = `at://${did}/app.bsky.feed.post/${commit.rkey}`;
    const key = normalizeKey(hit.name);
    if (!key) return;

    this.totalPosts++;

    let entry = this.names.get(key);
    if (!entry) {
      if (this.names.size >= MAX_NAMES) this.evictOldest();
      entry = { key, display: hit.name, score: 0, posts: 0, lastAt: 0, lastDid: "", lastUri: "", history: [] };
      this.names.set(key, entry);
    }
    entry.score += hit.delta;
    entry.posts++;
    entry.lastAt = now;
    entry.lastDid = did;
    entry.lastUri = uri;
    entry.history.push({ delta: hit.delta, newScore: entry.score, at: now, did });
    if (entry.history.length > MAX_HISTORY_PER_NAME) entry.history.shift();

    this.feed.unshift({ key, display: hit.name, delta: hit.delta, newScore: entry.score, did, uri, at: now });
    if (this.feed.length > MAX_FEED) this.feed.length = MAX_FEED;

    this.lastUpdated = now;
    this.dirty = true;
    // Rare event (the syntax is narrow) — persist right away rather than
    // waiting for the next alarm tick, so a score is never lost between ticks.
    this.persist().catch(() => {});
  }

  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestAt = Infinity;
    for (const [k, e] of this.names) {
      if (e.lastAt < oldestAt) {
        oldestAt = e.lastAt;
        oldestKey = k;
      }
    }
    if (oldestKey) this.names.delete(oldestKey);
  }

  private async persist(): Promise<void> {
    if (!this.dirty) return;
    this.dirty = false;
    await this.state.storage.put({
      names: Array.from(this.names.values()),
      feed: this.feed,
      totalPosts: this.totalPosts,
      lastUpdated: this.lastUpdated,
    });
  }

  // ---- AppView (best-effort profile hydration only) -----------------------
  private async fetchProfiles(dids: string[]): Promise<Map<string, any>> {
    const out = new Map<string, any>();
    const batches: string[][] = [];
    for (let i = 0; i < dids.length; i += 25) batches.push(dids.slice(i, i + 25));
    await Promise.all(
      batches.map(async (batch) => {
        try {
          const url = new URL(`${APPVIEW}/app.bsky.actor.getProfiles`);
          for (const d of batch) url.searchParams.append("actors", d);
          const r = await fetch(url.toString());
          if (!r.ok) return;
          const data: any = await r.json();
          for (const p of data.profiles || []) out.set(p.did, p);
        } catch {
          // one bad batch shouldn't sink the tick
        }
      }),
    );
    return out;
  }

  private async hydrateProfiles(): Promise<void> {
    const now = Date.now();
    const wanted = new Set<string>();
    for (const f of this.feed.slice(0, 60)) wanted.add(f.did);

    const stale: string[] = [];
    for (const did of wanted) {
      const p = this.profiles.get(did);
      if (!p || now - p.fetchedAt > PROFILE_TTL_MS) stale.push(did);
      if (stale.length >= MAX_PROFILE_FETCH_PER_TICK) break;
    }
    if (!stale.length) return;

    const fresh = await this.fetchProfiles(stale);
    for (const did of stale) {
      const p = fresh.get(did);
      this.profiles.set(did, {
        handle: (p && p.handle) || this.profiles.get(did)?.handle || "",
        displayName: (p && p.displayName) || "",
        avatar: (p && p.avatar) || "",
        fetchedAt: now,
      });
    }
  }

  // ---- alarm: reconnect + persist + hydrate --------------------------------
  async alarm(): Promise<void> {
    await this.ready;
    if (!this.wsOpen()) this.connectSocket().catch(() => {});
    await this.hydrateProfiles().catch(() => {});
    await this.persist().catch(() => {});
    await this.state.storage.setAlarm(Date.now() + ALARM_MS);
  }

  // ---- http -----------------------------------------------------------------
  async fetch(request: Request): Promise<Response> {
    await this.ready;
    if (!this.wsOpen()) this.connectSocket().catch(() => {});

    const url = new URL(request.url);
    const withProfile = <T extends { did: string }>(item: T) => {
      const p = this.profiles.get(item.did);
      return { ...item, handle: p?.handle || "", displayName: p?.displayName || "", avatar: p?.avatar || "" };
    };

    if (url.pathname === "/api/leaderboard") {
      const all = Array.from(this.names.values());
      const top = [...all].sort((a, b) => b.score - a.score || b.lastAt - a.lastAt).slice(0, TOP_N);
      const bottom = [...all]
        .filter((e) => e.score < 0)
        .sort((a, b) => a.score - b.score || b.lastAt - a.lastAt)
        .slice(0, TOP_N);
      const withLastDid = <T extends { lastDid: string }>(e: T) =>
        withProfile({ ...e, did: e.lastDid } as any);
      return json({
        updatedAt: this.lastUpdated || null,
        totalNames: this.names.size,
        totalPosts: this.totalPosts,
        top: top.map(withLastDid),
        bottom: bottom.map(withLastDid),
        recent: this.feed.slice(0, 60).map(withProfile),
      });
    }

    if (url.pathname === "/api/name") {
      const q = url.searchParams.get("q") || "";
      const key = normalizeKey(q);
      const entry = key ? this.names.get(key) : undefined;
      if (!entry) return json({ found: false, query: q });
      return json({
        found: true,
        query: q,
        entry: { ...entry, history: entry.history.map(withProfile) },
      });
    }

    return json({ error: "not found" }, 404);
  }
}
