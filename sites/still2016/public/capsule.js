const JETSTREAM_URL =
  "wss://jetstream2.us-east.bsky.network/subscribe?wantedCollections=app.bsky.feed.post";

const MAX_STORED = 60;
const MAX_SEEN_KEYS = 500;

const BLOCK_PHRASES = [
  "covid-19", "covid19", "sars-cov-2", "social distancing", "contact tracing",
  "long covid", "delta variant", "omicron variant", "vaccine mandate",
  "booster shot", "zoom fatigue", "zoom call fatigue", "work from home era",
  "george floyd", "breonna taylor", "capitol riot", "capitol hill riot",
  "january 6", "jan 6th", "roe v wade", "roe v. wade", "dobbs decision",
  "stormy daniels", "mueller report", "impeachment trial", "kamala harris",
  "trump administration", "biden administration", "pete buttigieg", "rfk jr",
  "vivek ramaswamy", "trump assassination attempt", "butler pennsylvania rally",
  "great resignation", "quiet quitting", "silicon valley bank", "svb collapse",
  "banking crisis", "student loan forgiveness", "department of government efficiency",
  "doge department", "war in ukraine", "ukraine war", "russian invasion",
  "russia invades ukraine", "invasion of ukraine", "president zelensky",
  "october 7th attack", "hamas attack", "israel gaza war", "gaza war",
  "afghanistan withdrawal", "kabul airport", "queen elizabeth died",
  "queen elizabeth's death", "death of queen elizabeth", "king charles coronation",
  "notre dame fire", "australian bushfires", "beirut explosion", "javier milei",
  "liz truss", "rishi sunak", "keir starmer", "chatgpt", "openai", "gpt-4",
  "gpt-3", "gpt4", "gpt3", "midjourney", "dall-e", "stable diffusion",
  "generative ai", "ai generated", "ai-generated", "large language model",
  "prompt engineering", "deepfake", "claude ai", "anthropic claude",
  "google gemini", "microsoft copilot", "github copilot", "grok ai", "vision pro",
  "apple vision pro", "meta quest", "metaverse", "web3", "mint an nft",
  "nft drop", "nft collection", "bluesky app", "mastodon.social", "threads app",
  "clubhouse app", "vine shut down", "onlyfans", "be real app", "bereal app",
  "tiktok ban", "iphone 11", "iphone 12", "iphone 13", "iphone 14", "iphone 15",
  "iphone 16", "galaxy s20", "galaxy s21", "galaxy s22", "galaxy s23", "galaxy s24",
  "playstation 5", "xbox series x", "nintendo switch", "cybertruck", "barbenheimer",
  "barbie movie", "oppenheimer movie", "wicked movie", "eras tour", "taylor swift eras",
  "travis kelce", "old town road", "baby shark", "among us", "apex legends",
  "wordle puzzle", "squid game", "andrew tate", "will smith slap", "oscars slap",
  "wallstreetbets", "meme stock", "gamestop stock", "elon buys twitter",
  "elon musk buys twitter", "twitter is now x", "twitter rebrands to x",
  "renamed to x", "elon takes over twitter",
];

const BLOCK_WORDS = new Set([
  "covid", "coronavirus", "pandemic", "quarantine", "lockdown", "omicron", "monkeypox",
  "mpox", "ozempic", "chatgpt", "bluesky", "tiktok", "metaverse", "nft", "nfts",
  "zelenskyy", "deepfake", "deepfakes", "genai", "llm", "llms", "midjourney", "vaxxed",
  "unvaxxed", "boosted", "hybrid-work", "hybridwork", "quiethiring", "layoffs2023",
  "cryptowinter",
]);

const YEAR_RE = /\b20(1[7-9]|[2-9]\d)\b/;
const STOPWORDS = new Set(
  (
    "about after again against all also always am an and any are as at back be because been before being below between both but by can cant cannot could did didnt do does doing dont down during each even ever every for from further get gets getting going gonna had has have having here hers herself him himself his how into isnt its itself just know like look many maybe might more most much must myself never not now off once only other our ours ourselves out over own really said same should since some someone something still such than that thats the their theirs them themselves then there theres these they thing things think this those through thus time today too under until very want wants was wasnt way were what whats when where which while who whom why will with wont would wouldnt your yours yourself youre youve"
  ).split(/\s+/)
);

