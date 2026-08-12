// still2016 Worker — still2016.bisks.net
//
// mfzx.net asked for "something that listens to the firehose for posts that
// could have conceivably originated 10 years ago, i.e. posts that make no
// reference to contemporary events/culture/persons from after the current
// date in 2016." Read literally that's undecidable — you can't prove a post
// *doesn't* gesture at anything from the last ten years — so this takes the
// pragmatic reading instead: watch the live firehose, and flag posts that
// clear a quality bar (enough real prose to judge) and trip none of a large
// blocklist of markers that are unambiguously post-2016 (named people who
// only became relevant after 2016, events, apps, AI tooling, slang, or an
// explicit year 2017+). Absence of evidence isn't proof of period-accuracy —
// it's "nothing here rules this out," not a certificate.
//
// Same shape as sites/dosimeter: a single Durable Object holds one
// persistent outbound Jetstream WebSocket (the fetch()-with-Upgrade-header
// pattern from sites/ratioed / sites/thrashradar), subscribed to just
// app.bsky.feed.post. Matches buffer in memory and flush to storage on a
// tick, same as dosimeter's situations log — the raw scan stream itself is
// never persisted (notes/ideas/store-ours-rederive-theirs.md), only the
// derived candidate log + running counters.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  CAPSULE: DurableObjectNamespace;
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
    if (url.pathname === "/api/feed") {
      const id = env.CAPSULE.idFromName("global");
      const stub = env.CAPSULE.get(id);
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

// ---- the blocklist ------------------------------------------------------
// Deliberately simple: substring/phrase matching with word boundaries, no
// real NLP. House style favors a pragmatic first pass over a rigorous
// classifier — see notes/00-vision.md. Grouped by category purely for
// editability; all of it gets compiled into one regex.

const BLOCK_PHRASES = [
  // pandemic
  "covid-19", "covid19", "sars-cov-2", "social distancing", "contact tracing",
  "long covid", "delta variant", "omicron variant", "vaccine mandate",
  "booster shot", "zoom fatigue", "zoom call fatigue", "work from home era",

  // US politics & events, 2017+
  "george floyd", "breonna taylor", "capitol riot", "capitol hill riot",
  "january 6", "jan 6th", "roe v wade", "roe v. wade", "dobbs decision",
  "stormy daniels", "mueller report", "impeachment trial", "kamala harris",
  "trump administration", "biden administration",
  "pete buttigieg", "rfk jr", "vivek ramaswamy", "trump assassination attempt",
  "butler pennsylvania rally", "great resignation", "quiet quitting",
  "silicon valley bank", "svb collapse", "banking crisis", "student loan forgiveness",
  "department of government efficiency", "doge department",

  // world events, 2017+
  "war in ukraine", "ukraine war", "russian invasion", "russia invades ukraine",
  "invasion of ukraine", "president zelensky", "october 7th attack",
  "hamas attack", "israel gaza war", "gaza war", "afghanistan withdrawal",
  "kabul airport", "queen elizabeth died", "queen elizabeth's death",
  "death of queen elizabeth", "king charles coronation", "notre dame fire",
  "australian bushfires", "beirut explosion", "javier milei", "liz truss",
  "rishi sunak", "keir starmer",

  // AI / tech, 2017+
  "chatgpt", "openai", "gpt-4", "gpt-3", "gpt4", "gpt3", "midjourney",
  "dall-e", "stable diffusion", "generative ai", "ai generated", "ai-generated",
  "large language model", "prompt engineering", "deepfake", "claude ai",
  "anthropic claude", "google gemini", "microsoft copilot", "github copilot",
  "grok ai", "vision pro", "apple vision pro", "meta quest", "metaverse",
  "web3", "mint an nft", "nft drop", "nft collection",

  // apps & platforms, 2017+
  "bluesky app", "mastodon.social", "threads app", "clubhouse app",
  "vine shut down", "onlyfans", "be real app", "bereal app", "tiktok ban",

  // gadgets, 2017+
  "iphone 11", "iphone 12", "iphone 13", "iphone 14", "iphone 15", "iphone 16",
  "galaxy s20", "galaxy s21", "galaxy s22", "galaxy s23", "galaxy s24",
  "playstation 5", "xbox series x", "nintendo switch", "cybertruck",

  // culture, 2017+
  "barbenheimer", "barbie movie", "oppenheimer movie", "wicked movie",
  "eras tour", "taylor swift eras", "travis kelce", "old town road",
  "baby shark", "among us", "apex legends", "wordle puzzle", "squid game",
  "andrew tate", "will smith slap", "oscars slap", "wallstreetbets",
  "meme stock", "gamestop stock", "elon buys twitter", "elon musk buys twitter",
  "twitter is now x", "twitter rebrands to x", "renamed to x", "elon takes over twitter",
];

const BLOCK_WORDS = new Set([
  "covid", "coronavirus", "pandemic", "quarantine", "lockdown", "omicron",
  "monkeypox", "mpox", "ozempic", "chatgpt", "bluesky", "tiktok", "metaverse",
  "nft", "nfts", "zelenskyy", "deepfake", "deepfakes", "genai", "llm", "llms",
  "midjourney", "vaxxed", "unvaxxed", "boosted", "hybrid-work", "hybridwork",
  "quiethiring", "layoffs2023", "cryptowinter",
]);

const YEAR_RE = /\b20(1[7-9]|[2-9]\d)\b/; // any explicit 2017-2099

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const PHRASE_RE = new RegExp(
  "\\b(" + BLOCK_PHRASES.map(escapeRe).join("|") + ")\\b",
  "i",
);

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

function realWordCount(text: string): number {
  const cleaned = text
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/@[a-zA-Z0-9.\-]+/g, " ")
    .toLowerCase();
  const words = cleaned
    .split(/[^a-z0-9']+/)
    .filter((w) => w.length >= 3 && w.length <= 24 && !/^\d+$/.test(w) && !STOPWORDS.has(w.replace(/'/g, "")));
  return new Set(words).size;
}

// Returns true if the post could conceivably be from 2016: enough real
// prose to judge, and none of the post-2016 markers.
function couldBe2016(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 20 || trimmed.length > 400) return false;
  if (realWordCount(trimmed) < 4) return false;
  const lower = trimmed.toLowerCase();
  if (YEAR_RE.test(lower)) return false;
  if (PHRASE_RE.test(lower)) return false;
  const tokens = lower.replace(/[^a-z0-9'#\s]/g, " ").split(/\s+/);
  for (const t of tokens) {
    if (BLOCK_WORDS.has(t)) return false;
  }
  return true;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

// ---- tuning ---------------------------------------------------------------
const TICK_MS = 20_000;
const MAX_STORED = 60;
const MAX_BUFFER_PER_TICK = 20; // don't let one hot tick flood storage
const MAX_SEEN_KEYS = 500; // bound on the redelivery-dedup set

const JETSTREAM_URL =
  "https://jetstream2.us-east.bsky.network/subscribe?wantedCollections=app.bsky.feed.post";

interface CapsuleEntry {
  text: string;
  did: string;
  rkey: string;
  matchedAt: number;
}

interface ClientEntry {
  text: string;
  url: string;
  matchedAt: number;
}

function shapeForClient(e: CapsuleEntry): ClientEntry {
  return {
    text: truncate(e.text, 260),
    // Don't encodeURIComponent the DID/rkey — bsky.app's profile route
    // doesn't decode the path segment, so an encoded "did:plc:xyz" 404s
    // where the literal DID resolves fine. Same gotcha as sites/dosimeter.
    url: `https://bsky.app/profile/${e.did}/post/${e.rkey}`,
    matchedAt: e.matchedAt,
  };
}

export class Capsule {
  private state: DurableObjectState;
  private ready: Promise<void>;

  // ---- live, in-memory ----
  private ws: any = null;
  private connecting = false;
  private reconnectDelay = 1000;
  private scannedThisTick = 0;
  private eligibleThisTick = 0;
  private matchedThisTick = 0;
  private buffer: CapsuleEntry[] = [];
  // Jetstream doesn't guarantee exactly-once delivery — a bounded recent-keys
  // set keeps a redelivered commit from being logged as a second match.
  private seenKeys: Set<string> = new Set();
  private seenQueue: string[] = [];

  // ---- persisted ----
  private totalScanned = 0;
  private totalEligible = 0;
  private totalMatched = 0;
  private since = 0;
  private entries: CapsuleEntry[] = [];
  private rateHistory: { t: number; matched: number }[] = [];

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
      this.totalScanned = (await this.state.storage.get<number>("meta:scanned")) ?? 0;
      this.totalEligible = (await this.state.storage.get<number>("meta:eligible")) ?? 0;
      this.totalMatched = (await this.state.storage.get<number>("meta:matched")) ?? 0;
      this.entries = (await this.state.storage.get<CapsuleEntry[]>("entries")) ?? [];
    });
    this.connectSocket().catch(() => {});
    this.state.storage.setAlarm(Date.now() + TICK_MS).catch(() => {});
  }

  // ---- firehose ----
  // Workers connect OUT to a WebSocket server via fetch() + an Upgrade
  // header, not the browser-style `new WebSocket(url)` constructor — same
  // as sites/dosimeter, sites/ratioed, sites/thrashradar.
  private async connectSocket(): Promise<void> {
    // Both the constructor and every fetch()/alarm() call this when
    // wsOpen() is false — without this guard, a request arriving while the
    // constructor's own connectSocket() is still awaiting the initial
    // fetch() (this.ws not yet set) opens a second concurrent Jetstream
    // connection, and every commit gets processed (and stored) twice.
    if (this.connecting || this.wsOpen()) return;
    this.connecting = true;
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
    } finally {
      this.connecting = false;
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

    this.scannedThisTick++;

    // langs is metadata the post already carries — not real language
    // detection, but a free, honest signal to skip non-English text the
    // English-only blocklist can't judge.
    if (Array.isArray(record.langs) && record.langs.length && !record.langs.includes("en")) return;

    this.eligibleThisTick++;
    if (!couldBe2016(record.text)) return;

    const key = did + "/" + rkey;
    if (this.seenKeys.has(key)) return;
    this.seenKeys.add(key);
    this.seenQueue.push(key);
    if (this.seenQueue.length > MAX_SEEN_KEYS) {
      const evict = this.seenQueue.shift();
      if (evict) this.seenKeys.delete(evict);
    }

    this.matchedThisTick++;
    if (this.buffer.length < MAX_BUFFER_PER_TICK) {
      this.buffer.push({ text: record.text, did, rkey, matchedAt: Date.now() });
    }
  }

  // ---- alarm: reconnect heartbeat + flush buffer to storage ----
  async alarm(): Promise<void> {
    await this.ready;
    if (!this.wsOpen()) this.connectSocket().catch(() => {});

    const now = Date.now();
    this.totalScanned += this.scannedThisTick;
    this.totalEligible += this.eligibleThisTick;
    this.totalMatched += this.matchedThisTick;

    this.rateHistory.push({ t: now, matched: this.matchedThisTick });
    if (this.rateHistory.length > 40) this.rateHistory.shift();

    this.scannedThisTick = 0;
    this.eligibleThisTick = 0;
    this.matchedThisTick = 0;

    if (this.buffer.length) {
      this.entries = [...this.buffer.reverse(), ...this.entries].slice(0, MAX_STORED);
      this.buffer = [];
    }

    await this.state.storage.put({
      "meta:scanned": this.totalScanned,
      "meta:eligible": this.totalEligible,
      "meta:matched": this.totalMatched,
      entries: this.entries,
    });

    await this.state.storage.setAlarm(now + TICK_MS);
  }

  async fetch(request: Request): Promise<Response> {
    await this.ready;
    if (!this.wsOpen()) this.connectSocket().catch(() => {});

    const url = new URL(request.url);
    if (url.pathname === "/api/feed" && request.method === "GET") {
      const recentMatched = this.rateHistory.reduce((s, h) => s + h.matched, 0);
      return json({
        since: this.since,
        totalScanned: this.totalScanned,
        totalEligible: this.totalEligible,
        totalMatched: this.totalMatched,
        matchRatePct:
          this.totalEligible > 0 ? Math.round((this.totalMatched / this.totalEligible) * 1000) / 10 : 0,
        perMinute: this.rateHistory.length
          ? Math.round((recentMatched / (this.rateHistory.length * (TICK_MS / 1000))) * 60 * 10) / 10
          : 0,
        entries: this.entries.map(shapeForClient),
      });
    }
    return json({ error: "not found" }, 404);
  }
}
