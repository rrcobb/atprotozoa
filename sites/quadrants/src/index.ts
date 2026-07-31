// quadrants Worker — mounted at bisks.net/quadrants/ (see
// notes/40-new-site-playbook.md). Idea #16 off permadeath.com's "50 ATProto
// Project Ideas" list: arbitrary quadrant diagrams, with plain labeled anchor
// points a creator drops in (no login needed) plus a live overlay of everyone
// who's logged in with Bluesky and placed their OWN marker — that write goes
// straight to their PDS, a net.bisks.quadrants.position record, same OAuth
// shape as sites/padmoot.
//
// "Aggregate stats on where everyone lands" needs an index across everyone's
// repos, and the AppView has no "give me every record of this custom
// collection" endpoint — so one Durable Object (name "global") keeps a live
// Jetstream subscription filtered to just net.bisks.quadrants.position and
// keeps a running chartId -> (did -> position) map, same shape as
// sites/ratioed's firehose-watching tracker. Chart definitions (title, axis
// labels, anchors) live in the same DO, keyed by a short id.
//
// Every request first gets its "/quadrants" mount prefix stripped; what's
// left is matched against /c/<id> (stamp per-chart OG tags onto the static
// chart shell, windmill-style) and /api/* (forwarded to the DO), and
// otherwise falls through to ASSETS.

export interface DurableObjectId {
  toString(): string;
}
export interface DurableObjectStub {
  fetch(request: Request): Promise<Response>;
}
export interface DurableObjectNamespace {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): DurableObjectStub;
}
export interface DurableObjectStorage {
  get<T = unknown>(key: string): Promise<T | undefined>;
  put(entries: Record<string, unknown>): Promise<void>;
  delete(key: string): Promise<boolean>;
  setAlarm(time: number | Date): Promise<void>;
}
export interface DurableObjectState {
  storage: DurableObjectStorage;
  blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T>;
}

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  HUB: DurableObjectNamespace;
}

const PREFIX = "/quadrants";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const GENERIC_TITLE = "quadrants — make your own alignment chart";
const GENERIC_DESC =
  "Plot arbitrary reference points on a 2x2 grid, then sign in with Bluesky to drop your own marker — written straight to your PDS.";
const GENERIC_OG_URL = "https://bisks.net/quadrants/";

async function renderChart(env: Env, request: Request, id: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/chart.html", request.url), { method: "GET" }));
  const html = await base.text();

  const stub = env.HUB.get(env.HUB.idFromName("global"));
  const apiUrl = new URL(request.url);
  apiUrl.pathname = `/api/charts/${encodeURIComponent(id)}`;
  let chart: any = null;
  try {
    const r = await stub.fetch(new Request(apiUrl.toString()));
    if (r.ok) chart = (await r.json()).chart;
  } catch {
    // DO hiccup — fall back to the generic shell rather than failing the page
  }

  if (!chart) return new Response(html, { headers: base.headers });

  const title = `quadrants: ${chart.title}`;
  const desc = `${chart.xLeft} ↔ ${chart.xRight} · ${chart.yBottom} ↔ ${chart.yTop} — plot yourself on ${esc(chart.title)}.`;
  const ogUrl = `https://bisks.net/quadrants/c/${encodeURIComponent(id)}`;

  const stamped = html
    .split(GENERIC_TITLE).join(esc(title))
    .split(GENERIC_DESC).join(esc(desc))
    .split(GENERIC_OG_URL).join(ogUrl);

  return new Response(stamped, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=60" },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === PREFIX) {
      url.pathname = PREFIX + "/";
      return Response.redirect(url.toString(), 308);
    }
    // Only strip when the prefix is actually present — on the subdomain
    // requests arrive without it, and an unconditional slice would chop
    // the front off short paths ("/app.js" -> "") so every asset would
    // silently serve index.html.
    if (url.pathname.startsWith(PREFIX + "/")) {
      url.pathname = url.pathname.slice(PREFIX.length) || "/";
    }
    const stripped = new Request(url, request);

    const chartMatch = url.pathname.match(/^\/c\/([A-Za-z0-9_-]+)\/?$/);
    if (chartMatch) return renderChart(env, stripped, chartMatch[1]);

    if (url.pathname.startsWith("/api/")) {
      const stub = env.HUB.get(env.HUB.idFromName("global"));
      return stub.fetch(stripped);
    }

    return env.ASSETS.fetch(stripped);
  },
};

// ---------------------------------------------------------------------------
// QuadrantHub — the one global Durable Object. Holds chart definitions and a
// live, firehose-fed index of everyone's position on every chart.
// ---------------------------------------------------------------------------

const JETSTREAM_URL =
  "https://jetstream2.us-east.bsky.network/subscribe?wantedCollections=net.bisks.quadrants.position";
