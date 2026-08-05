// intrigue Worker — intrigue.bisks.net
//
// Enter a Bluesky handle, get an "interestingness" score out of 100. The
// score itself is computed twice, independently, from the exact same rules:
//
//   - public/index.html computes it client-side (one profile fetch + one
//     page of recent posts against the public AppView) for instant feedback.
//   - This file computes it again, server-side in the Board Durable Object,
//     from nothing but the handle the client sends — it re-fetches the same
//     profile + post page itself and recomputes from scratch. The client's
//     own number is never trusted or stored; only what the server
//     independently derives goes on the leaderboard. See sites/peakposting
//     for the sibling pattern (verify by re-fetching, not by trusting).
//
// The scoring rules below are intentionally duplicated (not imported) in
// public/index.html — copy, don't abstract, even within one site, because
// one copy runs in a browser and the other in a Worker.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  BOARD: DurableObjectNamespace;
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
  list<T = unknown>(options?: { prefix?: string }): Promise<Map<string, T>>;
}
interface DurableObjectState {
  storage: DurableObjectStorage;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/leaderboard" || url.pathname === "/api/submit") {
      const id = env.BOARD.idFromName("global");
      const stub = env.BOARD.get(id);
      return stub.fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
  });
}

const API = "https://public.api.bsky.app/xrpc/";

async function xrpc(method: string, params: Record<string, string>): Promise<any> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(API + method + (qs ? "?" + qs : ""), {
    cf: { cacheTtl: 30 } as unknown as Record<string, unknown>,
  });
  if (!res.ok) throw new Error(`${method} ${res.status}`);
  return res.json();
}

// --- scoring rules (kept in lockstep with public/index.html's copy) ---

const GENERIC_SUFFIXES = [".bsky.social", ".bsky.brid.gy", ".bsky.team"];
const fmt = (n: number) => n.toLocaleString();

interface Signal {
  label: string;
  pts: number;
  detail: string | null;
}

function isCustomDomain(handle: string): boolean {
  return !!handle && !GENERIC_SUFFIXES.some((s) => handle.endsWith(s));
}

