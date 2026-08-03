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
//
// @antiali.as followed up asking for a d/o/d w/o/w "vibe-o-meter": backfill
// history and rank each day from "it's so over" to "we're so back". Every
// other site in this repo that tried searchPosts hit `public.api.bsky.app`
// and got 403 and concluded search needs auth (see sites/timeline,
// sites/giftlinks). That's the wrong host, not a hard limit — sites/trigruessr
// (notes/history/trigrams-reply-and-quiver.md, "HAMMERED") found
// `api.bsky.app` serves searchPosts unauthenticated (200, CORS *); only the
// `public.` subdomain 403s. So the daily backfill below pages that host,
// newest-first, one page per alarm tick — gentle on the shared endpoint, and
// any 403/429 (it soft-403s under burst load per that same note) just gets
// retried on the next 30s tick rather than a tight in-request retry loop.

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
// searchPosts specifically — NOT public.api.bsky.app, which 403s it. See the
// file-header comment: api.bsky.app serves it unauthenticated.
const SEARCH_URL = "https://api.bsky.app/xrpc/app.bsky.feed.searchPosts";
const PHRASE_RE = /the vibes are/gi;
// "Up to any punctuation" — Unicode's punctuation category, so ., !, ?, ;,
// :, quotes, dashes, brackets all count as a boundary, not just a curated
// ASCII list.
const PUNCT_RE = /\p{P}/gu;
const WORD_CHAR_RE = /[\p{L}\p{N}]/u;

// First "real" punctuation boundary in `s` — like PUNCT_RE.exec, but an
// apostrophe (straight or curly) sitting between two word characters is a
// contraction (it's, we're, don't, y'all), not a boundary. Without this,
// "the vibes are we're so back" tallied as just "we" — every contraction
// in a vibe answer got truncated to its first syllable.
function findBoundary(s: string): number {
  PUNCT_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PUNCT_RE.exec(s))) {
    const ch = m[0];
    if (ch === "'" || ch === "’") {
      const before = s[m.index - 1];
      const after = s[m.index + 1];
      if (before && after && WORD_CHAR_RE.test(before) && WORD_CHAR_RE.test(after)) {
        continue; // contraction apostrophe — not a boundary
      }
    }
    return m.index;
  }
  return -1;
}

const ALARM_MS = 30 * 1000; // tick cadence — also the reconnect heartbeat
const MAX_TRACKED = 1500; // safety valve on total distinct phrases kept
const MAX_RECENT = 60; // ring buffer of most recent raw matches
const BOARD_SIZE = 100; // how many ranked entries the API returns
// Dedup window against double-tallying the same post — guards against a
// stray redundant socket (see `connecting` below) or Jetstream itself
// redelivering a commit. Doesn't need to survive a DO eviction, just the
// seconds it'd take for a duplicate delivery to land.
const MAX_SEEN_URIS = 3000;
const PROFILE_TTL_MS = 60 * 60 * 1000; // re-hydrate a profile at most hourly
const MAX_PROFILE_FETCH_PER_TICK = 100; // 4 getProfiles batches of 25

// ---- daily backfill / vibe-o-meter -----------------------------------------
const DAY_MS = 24 * 60 * 60 * 1000;
const BACKFILL_LOOKBACK_DAYS = 35; // enough runway for several w/o/w points
const BACKFILL_PAGE_LIMIT = 100; // max searchPosts allows per page
const BACKFILL_MAX_PAGES = 400; // safety valve — stop paging rather than loop forever
const TIMELINE_DAYS = 21; // how many days the UI's vibe-o-meter shows

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

// UTC calendar date, "YYYY-MM-DD" — the vibe-o-meter's day boundary. UTC
// rather than any one poster's local time since posts come from everywhere.
function dateKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function dayStartMs(key: string): number {
  return Date.parse(key + "T00:00:00.000Z");
}

function addDays(key: string, n: number): string {
  return dateKey(dayStartMs(key) + n * DAY_MS);
}

// log-ratio change with +1 smoothing (so a 0-count day doesn't divide by
// zero, and going from 0 to a few doesn't read as an infinite swing).
function logChange(curr: number, prev: number): number {
  return Math.log((curr + 1) / (prev + 1));
}