const APPVIEW = "https://public.api.bsky.app/xrpc";
const ALARM_MS = 20 * 1000; // reconnect heartbeat, same cadence as sites/ratioed
const PROFILE_TTL_MS = 6 * 60 * 60 * 1000;

const MAX_TITLE = 80;
const MAX_LABEL = 24;
const MAX_ANCHOR_LABEL = 40;
const MAX_ANCHORS = 16;
const MAX_CHART_INDEX = 300;

interface Anchor {
  label: string;
  x: number;
  y: number;
}

interface ChartDef {
  id: string;
  title: string;
  xLeft: string;
  xRight: string;
  yBottom: string;
  yTop: string;
  anchors: Anchor[];
  creatorHandle: string | null;
  createdAt: number;
}

interface ChartIndexEntry {
  id: string;
  title: string;
  xLeft: string;
  xRight: string;
  yBottom: string;
  yTop: string;
  createdAt: number;
  positionCount: number;
}

interface PositionEntry {
  did: string;
  handle: string;
  displayName: string;
  avatar: string;
  x: number;
  y: number;
  updatedAt: number;
}

interface Profile {
  handle: string;
  displayName: string;
  avatar: string;
  resolvedAt: number;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function clamp(n: unknown, lo: number, hi: number): number {
  const v = typeof n === "number" && Number.isFinite(n) ? n : 0;
  return Math.max(lo, Math.min(hi, v));
}

function cleanLabel(s: unknown, max: number, fallback: string): string {
  const v = typeof s === "string" ? s.trim().slice(0, max) : "";
  return v || fallback;
}

function randomId(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 9);
}

export class QuadrantHub {
  private state: DurableObjectState;
  private ready: Promise<void>;
  private chartIndex: ChartIndexEntry[] = [];
  private chartCache: Map<string, ChartDef> = new Map();
  private positionsCache: Map<string, Map<string, PositionEntry>> = new Map();
  private profileCache: Map<string, Profile> = new Map();
  private ws: any = null;
  private reconnectDelay = 1000;

  constructor(state: DurableObjectState) {
    this.state = state;
    this.ready = this.state.blockConcurrencyWhile(async () => {
      const idx = await this.state.storage.get<ChartIndexEntry[]>("chartIndex");
      this.chartIndex = idx ?? [];
    });
    this.connectSocket().catch(() => {});
    this.state.storage.setAlarm(Date.now() + ALARM_MS).catch(() => {});
  }

