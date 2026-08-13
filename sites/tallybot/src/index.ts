// tallybot Worker — tallybot.bisks.net
//
// @cee.wtf: ".oO a bot that lets people add or remove arbitrarily named
// points with this form of syntax" — riffing on a shimmermathlabs.com post
// that used sites/socialcredit's "socialcredit +1" reply syntax. This site
// generalizes that syntax: instead of +1/-1 on a Bluesky ACCOUNT, it's
// +1/-1 on an arbitrary NAMED point — "mormonism mentioned in a realistic
// context +1", "number of times I've said 'anyway' today +1", whatever
// anyone types. No target account, so no self-vote rule and no reply
// requirement — the tally name comes straight out of the post text itself.
//
// Two ways to cast a vote, same as socialcredit:
//   1. Sign in with Bluesky OAuth here, type a name, hit +1/-1. The browser
//      writes a net.bisks.tallybot.point record straight to YOUR OWN PDS
//      (see public/lib/oauth.js) — that's the only part that needs your PDS
//      to authenticate.
//   2. Post anywhere on Bluesky — no reply needed, no sign-in needed — where
//      the ENTIRE trimmed post text is "<name> +1" or "<name> -1" (see
//      TALLY_RE below). Since Jetstream only re-emits commits the relay
//      already verified were signed by the posting DID, that post counts
//      exactly the same as a signed vote record.
//
// The score, the per-(voter, tally) cooldown, and the tally list itself are
// all computed here, server-side, in the TallyBoard Durable Object — which
// keeps a live Jetstream subscription filtered to net.bisks.tallybot.point
// plus app.bsky.feed.post across the WHOLE network (same "one DO, one
// Jetstream filter" shape as sites/socialcredit's CreditBoard). A client
// that tries to route around the cooldown can still write whatever it wants
// to its own repo — the DO just never counts it, so the tally's score never
// moves because of it.

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
  setAlarm(time: number | Date): Promise<void>;
}
export interface DurableObjectState {
  storage: DurableObjectStorage;
  blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T>;
}

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  BOARD: DurableObjectNamespace;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---- very light per-IP throttle on the API, ahead of the DO ----------------
// Best-effort only (resets on cold start / redeploy, not shared across
// isolates) — the real integrity guarantee is the DO's cooldown, this is
// just a floor against someone hammering the read endpoints.
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 120;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const b = rateBuckets.get(ip);
  if (!b || now > b.resetAt) {
    rateBuckets.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  b.count++;
  return b.count > RATE_MAX;
}

const GENERIC_TITLE = "tallybot — a point, by any name";
const GENERIC_DESC =
  "See any tally's score and full vote history — then sign in with Bluesky to give it a +1 or -1 yourself, or just post \"<name> +1\" anywhere on Bluesky.";
const GENERIC_OG_URL = "https://tallybot.bisks.net/t/";

async function renderTally(env: Env, request: Request, rawKey: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/tally.html", request.url), { method: "GET" }));
  let html = await base.text();

  const key = decodeURIComponent(rawKey || "").trim();
  if (!key) return new Response(html, { headers: base.headers });

  try {
    const stub = env.BOARD.get(env.BOARD.idFromName("global"));
    const apiUrl = new URL(request.url);
    apiUrl.pathname = "/api/tally";
    apiUrl.search = `?key=${encodeURIComponent(key)}`;
    const r = await stub.fetch(new Request(apiUrl.toString()));
    if (!r.ok) throw new Error("tally lookup failed");
    const data: any = await r.json();
    const t = data.tally;
    if (!t) throw new Error("no tally");

    const sign = t.score > 0 ? "+" : "";
    const title = `"${t.displayName}": ${sign}${t.score}`;
    const rankBit = data.rank ? ` Ranked #${data.rank} of ${data.totalRanked}.` : "";
    const desc = `${t.upCount} up, ${t.downCount} down.${rankBit} Vote at tallybot.bisks.net.`;
    const ogUrl = `https://tallybot.bisks.net/t/${encodeURIComponent(t.key)}`;

    html = html
      .split(GENERIC_TITLE).join(esc(title))
      .split(GENERIC_DESC).join(esc(desc))
      .split(GENERIC_OG_URL).join(ogUrl);

    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=60" },
    });
  } catch {
    // Couldn't resolve/score server-side — still serve the live page; the
    // client re-fetches and surfaces its own "not found" state if the tally
    // really doesn't exist.
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
    });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      const ip = request.headers.get("cf-connecting-ip") || "unknown";
      if (rateLimited(ip)) {
        return new Response(JSON.stringify({ error: "slow down" }), {
          status: 429,
          headers: { "content-type": "application/json" },
        });
      }
      const stub = env.BOARD.get(env.BOARD.idFromName("global"));
      return stub.fetch(request);
    }

    // /t/<key> — a distinct, shareable per-tally URL, stamped with that
    // tally's live score so it unfurls as a real card instead of one
    // generic one for every link. See notes/45-sharing-and-virality.md and
    // sites/socialcredit/src/index.ts (renderProfile), which this mirrors.
    const m = url.pathname.match(/^\/t\/([^/]+)\/?$/);
    if (m) return renderTally(env, request, m[1]);

    return env.ASSETS.fetch(request);
  },
};

