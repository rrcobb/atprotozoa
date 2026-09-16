// topmutuals.js — resolve a Bluesky handle's mutuals (people it follows who
// follow it back — copied and trimmed from sites/mootrace's lib/mutuals.js,
// itself from clustercrawl/lib/cluster.js — copy, don't abstract), then rank
// them by how many times each has replied to the searched handle: their
// "inner circle."
//
// 2026-09-16, asked by @heika.dog ("find the best way to change innercircle
// so it uses constellation to query posts instead of pulling every mutual's
// repo — if I have a lot of mutuals it'll take a long time"). Two real
// changes came out of investigating that, plus one deliberately NOT made —
// see the note below on why a full constellation replacement for ranking
// isn't actually the best way for every account:
//
// 1. Mapping the mutual set itself (mutualsOf) used to paginate the AppView's
//    getFollows AND getFollowers, both capped at 100/page — exactly the kind
//    of walk the "prefer bulk reads" standing order (see
//    sites/buildthis/builder/INSTRUCTIONS.md) already replaced elsewhere in
//    this repo. Follows are now a single com.atproto.sync.getRepo CAR
//    download (repo-backed, no pagination); followers now try
//    constellation.microcosm.blue's backlink index first (pages of 1000 vs.
//    the AppView's 100), falling back to the old paginated walk only if
//    constellation errors — same pattern as sites/mootfluence's
//    lib/moots.js and sites/kevinmoot's lib/bfs.js. This part is a
//    straightforward win regardless of mutual count.
//
// 2. Ranking mutuals by replies-to-mainDid used to mean downloading every
//    mutual's WHOLE repo as a CAR just to count — correct, but scaling with
//    mutual count. Constellation *can* answer "who replied to this post,"
//    but only keyed by an exact post URI, not by "any post this DID ever
//    made" (confirmed live: `/links/all?target=<bare DID>` has no
//    reply.parent bucket at all — reply targets are indexed by the parent
//    post's URI, never the author's DID). So a constellation-based rank
//    necessarily means enumerating *mainDid's own posts* and asking
//    "who replied to this one" for each — a cost that scales with mainDid's
//    OWN post count, not with mutual count. Tested live against
//    norvid-studies.bsky.social (59,229 posts, one of this site's original
//    requesters): that's 59k+ backlink queries, dramatically WORSE than the
//    mutual-scan it would replace, because a real account's post count
//    routinely dwarfs its mutual count (also confirmed live: heika.dog has
//    12,073 posts vs. 492 follows). So rankMutualsByConstellation is used
//    only when it's actually cheaper — see CONSTELLATION_WORTHWHILE_MULTIPLIER
//    and buildCircle's precheck — and buildCircle falls back to the original
//    full-mutual-scan otherwise, which stays the genuinely best approach for
//    a prolific poster with a modest mutual count.

import { fetchRepoRecordsWithKeys } from "./car.js";
import { resolvePds } from "./identity.js";

const PUB = "https://api.bsky.app/xrpc";
const POST_TYPE = "app.bsky.feed.post";
const FOLLOW_TYPE = "app.bsky.graph.follow";

const CONSTELLATION = "https://constellation.microcosm.blue";
const REPLY_SOURCE = "app.bsky.feed.post:reply.parent.uri";

// Constellation's index has a hard start (crawls the firehose live, never
// backfilled) — confirmed elsewhere in this repo (sites/blockcurve, xbill) at
// 2025-01-28T17:00:00Z. A follow/reply made before that date, by an account
// that hasn't touched it since, may not show up in a constellation query.
// That's why buildCircle pulls a candidate buffer past the requested circle
// size rather than trusting the constellation-ranked order exactly, and why
// both mutualsOf's followers lookup and buildCircle's ranking fall back to a
// full walk/scan if constellation returns nothing at all.
const CONSTELLATION_INDEXED_SINCE_MS = 1738083600000;

// Bounds how many of mainDid's own posts get their backlinks checked at
// once — a politeness/browser-memory limit, not a cap on how many posts get
// checked. Every post still gets queried, however many there are.
const RANK_CONCURRENCY = 8;

// How many extra candidates past `circleSize` to pull from the constellation
// ranking before doing the authoritative full-repo rescan — a safety margin
// against the indexing-gap caveat above, not a speed knob.
const RANK_BUFFER_MULTIPLIER = 2;

