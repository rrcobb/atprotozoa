// vibepantheon Worker — vibepantheon.bisks.net
//
// @antiali.as's idea: "a pantheon of vibes — scan the jet stream for posts
// matching /the vibes are/gi and tabulate the next phrase up to any
// punctuation." So: watch the live firehose for that exact phrase, take
// whatever comes right after it up to the next punctuation mark, and keep a
// running tally of every distinct answer anyone's given. The most-sworn-to
// vibe sits at the top of the pantheon.
//
// No AppView verification needed here (unlike sites/quotehof) — the phrase
// itself lives entirely in the firehose record, nothing to re-check against
// a hydrated view. The only AppView call is a light, best-effort profile
// lookup (getProfiles, public + unauthenticated) so the leaderboard can show
// a face and handle next to each vibe's most recent believer.
//
// Same shape as sites/quotehof/sites/ratioed: one Durable Object ("global")
// holding the live tally, a Jetstream websocket connected via fetch()+Upgrade
// (the documented Cloudflare pattern), and an alarm as the tick/heartbeat.

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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      const id = env.TRACKER.idFromName("global");
      const stub = env.TRACKER.get(id);
      return stub.fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};

// ---- config ----------------------------------------------------------------
const JETSTREAM_URL =
  "https://jetstream2.us-east.bsky.network/subscribe?wantedCollections=app.bsky.feed.post";
const APPVIEW = "https://public.api.bsky.app/xrpc";
const PHRASE_RE = /the vibes are/gi;
// "Up to any punctuation" — Unicode's punctuation category, so ., !, ?, ;,
// :, quotes, dashes, brackets all count as a boundary, not just a curated
// ASCII list.
const PUNCT_RE = /\p{P}/u;

const ALARM_MS = 30 * 1000; // tick cadence — also the reconnect heartbeat
const MAX_TRACKED = 1500; // safety valve on total distinct phrases kept
const MAX_RECENT = 60; // ring buffer of most recent raw matches
const BOARD_SIZE = 100; // how many ranked entries the API returns
const PROFILE_TTL_MS = 60 * 60 * 1000; // re-hydrate a profile at most hourly
const MAX_PROFILE_FETCH_PER_TICK = 100; // 4 getProfiles batches of 25

interface Deity {
  key: string; // normalized (lowercased, whitespace-collapsed) phrase
  display: string; // first-seen casing, what the UI shows
  count: number;
  firstSeen: number;
  lastSeen: number;
  lastUri: string;
  lastDid: string;
  lastRkey: string;
  lastText: string;
}

interface FeedEntry {
  phrase: string;
  did: string;
  rkey: string;
  uri: string;
  text: string;
  createdAt: number;
}

interface Profile {
  handle: string;
  displayName: string;
  avatar: string;
  fetchedAt: number;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

// Every phrase that follows "the vibes are" in this post, up to (but not
// including) the next punctuation mark. A post can only trip this a
// handful of times at most, but the source regex is /g so we honor that.
function extractPhrases(text: string): string[] {
  const out: string[] = [];
  PHRASE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PHRASE_RE.exec(text))) {
    let rest = text.slice(m.index + m[0].length);
    rest = rest.replace(/^[ \t]+/, ""); // eat the space before the phrase, not punctuation after it
    const p = PUNCT_RE.exec(rest);
    const phrase = normalizeWhitespace(p ? rest.slice(0, p.index) : rest);
    if (phrase) out.push(phrase.slice(0, 140));
    if (m[0].length === 0) PHRASE_RE.lastIndex++; // guard against zero-length matches
  }
  return out;
}

export class VibeTracker {
  private state: DurableObjectState;
  private ready: Promise<void>;
  private deities: Map<string, Deity> = new Map();
  private recentFeed: FeedEntry[] = [];
  private profiles: Map<string, Profile> = new Map();
  private board: Deity[] = [];
  private totalMatches = 0;
  private lastUpdated = 0;
  private ws: any = null;
  private reconnectDelay = 1000;

  constructor(state: DurableObjectState) {
    this.state = state;
    this.ready = this.state.blockConcurrencyWhile(async () => {
      const [deities, recentFeed, totalMatches, lastUpdated] = await Promise.all([
        this.state.storage.get<Deity[]>("deities"),
        this.state.storage.get<FeedEntry[]>("recentFeed"),
        this.state.storage.get<number>("totalMatches"),
        this.state.storage.get<number>("lastUpdated"),
      ]);
      for (const d of deities ?? []) this.deities.set(d.key, d);
      this.recentFeed = recentFeed ?? [];
      this.totalMatches = totalMatches ?? 0;
      this.lastUpdated = lastUpdated ?? 0;
      this.recomputeBoard();
    });
    this.connectSocket().catch(() => {});
    this.state.storage.setAlarm(Date.now() + ALARM_MS).catch(() => {});
  }

