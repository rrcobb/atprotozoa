// bsky.js — crosstag's AppView helpers. Copied+trimmed from
// trigrams/public/lib/unique.js's resolveActor/searchGet lineage (copy, don't
// abstract). Two hosts, deliberately:
//   PUB  (public.api.bsky.app) — profile/handle reads. Always open, no auth.
//   SEARCH (api.bsky.app)      — searchPosts. public.api.bsky.app 403s search,
//     but api.bsky.app serves it unauthenticated with CORS * (verified in
//     notes/70-reply-and-rich.md's "HAMMERED" test). No worker needed.

const PUB = "https://public.api.bsky.app/xrpc";
const SEARCH = "https://api.bsky.app/xrpc";

async function jget(url) {
  const r = await fetch(url);
  if (!r.ok) {
    const e = new Error(`HTTP ${r.status}`);
    e.status = r.status;
    throw e;
  }
  return r.json();
}

// searchPosts with retry/backoff — api.bsky.app soft-403s/429s under bursty
// load (a real, documented behavior, not a permanent block). Both must be
// retried with backoff; only other 4xx are real errors. Copied from
// trigrams/public/lib/unique.js searchGet.
async function searchGet(url, tries = 6) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (r.status === 200) return await r.json();
      const soft = r.status === 429 || r.status === 403 || r.status >= 500;
      if (!soft) return null;
      const ra = parseInt(r.headers.get("retry-after") || "", 10);
      await new Promise((res) =>
        setTimeout(res, ra ? ra * 1000 : 600 * (i + 1) + 350 * i * i),
      );
    } catch {
      await new Promise((res) => setTimeout(res, 600 * (i + 1)));
    }
  }
  return null;
}

// Forgiving handle/DID/URL/@mention parser, resolved to a full profile.
export async function resolveProfile(actor) {
  const a = (actor || "")
    .trim()
    .replace(/^@/, "")
    .replace(/^https?:\/\/(bsky\.app\/profile\/)?/, "")
    .split("/")[0];
  if (!a) throw new Error("empty handle");
  const d = await jget(`${PUB}/app.bsky.actor.getProfile?actor=${encodeURIComponent(a)}`);
  if (!d.did) throw new Error(`couldn't resolve "${a}"`);
  return {
    did: d.did,
    handle: d.handle,
    displayName: d.displayName || d.handle,
    avatar: d.avatar || null,
  };
}

const MAX_PAGES = 20; // per direction, 100/page => <=2000 posts/direction

// All posts authored by `fromDid` that mention `toDid`, newest-first pages,
// collected oldest-to-newest at the end isn't done here — caller merges both
// directions and sorts once.
export async function scanCrosstags(fromDid, toDid, { onPage } = {}) {
  const posts = [];
  let cursor = "";
  let pages = 0;

  for (; pages < MAX_PAGES; pages++) {
    const u = new URL(`${SEARCH}/app.bsky.feed.searchPosts`);
    u.searchParams.set("q", "*");
    u.searchParams.set("author", fromDid);
    u.searchParams.set("mentions", toDid);
    u.searchParams.set("sort", "latest");
    u.searchParams.set("limit", "100");
    if (cursor) u.searchParams.set("cursor", cursor);

    const d = await searchGet(u.toString());
    if (!d) break;
    const recs = d.posts || [];
    for (const p of recs) {
      const rec = p.record || {};
      posts.push({
        uri: p.uri,
        authorDid: p.author && p.author.did,
        text: rec.text || "",
        createdAt: rec.createdAt || p.indexedAt,
        isReply: !!rec.reply,
        parentUri: rec.reply ? rec.reply.parent && rec.reply.parent.uri : null,
      });
    }
    if (onPage) onPage(pages + 1, posts.length);
    cursor = d.cursor;
    if (!cursor || recs.length === 0) break;
  }
  return posts;
}

// bsky.app permalink from an at:// uri (works with a DID as the identifier,
// no handle lookup needed).
export function postUrl(uri) {
  const m = String(uri).match(/^at:\/\/([^/]+)\/[^/]+\/([^/]+)$/);
  if (!m) return "https://bsky.app";
  return `https://bsky.app/profile/${m[1]}/post/${m[2]}`;
}