function scoreProfile(profile: any): { points: number; signals: Signal[] } {
  const signals: Signal[] = [];
  let points = 0;
  const add = (label: string, pts: number, detail: string | null = null) => {
    if (!pts) return;
    points += pts;
    signals.push({ label, pts, detail });
  };

  const handle = profile.handle || "";
  if (isCustomDomain(handle)) add("custom domain handle", 8, `@${handle} isn't a *.bsky.social freebie`);

  const bio = (profile.description || "").trim();
  if (bio.length > 120) add("detailed bio", 8, `${bio.length} characters of self-summary`);
  else if (bio.length > 20) add("has a bio", 4);
  if (/https?:\/\//i.test(bio)) add("bio links out", 3, "points somewhere else on the internet");

  if (profile.avatar) add("has an avatar", 2);
  if (profile.banner) add("has a banner", 4, "bothered to set a banner image");
  if (profile.pinnedPost) add("pinned post", 5, "curates their own profile");

  const assoc = profile.associated || {};
  const lists = Number(assoc.lists || 0);
  const feedgens = Number(assoc.feedgens || 0);
  const packs = Number(assoc.starterPacks || 0);
  if (lists > 0) add(`made ${lists} list${lists === 1 ? "" : "s"}`, Math.min(lists * 3, 12));
  if (feedgens > 0)
    add(`runs ${feedgens} custom feed${feedgens === 1 ? "" : "s"}`, Math.min(feedgens * 12, 36), "writes their own ranking algorithm");
  if (packs > 0) add(`built ${packs} starter pack${packs === 1 ? "" : "s"}`, Math.min(packs * 6, 18));
  if (assoc.labeler) add("runs a labeler", 15, "moderates part of the network");

  const followers = Number(profile.followersCount || 0);
  const follows = Number(profile.followsCount || 0);
  if (followers >= 10000) add("real reach", 10, `${fmt(followers)} followers`);
  else if (followers >= 1000) add("solid following", 5, `${fmt(followers)} followers`);
  if (followers > 200 && followers / Math.max(follows, 1) >= 20) add("audience >> who they follow", 6, "broadcast energy");
  if (follows > 500 && follows / Math.max(followers, 1) >= 10) add("follows way more than follow them", 3, "here to read, not to be read");

  if (typeof profile.createdAt === "string") {
    const ageDays = (Date.now() - Date.parse(profile.createdAt)) / 86400000;
    if (Number.isFinite(ageDays) && ageDays > 900) add("early adopter", 8, `on Bluesky since ${profile.createdAt.slice(0, 10)}`);
    else if (Number.isFinite(ageDays) && ageDays > 365) add("been around a while", 3);
  }

  return { points, signals };
}

function scorePosts(did: string, feedItems: any[]): { points: number; signals: Signal[]; sampled: number } {
  const signals: Signal[] = [];
  let points = 0;
  const add = (label: string, pts: number, detail: string | null = null) => {
    if (!pts) return;
    points += pts;
    signals.push({ label, pts, detail });
  };

  let own = 0;
  let selfReplies = 0;
  let quotes = 0;
  let externalLinks = 0;
  let totalImages = 0;
  let altImages = 0;
  const langs = new Set<string>();
  const emojis = new Set<string>();
  const textSample: string[] = [];
  const seenText = new Map<string, number>();
  let dupes = 0;

  for (const item of feedItems) {
    if (item.reason) continue; // a repost of someone else's post, not theirs
    const post = item.post;
    if (!post || !post.author || post.author.did !== did) continue;
    own++;
    const rec = post.record || {};
    if (Array.isArray(rec.langs)) for (const l of rec.langs) langs.add(l);

    const text = typeof rec.text === "string" ? rec.text : "";
    if (text) {
      textSample.push(text);
      const norm = text.trim().toLowerCase().replace(/\s+/g, " ");
      if (norm.length > 8) {
        const count = (seenText.get(norm) || 0) + 1;
        seenText.set(norm, count);
        if (count > 1) dupes++;
      }
      const found = text.match(/\p{Extended_Pictographic}/gu) || [];
      for (const e of found) emojis.add(e);
    }

    if (rec.reply) {
      const parentDid = item.reply?.parent?.author?.did;
      if (parentDid === did) selfReplies++;
    }

    const embed = post.embed;
    if (embed) {
      const t = embed.$type || "";
      if (t.includes("recordWithMedia") || t === "app.bsky.embed.record#view") quotes++;
      if (t === "app.bsky.embed.external#view") externalLinks++;
      if (t === "app.bsky.embed.images#view" && Array.isArray(embed.images)) {
        totalImages += embed.images.length;
        altImages += embed.images.filter((i: any) => i.alt && i.alt.trim().length > 0).length;
      }
    }
  }

  if (own === 0) return { points: 0, signals: [], sampled: 0 };

  if (langs.size >= 2) add(`posts in ${langs.size} languages`, Math.min((langs.size - 1) * 4, 12), [...langs].join(", "));

  if (totalImages > 0) {
    const altRate = altImages / totalImages;
    if (altRate >= 0.8) add("writes alt text", 10, "images are accessible");
    else if (altRate >= 0.3) add("sometimes writes alt text", 4);
  }

  if (quotes > 0) add("quote-posts", Math.min(quotes, 6), `${quotes} in the sample`);
  if (externalLinks > 0) add("shares links", Math.min(externalLinks, 5));
  if (selfReplies >= 3) add("builds threads", Math.min(selfReplies, 10), `${selfReplies} self-replies in the sample`);
  if (emojis.size >= 5) add("emoji range", Math.min(emojis.size - 4, 8), [...emojis].slice(0, 8).join(" "));

  const dupeRate = dupes / own;
  if (dupeRate >= 0.4 && own >= 10) add("repeats itself a lot", -15, `${Math.round(dupeRate * 100)}% near-duplicate posts`);

  const lens = textSample.map((t) => t.length).filter((n) => n > 0);
  if (lens.length >= 5 && Math.max(...lens) - Math.min(...lens) > 200) add("range from one-liners to essays", 4);

  return { points, signals, sampled: own };
}

function scoreAccount(profile: any, feedItems: any[]): { score: number; signals: Signal[]; sampled: number } {
  const p = scoreProfile(profile);
  const q = scorePosts(profile.did, feedItems);
  const raw = p.points + q.points;
  const score = Math.max(0, Math.min(100, Math.round(100 * (1 - Math.exp(-Math.max(raw, 0) / 55)))));
  return { score, signals: [...p.signals, ...q.signals].sort((a, b) => b.pts - a.pts), sampled: q.sampled };
}

async function computeScore(did: string): Promise<{ profile: any; score: number; signals: Signal[]; sampled: number }> {
  const profile = await xrpc("app.bsky.actor.getProfile", { actor: did });
  const feed = await xrpc("app.bsky.feed.getAuthorFeed", { actor: did, limit: "50" });
  const { score, signals, sampled } = scoreAccount(profile, feed.feed || []);
  return { profile, score, signals, sampled };
}

interface UserRecord {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
  score: number;
  topSignals: Signal[];
  sampled: number;
  updatedAt: number;
}

const LEADERBOARD_SIZE = 100;
const RESCORE_COOLDOWN_MS = 30_000;

// Holds one UserRecord per DID that's ever been scored, under "user:<did>".
// A submit re-derives the score from the AppView every time (an account's
// interestingness can change), unless it was just scored within the
// cooldown window, in which case the cached record is returned as-is so an
// accidental double-submit doesn't hammer the AppView.
export class Board {
  private state: DurableObjectState;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/leaderboard" && request.method === "GET") {
      const users = await this.state.storage.list<UserRecord>({ prefix: "user:" });
      const all = [...users.values()];
      const board = all
        .sort((a, b) => b.score - a.score || b.updatedAt - a.updatedAt)
        .slice(0, LEADERBOARD_SIZE)
        .map((r) => ({
          did: r.did,
          handle: r.handle,
          displayName: r.displayName,
          avatar: r.avatar,
          score: r.score,
          topSignals: r.topSignals,
        }));
      return json({ board, scored: all.length });
    }

    if (url.pathname === "/api/submit" && request.method === "POST") {
      let body: any;
      try {
        body = await request.json();
      } catch {
        return json({ error: "bad request body" }, 400);
      }

      const handleOrDid = typeof body?.handle === "string" ? body.handle.trim() : "";
      if (!handleOrDid) return json({ error: "missing handle" }, 400);

      let did: string;
      try {
        did = handleOrDid.startsWith("did:") ? handleOrDid : (await xrpc("com.atproto.identity.resolveHandle", { handle: handleOrDid })).did;
      } catch {
        return json({ error: "couldn't resolve that handle" }, 400);
      }
      if (typeof did !== "string" || !did.startsWith("did:")) return json({ error: "couldn't resolve that handle" }, 400);

      const key = `user:${did}`;
      const existing = await this.state.storage.get<UserRecord>(key);
      if (existing && Date.now() - existing.updatedAt < RESCORE_COOLDOWN_MS) {
        return json({ did, handle: existing.handle, score: existing.score, signals: existing.topSignals, sampled: existing.sampled, cached: true });
      }

      let result;
      try {
        result = await computeScore(did);
      } catch {
        return json({ error: "couldn't reach the appview to score that account" }, 502);
      }

      const record: UserRecord = {
        did,
        handle: result.profile.handle || handleOrDid,
        displayName: result.profile.displayName || undefined,
        avatar: result.profile.avatar || undefined,
        score: result.score,
        topSignals: result.signals.slice(0, 6),
        sampled: result.sampled,
        updatedAt: Date.now(),
      };
      await this.state.storage.put({ [key]: record });

      return json({ did, handle: record.handle, score: record.score, signals: result.signals, sampled: result.sampled, cached: false });
    }

    return json({ error: "not found" }, 404);
  }
}