// ---------------------------------------------------------------------------
// TallyBoard — the one global Durable Object. Watches Jetstream for
// net.bisks.tallybot.point across the whole network, keeps running scores
// per tally name, a full vote log, and per-(voter, tally) cooldown state.
// ---------------------------------------------------------------------------

const COLLECTION = "net.bisks.tallybot.point";
const POST_COLLECTION = "app.bsky.feed.post"; // syntax trigger: "<name> +1" / "<name> -1"
const JETSTREAM_URL =
  "https://jetstream2.us-east.bsky.network/subscribe?" +
  [COLLECTION, POST_COLLECTION].map((c) => "wantedCollections=" + encodeURIComponent(c)).join("&");
const ALARM_MS = 20 * 1000; // reconnect heartbeat, same cadence as sites/socialcredit
const APPVIEW = "https://public.api.bsky.app/xrpc";
const PROFILE_TTL_MS = 6 * 60 * 60 * 1000;

const COOLDOWN_MS = 60 * 60 * 1000; // one vote per (voter, tally) pair per hour, server-enforced
const MAX_NAME_LEN = 140;
const MAX_VOTES_STORED = 20_000;
const MAX_TALLIES = 20_000; // storage ceiling — past this, brand-new names stop landing (existing ones still count)
const RECENT_SEEN_CAP = 2_000; // defensive de-dupe only; no cursor replay in normal operation
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

interface Tally {
  key: string; // normalized: trimmed, whitespace-collapsed, lowercased
  displayName: string; // first-seen raw casing (trimmed, whitespace-collapsed)
  score: number;
  upCount: number;
  downCount: number;
  firstSeenAt: number;
  updatedAt: number;
}

interface VoteEntry {
  id: string; // `${voterDid}::${rkey}`
  voterDid: string;
  voterHandle: string;
  voterAvatar: string;
  key: string;
  displayName: string;
  delta: 1 | -1;
  postUrl: string | null;
  createdAt: number; // ingestion time — authoritative for cooldown/windows
  recordCreatedAt: string | null; // the record's own claimed createdAt, display only
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function isDid(s: unknown): s is string {
  return typeof s === "string" && /^did:[a-z0-9]+:[A-Za-z0-9._:%-]{1,180}$/.test(s);
}

// Collapse internal whitespace (including newlines) to single spaces and
// trim, so "  mormonism   mentioned\nin a realistic context  " and
// "mormonism mentioned in a realistic context" land on the same tally.
function normalizeName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").slice(0, MAX_NAME_LEN);
}
function keyOf(displayName: string): string {
  return displayName.toLowerCase();
}

// Cooldown is per (voter, tally) pair — an account can vote on as many
// different named points as it likes within an hour, just not the same one
// twice.
function cooldownKey(voterDid: string, key: string): string {
  return `${voterDid}::${key}`;
}

