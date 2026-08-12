// socialcredit Worker — socialcredit.bisks.net
//
// @fromthewestmeadow.com: a Bluesky Social Credit leaderboard. Sign in with
// Bluesky OAuth, paste/type any handle, +1 or -1 their score. Scores persist
// globally, tied to DIDs (not handles, so a rename doesn't lose history).
// A follow-up reply in the same thread laid out the anti-abuse shape: OAuth
// required to vote, no self-voting, a server-enforced 1h cooldown per voter,
// rate-limiting, DID identity throughout, and a transparent public vote
// history. Browsing needs no login. (An even later reply in the same thread
// asked to allow self-voting, then immediately retracted it with "wait
// CAN'T" — self-voting stays blocked per that retraction.)
//
// The cooldown is per (voter, target) pair, not a single global per-voter
// lock — a later reply in the thread asked for exactly this: "make it so
// you can vote once an hour for a given person not just a single vote once
// an hour." So an account can vote on as many different people as it likes
// within an hour, but voting on the SAME target again has to wait out the
// hour. See COOLDOWN_MS and the cooldowns map below.
//
// The write happens where every other OAuth site in this repo puts a write:
// straight from the browser to the voter's OWN PDS, as a
// net.bisks.socialcredit.vote record (see public/lib/oauth.js). That's the
// only part that needs the voter's own PDS to authenticate.
//
// The score, the cooldown, and the no-self-voting rule are enforced here,
// server-side, in the CreditBoard Durable Object — which keeps a live
// Jetstream subscription filtered to just net.bisks.socialcredit.vote across
// the WHOLE network (same "one DO, one Jetstream filter on our own custom
// NSID" shape as sites/quadrants' QuadrantHub / sites/memex's GlobalTracker).
// Jetstream only re-emits commits the relay already verified were signed by
// the DID that made them, so by the time a vote reaches handleMessage below,
// its `did` can't be spoofed — a client that tries to route around the
// cooldown or self-vote check can still write the record to their own PDS
// (nothing here can stop that), but the DO simply never counts it, so it
// can't move anyone's score or reset anyone's cooldown. That's the actual
// enforcement boundary: not "can you write the record" but "does the score
// ever move because of it."
//
// The `profiles` map holds an entry for every DID that's ever cast OR
// received a vote (a voter-only entry exists so /api/profile can show their
// own votesCast even before anyone's voted on them). The public leaderboard
// must only ever surface accounts that have actually RECEIVED a vote —
// rankedProfiles() below filters on that, and every "totalRanked"/count the
// API reports is derived from it, not from profiles.size. (Bug fixed
// 2026-08-11: the leaderboard was built straight off profiles.size/values(),
// so anyone who'd ever cast a vote — even with zero votes received — showed
// up ranked on the public board next to real score-0 targets.)
//
// Because the DO can silently drop a written vote (cooldown, self-vote, a
// malformed record), a successful com.atproto.repo.createRecord response
// alone never proves a vote counted. (Bug fixed 2026-08-11: the client took
// that write as success and just showed an optimistic "vote written" —
// someone whose write landed after the DO had already dropped it for a
// server-side reason saw a cheerful success message and a target score that
// never moved. public/index.html and public/profile.html now poll
// /api/activity?voter=&target= after writing and only report success once
// the vote is actually visible there, re-check /api/cooldown before writing
// too, and no longer reset a fetch-failed cooldown read back to "clear to
// vote". The score PILL now updates optimistically the instant the PDS
// write succeeds — see applyOptimisticScore() in both HTML files — with the
// poll above still the source of truth: it corrects the pill to the real
// value on success, and rolls it back with a plain re-fetch if the vote
// never actually counted, so the optimism never lies for long.)
//
// A vote can ALSO be cast as a plain reply — post "socialcredit +1" or
// "socialcredit -1" as a reply to someone's post and it counts the same as
// a signed vote record. This works because Jetstream already re-verifies
// every commit's signature, so a reply's `did` is exactly as trustworthy as
// a net.bisks.socialcredit.vote record's — the CreditBoard just also
// subscribes to app.bsky.feed.post (see JETSTREAM_URL/POST_COLLECTION
// below), and for a reply whose text matches SOCIALCREDIT_RE, treats the
// replier as voter and the parent post's author (read straight off
// reply.parent.uri — an at:// URI embeds its author's DID, no extra lookup
// needed) as target. Same rules apply either way: no self-voting, one
// counted vote per (voter, target) pair per hour — both paths funnel
// through the same castVote() below, so there's exactly one enforcement
// point, not two to keep in sync.

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

