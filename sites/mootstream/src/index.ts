// mootstream Worker — bisks.net/mootstream
//
// @thealpacalypse asked for a webgl earth.nullschool.net-style wind map where
// the wind currents come from hot/cold spots: ocean heat is the "normal"
// (climatological) sea temperature — no satellite posters — and land heat is
// a z-score of user activity in an area. There's no per-post geolocation on
// Bluesky, so "area" is approximated by post language — each region below is
// a language + a rough bounding box for where that language's speakers
// cluster. The Worker watches Jetstream for app.bsky.feed.post creates,
// buckets counts per region per minute, and keeps a rolling history so each
// region gets its OWN z-score against its OWN baseline (a quiet region
// spiking registers just as "hot" as a loud one spiking). All of that lives
// in one Durable Object, same "rolling state in one DO" shape as sites/
// ratioed's RatioTracker (this site's lineage, heavily rewritten).
//
// The client (public/index.html) fetches this /api/heat endpoint, combines
// it with a climatological ocean/land baseline curve computed from latitude
// + day-of-year, derives a wind vector field from the temperature gradient,
// and renders particle advection in WebGL.

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
  TRACKER: DurableObjectNamespace;
}

// Mounted at bisks.net/mootstream/ — strip the mount prefix before routing,
// so the /api/* check and the DO + ASSETS all see root-relative paths. See
// notes/40-new-site-playbook.md.
const PREFIX = "/mootstream";

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
      const id = env.TRACKER.idFromName("global");
      const stub = env.TRACKER.get(id);
      return stub.fetch(stripped);
    }
    return env.ASSETS.fetch(stripped);
  },
};

// ---- region list ------------------------------------------------------------
// A region is a rough "where this language's speakers post from" bounding box
// (lon/lat), not an authoritative geolinguistic map — it's a fun-toy proxy,
// not a census. Multiple regions can share a language (e.g. "en" fans out to
// north-america, uk-ireland, australia — each keeps its own independent
// baseline, so an English-language spike in one doesn't "dilute" another).
// The client (public/index.html) keeps its own copy of id/name/bbox (no langs
// needed there) — see REGIONS in that file. Keep the two in sync by hand if
// you edit this list (house style: copy, don't abstract, even within a site).
export interface Region {
  id: string;
  name: string;
  langs: string[]; // normalized (lowercase, primary subtag only) BCP-47 codes
  bbox: [number, number, number, number]; // [minLon, minLat, maxLon, maxLat]
}

export const REGIONS: Region[] = [
  { id: "north-america", name: "North America", langs: ["en"], bbox: [-130, 25, -60, 55] },
  { id: "uk-ireland", name: "UK & Ireland", langs: ["en"], bbox: [-11, 49, 2, 61] },
  { id: "australia", name: "Australia & NZ", langs: ["en"], bbox: [113, -47, 179, -10] },
  { id: "brazil", name: "Brazil", langs: ["pt"], bbox: [-74, -34, -34, 6] },
  { id: "latin-america", name: "Latin America", langs: ["es"], bbox: [-109, -56, -35, 15] },
  { id: "spain", name: "Spain", langs: ["es"], bbox: [-10, 36, 4, 44] },
  { id: "france", name: "France", langs: ["fr"], bbox: [-5, 41, 10, 51] },
  { id: "germany", name: "Germany & Central Europe", langs: ["de"], bbox: [5, 46, 17, 55] },
  { id: "italy", name: "Italy", langs: ["it"], bbox: [6, 36, 19, 47] },
  { id: "netherlands", name: "Netherlands", langs: ["nl"], bbox: [3, 50, 7, 54] },
  { id: "poland", name: "Poland", langs: ["pl"], bbox: [14, 49, 24, 55] },
  { id: "nordics", name: "Nordics", langs: ["sv", "no", "da", "fi"], bbox: [4, 54, 31, 71] },
  { id: "russia", name: "Russia", langs: ["ru"], bbox: [30, 41, 180, 77] },
  { id: "turkey", name: "Turkey", langs: ["tr"], bbox: [26, 36, 45, 42] },
  { id: "middle-east", name: "Middle East", langs: ["ar", "fa", "he"], bbox: [34, 12, 60, 38] },
  { id: "north-africa", name: "North Africa", langs: ["ar"], bbox: [-17, 20, 34, 37] },
  { id: "japan", name: "Japan", langs: ["ja"], bbox: [129, 30, 146, 46] },
  { id: "korea", name: "Korea", langs: ["ko"], bbox: [124, 33, 131, 43] },
  { id: "china", name: "China & Taiwan", langs: ["zh"], bbox: [73, 18, 135, 53] },
  {
    id: "southeast-asia",
    name: "Southeast Asia",
    langs: ["id", "th", "vi", "tl", "ms"],
    bbox: [92, -11, 141, 21],
  },
  { id: "india", name: "India", langs: ["hi", "bn", "ta", "te", "mr", "ur"], bbox: [68, 6, 97, 36] },
];

const LANG_TO_REGIONS = new Map<string, Region[]>();
for (const r of REGIONS) {
  for (const lang of r.langs) {
    const list = LANG_TO_REGIONS.get(lang) || [];
    list.push(r);
    LANG_TO_REGIONS.set(lang, list);
  }
}

function normalizeLang(code: string): string {
  return code.toLowerCase().split("-")[0];
}

// ---- config ------------------------------------------------------------------
const JETSTREAM_URL =
  "https://jetstream2.us-east.bsky.network/subscribe?wantedCollections=app.bsky.feed.post";