// A constellation backlink query is a small JSON call; a full mutual-repo
// CAR download+parse is much heavier — measured live while building this,
// a single constellation getBacklinks call runs ~140ms, while a real repo
// CAR download+parse (bisks.net, ~3200 posts; cee.wtf, ~5300 posts) took
// 2.4-3.5s, roughly a 17-25x per-call difference. So constellation-based
// ranking is still worth it even if mainDid has several times more of their
// own posts than they have mutuals — this multiplier is deliberately set
// below that measured ratio (popular posts need extra paginated backlink
// calls, and the ratio was only measured on two accounts), not equal to it.
// Past this multiplier, per-post constellation queries would outnumber a
// direct mutual scan by enough that the scan is just the faster plan — see
// the header comment's norvid-studies/heika.dog numbers for why accounts
// that blow past even this multiplier aren't a rare edge case.
const CONSTELLATION_WORTHWHILE_MULTIPLIER = 15;

// Backstop, not a budget — same treatment as the rest of the moot family
// (see notes/40-new-site-playbook.md, 2026-08-28 cap order): getFollows/
// getFollowers have no bulk-download equivalent, so this still paginates,
// but the number of pages it's willing to spend is not a correctness limit.
const GRAPH_PAGES = 400;

// CONCURRENCY bounds how many repo downloads run at once — a politeness/
// browser-memory limit (don't open 200 simultaneous fetches to 200 different
// PDSs), not a cap on how many mutuals get scanned. Every mutual is still
// scanned, however many there are; this only paces how fast.
const CONCURRENCY = 6;

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
    for (const it of d[key] || []) out.push(it.did);
    cursor = d.cursor;
    if (!cursor) break;
  }
  return out;
}

// Follows are records in the account's own repo — one CAR download, no
// pagination (see notes/40-new-site-playbook.md's cee.wtf bulk-read order).
// Falls back to the paginated AppView walk only if the repo read itself
// fails (PDS unreachable, oversized repo, etc).
async function fetchFollows(did) {
  try {
    const pds = await resolvePds(did);
    if (!pds) throw new Error("no PDS");
    const { records } = await fetchRepoRecordsWithKeys(pds, did, FOLLOW_TYPE);
    return records.map((r) => r.value && r.value.subject).filter(Boolean);
  } catch {
    return graphAll("app.bsky.graph.getFollows", "follows", did);
  }
}

// Followers are an AppView-computed reverse index, not a repo record, so
// there's no bulk-download equivalent — constellation indexes the same
// app.bsky.graph.follow records by their .subject, though, which is exactly
// "who follows this DID." Pages at up to 1000/request vs. the AppView's 100.
// Falls back to the paginated AppView walk if constellation errors. Copied
// pattern from sites/mootfluence/lib/moots.js and sites/kevinmoot/lib/bfs.js
// (see notes/ideas/microcosm-blue.md).
async function fetchFollowers(did) {
  try {
    const out = [];
    let cursor = "";
    for (;;) {
      const u = new URL(`${CONSTELLATION}/links/distinct-dids`);
      u.searchParams.set("target", did);
      u.searchParams.set("collection", FOLLOW_TYPE);
      u.searchParams.set("path", ".subject");
      u.searchParams.set("limit", "1000");
      if (cursor) u.searchParams.set("cursor", cursor);
      const d = await jget(u.toString());
      const page = d.linking_dids || [];
      out.push(...page);
      cursor = d.cursor;
      if (!cursor || !page.length) break;
    }
    return out;
  } catch {
    return graphAll("app.bsky.graph.getFollowers", "followers", did);
  }
}

// Batch-hydrate DIDs into profile views, 25/request (the AppView's cap) —
// copied pattern from sites/mootfluence/lib/identity.js. Follows/followers
// now come back as bare DIDs (CAR records and constellation links don't
// carry profile info), so the final mutual list needs this to get handles/
// avatars/display names for rendering. A DID whose profile can't be fetched
// (deleted account, etc) still renders — as a bare handle-less entry — rather
// than silently dropping it from the circle.
async function getProfiles(dids) {
  const out = new Map();
  for (let i = 0; i < dids.length; i += 25) {
    const batch = dids.slice(i, i + 25);
    const u = new URL(`${PUB}/app.bsky.actor.getProfiles`);
    for (const d of batch) u.searchParams.append("actors", d);
    try {
      const d = await jget(u.toString());
      for (const p of d.profiles || []) out.set(p.did, profileOf(p));
    } catch {
      // partial data is fine — missing profiles just fall back below
    }
  }
  return out;
}

