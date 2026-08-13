const JETSTREAM_URL =
  "wss://jetstream2.us-east.bsky.network/subscribe?wantedCollections=app.bsky.feed.post";
const APPVIEW = "https://public.api.bsky.app/xrpc";
const WINDOW_MS = 24 * 60 * 60 * 1000;
const CHECK_DELAY_MS = 3 * 60 * 1000;
const TICK_MS = 10000;
const MAX_QUEUE = 4000;
const MAX_CHECKS_PER_TICK = 50;
const MAX_ARTICLES = 2000;

function hasGiftParam(url) {
  for (const [key, value] of url.searchParams) {
    if (/gift/i.test(key) || /gift/i.test(value)) return true;
  }
  return false;
}

const GIFT_SOURCES = [
  { key: "nyt", name: "The New York Times", domains: ["nytimes.com", "nyti.ms"], match: (url) => url.searchParams.has("unlocked_article_code") },
  { key: "wsj", name: "The Wall Street Journal", domains: ["wsj.com"], match: (url) => url.searchParams.has("st") },
  { key: "wapo", name: "The Washington Post", domains: ["wapo.st"], match: () => true },
  { key: "athletic", name: "The Athletic", domains: ["theathletic.com"], match: (url) => url.searchParams.has("unlocked_article_code") || hasGiftParam(url) },
  { key: "atlantic", name: "The Atlantic", domains: ["theatlantic.com"], match: hasGiftParam },
  { key: "bloomberg", name: "Bloomberg", domains: ["bloomberg.com"], match: hasGiftParam },
  { key: "economist", name: "The Economist", domains: ["economist.com"], match: hasGiftParam },
  { key: "ft", name: "Financial Times", domains: ["ft.com"], match: hasGiftParam },
  { key: "newyorker", name: "The New Yorker", domains: ["newyorker.com"], match: hasGiftParam },
  { key: "latimes", name: "Los Angeles Times", domains: ["latimes.com"], match: hasGiftParam },
  { key: "businessinsider", name: "Business Insider", domains: ["businessinsider.com"], match: hasGiftParam },
];