const GENERIC_TITLE = "Social Credit profile — bisks.net";
const GENERIC_DESC =
  "See anyone's Social Credit score, rank, and full vote history — then sign in with Bluesky to give them a +1 or -1 yourself.";
const GENERIC_OG_URL = "https://socialcredit.bisks.net/p/";

async function renderProfile(env: Env, request: Request, rawActor: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/profile.html", request.url), { method: "GET" }));
  let html = await base.text();

  const actor = decodeURIComponent(rawActor || "").trim().replace(/^@/, "");
  if (!actor) return new Response(html, { headers: base.headers });

  try {
    const stub = env.BOARD.get(env.BOARD.idFromName("global"));
    const apiUrl = new URL(request.url);
    apiUrl.pathname = "/api/profile";
    apiUrl.search = `?actor=${encodeURIComponent(actor)}`;
    const r = await stub.fetch(new Request(apiUrl.toString()));
    if (!r.ok) throw new Error("profile lookup failed");
    const data: any = await r.json();
    const p = data.profile;
    if (!p) throw new Error("no profile");

    const who = p.handle && p.handle !== "handle.invalid" ? "@" + p.handle : p.did;
    const sign = p.score > 0 ? "+" : "";
    const title = `${who}'s Social Credit: ${sign}${p.score}`;
    const rankBit = data.rank ? ` Ranked #${data.rank} of ${data.totalRanked}.` : "";
    const desc = `${p.upvotes} upvotes, ${p.downvotes} downvotes.${rankBit} Vote at socialcredit.bisks.net.`;
    const ogUrl = `https://socialcredit.bisks.net/p/${encodeURIComponent(actor)}`;

    html = html
      .split(GENERIC_TITLE).join(esc(title))
      .split(GENERIC_DESC).join(esc(desc))
      .split(GENERIC_OG_URL).join(ogUrl);

    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=60" },
    });
  } catch {
    // Couldn't resolve/score server-side — still serve the live page; the
    // client re-fetches and surfaces its own "not found" state if the actor
    // really doesn't resolve.
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

    // /p/<handle-or-did> — a distinct, shareable per-profile URL, stamped
    // with that person's live score so it unfurls as a real card instead of
    // one generic one for every link. See notes/45-sharing-and-virality.md
    // and sites/thrashmeter/src/index.ts (renderShare), which this mirrors.
    const m = url.pathname.match(/^\/p\/([^/]+)\/?$/);
    if (m) return renderProfile(env, request, m[1]);

    return env.ASSETS.fetch(request);
  },
};

// ---------------------------------------------------------------------------
// CreditBoard — the one global Durable Object. Watches Jetstream for
// net.bisks.socialcredit.vote across the whole network, keeps running scores
// per target DID, a full vote log, and per-voter cooldown state.
// ---------------------------------------------------------------------------

const COLLECTION = "net.bisks.socialcredit.vote";
const POST_COLLECTION = "app.bsky.feed.post"; // reply-vote trigger: "socialcredit +1" / "socialcredit -1"
const JETSTREAM_URL =
  "https://jetstream2.us-east.bsky.network/subscribe?" +
  [COLLECTION, POST_COLLECTION].map((c) => "wantedCollections=" + encodeURIComponent(c)).join("&");
const ALARM_MS = 20 * 1000; // reconnect heartbeat, same cadence as sites/quadrants
const APPVIEW = "https://public.api.bsky.app/xrpc";
const PROFILE_TTL_MS = 6 * 60 * 60 * 1000;

const COOLDOWN_MS = 60 * 60 * 1000; // one vote per (voter, target) pair per hour, server-enforced
const MAX_REASON = 280;
const MAX_VOTES_STORED = 20_000;
const RECENT_SEEN_CAP = 2_000; // defensive de-dupe only; no cursor replay in normal operation
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

interface Profile {
  did: string;
  handle: string;
  displayName: string;
  avatar: string;
  score: number;
  upvotes: number;
  downvotes: number;
  votesCast: number;
  profileResolvedAt: number;
  firstSeenAt: number;
  updatedAt: number;
}