// "it's so over" <-> "we're so back", driven by the average of the day/day
// and week/week log-changes (whichever are available). null = not enough
// backfilled history yet to say anything.
function vibeLabel(combined: number | null): string {
  if (combined === null) return "gathering data";
  if (combined <= -1.0) return "it's so over";
  if (combined <= -0.3) return "kinda over";
  if (combined < 0.3) return "steady vibes";
  if (combined < 1.0) return "kinda back";
  return "we're so back";
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
    const boundary = findBoundary(rest);
    const phrase = normalizeWhitespace(boundary >= 0 ? rest.slice(0, boundary) : rest);
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
  private connecting = false;
  private reconnectDelay = 1000;
  private seenUris: Set<string> = new Set();
  private seenUriOrder: string[] = [];

  // ---- vibe-o-meter (daily counts + backfill) ----
  private dailyCounts: Map<string, number> = new Map(); // dateKey -> match count
  private backfillCursor: string | undefined;
  private backfillDone = false;
  private backfillPages = 0;
  private backfillOldestMs = Date.now(); // watermark: everything newer than this is covered

  constructor(state: DurableObjectState) {
    this.state = state;
    this.ready = this.state.blockConcurrencyWhile(async () => {
      const [deities, recentFeed, totalMatches, lastUpdated, dailyCounts, backfill] = await Promise.all([
        this.state.storage.get<Deity[]>("deities"),
        this.state.storage.get<FeedEntry[]>("recentFeed"),
        this.state.storage.get<number>("totalMatches"),
        this.state.storage.get<number>("lastUpdated"),
        this.state.storage.get<[string, number][]>("dailyCounts"),
        this.state.storage.get<{ cursor?: string; done: boolean; pages: number; oldestMs: number }>("backfill"),
      ]);
      for (const d of deities ?? []) this.deities.set(d.key, d);
      this.recentFeed = recentFeed ?? [];
      this.totalMatches = totalMatches ?? 0;
      this.lastUpdated = lastUpdated ?? 0;
      this.dailyCounts = new Map(dailyCounts ?? []);
      if (backfill) {
        this.backfillCursor = backfill.cursor;
        this.backfillDone = backfill.done;
        this.backfillPages = backfill.pages;
        this.backfillOldestMs = backfill.oldestMs;
      }
      this.recomputeBoard();
    });
    this.connectSocket().catch(() => {});
    this.state.storage.setAlarm(Date.now() + ALARM_MS).catch(() => {});
  }

  // ---- firehose ------------------------------------------------------------
  // Workers connect OUT to a WebSocket server via fetch() + an Upgrade
  // header (the documented Cloudflare pattern), not the browser-style
  // `new WebSocket(url)` constructor.
  // Every call site (constructor, fetch(), alarm(), the close handler via
  // scheduleReconnect) calls this whenever it *thinks* there's no live
  // socket. But `this.ws` only gets set once the upgrade round-trip
  // finishes, so two callers can both see "not open" while one connection
  // attempt is already in flight and both open a socket. Two live sockets
  // both got their own "message" listener bound to handleMessage, so every
  // matching post got tallied once per open socket — this is why a post
  // could get counted twice. `connecting` closes that window.
  private async connectSocket(): Promise<void> {
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
    if (!commit || commit.operation !== "create") return;
    if (commit.collection && commit.collection !== "app.bsky.feed.post") return;
    const rec = commit.record;
    if (!rec) return;
    const text = typeof rec.text === "string" ? rec.text : "";
    if (!text || !/the vibes are/i.test(text)) return; // cheap pre-filter before the /g scan

    const phrases = extractPhrases(text);
    if (!phrases.length) return;

    const uri = `at://${evt.did}/app.bsky.feed.post/${commit.rkey}`;
    if (this.seenUris.has(uri)) return; // already tallied this post — duplicate delivery
    this.markSeen(uri);

    const now = Date.now();
    for (const phrase of phrases) {
      this.tally(phrase, evt.did, commit.rkey, uri, text, now);
    }
  }

  private markSeen(uri: string): void {
    this.seenUris.add(uri);
    this.seenUriOrder.push(uri);
    if (this.seenUriOrder.length > MAX_SEEN_URIS) {
      const drop = this.seenUriOrder.shift()!;
      this.seenUris.delete(drop);
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

    const day = dateKey(now);
    this.dailyCounts.set(day, (this.dailyCounts.get(day) ?? 0) + 1);
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

  // ---- vibe-o-meter: one searchPosts page per tick --------------------------
  // Pages api.bsky.app newest-first via cursor. Today is left to the live
  // firehose tally (tally() above already bumps dailyCounts) so this only
  // ever fills in *past* days, and never double-counts today.
  private async runBackfillStep(): Promise<void> {
    if (this.backfillDone || this.backfillPages >= BACKFILL_MAX_PAGES) {
      this.backfillDone = true;
      return;
    }

    const cutoffMs = Date.now() - BACKFILL_LOOKBACK_DAYS * DAY_MS;
    const today = dateKey(Date.now());

    const url = new URL(SEARCH_URL);
    url.searchParams.set("q", "the vibes are");
    url.searchParams.set("sort", "latest");
    url.searchParams.set("limit", String(BACKFILL_PAGE_LIMIT));
    if (this.backfillCursor) url.searchParams.set("cursor", this.backfillCursor);

    let data: any;
    try {
      const r = await fetch(url.toString());
      if (!r.ok) return; // 403/429 under load — just retry next tick, no busy loop
      data = await r.json();
    } catch {
      return; // network hiccup — retry next tick
    }

    const posts: any[] = Array.isArray(data.posts) ? data.posts : [];
    this.backfillPages++;

    if (!posts.length) {
      this.backfillDone = true;
      return;
    }

    let reachedCutoff = false;
    for (const post of posts) {
      const text = typeof post?.record?.text === "string" ? post.record.text : "";
      const createdAt = post?.record?.createdAt || post?.indexedAt;
      const ms = createdAt ? Date.parse(createdAt) : NaN;
      if (Number.isNaN(ms)) continue;

      if (ms < this.backfillOldestMs) this.backfillOldestMs = ms;
      if (ms < cutoffMs) {
        reachedCutoff = true;
        continue;
      }

      const day = dateKey(ms);
      if (day === today) continue; // today comes from the live tally only
      if (!text || !/the vibes are/i.test(text)) continue; // cheap pre-filter, same as handleMessage

      const phrases = extractPhrases(text);
      if (!phrases.length) continue;
      this.dailyCounts.set(day, (this.dailyCounts.get(day) ?? 0) + phrases.length);
    }

    if (reachedCutoff || !data.cursor) {
      this.backfillDone = true;
      // The watermark can't have gone further back than the cutoff we honored.
      if (this.backfillOldestMs < cutoffMs) this.backfillOldestMs = cutoffMs;
    } else {
      this.backfillCursor = data.cursor;
    }
  }

  // Last TIMELINE_DAYS calendar days, each ranked "it's so over" .. "we're
  // so back" from the average of its day/day and week/week log-change (see
  // vibeLabel/logChange above). A day only gets a verdict once the backfill
  // watermark has paged back past its start — otherwise it's honestly
  // "gathering data" rather than a fabricated flat 0.
  private computeTimeline(): Array<{
    date: string;
    count: number;
    dod: number | null;
    wow: number | null;
    label: string;
  }> {
    const today = dateKey(Date.now());
    const covered = (day: string) => day === today || this.backfillOldestMs <= dayStartMs(day);
    const countFor = (day: string) => this.dailyCounts.get(day) ?? 0;

    const out: Array<{ date: string; count: number; dod: number | null; wow: number | null; label: string }> = [];
    for (let i = TIMELINE_DAYS - 1; i >= 0; i--) {
      const day = addDays(today, -i);
      const prevDay = addDays(day, -1);
      const prevWeek = addDays(day, -7);
      const dod = covered(prevDay) ? logChange(countFor(day), countFor(prevDay)) : null;
      const wow = covered(prevWeek) ? logChange(countFor(day), countFor(prevWeek)) : null;
      const parts = [dod, wow].filter((v): v is number => v !== null);
      const combined = parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : null;
      out.push({ date: day, count: countFor(day), dod, wow, label: vibeLabel(combined) });
    }
    return out;
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
    await this.runBackfillStep().catch(() => {}); // one searchPosts page per tick

    this.lastUpdated = Date.now();
    await this.state.storage.put({
      deities: Array.from(this.deities.values()),
      recentFeed: this.recentFeed,
      totalMatches: this.totalMatches,
      lastUpdated: this.lastUpdated,
      dailyCounts: Array.from(this.dailyCounts.entries()),
      backfill: {
        cursor: this.backfillCursor,
        done: this.backfillDone,
        pages: this.backfillPages,
        oldestMs: this.backfillOldestMs,
      },
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
        timeline: this.computeTimeline(),
        backfill: { done: this.backfillDone, pages: this.backfillPages, oldestMs: this.backfillOldestMs },
      });
    }
    return json({ error: "not found" }, 404);
  }
}
