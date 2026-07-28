// Precomputes public/atlas-data.json — the whole simcluster atlas for a
// single fixed subject (norvid-studies.bsky.social), baked ahead of time
// instead of mapped live in-browser per visitor. This is round two: round
// one had a handle picker that did all of this live client-side, capped to
// 60 cluster members and one page (50 posts) each so a browser tab wouldn't
// sit there forever. Centering on one subject removes the need for a live
// picker, so the cap reasons go with it — this script scans the WHOLE
// mutuals pool and pages EVERY member's feed to exhaustion (with a generous
// safety valve per account so one hyper-prolific poster can't run forever).
//
// Re-run by hand to refresh the atlas:
//   node gen-atlas.mjs   # writes ./public/atlas-data.json
//
// Reads Bluesky's public AppView anonymously (api.bsky.app, no auth) — same
// endpoints the old client-side lib/cluster.js used, ported to Node.

import { writeFileSync } from "node:fs";

const PUB = "https://api.bsky.app/xrpc";
const SUBJECT = "norvid-studies.bsky.social";

const GRAPH_CONCURRENCY = 4;
const FEED_CONCURRENCY = 6;
const MIN_POOL = 6; // below this, widen mutuals -> follows so there's something to map
const FEED_PAGE_SAFETY_CAP = 40; // a safety valve against a runaway paginate, not a real cap
const GRAPH_PAGE_SAFETY_CAP = 200; // ~20000 follows/followers — ditto
// "no caps" means every cluster member gets scanned (no more 60-account
// cutoff) and no account gets stopped at a single page — but the atlas is
// about what the cluster's been "passing around lately," not full posting
// history since account creation, so pagination per account stops once it
// reaches posts older than this window rather than running forever.
const LOOKBACK_DAYS = 120;
const LOOKBACK_MS = LOOKBACK_DAYS * 24 * 60 * 60 * 1000;

async function jget(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    const r = await fetch(url);
    if (r.ok) return r.json();
    if (r.status === 429 && i < tries - 1) {
      await new Promise((res) => setTimeout(res, 1500 * (i + 1)));
      continue;
    }
    const e = new Error(`HTTP ${r.status}`);
    e.status = r.status;
    throw e;
  }
}