function hostMatches(hostname, domain) {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

function detectGiftSource(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch (_) {
    return null;
  }
  return GIFT_SOURCES.find((source) => source.domains.some((domain) => hostMatches(url.hostname, domain)) && source.match(url)) || null;
}

function externalEmbed(post) {
  const embed = post && post.embed;
  if (!embed) return null;
  const external =
    embed.$type === "app.bsky.embed.external#view"
      ? embed.external
      : embed.$type === "app.bsky.embed.recordWithMedia#view" && embed.media && embed.media.$type === "app.bsky.embed.external#view"
        ? embed.media.external
        : null;
  if (!external || !external.uri) return null;
  return {
    uri: external.uri,
    title: external.title || "",
    description: external.description || "",
    thumb: external.thumb || null,
  };
}

export class GiftIndex {
  constructor({ onUpdate } = {}) {
    this.onUpdate = typeof onUpdate === "function" ? onUpdate : () => {};
    this.started = false;
    this.paused = false;
    this.socket = null;
    this.reconnectTimer = null;
    this.tickTimer = null;
    this.reconnectDelay = 1000;
    this.running = false;
    this.emitTimer = null;
    this.candidates = [];
    this.seenUris = new Set();
    this.articles = new Map();
    this.lastUpdated = 0;
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
    this.paused = document.visibilityState === "hidden";
    this.emit();
    if (!this.paused) {
      this.connect();
      this.scheduleTick(0);
    }
  }

  snapshot() {
    const articles = Array.from(this.articles.values()).sort((a, b) => b.sharedAt - a.sharedAt);
    return {
      updatedAt: this.lastUpdated || null,
      windowHours: WINDOW_MS / (60 * 60 * 1000),
      count: articles.length,
      sources: GIFT_SOURCES.map((source) => ({ key: source.key, name: source.name })),
      articles,
      connected: !!this.socket && this.socket.readyState === WebSocket.OPEN,
      processing: this.running || this.candidates.length > 0,
      error: this.error,
    };
  }

  emit() {
    try {
      this.onUpdate(this.snapshot());
    } catch (err) {
      console.error("giftlinks render failed", err);
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
    if (this.tickTimer) clearTimeout(this.tickTimer);
    this.reconnectTimer = null;
    this.tickTimer = null;
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
    this.scheduleTick(0);
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
      this.error = "firehose reconnecting";
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
    const record = commit.record;
    const did = typeof event.did === "string" ? event.did : "";
    const rkey = typeof commit.rkey === "string" ? commit.rkey : "";
    if (!record || !did || !rkey) return;
    const embed = record.embed;
    const external =
      embed?.$type === "app.bsky.embed.external"
        ? embed.external
        : embed?.$type === "app.bsky.embed.recordWithMedia" && embed.media?.$type === "app.bsky.embed.external"
          ? embed.media.external
          : null;
    const linkUrl = external && external.uri;
    if (!linkUrl || !detectGiftSource(linkUrl)) return;

    const uri = `at://${did}/app.bsky.feed.post/${rkey}`;
    if (this.seenUris.has(uri) || this.candidates.length >= MAX_QUEUE) return;
    this.seenUris.add(uri);
    const now = Date.now();
    this.candidates.push({ uri, did, rkey, createdAt: now, dueAt: now + CHECK_DELAY_MS });
    this.scheduleEmit();
  }

  scheduleTick(delay = TICK_MS) {
    if (!this.started || this.paused || this.tickTimer) return;
    this.tickTimer = setTimeout(() => {
      this.tickTimer = null;
      this.processTick();
    }, delay);
  }

  async fetchPosts(uris) {
    const out = new Map();
    const batches = [];
    for (let i = 0; i < uris.length; i += 25) batches.push(uris.slice(i, i + 25));
    await Promise.all(
      batches.map(async (batch) => {
        try {
          const url = new URL(`${APPVIEW}/app.bsky.feed.getPosts`);
          for (const uri of batch) url.searchParams.append("uris", uri);
          const response = await fetch(url);
          if (!response.ok) return;
          const data = await response.json();
          for (const post of data.posts || []) out.set(post.uri, post);
        } catch (_) {
          // A failed batch is dropped; later firehose posts continue normally.
        }
      }),
    );
    return out;
  }

  verify(candidate, post) {
    if (!post) return null;
    const external = externalEmbed(post);
    if (!external) return null;
    const source = detectGiftSource(external.uri);
    if (!source) return null;
    let hostname;
    try {
      hostname = new URL(external.uri).hostname;
    } catch (_) {
      return null;
    }
    const author = post.author || {};
    const record = post.record || {};
    return {
      uri: candidate.uri,
      rkey: candidate.rkey,
      handle: author.handle || "",
      displayName: author.displayName || author.handle || "",
      avatar: author.avatar || "",
      articleUrl: external.uri,
      hostname,
      title: external.title,
      description: external.description,
      thumb: external.thumb,
      sourceKey: source.key,
      sourceName: source.name,
      sharedAt: record.createdAt ? Date.parse(record.createdAt) || candidate.createdAt : candidate.createdAt,
      checkedAt: Date.now(),
    };
  }

  async processTick() {
    if (!this.started || this.paused || this.running) return;
    this.running = true;
    try {
      const now = Date.now();
      const due = [];
      while (this.candidates.length && this.candidates[0].dueAt <= now && due.length < MAX_CHECKS_PER_TICK) {
        due.push(this.candidates.shift());
      }
      if (due.length) {
        const fresh = await this.fetchPosts(due.map((candidate) => candidate.uri));
        for (const candidate of due) {
          const article = this.verify(candidate, fresh.get(candidate.uri));
          if (article) this.articles.set(article.uri, article);
        }
      }

      for (const [uri, article] of this.articles) {
        if (now - article.sharedAt > WINDOW_MS) {
          this.articles.delete(uri);
          this.seenUris.delete(uri);
        }
      }
      while (this.candidates.length && now - this.candidates[0].createdAt > WINDOW_MS) {
        this.seenUris.delete(this.candidates[0].uri);
        this.candidates.shift();
      }
      if (this.articles.size > MAX_ARTICLES) {
        const old = Array.from(this.articles.values()).sort((a, b) => a.sharedAt - b.sharedAt);
        for (const article of old.slice(0, this.articles.size - MAX_ARTICLES)) this.articles.delete(article.uri);
      }
      this.lastUpdated = now;
      this.error = "";
    } catch (err) {
      this.error = "article check paused; retrying";
      console.warn("giftlinks browser check failed", err);
    } finally {
      this.running = false;
      this.scheduleEmit();
      this.scheduleTick();
    }
  }
}