// The ENTIRE trimmed post text has to be "<name> +1" / "<name> -1" — an
// optional colon and/or whitespace (including newlines) between the name and
// the sign, but nothing after it. Anchored at both ends so a post that just
// happens to mention "+1" somewhere in a longer message ("chess +1 today,
// feeling good") doesn't spawn a tally by accident — only a post whose whole
// content IS the vote syntax counts, same shape as the example post that
// inspired this ("socialcredit +1" as the entire post).
const TALLY_RE = /^([\s\S]{1,140}?)\s*:?\s*([+-])\s*1\s*$/;

export class TallyBoard {
  private state: DurableObjectState;
  private ready: Promise<void>;
  private tallies: Map<string, Tally> = new Map();
  private votes: VoteEntry[] = [];
  private cooldowns: Map<string, number> = new Map();
  private recentlySeen: Set<string> = new Set(); // in-memory only, defensive dedupe
  private ws: any = null;
  private reconnectDelay = 1000;

  constructor(state: DurableObjectState) {
    this.state = state;
    this.ready = this.state.blockConcurrencyWhile(async () => {
      const [tallies, votes, cooldowns] = await Promise.all([
        this.state.storage.get<Record<string, Tally>>("tallies"),
        this.state.storage.get<VoteEntry[]>("votes"),
        this.state.storage.get<Record<string, number>>("cooldowns"),
      ]);
      if (tallies) this.tallies = new Map(Object.entries(tallies));
      if (votes) this.votes = votes;
      if (cooldowns) this.cooldowns = new Map(Object.entries(cooldowns));
    });
    this.connectSocket().catch(() => {});
    this.state.storage.setAlarm(Date.now() + ALARM_MS).catch(() => {});
  }

  // ---- firehose --------------------------------------------------------
  // Workers connect OUT to a WebSocket server via fetch() + an Upgrade
  // header (the documented Cloudflare pattern), not the browser-style
  // `new WebSocket(url)` constructor. Same shape as sites/socialcredit.
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

  private async resolveDisplay(did: string): Promise<{ handle: string; displayName: string; avatar: string }> {
    try {
      const r = await fetch(`${APPVIEW}/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`);
      if (!r.ok) throw new Error("http " + r.status);
      const data: any = await r.json();
      return {
        handle: data.handle && data.handle !== "handle.invalid" ? data.handle : did,
        displayName: data.displayName || data.handle || did,
        avatar: data.avatar || "",
      };
    } catch {
      return { handle: did, displayName: did, avatar: "" };
    }
  }

  private ensureTally(displayName: string, now: number): Tally | null {
    const key = keyOf(displayName);
    let t = this.tallies.get(key);
    if (!t) {
      if (this.tallies.size >= MAX_TALLIES) return null; // storage ceiling — drop brand-new names
      t = { key, displayName, score: 0, upCount: 0, downCount: 0, firstSeenAt: now, updatedAt: now };
      this.tallies.set(key, t);
    }
    return t;
  }

  private async persist(): Promise<void> {
    await this.state.storage.put({
      tallies: Object.fromEntries(this.tallies),
      votes: this.votes,
      cooldowns: Object.fromEntries(this.cooldowns),
    });
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
    if (!commit || commit.operation !== "create") return;
    // Both collections here are effectively create-only for our purposes:
    // client-metadata.json only grants action=create for the point record,
    // and a later edit/delete of a post shouldn't retroactively cast or
    // uncast a vote — so updates/deletes are ignored defensively.

    const did = evt.did;
    if (typeof did !== "string" || !did.startsWith("did:")) return;
    const rkey = commit.rkey;
    if (typeof rkey !== "string") return;

    const seenId = `${commit.collection}::${did}::${rkey}`;
    if (this.recentlySeen.has(seenId)) return;
    this.recentlySeen.add(seenId);
    if (this.recentlySeen.size > RECENT_SEEN_CAP) {
      const first = this.recentlySeen.values().next().value;
      if (first !== undefined) this.recentlySeen.delete(first);
    }

    const rec = commit.record;
    if (!rec || typeof rec !== "object") return;

    if (commit.collection === COLLECTION) {
      const name = typeof rec.name === "string" ? normalizeName(rec.name) : "";
      if (!name) return;
      const delta: 1 | -1 | null = rec.delta === 1 ? 1 : rec.delta === -1 ? -1 : null;
      if (delta === null) return;
      const recordCreatedAt = typeof rec.createdAt === "string" ? rec.createdAt : null;
      await this.castVote(did, rkey, name, delta, null, recordCreatedAt);
      return;
    }

    if (commit.collection === POST_COLLECTION) {
      const text = typeof rec.text === "string" ? rec.text : "";
      if (!text) return;
      const m = TALLY_RE.exec(text.trim());
      if (!m) return;
      const name = normalizeName(m[1]);
      if (!name) return;
      const delta: 1 | -1 = m[2] === "+" ? 1 : -1;
      const postUrl = `https://bsky.app/profile/${did}/post/${rkey}`;
      const recordCreatedAt = typeof rec.createdAt === "string" ? rec.createdAt : null;
      await this.castVote(did, rkey, name, delta, postUrl, recordCreatedAt);
    }
  }