// Resolve a handle to { did, handle, self, mutuals, mainPostsCount }.
// `mutuals` is the plain follow ∩ follow-back set, self excluded, no
// widening. `mainPostsCount` (from the same getProfile call already needed
// for `self`) lets buildCircle decide, before downloading anything else,
// whether constellation-based ranking is even worth attempting for this
// account — see CONSTELLATION_WORTHWHILE_MULTIPLIER.
export async function mutualsOf(actor, { onStep } = {}) {
  const did = await resolveDid(actor);
  if (onStep) onStep("mapping who they follow…");
  const follows = await fetchFollows(did);
  if (onStep) onStep("mapping who follows them back…");
  const followers = await fetchFollowers(did);

  let self = {
    did,
    handle: actor.replace(/^@/, ""),
    displayName: actor.replace(/^@/, ""),
    avatar: "",
  };
  let mainPostsCount = null;
  try {
    const prof = await jget(
      `${PUB}/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`,
    );
    self = profileOf(prof);
    mainPostsCount = typeof prof.postsCount === "number" ? prof.postsCount : null;
  } catch {}

  const followerSet = new Set(followers);
  const seen = new Set([did]);
  const mutualDids = [];
  for (const f of follows) {
    if (!followerSet.has(f) || seen.has(f)) continue;
    seen.add(f);
    mutualDids.push(f);
  }

  if (onStep) onStep(`hydrating ${mutualDids.length} mutual profiles…`);
  const profiles = await getProfiles(mutualDids);
  const mutuals = mutualDids.map(
    (d) => profiles.get(d) || { did: d, handle: d, displayName: d, avatar: "" },
  );

  return { did, handle: self.handle, self, mutuals, mainPostsCount };
}

function didFromUri(uri) {
  const m = /^at:\/\/(did:[^/]+)\//.exec(uri || "");
  return m ? m[1] : null;
}

// Scans one mutual's whole repo. Returns { repliesToMain, firstReplies }:
// repliesToMain is how many times this account has replied to mainDid ever
// (the ranking signal); firstReplies is Map<targetDid, {createdAt, uri,
// text}> — this account's EARLIEST reply to every did it's ever replied to,
// not just mainDid, so the grid step can reuse it for whichever other
// accounts make the top 40. Throws if the repo can't be read at all; the
// caller marks that mutual "unknown" rather than "never replied."
export async function scanMutual(did, mainDid) {
  const pds = await resolvePds(did);
  if (!pds) throw new Error("couldn't resolve a PDS for " + did);
  const { records } = await fetchRepoRecordsWithKeys(pds, did, POST_TYPE);
  const firstReplies = new Map();
  let repliesToMain = 0;
  for (const { uri, value } of records) {
    const parentUri = value?.reply?.parent?.uri;
    if (!parentUri) continue;
    const targetDid = didFromUri(parentUri);
    if (!targetDid || targetDid === did) continue;
    const createdAt = value.createdAt;
    if (!createdAt || typeof createdAt !== "string") continue;
    if (targetDid === mainDid) repliesToMain++;
    const text = typeof value.text === "string" ? value.text : "";
    const cur = firstReplies.get(targetDid);
    if (!cur || createdAt < cur.createdAt) {
      firstReplies.set(targetDid, { createdAt, uri, text });
    }
  }
  return { repliesToMain, firstReplies };
}

// Runs scanMutual for every mutual, bounded concurrency. onEach(mutual,
// result|null, done, total) fires as each finishes — result is null when
// that mutual's repo couldn't be read at all (private/deleted/oversized/PDS
// down), so ranking and the grid can both show a visible "unknown" instead
// of silently dropping that mutual or hanging on one bad account.
export async function scanAll(mutuals, mainDid, onEach) {
  let next = 0;
  let done = 0;
  async function worker() {
    while (next < mutuals.length) {
      const m = mutuals[next++];
      let result = null;
      try {
        result = await scanMutual(m.did, mainDid);
      } catch {
        result = null;
      }
      done++;
      onEach(m, result, done, mutuals.length);
    }
  }
  const workers = Array.from(
    { length: Math.min(CONCURRENCY, mutuals.length) },
    worker,
  );
  await Promise.all(workers);
}