const ALARM_MS = 20 * 1000; // heartbeat / reconnect check cadence
const MINUTE_MS = 60 * 1000;
const HISTORY_LEN = 180; // trailing minutes kept per region (3 hours)
const MIN_HISTORY_FOR_Z = 6; // need at least this many prior minutes before trusting a z-score
const Z_CLAMP = 3;
const MIN_STD = 0.5; // floor so a near-silent region doesn't produce a huge z from tiny noise

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
  });
}

interface RegionStat {
  z: number;
  rate: number; // posts in the most recently completed minute
  mean: number;
  std: number;
}

export class ActivityTracker {
  private state: DurableObjectState;
  private ready: Promise<void>;
  private ws: any = null;
  private reconnectDelay = 1000;

  private currentMinute = 0; // epoch-minutes of the still-open bucket
  private currentCounts: Map<string, number> = new Map();
  private history: Record<string, number[]> = {};
  private zscores: Record<string, RegionStat> = {};
  private lastUpdated = 0;
  private seenCount = 0;

  constructor(state: DurableObjectState) {
    this.state = state;
    this.ready = this.state.blockConcurrencyWhile(async () => {
      const [history, zscores, lastUpdated] = await Promise.all([
        this.state.storage.get<Record<string, number[]>>("history"),
        this.state.storage.get<Record<string, RegionStat>>("zscores"),
        this.state.storage.get<number>("lastUpdated"),
      ]);
      this.history = history ?? {};
      this.zscores = zscores ?? {};
      this.lastUpdated = lastUpdated ?? 0;
    });
    this.connectSocket().catch(() => {});
    this.state.storage.setAlarm(Date.now() + ALARM_MS).catch(() => {});
  }

  // ---- firehose --------------------------------------------------------------
  // Workers connect OUT via fetch() + an Upgrade header (the documented
  // Cloudflare pattern), not the browser `new WebSocket(url)` constructor.
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
    const langs: string[] = Array.isArray(rec.langs) ? rec.langs : [];
    if (!langs.length) return; // can't place a post with no declared language

    this.seenCount++;
    const touched = new Set<string>();
    for (const raw of langs) {
      const lang = normalizeLang(String(raw));
      const regions = LANG_TO_REGIONS.get(lang);
      if (!regions) continue;
      for (const r of regions) touched.add(r.id);
    }
    for (const id of touched) {
      this.currentCounts.set(id, (this.currentCounts.get(id) || 0) + 1);
    }
  }

  // ---- rolling stats -----------------------------------------------------
  private closeMinute(): void {
    for (const r of REGIONS) {
      const count = this.currentCounts.get(r.id) || 0;
      const hist = this.history[r.id] || (this.history[r.id] = []);
      hist.push(count);
      if (hist.length > HISTORY_LEN) hist.shift();
    }
    this.currentCounts = new Map();
  }

  private recomputeZscores(): void {
    const out: Record<string, RegionStat> = {};
    for (const r of REGIONS) {
      const hist = this.history[r.id] || [];
      if (!hist.length) {
        out[r.id] = { z: 0, rate: 0, mean: 0, std: 0 };
        continue;
      }
      const current = hist[hist.length - 1];
      const baseline = hist.slice(0, -1);
      if (baseline.length < MIN_HISTORY_FOR_Z) {
        out[r.id] = { z: 0, rate: current, mean: current, std: 0 };
        continue;
      }
      const mean = baseline.reduce((a, b) => a + b, 0) / baseline.length;
      const variance = baseline.reduce((a, b) => a + (b - mean) ** 2, 0) / baseline.length;
      const std = Math.max(Math.sqrt(variance), MIN_STD);
      let z = (current - mean) / std;
      z = Math.max(-Z_CLAMP, Math.min(Z_CLAMP, z));
      out[r.id] = { z, rate: current, mean, std };
    }
    this.zscores = out;
  }

  // ---- alarm: the tracker's heartbeat ------------------------------------
  async alarm(): Promise<void> {
    await this.ready;
    if (!this.wsOpen()) this.connectSocket().catch(() => {});

    const now = Date.now();
    const nowMinute = Math.floor(now / MINUTE_MS);
    if (this.currentMinute === 0) {
      this.currentMinute = nowMinute; // first tick after (re)start — nothing to close yet
    } else {
      // Close out every minute we've crossed since the last tick (handles a
      // missed tick or a cold start gracefully instead of one giant bucket).
      let guard = 0;
      while (this.currentMinute < nowMinute && guard < HISTORY_LEN) {
        this.closeMinute();
        this.currentMinute++;
        guard++;
      }
    }

    this.recomputeZscores();
    this.lastUpdated = now;
    await this.state.storage.put({
      history: this.history,
      zscores: this.zscores,
      lastUpdated: this.lastUpdated,
    });
    await this.state.storage.setAlarm(now + ALARM_MS);
  }

  // ---- http ---------------------------------------------------------------
  async fetch(request: Request): Promise<Response> {
    await this.ready;
    if (!this.wsOpen()) this.connectSocket().catch(() => {});

    const url = new URL(request.url);
    if (url.pathname === "/api/heat") {
      return json({
        updatedAt: this.lastUpdated || null,
        windowMinutes: HISTORY_LEN,
        seen: this.seenCount,
        regions: this.zscores,
      });
    }
    return json({ error: "not found" }, 404);
  }
}
