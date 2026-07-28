// cluster.js — map a Bluesky handle's "simcluster" (self + mutuals) and pull
// every link the cluster has posted lately. Everything reads Bluesky's
// PUBLIC AppView anonymously (api.bsky.app, CORS *, no auth). The moots half
// is copied and trimmed from clustercrawl/lib/cluster.js, itself from
// simcluster/lib/moots.js, itself from neighborhood/hood.js — copy, don't
// abstract. The link-scraping half (postsWithLinks) is new for the atlas.

const PUB = "https://api.bsky.app/xrpc";

const GRAPH_PAGES = 12; // ≤ ~1200 follows + ~1200 followers scanned for mutuals
const MIN_POOL = 6; // below this, widen mutuals → follows so there's something to map
const ATLAS_MAX_ACCOUNTS = 60; // cap how many cluster members we spend feed calls on
const ATLAS_CONCURRENCY = 6; // parallel getAuthorFeed calls in flight at once

async function jget(url) {
  const r = await fetch(url);
  if (!r.ok) {
    const e = new Error(`HTTP ${r.status}`);
    e.status = r.status;
    throw e;
  }
  return r.json();
}

// Resolve a handle / URL / @mention / DID to a DID. Forgiving about paste
// formats — copied from neighborhood/hood.js resolveDid.
export async function resolveDid(actor) {
  const a = (actor || "")
    .trim()
    .replace(/^@/, "")
    .replace(/^at:\/\//, "")
    .replace(/^https?:\/\/(bsky\.app\/profile\/)?/, "")
    .split("/")[0];
  if (!a) throw new Error("empty handle");
  if (a.startsWith("did:")) return a;
  const d = await jget(
    `${PUB}/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(a)}`,
  );
  if (!d.did) throw new Error(`couldn't resolve “${a}”`);
  return d.did;
}

const profileOf = (p) => ({
  did: p.did,
  handle: p.handle,
  displayName: p.displayName || p.handle,
  avatar: p.avatar || "",
});

async function graphAll(endpoint, key, did) {
  const out = [];
  let cursor = "";
  for (let p = 0; p < GRAPH_PAGES; p++) {
    const u = new URL(`${PUB}/${endpoint}`);
    u.searchParams.set("actor", did);
    u.searchParams.set("limit", "100");
    if (cursor) u.searchParams.set("cursor", cursor);
    let d;
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

// Resolve a handle to its cluster: { did, handle, self, pool, kind, counts }.
// `pool` is moots (mutuals) without self, widened to plain follows if the
// mutual set is small.
export async function moots(actor, { onStep } = {}) {
  const did = await resolveDid(actor);
  if (onStep) onStep("mapping who they follow…");
  const follows = await graphAll("app.bsky.graph.getFollows", "follows", did);
  if (onStep) onStep("mapping who follows them back…");
  const followers = await graphAll(
    "app.bsky.graph.getFollowers",
    "followers",
    did,
  );

  let self = {
    did,
    handle: actor.replace(/^@/, ""),
    displayName: actor.replace(/^@/, ""),
    avatar: "",
  };
  try {
    const prof = await jget(
      `${PUB}/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`,
    );
    self = profileOf(prof);
  } catch {}

  const followerDids = new Set(followers.map((f) => f.did));
  const seen = new Set([did]);
  const mutuals = [];
  for (const f of follows) {
    if (!followerDids.has(f.did) || seen.has(f.did)) continue;
    seen.add(f.did);
    mutuals.push(profileOf(f));
  }

  const mutualCount = mutuals.length;
  let kind = "moots";
  const pool = mutuals.slice();
  if (pool.length < MIN_POOL) {
    for (const f of follows) {
      if (seen.has(f.did)) continue;
      seen.add(f.did);
      pool.push(profileOf(f));
    }
    if (pool.length > mutualCount) kind = "moots + follows";
  }

  return {
    did,
    handle: self.handle,
    self,
    pool,
    kind,
    counts: {
      follows: follows.length,
      followers: followers.length,
      mutuals: mutualCount,
      pool: pool.length,
    },
  };
}

function extractLinks(post) {
  const links = [];
  const seen = new Set();
  const add = (uri) => {
    if (!uri || seen.has(uri)) return;
    try {
      new URL(uri); // throws on garbage
    } catch {
      return;
    }
    seen.add(uri);
    links.push(uri);
  };
  for (const f of post.record?.facets || []) {
    for (const feat of f.features || []) {
      if (feat.$type === "app.bsky.richtext.facet#link" && feat.uri) add(feat.uri);
    }
  }
  const embed = post.embed || post.record?.embed;
  if (embed?.$type === "app.bsky.embed.external#view" && embed.external?.uri) {
    add(embed.external.uri);
  } else if (embed?.$type === "app.bsky.embed.external" && embed.external?.uri) {
    add(embed.external.uri);
  }
  // a recordWithMedia can carry an external card alongside a quote
  const media = embed?.media;
  if (media?.$type === "app.bsky.embed.external#view" && media.external?.uri) {
    add(media.external.uri);
  }
  return links;
}

function domainOf(uri) {
  try {
    return new URL(uri).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

// Run `limit` copies of an async worker over `items`, `concurrency` at a time.
async function pool(items, concurrency, worker) {
  const out = new Array(items.length);
  let i = 0;
  async function lane() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await worker(items[idx], idx);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, lane),
  );
  return out;
}

// Given the cluster's accounts (self + pool, already capped), fetch a page
// of each one's own posts and keep the ones carrying a link — either an
// inline text link (a facet) or a link-card embed. Returns entries sorted
// newest-first:
// [{ uri, handle, displayName, avatar, text, createdAt, links, likeCount,
//    repostCount, replyCount }]
export async function postsWithLinks(accounts, { onStep } = {}) {
  const scanned = accounts.slice(0, ATLAS_MAX_ACCOUNTS);
  const truncated = accounts.length > scanned.length;
  let done = 0;
  const perAccount = await pool(scanned, ATLAS_CONCURRENCY, async (acct) => {
    const found = [];
    try {
      const u = new URL(`${PUB}/app.bsky.feed.getAuthorFeed`);
      u.searchParams.set("actor", acct.did);
      u.searchParams.set("limit", "50");
      u.searchParams.set("filter", "posts_no_replies");
      const d = await jget(u.toString());
      for (const it of d.feed || []) {
        if (it.reason) continue; // skip reposts — attribute links to their author, not the reposter
        const post = it.post;
        const links = extractLinks(post);
        if (!links.length) continue;
        found.push({
          uri: post.uri || "",
          handle: acct.handle,
          displayName: acct.displayName || acct.handle,
          avatar: acct.avatar || "",
          text: post.record?.text?.trim() || "",
          createdAt: post.record?.createdAt || "",
          links,
          likeCount: post.likeCount || 0,
          repostCount: post.repostCount || 0,
          replyCount: post.replyCount || 0,
        });
      }
    } catch {
      // one account failing shouldn't sink the whole atlas
    }
    done++;
    if (onStep) onStep(`reading the cluster's posts… ${done}/${scanned.length}`);
    return found;
  });

  const entries = perAccount.flat().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  const domainCounts = new Map();
  for (const e of entries) {
    for (const link of e.links) {
      const d = domainOf(link);
      if (!d) continue;
      domainCounts.set(d, (domainCounts.get(d) || 0) + 1);
    }
  }
  const domains = [...domainCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([domain, count]) => ({ domain, count }));

  return { entries, domains, scannedCount: scanned.length, truncated };
}