  // Shared counting path for both a direct net.bisks.tallybot.point record
  // and a "<name> +1"/"-1" post — same rules either way, and a vote that
  // fails the cooldown check is silently dropped: never scored, never
  // touches the cooldown.
  private async castVote(
    voterDid: string,
    rkey: string,
    displayName: string,
    delta: 1 | -1,
    postUrl: string | null,
    recordCreatedAt: string | null,
  ): Promise<void> {
    await this.ready;
    const now = Date.now();
    const key = keyOf(displayName);

    // Server-enforced cooldown: one counted vote per (voter, tally) pair per
    // hour. A vote written outside the window is simply never scored — it
    // doesn't consume or reset the cooldown, so spamming writes can't game
    // it. A voter can still vote on a DIFFERENT tally immediately; only
    // re-voting the same one is gated.
    const ckey = cooldownKey(voterDid, key);
    const last = this.cooldowns.get(ckey) || 0;
    if (now - last < COOLDOWN_MS) return;

    const tally = this.ensureTally(displayName, now);
    if (!tally) return; // MAX_TALLIES ceiling hit and this is a brand-new name

    const voterDisplay = await this.resolveDisplay(voterDid);

    tally.score += delta;
    if (delta > 0) tally.upCount += 1;
    else tally.downCount += 1;
    tally.updatedAt = now;

    this.votes.unshift({
      id: `${voterDid}::${rkey}`,
      voterDid,
      voterHandle: voterDisplay.handle,
      voterAvatar: voterDisplay.avatar,
      key,
      displayName: tally.displayName,
      delta,
      postUrl,
      createdAt: now,
      recordCreatedAt,
    });
    if (this.votes.length > MAX_VOTES_STORED) this.votes.length = MAX_VOTES_STORED;

    this.cooldowns.set(ckey, now);
    await this.persist();
  }

  // ---- alarm: reconnect heartbeat ---------------------------------------
  async alarm(): Promise<void> {
    await this.ready;
    if (!this.wsOpen()) this.connectSocket().catch(() => {});
    await this.state.storage.setAlarm(Date.now() + ALARM_MS);
  }

  // ---- derived views ------------------------------------------------------

  private rankedTallies(): Tally[] {
    return [...this.tallies.values()].sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
  }

  private tallyCard(t: Tally, rank: number | null, totalRanked: number): any {
    return {
      key: t.key,
      displayName: t.displayName,
      score: t.score,
      upCount: t.upCount,
      downCount: t.downCount,
      votesReceived: t.upCount + t.downCount,
      rank,
      totalRanked,
    };
  }

  private windowCutoff(window: string | null): number {
    const now = Date.now();
    switch (window) {
      case "1h":
        return now - 60 * 60 * 1000;
      case "24h":
        return now - 24 * 60 * 60 * 1000;
      case "7d":
        return now - 7 * 24 * 60 * 60 * 1000;
      case "30d":
        return now - 30 * 24 * 60 * 60 * 1000;
      default:
        return 0; // "all"
    }
  }

  private clampLimit(raw: string | null): number {
    const n = raw ? parseInt(raw, 10) : DEFAULT_LIMIT;
    if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
    return Math.min(n, MAX_LIMIT);
  }