// Every {did, rkey} record linking to `subject` via `source` — full cursor
// walk, no page cap (a busy post can have thousands of replies). Thin wrapper
// around constellation's blue.microcosm.links.getBacklinks.
async function fetchBacklinksAll(subject, source) {
  const out = [];
  let cursor = null;
  for (;;) {
    const u = new URL(`${CONSTELLATION}/xrpc/blue.microcosm.links.getBacklinks`);
    u.searchParams.set("subject", subject);
    u.searchParams.set("source", source);
    u.searchParams.set("limit", "100");
    if (cursor) u.searchParams.set("cursor", cursor);
    const d = await jget(u.toString());
    const records = d.records || [];
    out.push(...records);
    cursor = d.cursor;
    if (!cursor || !records.length) break;
  }
  return out;
}

// True when checking constellation for who-replied-to-each-of-mainDid's-posts
// is likely cheaper than just downloading every mutual's repo directly — see
// CONSTELLATION_WORTHWHILE_MULTIPLIER's doc comment. `mutualCount` of 0 means
// there's nothing to rank either way; treat that as "not worth it" so callers
// skip straight to the (equally pointless) fallback instead of spending a
// CAR download on it.
function worthConstellation(ownPostCount, mutualCount) {
  if (!mutualCount) return false;
  return ownPostCount <= mutualCount * CONSTELLATION_WORTHWHILE_MULTIPLIER;
}

// Ranks mutuals by replies-to-mainDid *without downloading any mutual's
// repo*: pulls mainDid's own posts in one CAR download, then asks
// constellation who replied to each one (a `.reply.parent.uri` backlink
// query per post — a cost that scales with mainDid's own post count, not
// with how many mutuals it has). Returns Map<mutualDid, count>. Throws if
// mainDid's PDS/repo can't be read, if this turns out not to be worth it
// after all (own post count only becomes exactly known once the CAR is
// actually down — the caller's precheck in buildCircle is just an estimate
// from getProfile's postsCount), or if every single backlink query fails
// (constellation itself looks unreachable) — any of these send the caller
// back to the old full-mutual-scan behavior.
//
// onProgress(done, total, "rank") mirrors buildCircle's scan-phase onProgress
// shape (see its doc comment) so the same progress bar can track both phases
// in sequence rather than sitting frozen while this phase's onStep messages
// scroll past — added 2026-09-16 after a live test against an account with
// 3200+ of its own posts showed exactly that: text updating, bar not moving.
export async function rankMutualsByConstellation(mainDid, mutualDids, onStep, onProgress) {
  const pds = await resolvePds(mainDid);
  if (!pds) throw new Error("couldn't resolve a PDS for " + mainDid);
  if (onStep) onStep("reading your own post history to know what to check for replies…");
  const { records: ownPosts } = await fetchRepoRecordsWithKeys(pds, mainDid, POST_TYPE);

  if (!worthConstellation(ownPosts.length, mutualDids.length)) {
    throw new Error(
      `not worth it: ${ownPosts.length} own posts vs ${mutualDids.length} mutuals`,
    );
  }

  const mutualSet = new Set(mutualDids);
  const counts = new Map();
  if (!ownPosts.length) return counts;

  let next = 0;
  let done = 0;
  let failed = 0;
  if (onStep) onStep(`asking constellation who replied to ${ownPosts.length} of your posts…`);
  async function worker() {
    while (next < ownPosts.length) {
      const post = ownPosts[next++];
      try {
        const backlinks = await fetchBacklinksAll(post.uri, REPLY_SOURCE);
        for (const b of backlinks) {
          if (b.did === mainDid || !mutualSet.has(b.did)) continue;
          counts.set(b.did, (counts.get(b.did) || 0) + 1);
        }
      } catch {
        failed++;
      }
      done++;
      if (onProgress) onProgress(done, ownPosts.length, "rank");
      if (onStep && done % 10 === 0) {
        onStep(`checked ${done} / ${ownPosts.length} of your posts for replies…`);
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(RANK_CONCURRENCY, ownPosts.length) }, worker),
  );
  if (failed === ownPosts.length) throw new Error("constellation looks unreachable");
  return counts;
}