  // ---- firehose ------------------------------------------------------------
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
    if (!rec) return;
    const text = typeof rec.text === "string" ? rec.text : "";
    if (!text || !/the vibes are/i.test(text)) return; // cheap pre-filter before the /g scan

    const phrases = extractPhrases(text);
    if (!phrases.length) return;

    const now = Date.now();
    const uri = `at://${evt.did}/app.bsky.feed.post/${commit.rkey}`;
    for (const phrase of phrases) {
      this.tally(phrase, evt.did, commit.rkey, uri, text, now);
    }
  }

  private tally(phrase: string, did: string, rkey: string, uri: string, text: string, now: number): void {
    const key = phrase.toLowerCase();
    let d = this.deities.get(key);
    if (!d) {
      d = { key, display: phrase, count: 0, firstSeen: now, lastSeen: now, lastUri: uri, lastDid: did, lastRkey: rkey, lastText: text.slice(0, 300) };
      this.deities.set(key, d);
    }
    d.count++;
    d.lastSeen = now;
    d.lastUri = uri;
    d.lastDid = did;
    d.lastRkey = rkey;
    d.lastText = text.slice(0, 300);
    this.totalMatches++;

    this.recentFeed.unshift({ phrase: d.display, did, rkey, uri, text: text.slice(0, 300), createdAt: now });
    if (this.recentFeed.length > MAX_RECENT) this.recentFeed.length = MAX_RECENT;
  }

  // Long-tail one-off phrases pile up forever otherwise — once over the
  // cap, drop the least-sworn, longest-stale entries first.
  private pruneDeities(): void {
    if (this.deities.size <= MAX_TRACKED) return;
    const all = Array.from(this.deities.values()).sort(
      (a, b) => a.count - b.count || a.lastSeen - b.lastSeen,
    );
    const drop = all.slice(0, this.deities.size - MAX_TRACKED);
    for (const d of drop) this.deities.delete(d.key);
  }

  private recomputeBoard(): void {
    this.board = Array.from(this.deities.values())
      .sort((a, b) => b.count - a.count || b.lastSeen - a.lastSeen)
      .slice(0, BOARD_SIZE);
  }

  // ---- AppView (best-effort profile hydration only) ------------------------
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
    for (const d of this.board) wanted.add(d.lastDid);
    for (const f of this.recentFeed) wanted.add(f.did);

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

  private profileFor(did: string): { handle: string; displayName: string; avatar: string } {
    const p = this.profiles.get(did);
    return { handle: p?.handle || "", displayName: p?.displayName || "", avatar: p?.avatar || "" };
  }

  // ---- alarm: the tracker's heartbeat ---------------------------------------
  async alarm(): Promise<void> {
    await this.ready;
    if (!this.wsOpen()) this.connectSocket().catch(() => {});

    this.pruneDeities();
    this.recomputeBoard();
    await this.hydrateProfiles().catch(() => {});

    this.lastUpdated = Date.now();
    await this.state.storage.put({
      deities: Array.from(this.deities.values()),
      recentFeed: this.recentFeed,
      totalMatches: this.totalMatches,
      lastUpdated: this.lastUpdated,
    });
    await this.state.storage.setAlarm(this.lastUpdated + ALARM_MS);
  }

  // ---- http ------------------------------------------------------------------
  async fetch(request: Request): Promise<Response> {
    await this.ready;
    if (!this.wsOpen()) this.connectSocket().catch(() => {});

    const url = new URL(request.url);
    if (url.pathname === "/api/leaderboard") {
      // Recompute from the live in-memory tally rather than waiting on the
      // next alarm tick — the alarm's job is persistence + profile hydration
      // on a slower cadence, not gating how fresh the board looks.
      this.recomputeBoard();
      return json({
        updatedAt: Date.now(),
        totalMatches: this.totalMatches,
        tracked: this.deities.size,
        top: this.board.map((d) => ({
          phrase: d.display,
          count: d.count,
          firstSeen: d.firstSeen,
          lastSeen: d.lastSeen,
          lastUri: d.lastUri,
          lastDid: d.lastDid,
          lastRkey: d.lastRkey,
          lastText: d.lastText,
          ...this.profileFor(d.lastDid),
        })),
        recent: this.recentFeed.slice(0, 20).map((f) => ({
          ...f,
          ...this.profileFor(f.did),
        })),
      });
    }
    return json({ error: "not found" }, 404);
  }
}