interface VoteEntry {
  id: string; // `${voterDid}::${rkey}`
  voterDid: string;
  voterHandle: string;
  voterAvatar: string;
  targetDid: string;
  targetHandle: string;
  targetAvatar: string;
  delta: 1 | -1;
  reason: string | null;
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

// An at:// record URI embeds its author's DID as the first path segment —
// at://did:plc:xyz/app.bsky.feed.post/rkey — so a reply's parent author is
// readable straight off reply.parent.uri, no extra AppView lookup needed.
function authorFromUri(uri: string | undefined): string | null {
  const m = /^at:\/\/([^/]+)\//.exec(uri || "");
  return m ? m[1] : null;
}

// Cooldown is per (voter, target) pair — an account can vote on as many
// different people as it likes within an hour, just not the same one twice.
function cooldownKey(voterDid: string, targetDid: string): string {
  return `${voterDid}::${targetDid}`;
}

const POST_URL_RE = /^https:\/\/bsky\.app\/profile\/[^/]+\/post\/[A-Za-z0-9]+$/;

// "socialcredit +1" / "socialcredit -1" as a reply — allows a colon and/or
// whitespace between the word and the sign ("socialcredit: +1",
// "socialcredit+1"), but nothing else, so a reply that just happens to
// mention "socialcredit" and "+1" separately (e.g. "love socialcredit, +1
// for effort") doesn't accidentally trigger a vote.
const SOCIALCREDIT_RE = /\bsocialcredit\s*:?\s*([+-])\s*1\b/i;

export class CreditBoard {
  private state: DurableObjectState;
  private ready: Promise<void>;
  private profiles: Map<string, Profile> = new Map();
  private votes: VoteEntry[] = [];
  private cooldowns: Map<string, number> = new Map();
  private recentlySeen: Set<string> = new Set(); // in-memory only, defensive dedupe
  private ws: any = null;
  private reconnectDelay = 1000;

  constructor(state: DurableObjectState) {
    this.state = state;
    this.ready = this.state.blockConcurrencyWhile(async () => {
      const [profiles, votes, cooldowns] = await Promise.all([
        this.state.storage.get<Record<string, Profile>>("profiles"),
        this.state.storage.get<VoteEntry[]>("votes"),
        this.state.storage.get<Record<string, number>>("cooldowns"),
      ]);
      if (profiles) this.profiles = new Map(Object.entries(profiles));
      if (votes) this.votes = votes;
      if (cooldowns) this.cooldowns = new Map(Object.entries(cooldowns));
    });
    this.connectSocket().catch(() => {});
    this.state.storage.setAlarm(Date.now() + ALARM_MS).catch(() => {});
  }

