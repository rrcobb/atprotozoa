// areyoumad Worker — mounted at bisks.net/areyoumad/ (see
// notes/40-new-site-playbook.md). The static site does all the real work
// client-side; the one thing that needed a server is shared links. A plain
// static page serves the same og:title/og:description/og:url no matter whose
// handle is in the URL, so Bluesky's link-unfurl cache shows one generic
// card forever no matter who shares it (see notes/45-sharing-and-virality.md,
// tier 4). Fix: /s/<handle> is a real, distinct URL per person — the Worker
// resolves the handle server-side, computes the same "who ghosted your
// courtesy-like" summary the client does, and stamps a personalized
// title/description/url onto the same page shell before serving it. Copied
// and adapted from sites/didscope/src/index.ts's renderShare (copy, don't
// abstract) — the actual moot/like-check logic is ported from
// public/lib/atproto.js since a Worker can't import browser modules.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const PREFIX = "/areyoumad";
const PUB = "https://api.bsky.app/xrpc";
const PLC_DIR = "https://plc.directory";

async function jget(url: string): Promise<any> {
  const r = await fetch(url, { headers: { Accept: "application/json" }, cf: { cacheTtl: 60 } as any });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

function cleanHandle(raw: string): string {
  return decodeURIComponent(raw || "")
    .trim()
    .replace(/^@/, "")
    .replace(/^at:\/\//, "")
    .replace(/^https?:\/\/(bsky\.app\/profile\/)?/, "")
    .split("/")[0];
}

async function resolveDid(actor: string): Promise<string> {
  if (actor.startsWith("did:")) return actor;
  const d = await jget(`${PUB}/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(actor)}`);
  if (!d.did) throw new Error(`couldn't resolve "${actor}"`);
  return d.did;
}

async function didDoc(did: string): Promise<any> {
  if (did.startsWith("did:plc:")) {
    const r = await fetch(`${PLC_DIR}/${did}`);
    return r.ok ? r.json() : null;
  }
  if (did.startsWith("did:web:")) {
    const domain = did.replace("did:web:", "").replace(/:/g, "/");
    const r = await fetch(`https://${domain}/.well-known/did.json`);
    return r.ok ? r.json() : null;
  }
  return null;
}

async function resolvePds(did: string): Promise<string | null> {
  try {
    const doc = await didDoc(did);
    const svc = (doc?.service || []).find(
      (s: any) => s.id === "#atproto_pds" || s.type === "AtprotoPersonalDataServer",
    );
    return svc?.serviceEndpoint || null;
  } catch {
    return null;
  }
}

async function getProfile(did: string): Promise<any> {
  try {
    return await jget(`${PUB}/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`);
  } catch {
    return null;
  }
}

// Trimmed cap vs. the client's (which runs once, on a live visit): this runs
// on every fresh crawl of a share link, so it stays cheap and fast.
async function listRecordsSince(
  pdsUrl: string,
  repo: string,
  collection: string,
  sinceMs: number,
  filter: (v: any) => boolean,
  capPages = 4,
): Promise<any[]> {
  const out: any[] = [];
  let cursor: string | undefined;
  for (let p = 0; p < capPages; p++) {
    const params = new URLSearchParams({ repo, collection, limit: "100" });
    if (cursor) params.set("cursor", cursor);
    let d: any;
    try {
      d = await jget(`${pdsUrl.replace(/\/$/, "")}/xrpc/com.atproto.repo.listRecords?${params}`);
    } catch {
      break;
    }
    const records = d.records || [];
    let hitOld = false;
    for (const rec of records) {
      const t = Date.parse(rec.value?.createdAt || "");
      if (!Number.isFinite(t) || t < sinceMs) {
        hitOld = true;
        break;
      }
      if (!filter || filter(rec.value)) out.push(rec);
    }
    cursor = d.cursor;
    if (hitOld || !cursor || !records.length) break;
  }
  return out;
}

const GRAPH_PAGES = 6;

async function graphAll(endpoint: string, key: string, did: string): Promise<any[]> {
  const out: any[] = [];
  let cursor = "";
  for (let p = 0; p < GRAPH_PAGES; p++) {
    const u = new URL(`${PUB}/${endpoint}`);
    u.searchParams.set("actor", did);
    u.searchParams.set("limit", "100");
    if (cursor) u.searchParams.set("cursor", cursor);
    let d: any;
    try {
      d = await jget(u.toString());
    } catch {
      break;
    }
    for (const it of d[key] || []) out.push(it);
    cursor = d.cursor;
    if (!cursor) break;
  }
  return out;
}

async function moots(did: string, cap = 60): Promise<any[]> {
  const follows = await graphAll("app.bsky.graph.getFollows", "follows", did);
  const followers = await graphAll("app.bsky.graph.getFollowers", "followers", did);
  const followerDids = new Set(followers.map((f: any) => f.did));
  const out: any[] = [];
  for (const f of follows) {
    if (!followerDids.has(f.did)) continue;
    out.push({ did: f.did, handle: f.handle });
    if (out.length >= cap) break;
  }
  return out;
}

async function didLike(postUri: string, likerDid: string, capPages = 2): Promise<boolean> {
  let cursor: string | undefined;
  for (let p = 0; p < capPages; p++) {
    const u = new URL(`${PUB}/app.bsky.feed.getLikes`);
    u.searchParams.set("uri", postUri);
    u.searchParams.set("limit", "100");
    if (cursor) u.searchParams.set("cursor", cursor);
    let d: any;
    try {
      d = await jget(u.toString());
    } catch {
      break;
    }
    const likes = d.likes || [];
    if (likes.some((l: any) => l.actor?.did === likerDid)) return true;
    cursor = d.cursor;
    if (!cursor || !likes.length) break;
  }
  return false;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]).catch(() => null);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

function authorDidFromUri(uri: string): string {
  return uri.replace(/^at:\/\//, "").split("/")[0];
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1).trimEnd() + "…";
}

// Exact strings from public/index.html — split/join swaps every occurrence.
// Order matters: the full <title> text must be swapped before the shorter
// og:title/twitter:title text, since the latter is a substring of the former.
const PAGE_TITLE = "areyoumad — who ghosted your courtesy-like today — bisks.net";
const OG_TWITTER_TITLE = "areyoumad — who ghosted your courtesy-like today";
const OG_DESC =
  "Finds today's replies, checks who you replied to didn't like you back, and gives you a button to ask them if they're mad. Petty, automated, atproto-native.";
const TWITTER_DESC = "Finds today's replies, checks who didn't like you back, gives you a button to ask if they're mad.";
const OG_URL_ATTR = 'content="https://bisks.net/areyoumad"';

async function renderShare(env: Env, request: Request, rawHandle: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  const handle = cleanHandle(rawHandle);
  if (!handle) return new Response(html, { headers: base.headers });

  try {
    const did = await resolveDid(handle);
    const [profile, pds] = await Promise.all([getProfile(did), resolvePds(did)]);
    if (!pds) throw new Error("no pds");
    const myHandle = profile?.handle || handle;

    const startOfDayUtcMs = Math.floor(Date.now() / 86400000) * 86400000;
    const replies = await listRecordsSince(pds, did, "app.bsky.feed.post", startOfDayUtcMs, (v) => !!v?.reply);

    let title: string;
    let desc: string;
    let twitterDesc: string;

    if (!replies.length) {
      title = `areyoumad: @${myHandle} hasn't replied today`;
      desc = `@${myHandle} hasn't posted any replies yet today — nothing to check. See who's ghosting your courtesy-likes at bisks.net/areyoumad.`;
      twitterDesc = desc;
    } else {
      const myMoots = await moots(did);
      const mootByDid = new Map(myMoots.map((m: any) => [m.did, m]));
      const byMoot = new Map<string, any[]>();
      for (const rec of replies) {
        const parentUri = rec.value?.reply?.parent?.uri;
        if (!parentUri) continue;
        const parentAuthorDid = authorDidFromUri(parentUri);
        if (parentAuthorDid === did || !mootByDid.has(parentAuthorDid)) continue;
        const list = byMoot.get(parentAuthorDid) || [];
        list.push({ uri: rec.uri, createdAt: rec.value.createdAt });
        byMoot.set(parentAuthorDid, list);
      }

      if (!byMoot.size) {
        title = `areyoumad: @${myHandle} — nothing to check yet`;
        desc = `@${myHandle} replied ${replies.length} time${replies.length === 1 ? "" : "s"} today, but not to any moots — nothing to check. bisks.net/areyoumad`;
        twitterDesc = desc;
      } else {
        const entries = [...byMoot.entries()];
        const checked = await mapLimit(entries, 6, async ([mootDid, list]) => {
          const sorted = [...list].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
          for (const r of sorted) {
            if (await didLike(r.uri, mootDid)) return null;
          }
          return true;
        });
        const flaggedCount = checked.filter(Boolean).length;
        const mootCount = byMoot.size;

        if (!flaggedCount) {
          title = `areyoumad: @${myHandle} — nobody's mad`;
          desc = `@${myHandle} replied to ${mootCount} moot${mootCount === 1 ? "" : "s"} today. Every single one courtesy-liked back. Check your own at bisks.net/areyoumad.`;
        } else {
          title = `areyoumad: @${myHandle} — ${flaggedCount}/${mootCount} moots ghosted today`;
          desc = `${flaggedCount} of the ${mootCount} moot${mootCount === 1 ? "" : "s"} @${myHandle} replied to today didn't courtesy-like back. See who, and ask them, at bisks.net/areyoumad.`;
        }
        twitterDesc = truncate(desc, 200);
      }
    }

    const ogUrl = `https://bisks.net/areyoumad/s/${encodeURIComponent(handle)}`;

    html = html
      .split(PAGE_TITLE)
      .join(esc(title))
      .split(OG_TWITTER_TITLE)
      .join(esc(title))
      .split(OG_DESC)
      .join(esc(desc))
      .split(TWITTER_DESC)
      .join(esc(twitterDesc))
      .split(OG_URL_ATTR)
      .join(`content="${ogUrl}"`);

    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
    });
  } catch {
    // Couldn't resolve/compute server-side (typo, deleted account, rate
    // limit) — still serve the live page so the link isn't dead; the client
    // script surfaces its own error once it tries the same lookup.
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
    });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // /areyoumad/s/<handle> — the distinct, shareable, per-person URL. Every
    // handle gets its own page (and its own og:title/description/url), so a
    // link unfurler can't collapse every share into one generic cached card.
    const shareMatch = url.pathname.match(/^\/areyoumad\/s\/([^/]+)\/?$/);
    if (shareMatch) return renderShare(env, request, shareMatch[1]);

    url.pathname = url.pathname.slice(PREFIX.length) || "/";
    return env.ASSETS.fetch(new Request(url, request));
  },
};
