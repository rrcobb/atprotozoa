// ideahose Worker — bisks.net/ideahose
//
// @words.bsky.social asked for a site that watches the ENTIRE Bluesky firehose
// (not just posts tagging @buildthis) for ideas for websites/apps/tools, and
// aggregates + ranks them into a crowdsourced backlog for @buildthis to build
// from next.
//
// Shape borrowed from sites/ratioed: one Durable Object holds the live
// Jetstream connection, a stats-check queue, and the rolling state — same
// "single-writer rolling state" case notes/10-architecture.md calls out DOs
// for. What's different from ratioed: instead of scoring one post against
// itself, every root post is run through a cheap "does this sound like a
// website/app idea" heuristic (looksLikeIdea below), and matches are grouped
// into loose clusters by shared significant keywords — so five people
// separately wishing for the same kind of tool count as one bigger idea
// mentioned 5x, not five unrelated small ones. Each cluster is ranked by how
// many separate people raised it (the actual "crowdsourced" signal) plus the
// real like/repost/reply counts of the post(s) that raised it (checked via
// the public, UNAUTHENTICATED AppView — same trick ratioed uses, since
// searchPosts is gated for anonymous callers but getPosts isn't) plus
// site-visitor upvotes.
//
// Honest scope, spelled out on the page itself (same spirit as trigrams'
// "novel to this session" disclaimer): the keyword-overlap clustering is
// fuzzy, not real NLP — two ideas about unrelated things that happen to share
// a distinctive word can merge, and two phrasings of the same idea with no
// word overlap can end up as separate clusters. Good enough for a fun,
// roughly-sorted backlog; not a claim of perfect dedup.

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

// Mounted at bisks.net/ideahose/ — strip the mount prefix before routing, so
// the /api/* calls and the DO + ASSETS all see root-relative paths. See
// notes/40-new-site-playbook.md.
const PREFIX = "/ideahose";

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

// ---- config ----------------------------------------------------------------
const JETSTREAM_URL =
  "https://jetstream2.us-east.bsky.network/subscribe?wantedCollections=app.bsky.feed.post";
const APPVIEW = "https://public.api.bsky.app/xrpc";

const CHECK_DELAY_MS = 6 * 60 * 1000; // give a post ~6 min to accumulate reactions before checking it
const ALARM_MS = 20 * 1000; // tick cadence — also the reconnect heartbeat
const MAX_QUEUE = 1500; // safety valve: drop new candidates if the check backlog balloons
const MAX_CHECKS_PER_TICK = 200;
const LEADERBOARD_SIZE = 40;
const MAX_CLUSTERS = 500; // evict the lowest-scoring cluster when a new one would exceed this
const MAX_INSTANCES_PER_CLUSTER = 6; // how many source posts we keep receipts for
const STALE_AFTER_MS = 30 * 24 * 60 * 60 * 1000; // prune quiet, low-signal clusters after this long
const STALE_MENTION_FLOOR = 3; // ...but only if it never got much traction