function escapeRe(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const PHRASE_RE = new RegExp("\\b(" + BLOCK_PHRASES.map(escapeRe).join("|") + ")\\b", "i");

function realWordCount(text) {
  const cleaned = text
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/@[a-zA-Z0-9.\-]+/g, " ")
    .toLowerCase();
  const words = cleaned
    .split(/[^a-z0-9']+/)
    .filter((word) => word.length >= 3 && word.length <= 24 && !/^\d+$/.test(word) && !STOPWORDS.has(word.replace(/'/g, "")));
  return new Set(words).size;
}

function couldBe2016(text) {
  const trimmed = text.trim();
  if (trimmed.length < 20 || trimmed.length > 400) return false;
  if (realWordCount(trimmed) < 4) return false;
  const lower = trimmed.toLowerCase();
  if (YEAR_RE.test(lower) || PHRASE_RE.test(lower)) return false;
  const tokens = lower.replace(/[^a-z0-9'#\s]/g, " ").split(/\s+/);
  return !tokens.some((token) => BLOCK_WORDS.has(token));
}

function truncate(text, max) {
  return text.length <= max ? text : text.slice(0, max - 1).trimEnd() + "…";
}

function shapeForClient(entry) {
  return {
    text: truncate(entry.text, 260),
    url: `https://bsky.app/profile/${entry.did}/post/${entry.rkey}`,
    matchedAt: entry.matchedAt,
  };
}

export class CapsuleIndex {
  constructor({ onUpdate } = {}) {
    this.onUpdate = typeof onUpdate === "function" ? onUpdate : () => {};
    this.started = false;
    this.paused = false;
    this.socket = null;
    this.reconnectTimer = null;
    this.reconnectDelay = 1000;
    this.emitTimer = null;
    this.since = 0;
    this.totalScanned = 0;
    this.totalEligible = 0;
    this.totalMatched = 0;
    this.entries = [];
    this.matchedTimes = [];
    this.seenKeys = new Set();
    this.seenQueue = [];
    this.error = "";
    this.visibilityHandler = () => {
      if (document.visibilityState === "hidden") this.pause();
      else this.resume();
    };
    document.addEventListener("visibilitychange", this.visibilityHandler);
  }

  start() {
    if (this.started) return;
    this.started = true;
    this.since = Date.now();
    this.paused = document.visibilityState === "hidden";
    this.emit();
    if (!this.paused) this.connect();
  }

  snapshot() {
    const now = Date.now();
    this.matchedTimes = this.matchedTimes.filter((time) => now - time <= 60000);
    return {
      since: this.since,
      totalScanned: this.totalScanned,
      totalEligible: this.totalEligible,
      totalMatched: this.totalMatched,
      matchRatePct: this.totalEligible > 0 ? Math.round((this.totalMatched / this.totalEligible) * 1000) / 10 : 0,
      perMinute: this.matchedTimes.length,
      connected: !!this.socket && this.socket.readyState === WebSocket.OPEN,
      error: this.error,
      entries: this.entries.map(shapeForClient),
    };
  }

  emit() {
    try {
      this.onUpdate(this.snapshot());
    } catch (err) {
      console.error("still2016 render failed", err);
    }
  }

  scheduleEmit() {
    if (this.emitTimer) return;
    this.emitTimer = setTimeout(() => {
      this.emitTimer = null;
      this.emit();
    }, 100);
  }

  pause() {
    this.paused = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    if (this.socket) {
      try {
        this.socket.close();
      } catch (_) {
        // The browser may already have closed the socket.
      }
    }
    this.socket = null;
    this.emit();
  }

  resume() {
    this.paused = false;
    if (!this.started) return;
    this.connect();
    this.emit();
  }

  dispose() {
    this.pause();
    document.removeEventListener("visibilitychange", this.visibilityHandler);
    if (this.emitTimer) clearTimeout(this.emitTimer);
  }

  connect() {
    if (!this.started || this.paused || this.socket) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    let socket;
    try {
      socket = new WebSocket(JETSTREAM_URL);
    } catch (_) {
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;
    socket.addEventListener("open", () => {
      if (this.socket !== socket) return;
      this.reconnectDelay = 1000;
      this.error = "";
      this.emit();
    });
    socket.addEventListener("message", (event) => this.handleMessage(String(event.data)));
    socket.addEventListener("error", () => {
      try {
        socket.close();
      } catch (_) {
        // The close event will handle reconnecting.
      }
    });
    socket.addEventListener("close", () => {
      if (this.socket === socket) this.socket = null;
      if (!this.paused) this.scheduleReconnect();
      this.emit();
    });
  }

  scheduleReconnect() {
    if (!this.started || this.paused || this.reconnectTimer) return;
    const delay = this.reconnectDelay;
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  handleMessage(raw) {
    let event;
    try {
      event = JSON.parse(raw);
    } catch (_) {
      return;
    }
    const commit = event.kind === "commit" ? event.commit : null;
    if (!commit || commit.operation !== "create" || commit.collection !== "app.bsky.feed.post") return;
    const did = typeof event.did === "string" ? event.did : "";
    const rkey = typeof commit.rkey === "string" ? commit.rkey : "";
    const text = typeof commit.record?.text === "string" ? commit.record.text : "";
    if (!did || !rkey || !text) return;

    this.totalScanned++;
    if (Array.isArray(commit.record.langs) && commit.record.langs.length && !commit.record.langs.includes("en")) {
      this.scheduleEmit();
      return;
    }
    this.totalEligible++;
    if (!couldBe2016(text)) {
      this.scheduleEmit();
      return;
    }

    const key = `${did}/${rkey}`;
    if (this.seenKeys.has(key)) return;
    this.seenKeys.add(key);
    this.seenQueue.push(key);
    if (this.seenQueue.length > MAX_SEEN_KEYS) {
      const evicted = this.seenQueue.shift();
      if (evicted) this.seenKeys.delete(evicted);
    }

    this.totalMatched++;
    this.matchedTimes.push(Date.now());
    if (this.entries.length < MAX_STORED) {
      this.entries.unshift({ text, did, rkey, matchedAt: Date.now() });
      this.entries = this.entries.slice(0, MAX_STORED);
    }
    this.scheduleEmit();
  }
}
