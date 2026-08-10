// dosimeter Worker — dosimeter.bisks.net
//
// @cee.wtf asked for "a Situation Detector, a sort of Geiger counter for
// situations, happenings, and circumstances using the bsky firehose." The
// idea here: instead of measuring one account (thrashmeter/thrashradar) or
// one-way follows (seismograph), this measures the whole live post stream
// itself, term by term, looking for words and hashtags whose rate right now
// is running hot against their own normal rate — that's a "situation."
//
// A single Durable Object holds one persistent outbound WebSocket to
// Jetstream (fetch() + an Upgrade header, not `new WebSocket(url)` — the
// documented Workers pattern, same as sites/ratioed / sites/didrank /
// sites/thrashradar), subscribed to just app.bsky.feed.post. Every post's
// text is tokenized into words + hashtags; a bounded in-memory map tracks
// each term's count in the current ~15s tick alongside a slow decaying
// baseline for that same term. A tick where a term's count is both
// absolutely high enough and far enough above its own baseline gets logged
// as a "situation" — term, ratio, a few sample posts (linked by DID+rkey,
// no handle resolution needed, since bsky.app/profile/ accepts a DID
// directly).
//
// Per notes/ideas/store-ours-rederive-theirs.md: the raw term-frequency map
// is bounded, in-memory only, and never written to storage — it can't be
// meaningfully "re-derived" anyway, since it's a live signal over a stream
// that isn't retained anywhere. Only the derived situations log (our own
// work product) is persisted, same spirit as thrashradar's leaderboard.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  READING: DurableObjectNamespace;
}

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
  delete(key: string): Promise<boolean>;
  list<T = unknown>(options?: { prefix?: string }): Promise<Map<string, T>>;
  setAlarm(time: number | Date): Promise<void>;
}
interface DurableObjectState {
  storage: DurableObjectStorage;
  blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T>;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/reading") {
      const id = env.READING.idFromName("global");
      const stub = env.READING.get(id);
      return stub.fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "cache-control": "no-store",
    },
  });
}

// ---- term extraction --------------------------------------------------
// Deliberately simple: no stemming, no real language detection. House style
// favors a pragmatic first pass over perfect NLP — see notes/00-vision.md.

const STOPWORDS = new Set([
  "about", "after", "again", "against", "all", "also", "always", "am", "an", "and", "any", "are",
  "as", "at", "back", "be", "because", "been", "before", "being", "below", "between", "both", "but",
  "by", "can", "cant", "cannot", "could", "did", "didnt", "do", "does", "doing", "dont", "down",
  "during", "each", "even", "ever", "every", "for", "from", "further", "get", "gets", "getting",
  "going", "gonna", "had", "has", "have", "having", "here", "hers", "herself", "him", "himself",
  "his", "how", "into", "isnt", "its", "itself", "just", "know", "like", "look", "many", "maybe",
  "might", "more", "most", "much", "must", "myself", "never", "not", "now", "off", "once", "only",
  "other", "our", "ours", "ourselves", "out", "over", "own", "really", "said", "same", "should",
  "since", "some", "someone", "something", "still", "such", "than", "that", "thats", "the", "their",
  "theirs", "them", "themselves", "then", "there", "theres", "these", "they", "thing", "things",
  "think", "this", "those", "through", "thus", "time", "today", "too", "under", "until", "very",
  "want", "wants", "was", "wasnt", "way", "were", "what", "whats", "when", "where", "which", "while",
  "who", "whom", "why", "will", "with", "wont", "would", "wouldnt", "your", "yours", "yourself",
  "youre", "youve",
]);