  // ---- firehose ------------------------------------------------------------
  // Workers connect OUT to a WebSocket server via fetch() + an Upgrade header
  // (the documented Cloudflare pattern), not the browser-style `new
  // WebSocket(url)` constructor. Same shape as sites/ratioed and sites/mootstream.
  private async connectSocket(): Promise<void> {
    try {
      const resp: any = await fetch(JETSTREAM_URL, { headers: { Upgrade: "websocket" } });
      const ws = resp.webSocket;
      if (!ws) throw new Error("jetstream didn't upgrade");
      ws.accept();
      this.ws = ws;
      this.reconnectDelay = 1000;
      ws.addEventListener("message", (ev: any) => {
        this.handleMessage(String(ev.data)).catch(() => {
          // one bad message shouldn't kill the stream
        });
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

  private async handleMessage(raw: string): Promise<void> {
    let evt: any;
    try {
      evt = JSON.parse(raw);
    } catch {
      return;
    }
    if (evt.kind !== "commit") return;
    const commit = evt.commit;
    if (!commit || commit.collection !== "net.bisks.quadrants.position") return;
    const did = evt.did;
    if (typeof did !== "string") return;

    if (commit.operation === "delete") {
      // rkey is the chart id (one position per chart per user) — see chart.html.
      const chartId = typeof commit.rkey === "string" ? commit.rkey : null;
      if (!chartId) return;
      const positions = await this.loadPositions(chartId);
      if (positions.delete(did)) await this.persistPositions(chartId, positions);
      return;
    }

    if (commit.operation !== "create" && commit.operation !== "update") return;
    const rec = commit.record;
    if (!rec || typeof rec.chart !== "string") return;
    const chartId = rec.chart;
    if (typeof rec.x !== "number" || typeof rec.y !== "number") return;

    const profile = await this.resolveProfile(did);
    const positions = await this.loadPositions(chartId);
    positions.set(did, {
      did,
      handle: profile?.handle || did,
      displayName: profile?.displayName || profile?.handle || did,
      avatar: profile?.avatar || "",
      x: clamp(rec.x, -1, 1),
      y: clamp(rec.y, -1, 1),
      updatedAt: Date.now(),
    });
    await this.persistPositions(chartId, positions);
  }

  private async resolveProfile(did: string): Promise<Profile | null> {
    const cached = this.profileCache.get(did);
    if (cached && Date.now() - cached.resolvedAt < PROFILE_TTL_MS) return cached;
    try {
      const r = await fetch(`${APPVIEW}/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`);
      if (!r.ok) return cached || null;
      const data: any = await r.json();
      const profile: Profile = {
        handle: data.handle || did,
        displayName: data.displayName || data.handle || did,
        avatar: data.avatar || "",
        resolvedAt: Date.now(),
      };
      this.profileCache.set(did, profile);
      return profile;
    } catch {
      return cached || null;
    }
  }

  // ---- storage --------------------------------------------------------------

  private async loadChart(id: string): Promise<ChartDef | null> {
    const cached = this.chartCache.get(id);
    if (cached) return cached;
    const stored = await this.state.storage.get<ChartDef>(`chart:${id}`);
    if (stored) this.chartCache.set(id, stored);
    return stored ?? null;
  }

  private async loadPositions(chartId: string): Promise<Map<string, PositionEntry>> {
    const cached = this.positionsCache.get(chartId);
    if (cached) return cached;
    const stored = await this.state.storage.get<Record<string, PositionEntry>>(`positions:${chartId}`);
    const map = new Map<string, PositionEntry>(Object.entries(stored ?? {}));
    this.positionsCache.set(chartId, map);
    return map;
  }

  private async persistPositions(chartId: string, positions: Map<string, PositionEntry>): Promise<void> {
    await this.state.storage.put({ [`positions:${chartId}`]: Object.fromEntries(positions) });
    const entry = this.chartIndex.find((c) => c.id === chartId);
    if (entry) {
      entry.positionCount = positions.size;
      await this.state.storage.put({ chartIndex: this.chartIndex });
    }
  }

  // ---- alarm: reconnect heartbeat -------------------------------------------
  async alarm(): Promise<void> {
    await this.ready;
    if (!this.wsOpen()) this.connectSocket().catch(() => {});
    await this.state.storage.setAlarm(Date.now() + ALARM_MS);
  }

  // ---- http -------------------------------------------------------------
  async fetch(request: Request): Promise<Response> {
    await this.ready;
    if (!this.wsOpen()) this.connectSocket().catch(() => {});

    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean); // ["api", "charts", (id)]

    if (parts[0] !== "api" || parts[1] !== "charts") return json({ error: "not found" }, 404);

    if (parts.length === 2 && request.method === "GET") {
      return json({ charts: this.chartIndex.slice(0, 50) });
    }

    if (parts.length === 2 && request.method === "POST") {
      let body: any;
      try {
        body = await request.json();
      } catch {
        return json({ error: "bad json" }, 400);
      }
      const rawAnchors = Array.isArray(body.anchors) ? body.anchors : [];
      const anchors: Anchor[] = rawAnchors.slice(0, MAX_ANCHORS).map((a: any) => ({
        label: cleanLabel(a?.label, MAX_ANCHOR_LABEL, "?"),
        x: clamp(a?.x, -1, 1),
        y: clamp(a?.y, -1, 1),
      }));

      let id = randomId();
      for (let i = 0; i < 5 && this.chartCache.has(id); i++) id = randomId();

      const chart: ChartDef = {
        id,
        title: cleanLabel(body.title, MAX_TITLE, "untitled quadrant"),
        xLeft: cleanLabel(body.xLeft, MAX_LABEL, "left"),
        xRight: cleanLabel(body.xRight, MAX_LABEL, "right"),
        yBottom: cleanLabel(body.yBottom, MAX_LABEL, "bottom"),
        yTop: cleanLabel(body.yTop, MAX_LABEL, "top"),
        anchors,
        creatorHandle: typeof body.creatorHandle === "string" ? body.creatorHandle.slice(0, 64) : null,
        createdAt: Date.now(),
      };

      this.chartCache.set(id, chart);
      this.chartIndex.unshift({
        id,
        title: chart.title,
        xLeft: chart.xLeft,
        xRight: chart.xRight,
        yBottom: chart.yBottom,
        yTop: chart.yTop,
        createdAt: chart.createdAt,
        positionCount: 0,
      });
      this.chartIndex = this.chartIndex.slice(0, MAX_CHART_INDEX);

      await this.state.storage.put({ [`chart:${id}`]: chart, chartIndex: this.chartIndex });
      return json({ id });
    }

    if (parts.length === 3 && request.method === "GET") {
      const id = parts[2];
      const chart = await this.loadChart(id);
      if (!chart) return json({ error: "not found" }, 404);
      const positions = await this.loadPositions(id);
      return json({ chart, positions: Array.from(positions.values()) });
    }

    return json({ error: "not found" }, 404);
  }
}