// The full pipeline: rank every mutual via constellation (cheap), then run
// the expensive full-repo scan (scanMutual/scanAll) only on however many
// mutuals it actually takes to fill the circle — never on the whole mutuals
// list unless constellation itself is down. The full-repo scan is still
// required for whoever makes the cut: it's the only way to get the exact
// grid data (each pair's first-ever reply, text + link, both directions),
// which no backlink index answers on its own — constellation only tells you
// *that* someone replied, not the earliest one with its text.
//
// onStep(message) reports progress text; onProgress(done, total, phase)
// drives the progress bar — phase is "rank" while checking constellation for
// replies to mainDid's own posts (added 2026-09-16 so the bar doesn't sit
// frozen through that phase on an account with a big post history — see
// rankMutualsByConstellation's doc comment) and "scan" while downloading
// whichever repos actually make the cut. The bar resets between phases
// rather than trying to blend two different denominators into one.
// `mainPostsCountHint` (from mutualsOf's getProfile call, which already
// happened) lets this skip even ATTEMPTING constellation — and so skip
// wasting a CAR download on mainDid's own repo — when it's already obvious
// from the profile's postsCount that mainDid has posted far more than they
// have mutuals (see the header comment's norvid-studies example). When the
// hint is unavailable (getProfile failed), constellation is attempted
// anyway; rankMutualsByConstellation re-checks with the exact post count
// once it has actually downloaded the repo, and bails out to the same
// fallback if it turns out not to have been worth it.
export async function buildCircle(mainDid, mutuals, circleSize, opts = {}) {
  const { onStep, onProgress, mainPostsCountHint } = opts;
  const mutualDids = mutuals.map((m) => m.did);

  let ranked;
  let rankMethod = "constellation";
  const skipConstellation =
    mainPostsCountHint != null && !worthConstellation(mainPostsCountHint, mutualDids.length);

  if (skipConstellation) {
    rankMethod = "fallback-full-scan";
    ranked = mutuals;
    if (onStep) {
      onStep(
        `this account has posted far more than it has mutuals (${mainPostsCountHint} posts vs ${mutualDids.length} mutuals) — constellation would need more per-post checks than just scanning your mutuals directly, so going straight there…`,
      );
    }
  } else {
    try {
      const counts = await rankMutualsByConstellation(mainDid, mutualDids, onStep, onProgress);
      if (!counts.size) throw new Error("no constellation hits");
      ranked = mutuals
        .filter((m) => counts.has(m.did))
        .sort((a, b) => counts.get(b.did) - counts.get(a.did) || a.handle.localeCompare(b.handle));
    } catch {
      // Constellation unreachable, not worth it after all (see
      // rankMutualsByConstellation), or genuinely returned nothing (which
      // could mean "no replies" or "all replies predate the index" —
      // CONSTELLATION_INDEXED_SINCE_MS — no way to tell those apart without
      // a real scan). Either way, fall back to the pre-constellation
      // behavior: scan every mutual directly.
      rankMethod = "fallback-full-scan";
      ranked = mutuals;
    }
  }

  const batchSize =
    rankMethod === "constellation"
      ? Math.max(circleSize * RANK_BUFFER_MULTIPLIER, circleSize + 10)
      : ranked.length;

  const scanned = [];
  const scannedDids = new Set();
  let offset = 0;
  for (;;) {
    const batch = ranked.slice(offset, offset + batchSize).filter((m) => !scannedDids.has(m.did));
    offset += batchSize;
    if (!batch.length) break;

    if (onStep) {
      onStep(
        rankMethod === "constellation"
          ? `constellation found ${ranked.length} mutuals who've replied to you — downloading ${batch.length} whole ${batch.length === 1 ? "repo" : "repos"} to build the real grid…`
          : `constellation wasn't available for this handle — scanning all ${batch.length} mutuals' whole repos directly (this is the slow path)…`,
      );
    }
    await scanAll(batch, mainDid, (m, result) => {
      scannedDids.add(m.did);
      scanned.push({
        ...m,
        repliesToMain: result ? result.repliesToMain : 0,
        firstReplies: result ? result.firstReplies : null,
      });
      if (onProgress) onProgress(scanned.length, ranked.length, "scan");
    });

    const qualifying = scanned.filter((m) => m.repliesToMain > 0).length;
    if (qualifying >= circleSize || offset >= ranked.length) break;
  }

  const withReplies = scanned.filter((m) => m.repliesToMain > 0);
  withReplies.sort((a, b) => b.repliesToMain - a.repliesToMain || a.handle.localeCompare(b.handle));
  return {
    circle: withReplies.slice(0, circleSize),
    scannedCount: scanned.length,
    totalMutuals: mutuals.length,
    rankMethod,
  };
}