function extractTerms(text: string): string[] {
  const cleaned = text
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/@[a-zA-Z0-9.\-]+/g, " ")
    .toLowerCase();

  const hashtags = Array.from(cleaned.matchAll(/#([a-z][a-z0-9_]{1,29})/g)).map((m) => "#" + m[1]);

  const words = cleaned
    .replace(/#[a-z0-9_]+/g, " ")
    .split(/[^a-z0-9']+/)
    .filter((w) => w.length >= 4 && w.length <= 24 && !/^\d+$/.test(w) && !STOPWORDS.has(w.replace(/'/g, "")));

  return Array.from(new Set([...hashtags, ...words])).slice(0, 12);
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

// ---- tuning -------------------------------------------------------------
const TICK_MS = 15_000;
const MIN_TICKS_FOR_BASELINE = 4; // a term needs a minute of history before its baseline is trusted
const MIN_ABS_COUNT = 6; // ignore a spike unless it clears a floor of real volume
const SPIKE_RATIO = 4; // count must be at least this many times the term's own baseline
const BASELINE_DECAY = 0.85; // per-tick EWMA decay — adapts in a few minutes
const MIN_BASELINE_FLOOR = 0.4; // keeps a never-before-seen term's ratio from exploding on its first count
const INACTIVITY_TICKS = 3; // ticks of silence before an active situation is marked faded
// A live run against the real firehose filled 6000 slots in under 3 minutes
// — vocabulary diversity (proper nouns, hashtags, misspellings) runs high.
// An idle TermState is tiny (a few numbers; samples are cleared every tick
// regardless of outcome, so they never accumulate) — 25k entries is still
// only a few MB, well inside a Worker isolate's memory budget.
const MAX_TRACKED_TERMS = 25000; // bound on the in-memory term map — never persisted, see header comment
const MAX_STORED_SITUATIONS = 80; // bound on persisted situation records
const MAX_SAMPLES_PER_SITUATION = 3;
const RATE_HISTORY_LEN = 40; // ~10 minutes of tick history for the pace sparkline
const STALE_TERM_MS = 5 * 60 * 1000; // evict a term that's had near-zero baseline and no hits in this long

const JETSTREAM_URL =
  "https://jetstream2.us-east.bsky.network/subscribe?wantedCollections=app.bsky.feed.post";

interface TermState {
  count: number; // hits accumulated in the current tick
  baseline: number; // decaying EWMA of per-tick counts
  ticksObserved: number;
  lastActiveTick: number;
  samples: Sample[];
}

interface Sample {
  text: string;
  did: string;
  rkey: string;
}

interface SituationRecord {
  term: string;
  firstSeen: number;
  lastSeen: number;
  peakRatio: number;
  lastRatio: number;
  peakCount: number;
  active: boolean;
  samples: Sample[];
}

interface ClientSample {
  text: string;
  url: string;
}

interface ClientSituation {
  term: string;
  firstSeen: number;
  lastSeen: number;
  peakRatio: number;
  lastRatio: number;
  peakCount: number;
  active: boolean;
  samples: ClientSample[];
}

function shapeForClient(r: SituationRecord): ClientSituation {
  return {
    term: r.term,
    firstSeen: r.firstSeen,
    lastSeen: r.lastSeen,
    peakRatio: Math.round(r.peakRatio * 10) / 10,
    lastRatio: Math.round(r.lastRatio * 10) / 10,
    peakCount: r.peakCount,
    active: r.active,
    // Don't encodeURIComponent the DID/rkey: both are already made of
    // URL-safe characters, and bsky.app's profile route doesn't decode the
    // path segment before resolving the actor — an encoded "did:plc:xyz"
    // (colons -> %3A) 404s where the literal DID resolves fine. Same gotcha
    // documented in sites/thrashradar/src/index.ts's renderShare.
    samples: r.samples.map((s) => ({
      text: truncate(s.text, 180),
      url: `https://bsky.app/profile/${s.did}/post/${s.rkey}`,
    })),
  };
}

// level is a flavor number, not a rigorous statistic: each currently-active
// situation contributes its ratio (capped so one runaway term can't alone
// pin the needle), summed and scaled onto a 0-100 dial.
function computeLevel(active: ClientSituation[]): number {
  if (!active.length) return 0;
  const score = active.reduce((sum, r) => sum + Math.min(15, r.lastRatio), 0);
  return Math.max(0, Math.min(100, Math.round(score * 5)));
}

export class Dosimeter {
  private state: DurableObjectState;
  private ready: Promise<void>;

  // ---- live, in-memory, never persisted (see header comment) ----
  private terms: Map<string, TermState> = new Map();
  private totalThisTick = 0;
  private rateHistory: { t: number; rate: number }[] = [];
  private ws: any = null;
  private reconnectDelay = 1000;

  // ---- cached once per alarm tick, served to every poll in between ----
  private active: ClientSituation[] = [];
  private recent: ClientSituation[] = [];
  private level = 0;
  private since = 0;

  constructor(state: DurableObjectState) {
    this.state = state;
    this.ready = this.state.blockConcurrencyWhile(async () => {
      const since = await this.state.storage.get<number>("meta:since");
      if (typeof since === "number") {
        this.since = since;
      } else {
        this.since = Date.now();
        await this.state.storage.put({ "meta:since": this.since });
      }
    });
    this.connectSocket().catch(() => {});
    this.state.storage.setAlarm(Date.now() + TICK_MS).catch(() => {});
  }

  // ---- firehose ----
  // Workers connect OUT to a WebSocket server via fetch() + an Upgrade
  // header, not the browser-style `new WebSocket(url)` constructor — same
  // as sites/ratioed, sites/didrank, sites/thrashradar.
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
    if (!commit || commit.operation !== "create" || commit.collection !== "app.bsky.feed.post") return;
    const record = commit.record;
    const did = evt.did;
    const rkey = commit.rkey;
    if (!record || typeof record.text !== "string" || typeof did !== "string" || typeof rkey !== "string") return;

    this.totalThisTick++;
    const terms = extractTerms(record.text);
    if (!terms.length) return;

    for (const term of terms) {
      let st = this.terms.get(term);
      if (!st) {
        if (this.terms.size >= MAX_TRACKED_TERMS) continue; // tracking map is full — drop new terms, don't grow unbounded
        st = { count: 0, baseline: 0, ticksObserved: 0, lastActiveTick: Date.now(), samples: [] };
        this.terms.set(term, st);
      }
      st.count++;
      st.lastActiveTick = Date.now();
      if (st.samples.length < MAX_SAMPLES_PER_SITUATION) {
        st.samples.push({ text: record.text, did, rkey });
      }
    }
  }

  // ---- alarm: reconnect heartbeat + spike detection + persistence ----
  async alarm(): Promise<void> {
    await this.ready;
    if (!this.wsOpen()) this.connectSocket().catch(() => {});

    const now = Date.now();
    const rate = this.totalThisTick / (TICK_MS / 1000);
    this.totalThisTick = 0;
    this.rateHistory.push({ t: now, rate });
    if (this.rateHistory.length > RATE_HISTORY_LEN) this.rateHistory.shift();

    const spikesThisTick: { term: string; count: number; ratio: number; samples: Sample[] }[] = [];

    for (const [term, st] of this.terms) {
      const count = st.count;
      const samples = st.samples;
      st.count = 0;
      st.samples = [];

      if (count > 0 && st.ticksObserved >= MIN_TICKS_FOR_BASELINE) {
        const ratio = count / Math.max(st.baseline, MIN_BASELINE_FLOOR);
        if (count >= MIN_ABS_COUNT && ratio >= SPIKE_RATIO) {
          spikesThisTick.push({ term, count, ratio, samples });
        }
      }

      st.baseline = st.baseline * BASELINE_DECAY + count * (1 - BASELINE_DECAY);
      st.ticksObserved++;
    }

    // evict terms that have gone quiet and settled near zero, so the map
    // doesn't grow unbounded with one-off words seen only once ever
    for (const [term, st] of this.terms) {
      if (st.baseline < 0.05 && now - st.lastActiveTick > STALE_TERM_MS) this.terms.delete(term);
    }

    for (const s of spikesThisTick) {
      const key = `situation:${s.term}`;
      const existing = await this.state.storage.get<SituationRecord>(key);
      const record: SituationRecord = {
        term: s.term,
        firstSeen: existing ? existing.firstSeen : now,
        lastSeen: now,
        peakRatio: Math.max(existing ? existing.peakRatio : 0, s.ratio),
        lastRatio: s.ratio,
        peakCount: Math.max(existing ? existing.peakCount : 0, s.count),
        active: true,
        samples: s.samples.length ? s.samples : existing ? existing.samples : [],
      };
      await this.state.storage.put({ [key]: record });
    }

    const activeTermsThisTick = new Set(spikesThisTick.map((s) => s.term));
    let stored = [...(await this.state.storage.list<SituationRecord>({ prefix: "situation:" })).entries()];

    for (const [key, rec] of stored) {
      if (rec.active && !activeTermsThisTick.has(rec.term) && now - rec.lastSeen > INACTIVITY_TICKS * TICK_MS) {
        rec.active = false;
        await this.state.storage.put({ [key]: rec });
      }
    }

    if (stored.length > MAX_STORED_SITUATIONS) {
      stored.sort((a, b) => a[1].lastSeen - b[1].lastSeen); // oldest first
      const toDrop = stored.slice(0, stored.length - MAX_STORED_SITUATIONS);
      for (const [key] of toDrop) await this.state.storage.delete(key);
      stored = stored.slice(stored.length - MAX_STORED_SITUATIONS);
    }

    const shaped = stored.map(([, rec]) => shapeForClient(rec)).sort((a, b) => b.lastSeen - a.lastSeen);
    this.active = shaped.filter((r) => r.active);
    this.recent = shaped.slice(0, 20);
    this.level = computeLevel(this.active);

    await this.state.storage.setAlarm(now + TICK_MS);
  }

  async fetch(request: Request): Promise<Response> {
    await this.ready;
    if (!this.wsOpen()) this.connectSocket().catch(() => {});

    const url = new URL(request.url);
    if (url.pathname === "/api/reading" && request.method === "GET") {
      const lastRate = this.rateHistory.length ? this.rateHistory[this.rateHistory.length - 1].rate : 0;
      return json({
        cpm: Math.round(lastRate * 60),
        level: this.level,
        watching: this.terms.size,
        since: this.since,
        active: this.active,
        recent: this.recent,
        history: this.rateHistory.map((h) => Math.round(h.rate * 60)),
      });
    }
    return json({ error: "not found" }, 404);
  }
}