async function resolveDid(actor) {
  const a = actor.trim().replace(/^@/, "");
  if (a.startsWith("did:")) return a;
  const d = await jget(`${PUB}/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(a)}`);
  if (!d.did) throw new Error(`couldn't resolve "${a}"`);
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
  for (let p = 0; p < GRAPH_PAGE_SAFETY_CAP; p++) {
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

// Run `concurrency` copies of an async worker over `items` at once.
async function pool(items, concurrency, worker) {
  const out = new Array(items.length);
  let i = 0;
  async function lane() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await worker(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, lane));
  return out;
}

async function mapCluster(actor) {
  const did = await resolveDid(actor);
  console.log("resolved", actor, "->", did);

  console.log("fetching follows + followers…");
  const [follows, followers] = await pool(
    ["app.bsky.graph.getFollows", "app.bsky.graph.getFollowers"],
    GRAPH_CONCURRENCY,
    (endpoint) => graphAll(endpoint, endpoint.includes("Follows") ? "follows" : "followers", did),
  );
  console.log(`  ${follows.length} follows, ${followers.length} followers`);

  let self = { did, handle: actor.replace(/^@/, ""), displayName: actor, avatar: "" };
  try {
    self = profileOf(await jget(`${PUB}/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`));
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
  const clusterPool = mutuals.slice();
  if (clusterPool.length < MIN_POOL) {
    for (const f of follows) {
      if (seen.has(f.did)) continue;
      seen.add(f.did);
      clusterPool.push(profileOf(f));
    }
    if (clusterPool.length > mutualCount) kind = "moots + follows";
  }

  return {
    did,
    handle: self.handle,
    self,
    pool: clusterPool,
    kind,
    counts: { follows: follows.length, followers: followers.length, mutuals: mutualCount, pool: clusterPool.length },
  };
}

function extractLinks(post) {
  const links = [];
  const seen = new Set();
  const add = (uri) => {
    if (!uri || seen.has(uri)) return;
    try {
      new URL(uri);
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
  if (embed?.$type === "app.bsky.embed.external#view" && embed.external?.uri) add(embed.external.uri);
  else if (embed?.$type === "app.bsky.embed.external" && embed.external?.uri) add(embed.external.uri);
  const media = embed?.media;
  if (media?.$type === "app.bsky.embed.external#view" && media.external?.uri) add(media.external.uri);
  return links;
}

function domainOf(uri) {
  try {
    return new URL(uri).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

// Loose de-dupe key for "the same link posted more than once" — strips
// tracking noise so utm-tagged reposts of the same URL still group.
function normalizeUrl(uri) {
  try {
    const u = new URL(uri);
    for (const k of [...u.searchParams.keys()]) {
      if (/^utm_|^ref$|^si$/i.test(k)) u.searchParams.delete(k);
    }
    let s = u.origin + u.pathname.replace(/\/+$/, "") + (u.search ? "?" + u.searchParams.toString() : "");
    return s.toLowerCase();
  } catch {
    return uri;
  }
}

async function scanAccountFeed(acct, cutoffTime) {
  const found = [];
  let cursor = "";
  for (let p = 0; p < FEED_PAGE_SAFETY_CAP; p++) {
    const u = new URL(`${PUB}/app.bsky.feed.getAuthorFeed`);
    u.searchParams.set("actor", acct.did);
    u.searchParams.set("limit", "100");
    u.searchParams.set("filter", "posts_no_replies");
    if (cursor) u.searchParams.set("cursor", cursor);
    let d;
    try {
      d = await jget(u.toString());
    } catch {
      break;
    }
    const feed = d.feed || [];
    let sawOlder = false;
    for (const it of feed) {
      if (it.reason) continue; // skip reposts — attribute links to their author, not the reposter
      const post = it.post;
      const createdAt = post.record?.createdAt || "";
      const t = Date.parse(createdAt);
      if (isFinite(t) && t < cutoffTime) {
        sawOlder = true;
        continue; // feed pages are reverse-chron, so keep draining this page then stop
      }
      const links = extractLinks(post);
      if (!links.length) continue;
      found.push({
        uri: post.uri || "",
        handle: acct.handle, // displayName/avatar live once in `posters`, not per-entry
        text: post.record?.text?.trim() || "",
        createdAt,
        links,
        likeCount: post.likeCount || 0,
        repostCount: post.repostCount || 0,
        replyCount: post.replyCount || 0,
      });
    }
    cursor = d.cursor;
    if (!cursor || sawOlder) break;
  }
  return found;
}

async function buildAtlas(accounts) {
  const cutoffTime = Date.now() - LOOKBACK_MS;
  const acctByHandle = new Map(accounts.map((a) => [a.handle, a]));
  let done = 0;
  const perAccount = await pool(accounts, FEED_CONCURRENCY, async (acct) => {
    let found = [];
    try {
      found = await scanAccountFeed(acct, cutoffTime);
    } catch {
      // one account failing shouldn't sink the whole atlas
    }
    done++;
    if (done % 10 === 0 || done === accounts.length) {
      console.log(`  scanned ${done}/${accounts.length} accounts…`);
    }
    return found;
  });

  const entries = perAccount.flat().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  const domainCounts = new Map();
  const posterCounts = new Map(); // did -> { handle, displayName, avatar, count }
  const linkCounts = new Map(); // normalized url -> count

  for (const e of entries) {
    if (!posterCounts.has(e.handle)) {
      const acct = acctByHandle.get(e.handle);
      posterCounts.set(e.handle, {
        handle: e.handle,
        displayName: acct?.displayName || e.handle,
        avatar: acct?.avatar || "",
        count: 0,
      });
    }
    posterCounts.get(e.handle).count++;

    for (const link of e.links) {
      const d = domainOf(link);
      if (d) domainCounts.set(d, (domainCounts.get(d) || 0) + 1);
      const key = normalizeUrl(link);
      linkCounts.set(key, (linkCounts.get(key) || 0) + 1);
    }
  }

  // Attach each entry's max share-count across its own links, so the UI can
  // badge/sort "this link has been dropped N times across the cluster."
  for (const e of entries) {
    e.maxShareCount = Math.max(1, ...e.links.map((l) => linkCounts.get(normalizeUrl(l)) || 1));
  }

  const domains = [...domainCounts.entries()].sort((a, b) => b[1] - a[1]).map(([domain, count]) => ({ domain, count }));
  const posters = [...posterCounts.values()].sort((a, b) => b.count - a.count || a.handle.localeCompare(b.handle));

  return { entries, domains, posters, scannedCount: accounts.length };
}

async function main() {
  const cluster = await mapCluster(SUBJECT);
  console.log(`cluster: ${cluster.counts.pool} ${cluster.kind} + self`);

  const accounts = [cluster.self, ...cluster.pool];
  console.log(`scanning ${accounts.length} accounts' feeds for link-posts (no per-account page cap)…`);
  const atlas = await buildAtlas(accounts);

  const out = {
    generatedAt: new Date().toISOString(),
    lookbackDays: LOOKBACK_DAYS,
    subject: cluster.self,
    clusterKind: cluster.kind,
    counts: { ...cluster.counts, scanned: atlas.scannedCount, entries: atlas.entries.length, domains: atlas.domains.length },
    entries: atlas.entries,
    domains: atlas.domains,
    posters: atlas.posters,
  };

  const path = new URL("./public/atlas-data.json", import.meta.url).pathname;
  writeFileSync(path, JSON.stringify(out));
  console.log(`wrote ${path} — ${out.entries.length} link-posts, ${out.domains.length} domains, ${out.posters.length} posters`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