  // ---- firehose --------------------------------------------------------
  // Workers connect OUT to a WebSocket server via fetch() + an Upgrade
  // header (the documented Cloudflare pattern), not the browser-style
  // `new WebSocket(url)` constructor. Same shape as sites/quadrants.
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
    const existing = this.profiles.get(did);
    if (existing && Date.now() - existing.profileResolvedAt < PROFILE_TTL_MS) {
      return { handle: existing.handle, displayName: existing.displayName, avatar: existing.avatar };
    }
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
      if (existing) return { handle: existing.handle, displayName: existing.displayName, avatar: existing.avatar };
      return { handle: did, displayName: did, avatar: "" };
    }
  }

  private ensureProfile(did: string, display: { handle: string; displayName: string; avatar: string }, now: number): Profile {
    let p = this.profiles.get(did);
    if (!p) {
      p = {
        did,
        handle: display.handle,
        displayName: display.displayName,
        avatar: display.avatar,
        score: 0,
        upvotes: 0,
        downvotes: 0,
        votesCast: 0,
        profileResolvedAt: now,
        firstSeenAt: now,
        updatedAt: now,
      };
      this.profiles.set(did, p);
    } else {
      p.handle = display.handle;
      p.displayName = display.displayName;
      p.avatar = display.avatar;
      p.profileResolvedAt = now;
    }
    return p;
  }

  private async persist(): Promise<void> {
    await this.state.storage.put({
      profiles: Object.fromEntries(this.profiles),
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
    // client-metadata.json only grants action=create for the vote record,
    // and a later edit/delete of a reply shouldn't retroactively cast or
    // uncast a reply-vote — so updates/deletes are ignored defensively.

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
      const target = isDid(rec.target) ? rec.target : null;
      if (!target) return;
      const delta: 1 | -1 | null = rec.delta === 1 ? 1 : rec.delta === -1 ? -1 : null;
      if (delta === null) return;
      const reason = typeof rec.reason === "string" && rec.reason.trim() ? rec.reason.trim().slice(0, MAX_REASON) : null;
      const postUrl = typeof rec.postUrl === "string" && POST_URL_RE.test(rec.postUrl) ? rec.postUrl : null;
      const recordCreatedAt = typeof rec.createdAt === "string" ? rec.createdAt : null;
      await this.castVote(did, rkey, target, delta, reason, postUrl, recordCreatedAt);
      return;
    }

    if (commit.collection === POST_COLLECTION) {
      const text = typeof rec.text === "string" ? rec.text : "";
      if (!text) return;
      const parentUri = rec.reply && rec.reply.parent ? rec.reply.parent.uri : undefined;
      if (typeof parentUri !== "string") return; // reply-votes only — a root post can't target anyone
      const target = authorFromUri(parentUri);
      if (!target || !isDid(target)) return;
      const m = SOCIALCREDIT_RE.exec(text);
      if (!m) return;
      const delta: 1 | -1 = m[1] === "+" ? 1 : -1;
      const reason = text.replace(SOCIALCREDIT_RE, "").trim().slice(0, MAX_REASON) || null;
      const postUrl = `https://bsky.app/profile/${did}/post/${rkey}`; // the reply itself, as context
      const recordCreatedAt = typeof rec.createdAt === "string" ? rec.createdAt : null;
      await this.castVote(did, rkey, target, delta, reason, postUrl, recordCreatedAt);
    }
  }

  // Shared counting path for both a direct net.bisks.socialcredit.vote
  // record and a "socialcredit +1"/"-1" reply — same rules either way, and
  // a vote that fails either check is silently dropped: never scored, never
  // touches the cooldown.
  private async castVote(
    voterDid: string,
    rkey: string,
    target: string,
    delta: 1 | -1,
    reason: string | null,
    postUrl: string | null,
    recordCreatedAt: string | null,
  ): Promise<void> {
    if (target === voterDid) return; // no self-voting — silently dropped, never counted

    await this.ready;
    const now = Date.now();

    // Server-enforced cooldown: one counted vote per (voter, target) pair
    // per hour. A vote written outside the window is simply never scored —
    // it doesn't consume or reset the cooldown, so spamming writes can't
    // game it. A voter can still vote on a DIFFERENT target immediately;
    // only re-voting the same target is gated.
    const ckey = cooldownKey(voterDid, target);
    const last = this.cooldowns.get(ckey) || 0;
    if (now - last < COOLDOWN_MS) return;

    const [voterDisplay, targetDisplay] = await Promise.all([this.resolveDisplay(voterDid), this.resolveDisplay(target)]);
    const voterProfile = this.ensureProfile(voterDid, voterDisplay, now);
    const targetProfile = this.ensureProfile(target, targetDisplay, now);

    voterProfile.votesCast += 1;
    voterProfile.updatedAt = now;

    targetProfile.score += delta;
    if (delta > 0) targetProfile.upvotes += 1;
    else targetProfile.downvotes += 1;
    targetProfile.updatedAt = now;

    this.votes.unshift({
      id: `${voterDid}::${rkey}`,
      voterDid,
      voterHandle: voterDisplay.handle,
      voterAvatar: voterDisplay.avatar,
      targetDid: target,
      targetHandle: targetDisplay.handle,
      targetAvatar: targetDisplay.avatar,
      delta,
      reason,
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

  // Only accounts that have actually received a vote belong on the public
  // leaderboard — a profile entry can also exist purely because its DID has
  // cast votes (see the comment at the top of this file).
  private rankedProfiles(): Profile[] {
    return [...this.profiles.values()]
      .filter((p) => p.upvotes + p.downvotes > 0)
      .sort((a, b) => b.score - a.score || a.did.localeCompare(b.did));
  }

  private profileCard(p: Profile, rank: number | null, totalRanked: number): any {
    return {
      did: p.did,
      handle: p.handle,
      displayName: p.displayName,
      avatar: p.avatar,
      score: p.score,
      upvotes: p.upvotes,
      downvotes: p.downvotes,
      votesReceived: p.upvotes + p.downvotes,
      votesCast: p.votesCast,
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

      let rows: Profile[];
      let deltaByDid: Map<string, number> | null = null;

      if (sort === "gainers" || sort === "losers") {
        const cutoff = this.windowCutoff(url.searchParams.get("window"));
        deltaByDid = new Map();
        for (const v of this.votes) {
          if (v.createdAt < cutoff) break; // votes is newest-first
          deltaByDid.set(v.targetDid, (deltaByDid.get(v.targetDid) || 0) + v.delta);
        }
        rows = [...this.profiles.values()].filter((p) => deltaByDid!.has(p.did));
        rows.sort((a, b) => {
          const da = deltaByDid!.get(a.did) || 0;
          const db = deltaByDid!.get(b.did) || 0;
          return sort === "gainers" ? db - da : da - db;
        });
      } else if (sort === "bottom") {
        rows = this.rankedProfiles().reverse();
      } else if (sort === "voted") {
        rows = [...this.profiles.values()]
          .filter((p) => p.upvotes + p.downvotes > 0)
          .sort((a, b) => b.upvotes + b.downvotes - (a.upvotes + a.downvotes) || b.score - a.score);
      } else {
        rows = this.rankedProfiles(); // "top" (default)
      }

      if (q) {
        rows = rows.filter(
          (p) => p.handle.toLowerCase().includes(q) || p.displayName.toLowerCase().includes(q),
        );
      }

      const totalRanked = this.rankedProfiles().length;
      const rankOf = new Map(this.rankedProfiles().map((p, i) => [p.did, i + 1]));
      const page = rows.slice(0, limit).map((p) => {
        const card = this.profileCard(p, rankOf.get(p.did) ?? null, totalRanked);
        if (deltaByDid) card.windowDelta = deltaByDid.get(p.did) || 0;
        return card;
      });

      return json({ sort, board: page, total: rows.length, totalRanked });
    }

    if (url.pathname === "/api/activity" && request.method === "GET") {
      const targetDid = url.searchParams.get("target");
      const voterDid = url.searchParams.get("voter");
      let rows = this.votes;
      if (targetDid) rows = rows.filter((v) => v.targetDid === targetDid);
      if (voterDid) rows = rows.filter((v) => v.voterDid === voterDid);
      return json({ votes: rows.slice(0, limit), total: rows.length });
    }

    if (url.pathname === "/api/profile" && request.method === "GET") {
      const raw = (url.searchParams.get("actor") || "").trim().replace(/^@/, "");
      if (!raw) return json({ error: "missing actor" }, 400);

      let did: string;
      if (raw.startsWith("did:")) {
        did = raw;
      } else {
        try {
          const r = await fetch(`${APPVIEW}/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(raw)}`);
          if (!r.ok) throw new Error("resolve failed");
          did = (await r.json<{ did?: string }>()).did || "";
        } catch {
          return json({ error: "couldn't resolve that handle" }, 400);
        }
      }
      if (!did) return json({ error: "couldn't resolve that handle" }, 400);

      let p = this.profiles.get(did);
      const display = await this.resolveDisplay(did);
      if (p) {
        p = this.ensureProfile(did, display, Date.now());
        await this.persist();
      }

      const ranked = this.rankedProfiles();
      const totalRanked = ranked.length;
      const rank = p ? ranked.findIndex((x) => x.did === did) + 1 || null : null;

      const card = p
        ? this.profileCard(p, rank, totalRanked)
        : {
            did,
            handle: display.handle,
            displayName: display.displayName,
            avatar: display.avatar,
            score: 0,
            upvotes: 0,
            downvotes: 0,
            votesReceived: 0,
            votesCast: 0,
            rank: null,
            totalRanked,
          };

      const received = this.votes.filter((v) => v.targetDid === did).slice(0, 50);
      const cast = this.votes.filter((v) => v.voterDid === did).slice(0, 50);

      return json({ profile: card, rank, totalRanked, received, cast });
    }

    if (url.pathname === "/api/cooldown" && request.method === "GET") {
      const did = url.searchParams.get("did") || "";
      const target = url.searchParams.get("target") || "";
      if (!isDid(did)) return json({ error: "missing/bad did" }, 400);
      if (!isDid(target)) return json({ error: "missing/bad target" }, 400);
      const last = this.cooldowns.get(cooldownKey(did, target)) || 0;
      const nextEligibleAt = last ? last + COOLDOWN_MS : 0;
      const remainingMs = Math.max(0, nextEligibleAt - Date.now());
      return json({ lastVoteAt: last || null, nextEligibleAt: nextEligibleAt || null, remainingMs });
    }

    return json({ error: "not found" }, 404);
  }
}