  // ---- http ---------------------------------------------------------------
  async fetch(request: Request): Promise<Response> {
    await this.ready;
    if (!this.wsOpen()) this.connectSocket().catch(() => {});

    const url = new URL(request.url);
    const limit = this.clampLimit(url.searchParams.get("limit"));

    if (url.pathname === "/api/leaderboard" && request.method === "GET") {
      const sort = url.searchParams.get("sort") || "top";
      const q = (url.searchParams.get("q") || "").trim().toLowerCase();

      let rows: Tally[];
      let deltaByKey: Map<string, number> | null = null;

      if (sort === "gainers" || sort === "losers") {
        const cutoff = this.windowCutoff(url.searchParams.get("window"));
        deltaByKey = new Map();
        for (const v of this.votes) {
          if (v.createdAt < cutoff) break; // votes is newest-first
          deltaByKey.set(v.key, (deltaByKey.get(v.key) || 0) + v.delta);
        }
        rows = [...this.tallies.values()].filter((t) => deltaByKey!.has(t.key));
        rows.sort((a, b) => {
          const da = deltaByKey!.get(a.key) || 0;
          const db = deltaByKey!.get(b.key) || 0;
          return sort === "gainers" ? db - da : da - db;
        });
      } else if (sort === "bottom") {
        rows = this.rankedTallies().reverse();
      } else if (sort === "active") {
        rows = [...this.tallies.values()].sort(
          (a, b) => b.upCount + b.downCount - (a.upCount + a.downCount) || b.score - a.score,
        );
      } else {
        rows = this.rankedTallies(); // "top" (default)
      }

      if (q) {
        rows = rows.filter((t) => t.displayName.toLowerCase().includes(q));
      }

      const totalRanked = this.tallies.size;
      const rankOf = new Map(this.rankedTallies().map((t, i) => [t.key, i + 1]));
      const page = rows.slice(0, limit).map((t) => {
        const card = this.tallyCard(t, rankOf.get(t.key) ?? null, totalRanked);
        if (deltaByKey) card.windowDelta = deltaByKey.get(t.key) || 0;
        return card;
      });

      return json({ sort, board: page, total: rows.length, totalRanked });
    }

    if (url.pathname === "/api/activity" && request.method === "GET") {
      const key = url.searchParams.get("key");
      const voterDid = url.searchParams.get("voter");
      let rows = this.votes;
      if (key) rows = rows.filter((v) => v.key === keyOf(key));
      if (voterDid) rows = rows.filter((v) => v.voterDid === voterDid);
      return json({ votes: rows.slice(0, limit), total: rows.length });
    }

    if (url.pathname === "/api/tally" && request.method === "GET") {
      const raw = (url.searchParams.get("key") || "").trim();
      if (!raw) return json({ error: "missing key" }, 400);
      const key = keyOf(normalizeName(raw));

      const t = this.tallies.get(key);
      const ranked = this.rankedTallies();
      const totalRanked = ranked.length;
      const rank = t ? ranked.findIndex((x) => x.key === key) + 1 || null : null;

      const card = t
        ? this.tallyCard(t, rank, totalRanked)
        : { key, displayName: normalizeName(raw), score: 0, upCount: 0, downCount: 0, votesReceived: 0, rank: null, totalRanked };

      const votes = this.votes.filter((v) => v.key === key).slice(0, 50);

      return json({ tally: card, rank, totalRanked, votes });
    }

    if (url.pathname === "/api/cooldown" && request.method === "GET") {
      const did = url.searchParams.get("did") || "";
      const rawKey = url.searchParams.get("key") || "";
      if (!isDid(did)) return json({ error: "missing/bad did" }, 400);
      if (!rawKey.trim()) return json({ error: "missing key" }, 400);
      const key = keyOf(normalizeName(rawKey));
      const last = this.cooldowns.get(cooldownKey(did, key)) || 0;
      const nextEligibleAt = last ? last + COOLDOWN_MS : 0;
      const remainingMs = Math.max(0, nextEligibleAt - Date.now());
      return json({ lastVoteAt: last || null, nextEligibleAt: nextEligibleAt || null, remainingMs });
    }

    return json({ error: "not found" }, 404);
  }
}