// Scoring weights: mentions (distinct people raising the idea) is the real
// "crowdsourced" signal and dominates; engagement and visitor upvotes nudge.
const MENTION_WEIGHT = 30;
const ENGAGEMENT_WEIGHT = 8; // multiplies log2(1 + weighted reactions)
const UPVOTE_WEIGHT = 12;
const TAGGED_BONUS = 15; // small bump for ideas already posted @ the build bot directly

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// ---- spam gate (trimmed from sites/ratioed's looksLikeSpam) ----------------
function looksLikeSpam(text: string): boolean {
  if (/#nowplaying|listen live|onelink\.to/i.test(text)) return true;
  if (/shop now|buy now|amzn\.to|prime members|\$\d+\.\d{2}\b/i.test(text)) return true;
  const hashtags = (text.match(/#/g) || []).length;
  if (hashtags >= 4) return true;
  return false;
}

// ---- "is this a website/app/tool idea" heuristic ---------------------------
// Explicit phrasings that already name the thing (website/app/tool/bot/...),
// so no extra noun-gate needed.
const EXPLICIT_IDEA_PATTERNS: RegExp[] = [
  /\bidea for an? (website|site|web ?app|app|bot|tool|extension|plugin)\b/i,
  /\b(website|site|web ?app|app) idea\b/i,
  /\bthere (should|ought to) be an? (website|site|web ?app|app|bot|tool|extension)\b/i,
  /\bimagine an? (website|site|web ?app|app|bot|tool) that\b/i,
  /\bwhat if there (was|were) an? (website|site|web ?app|app|bot|tool)\b/i,
  /\bbuild me an? (website|site|web ?app|app|bot|tool)\b/i,
  /\bwe need an? (website|site|web ?app|app|bot|tool) (that|for|to)\b/i,
];

// Verb phrases that mean "someone wants this built" but don't name the noun
// themselves — need NOUN_GATE to also match somewhere in the text.
const VERB_PHRASE_PATTERNS: RegExp[] = [
  /\b(someone|somebody)\s+(should|needs? to|ought to|really should|could)\s+(build|make|create|code up|develop|design)\b/i,
  /\bi wish (there was|there were|someone (would|had) (made|built)|there existed)\b/i,
  /\b(can|could|would)\s+(someone|somebody|anyone)\s+(please\s+)?(build|make|create)\b/i,
];
const NOUN_GATE =
  /\b(website|web ?site|site|web ?app|app|bot|tool|extension|plugin|dashboard|tracker|generator|game)\b/i;

function looksLikeIdea(text: string): boolean {
  if (text.length < 15 || text.length > 500) return false;
  if (/@buildthis\.bisks\.net|@buildthis\b/i.test(text)) return true; // direct submission — strongest signal
  for (const re of EXPLICIT_IDEA_PATTERNS) if (re.test(text)) return true;
  for (const re of VERB_PHRASE_PATTERNS) if (re.test(text) && NOUN_GATE.test(text)) return true;
  return false;
}

// ---- clustering: cheap keyword-overlap signature ---------------------------
// Scaffolding words that show up in nearly every idea-shaped post (should,
// build, website, ...) get stripped alongside ordinary stopwords — otherwise
// every idea would "match" every other idea on those alone.
const STOPWORDS = new Set(
  (
    "the a an and or but if then else for nor so yet of to in on at by with " +
    "from into onto over under about above below between out up down off " +
    "again further once here there when where why how all any both each few " +
    "more most other some such no not only own same than too very s t can " +
    "will just don should now this that these those i you he she it we they " +
    "them his her its our your my me him is are was were be been being have " +
    "has had do does did would could should might must shall someone somebody " +
    "anyone everybody people who what which really please make build " +
    "created create creating website site web app apps bot tool tools " +
    "extension plugin idea ideas imagine there needs need wish wishing " +
    "existed exist would could actually kind sort thing things like just " +
    "really something anything into onto"
  ).split(/\s+/),
);

function stem(word: string): string {
  let w = word;
  if (w.length > 5 && w.endsWith("ing")) w = w.slice(0, -3);
  else if (w.length > 4 && w.endsWith("ed")) w = w.slice(0, -2);
  else if (w.length > 4 && w.endsWith("es")) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith("s")) w = w.slice(0, -1);
  return w;
}

function signature(text: string): string[] {
  const tokens = text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9\s']/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const sig = new Set<string>();
  for (const t of tokens) {
    if (t.length < 4 || STOPWORDS.has(t)) continue;
    const s = stem(t);
    if (s.length < 3) continue;
    sig.add(s);
    if (sig.size >= 10) break;
  }
  return Array.from(sig);
}

function jaccard(a: string[], b: string[]): { score: number; overlap: number } {
  const sa = new Set(a);
  const sb = new Set(b);
  let overlap = 0;
  for (const w of sa) if (sb.has(w)) overlap++;
  const union = sa.size + sb.size - overlap;
  return { score: union ? overlap / union : 0, overlap };
}

const CLUSTER_MATCH_THRESHOLD = 0.34;
const CLUSTER_MIN_OVERLAP = 2;

// ---- types ------------------------------------------------------------------
interface Instance {
  uri: string;
  did: string;
  rkey: string;
  text: string;
  createdAt: number;
  dueAt: number;
  checked: boolean;
}

interface Representative {
  uri: string;
  did: string;
  rkey: string;
  handle: string;
  displayName: string;
  avatar: string;
  text: string;
  createdAt: number;
}

interface Cluster {
  key: string;
  sig: string[];
  mentionCount: number;
  instances: Instance[];
  representative: Representative | null;
  likeSum: number;
  repostSum: number;
  replySum: number;
  checkedInstances: number;
  upvotes: number;
  tagged: boolean; // at least one instance directly mentioned @buildthis
  firstSeen: number;
  lastSeen: number;
}

interface LeaderboardEntry {
  key: string;
  text: string;
  handle: string;
  displayName: string;
  avatar: string;
  rkey: string;
  mentionCount: number;
  likeSum: number;
  repostSum: number;
  replySum: number;
  upvotes: number;
  tagged: boolean;
  firstSeen: number;
  lastSeen: number;
  score: number;
}

function scoreCluster(c: Cluster): number {
  const weighted = c.likeSum + c.repostSum * 2 + c.replySum * 1.5;
  return (
    c.mentionCount * MENTION_WEIGHT +
    Math.log2(1 + weighted) * ENGAGEMENT_WEIGHT +
    c.upvotes * UPVOTE_WEIGHT +
    (c.tagged ? TAGGED_BONUS : 0)
  );
}

function toLeaderboardEntry(c: Cluster): LeaderboardEntry | null {
  if (!c.representative) return null;
  return {
    key: c.key,
    text: c.representative.text,
    handle: c.representative.handle,
    displayName: c.representative.displayName,
    avatar: c.representative.avatar,
    rkey: c.representative.rkey,
    mentionCount: c.mentionCount,
    likeSum: c.likeSum,
    repostSum: c.repostSum,
    replySum: c.replySum,
    upvotes: c.upvotes,
    tagged: c.tagged,
    firstSeen: c.firstSeen,
    lastSeen: c.lastSeen,
    score: scoreCluster(c),
  };
}

export class IdeaTracker {
  private state: DurableObjectState;
  private ready: Promise<void>;
  private clusters: Map<string, Cluster> = new Map();
  private uriToKey: Map<string, string> = new Map(); // in-memory only, dedupe within this DO's lifetime
  private checkQueue: Instance[] = [];
  private leaderboard: LeaderboardEntry[] = [];
  private lastUpdated = 0;
  private seenCount = 0;
  private ideaCount = 0;
  private recentVotes: Map<string, number> = new Map(); // `${ip}|${key}` -> timestamp, naive upvote debounce
  private ws: any = null;
  private reconnectDelay = 1000;

  constructor(state: DurableObjectState) {
    this.state = state;
    this.ready = this.state.blockConcurrencyWhile(async () => {
      const [clusters, leaderboard, lastUpdated] = await Promise.all([
        this.state.storage.get<Cluster[]>("clusters"),
        this.state.storage.get<LeaderboardEntry[]>("leaderboard"),
        this.state.storage.get<number>("lastUpdated"),
      ]);
      for (const c of clusters ?? []) this.clusters.set(c.key, c);
      this.leaderboard = leaderboard ?? [];
      this.lastUpdated = lastUpdated ?? 0;
    });
    this.connectSocket().catch(() => {});
    this.state.storage.setAlarm(Date.now() + ALARM_MS).catch(() => {});
  }

  // ---- firehose ------------------------------------------------------------
  // Workers connect OUT to a WebSocket server via fetch() + an Upgrade header
  // (the documented Cloudflare pattern), not the browser-style `new
  // WebSocket(url)` constructor.
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
    const text = rec.text.trim();
    if (!text) return;
    if (rec.reply) return; // root posts only — see the scope note at the top of this file
    this.seenCount++;
    if (looksLikeSpam(text)) return;
    if (!looksLikeIdea(text)) return;

    if (this.checkQueue.length >= MAX_QUEUE) return; // backlog full — drop, don't grow unbounded
    const uri = `at://${evt.did}/app.bsky.feed.post/${commit.rkey}`;
    if (this.uriToKey.has(uri)) return;
    this.ideaCount++;

    const trimmed = text.length > 280 ? text.slice(0, 280) + "…" : text;
    const tagged = /@buildthis\.bisks\.net|@buildthis\b/i.test(text);
    const now = Date.now();
    const sig = signature(text);

    let match: Cluster | null = null;
    let best = 0;
    for (const c of this.clusters.values()) {
      const { score, overlap } = jaccard(sig, c.sig);
      if (overlap >= CLUSTER_MIN_OVERLAP && score >= CLUSTER_MATCH_THRESHOLD && score > best) {
        best = score;
        match = c;
      }
    }

    const instance: Instance = {
      uri,
      did: evt.did,
      rkey: commit.rkey,
      text: trimmed,
      createdAt: now,
      dueAt: now + CHECK_DELAY_MS,
      checked: false,
    };

    if (match) {
      match.mentionCount++;
      match.lastSeen = now;
      if (tagged) match.tagged = true;
      match.instances.unshift(instance);
      if (match.instances.length > MAX_INSTANCES_PER_CLUSTER) match.instances.length = MAX_INSTANCES_PER_CLUSTER;
      this.uriToKey.set(uri, match.key);
      this.checkQueue.push(instance);
      return;
    }

    // New cluster — evict the current lowest-scorer if we're at capacity.
    if (this.clusters.size >= MAX_CLUSTERS) {
      let worstKey: string | null = null;
      let worstScore = Infinity;
      for (const c of this.clusters.values()) {
        const s = scoreCluster(c);
        if (s < worstScore) {
          worstScore = s;
          worstKey = c.key;
        }
      }
      if (worstKey) this.clusters.delete(worstKey);
    }

    const cluster: Cluster = {
      key: `${evt.did.slice(-12)}-${commit.rkey}`,
      sig,
      mentionCount: 1,
      instances: [instance],
      representative: null,
      likeSum: 0,
      repostSum: 0,
      replySum: 0,
      checkedInstances: 0,
      upvotes: 0,
      tagged,
      firstSeen: now,
      lastSeen: now,
    };
    this.clusters.set(cluster.key, cluster);
    this.uriToKey.set(uri, cluster.key);
    this.checkQueue.push(instance);
  }

  // ---- stats -----------------------------------------------------------
  private async fetchStats(uris: string[]): Promise<Map<string, any>> {
    const out = new Map<string, any>();
    const batches: string[][] = [];
    for (let i = 0; i < uris.length; i += 25) batches.push(uris.slice(i, i + 25));
    await Promise.all(
      batches.map(async (batch) => {
        try {
          const url = new URL(`${APPVIEW}/app.bsky.feed.getPosts`);
          for (const u of batch) url.searchParams.append("uris", u);
          const r = await fetch(url.toString());
          if (!r.ok) return;
          const data: any = await r.json();
          for (const p of data.posts || []) out.set(p.uri, p);
        } catch {
          // one bad batch shouldn't sink the tick
        }
      }),
    );
    return out;
  }

  private applyStats(instance: Instance, cluster: Cluster, post: any): void {
    const author = post.author || {};
    cluster.likeSum += post.likeCount || 0;
    cluster.repostSum += post.repostCount || 0;
    cluster.replySum += post.replyCount || 0;
    cluster.checkedInstances++;
    if (!cluster.representative) {
      cluster.representative = {
        uri: instance.uri,
        did: instance.did,
        rkey: instance.rkey,
        handle: author.handle || "",
        displayName: author.displayName || author.handle || "",
        avatar: author.avatar || "",
        text: (post.record && post.record.text) || instance.text,
        createdAt: instance.createdAt,
      };
    }
  }

  private recomputeLeaderboard(): void {
    const now = Date.now();
    // Prune quiet clusters that never gained traction.
    for (const [key, c] of this.clusters) {
      if (now - c.lastSeen > STALE_AFTER_MS && c.mentionCount < STALE_MENTION_FLOOR) {
        this.clusters.delete(key);
      }
    }
    const entries = Array.from(this.clusters.values())
      .map(toLeaderboardEntry)
      .filter((e): e is LeaderboardEntry => e !== null);
    entries.sort((a, b) => b.score - a.score || b.mentionCount - a.mentionCount || b.lastSeen - a.lastSeen);
    this.leaderboard = entries.slice(0, LEADERBOARD_SIZE);
  }

  // ---- alarm: the tracker's heartbeat -----------------------------------
  async alarm(): Promise<void> {
    await this.ready;
    if (!this.wsOpen()) this.connectSocket().catch(() => {});

    const now = Date.now();
    const due: Instance[] = [];
    while (
      this.checkQueue.length &&
      this.checkQueue[0].dueAt <= now &&
      due.length < MAX_CHECKS_PER_TICK
    ) {
      due.push(this.checkQueue.shift() as Instance);
    }

    if (due.length) {
      const fresh = await this.fetchStats(due.map((c) => c.uri));
      for (const instance of due) {
        const post = fresh.get(instance.uri);
        instance.checked = true;
        if (!post) continue; // deleted, or not indexed yet — drop rather than guess
        const key = this.uriToKey.get(instance.uri);
        const cluster = key ? this.clusters.get(key) : undefined;
        if (cluster) this.applyStats(instance, cluster, post);
      }
    }

    this.recomputeLeaderboard();
    this.lastUpdated = now;
    // Trim in-memory dedupe map so it doesn't grow forever across a long-lived DO.
    if (this.uriToKey.size > 20000) this.uriToKey.clear();
    if (this.recentVotes.size > 20000) this.recentVotes.clear();

    await this.state.storage.put({
      clusters: Array.from(this.clusters.values()),
      leaderboard: this.leaderboard,
      lastUpdated: this.lastUpdated,
    });
    await this.state.storage.setAlarm(now + ALARM_MS);
  }

  // ---- http ---------------------------------------------------------------
  async fetch(request: Request): Promise<Response> {
    await this.ready;
    if (!this.wsOpen()) this.connectSocket().catch(() => {});

    const url = new URL(request.url);

    if (url.pathname === "/api/leaderboard") {
      return json({
        updatedAt: this.lastUpdated || null,
        tracking: this.clusters.size,
        ideasSeen: this.ideaCount,
        postsScanned: this.seenCount,
        ideas: this.leaderboard,
      });
    }

    if (url.pathname === "/api/upvote" && request.method === "POST") {
      let body: any = {};
      try {
        body = await request.json();
      } catch {
        return json({ error: "bad json" }, 400);
      }
      const key = typeof body.key === "string" ? body.key : "";
      const cluster = this.clusters.get(key);
      if (!cluster) return json({ error: "not found" }, 404);

      const ip = request.headers.get("cf-connecting-ip") || "anon";
      const voteKey = `${ip}|${key}`;
      const last = this.recentVotes.get(voteKey) || 0;
      if (Date.now() - last < 60 * 60 * 1000) {
        return json({ ok: true, upvotes: cluster.upvotes, alreadyVoted: true });
      }
      this.recentVotes.set(voteKey, Date.now());
      cluster.upvotes++;
      this.recomputeLeaderboard();
      await this.state.storage.put({
        clusters: Array.from(this.clusters.values()),
        leaderboard: this.leaderboard,
      });
      return json({ ok: true, upvotes: cluster.upvotes });
    }

    return json({ error: "not found" }, 404);
  }
}
