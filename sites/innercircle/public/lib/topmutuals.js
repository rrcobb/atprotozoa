// topmutuals.js — resolve a Bluesky handle's mutuals (people it follows who
// follow it back — copied and trimmed from sites/mootrace's lib/mutuals.js,
// itself from clustercrawl/lib/cluster.js — copy, don't abstract), rank them
// by how many times each has replied to the searched handle, and pull the
// first-ever reply in each direction for however many make the top 40.
//
// 2026-09-16, @heika.dog: "find the best way to change innercircle so it
// uses constellation to query posts instead of pulling every mutuals' repo,
// if i have a lot of mutuals it'll take a long time." First pass mapped
// mutuals via bulk reads (fetchFollows/fetchFollowers below) but still fell
// back to downloading every candidate mutual's WHOLE repo (scanMutual/
// scanAll, now deleted) to rank them and to build a full mutual×mutual grid
// of first replies — correct, but scaling with mutual count, exactly what
// was asked to go away. heika.dog came back the same day and asked for the
// rest of it: "remove the whole-repo mutual scan entirely and only rely on
// select constellation backlinks."
//
// That's what this version does, and it changes what the site can show:
//
// - RANKING is now constellation-only, no fallback. buildCircle pulls
//   mainDid's own posts in one repo download (not a "mutual" — the searched
//   account itself, and needed either way to know which post URIs to ask
//   constellation about), then asks constellation who replied to each one.
//   There's no longer a faster-alternative check to skip this when mainDid
//   has posted a lot (see history/ — the old CONSTELLATION_WORTHWHILE_
//   MULTIPLIER precheck) — this is the only path now, so it runs regardless
//   of cost, exactly as asked. For a prolific poster (heika.dog: 12k+ posts)
//   this can take a couple of minutes; the progress bar (phase "rank")
//   covers it so it doesn't look frozen. No page cap on it either, per the
//   "question every cap" standing order — every post gets checked, however
//   many there are.
//
// - THE GRID is gone, replaced by a per-mutual "first words" pair: your
//   first reply to them, and their first reply to you. This is a real
//   capability change, not just a rename — constellation is a *reverse*
//   index (who links to X), so it can tell you who replied to one of your
//   posts, but it has no way to enumerate a given mutual's OWN posts (that's
//   exactly what a repo download does, which is the thing being removed).
//   So a full mutual×mutual grid ("did A ever reply to B," for any two
//   circle members) is no longer something this site can build without
//   reintroducing per-account repo scans. What's still fully buildable from
//   constellation + your own single repo download:
//     · you → mutual: already sitting in your own downloaded posts (their
//       .reply.parent.uri), no extra call needed.
//     · mutual → you: constellation's backlinks to your posts give
//       {did, rkey} for every reply aimed at you — no createdAt, but the
//       rkey is a TID that encodes its own timestamp (tid.js), so the
//       EARLIEST one per mutual can be found with zero extra network calls.
//       Only once ranking picks the top 40 does this fetch the actual
//       record (one targeted com.atproto.repo.getRecord per mutual, for
//       text) — a "select" read, not a repo download.
//
// 2026-09-16, same day, "keep going": tagged again after that rewrite landed
// as a "first pass." Actually ran mutualsOf/buildCircle live against
// heika.dog's real account (12k+ posts, 138 mutuals) instead of just reading
// the diff, the way the frozen-progress-bar gap got caught last time — this
// time the pipeline itself checked out (correct ranking, correct first-reply
// text/timestamps, ~3.6 min end to end), but it surfaced a real waste: this
// account's own posts got downloaded and parsed as a full repo CAR *twice* —
// once inside fetchFollows (to read the .follow records) and again inside
// buildCircle (to read the .post records), because those started as two
// separate functions. fetchOwnRepo below merges them into one CAR read for
// both $types, and mutualsOf now hands its already-downloaded posts to
// buildCircle via opts.ownPosts so it never re-fetches — a second exhibit,
// after the whole-repo-per-mutual scan, of "don't scan more than the request
// needs," just aimed at this site's own single account read instead of its
// mutuals'.
import { fetchRepoRecordsWithKeys } from "./car.js";
import { resolvePds } from "./identity.js";
import { tidToMs } from "./tid.js";

const PUB = "https://api.bsky.app/xrpc";
const POST_TYPE = "app.bsky.feed.post";
const FOLLOW_TYPE = "app.bsky.graph.follow";

const CONSTELLATION = "https://constellation.microcosm.blue";
const REPLY_SOURCE = "app.bsky.feed.post:reply.parent.uri";

// Constellation's index has a hard start (crawls the firehose live, never
// backfilled) — confirmed elsewhere in this repo (sites/blockcurve, xbill) at
// 2025-01-28T17:00:00Z. A follow/reply made before that date, by an account
// that hasn't touched it since, may not show up in a constellation query.
// mutualsOf's followers lookup falls back to a full walk if constellation
// returns nothing at all; ranking (below) has no such fallback anymore, so a
// reply that predates the index just won't count towards that mutual's rank.
const CONSTELLATION_INDEXED_SINCE_MS = 1738083600000;

// Bounds how many of mainDid's own posts get their backlinks checked at
// once — a politeness/browser-memory limit, not a cap on how many posts get
// checked. Every post still gets queried, however many there are.
const RANK_CONCURRENCY = 8;

// Backstop, not a budget — same treatment as the rest of the moot family
// (see notes/40-new-site-playbook.md, 2026-08-28 cap order): getFollows/
// getFollowers have no bulk-download equivalent, so this still paginates,
// but the number of pages it's willing to spend is not a correctness limit.
const GRAPH_PAGES = 400;

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

// Follows AND the searched account's own posts are both records in the same
// repo — buildCircle needs that same account's posts a few seconds later to
// rank against, and fetchRepoRecordsWithKeys already takes an array of
// wanted $types, so one CAR download covers both instead of two. Tested
// live against @heika.dog (12k+ posts): downloading and parsing a prolific
// poster's whole repo twice, just because the follows read and the post
// read used to be two separate functions, wasted a real chunk of the wait
// this build already got flagged for being slow. Falls back to the
// paginated AppView walk for follows only if the repo read itself fails
// (PDS unreachable, oversized repo, etc) — `posts: null` in that case tells
// buildCircle it still needs its own (separate, one-shot) download.
async function fetchOwnRepo(did) {
  try {
    const pds = await resolvePds(did);
    if (!pds) throw new Error("no PDS");
    const { records } = await fetchRepoRecordsWithKeys(pds, did, [FOLLOW_TYPE, POST_TYPE]);
    const follows = [];
    const posts = [];
    for (const r of records) {
      const type = r.value && r.value.$type;
      if (type === FOLLOW_TYPE && r.value.subject) follows.push(r.value.subject);
      else if (type === POST_TYPE) posts.push(r);
    }
    return { follows, posts };
  } catch {
    return { follows: await graphAll("app.bsky.graph.getFollows", "follows", did), posts: null };
  }
}

// Followers are an AppView-computed reverse index, not a repo record, so
// there's no bulk-download equivalent — constellation indexes the same
// app.bsky.graph.follow records by their .subject, though, which is exactly
// "who follows this DID." Pages at up to 1000/request vs. the AppView's 100.
// Falls back to the paginated AppView walk if constellation errors. Copied
// pattern from sites/mootfluence/lib/moots.js and sites/kevinmoot/lib/bfs.js
// (see notes/ideas/microcosm-blue.md).
//
// Uses the xrpc getBacklinkDids endpoint, not the old /links/distinct-dids
// REST route — heika.dog flagged distinct-dids as deprecated 2026-09-16.
// Same response shape (linking_dids/cursor), just a different URL and query
// param names (subject/source instead of target/collection/path).
async function fetchFollowers(did) {
  try {
    const out = [];
    let cursor = "";
    for (;;) {
      const u = new URL(`${CONSTELLATION}/xrpc/blue.microcosm.links.getBacklinkDids`);
      u.searchParams.set("subject", did);
      u.searchParams.set("source", `${FOLLOW_TYPE}:subject`);
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

// Resolve a handle to { did, handle, self, mutuals, ownPosts }. `mutuals` is
// the plain follow ∩ follow-back set, self excluded, no widening. `ownPosts`
// is the same CAR read's post records, handed to buildCircle below so it
// doesn't have to download the same repo a second time — null if the repo
// read failed and follows fell back to the paginated walk, in which case
// buildCircle downloads posts itself instead.
export async function mutualsOf(actor, { onStep } = {}) {
  const did = await resolveDid(actor);
  if (onStep) onStep("reading their own repo for follows and posts…");
  const { follows, posts: ownPosts } = await fetchOwnRepo(did);
  if (onStep) onStep("mapping who follows them back…");
  const followers = await fetchFollowers(did);

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

  return { did, handle: self.handle, self, mutuals, ownPosts };
}

function didFromUri(uri) {
  const m = /^at:\/\/(did:[^/]+)\//.exec(uri || "");
  return m ? m[1] : null;
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

// One targeted record read — the only per-mutual network cost left in this
// file. Only called for however many mutuals actually make the top-40 cut,
// to get the real text of their earliest reply (constellation's backlinks
// only ever give {did, rkey}, never the record body).
async function fetchRecord(did, rkey) {
  const pds = await resolvePds(did);
  if (!pds) return null;
  try {
    const u = new URL(`${pds.replace(/\/$/, "")}/xrpc/com.atproto.repo.getRecord`);
    u.searchParams.set("repo", did);
    u.searchParams.set("collection", POST_TYPE);
    u.searchParams.set("rkey", rkey);
    const d = await jget(u.toString());
    return d.value || null;
  } catch {
    return null;
  }
}

// The full pipeline. Ranks every mutual purely from constellation backlinks
// to mainDid's own posts, then — only for the mutuals who make the final
// top `circleSize` — fetches the one record needed to show the real text of
// their earliest reply.
//
// opts.ownPosts, if given (mutualsOf's combined follows+posts CAR read),
// skips this function's own repo download entirely — mainDid's posts were
// already pulled down once to find its follows, so re-downloading and
// re-parsing the same repo here would be the exact kind of redundant
// whole-repo work this rewrite exists to cut out. Still downloads them
// itself if called without that (e.g. mutualsOf's own repo read failed and
// fell back to the paginated follows walk, which doesn't fetch posts).
//
// onStep(message) reports progress text; onProgress(done, total, phase)
// drives the progress bar — phase is "rank" while checking constellation for
// replies to mainDid's own posts (the only long phase; can run to several
// minutes for an account with thousands of its own posts, since there's no
// faster fallback anymore) and "text" while fetching the handful of records
// needed for the final top 40.
export async function buildCircle(mainDid, mutuals, circleSize, opts = {}) {
  const { onStep, onProgress, ownPosts: providedOwnPosts } = opts;
  const mutualSet = new Set(mutuals.map((m) => m.did));

  let ownPosts = providedOwnPosts;
  if (!ownPosts) {
    const pds = await resolvePds(mainDid);
    if (!pds) throw new Error("couldn't resolve a PDS for " + mainDid);
    if (onStep) onStep("reading your own post history to know what to check for replies…");
    ({ records: ownPosts } = await fetchRepoRecordsWithKeys(pds, mainDid, POST_TYPE));
  }

  // you → mutual: already in hand from your own downloaded posts, no extra
  // fetch needed. Earliest reply per target DID.
  const yourFirstReplyByDid = new Map();
  for (const { uri, value } of ownPosts) {
    const parentUri = value?.reply?.parent?.uri;
    if (!parentUri) continue;
    const targetDid = didFromUri(parentUri);
    if (!targetDid || !mutualSet.has(targetDid)) continue;
    const createdAt = value.createdAt;
    if (!createdAt || typeof createdAt !== "string") continue;
    const text = typeof value.text === "string" ? value.text : "";
    const cur = yourFirstReplyByDid.get(targetDid);
    if (!cur || createdAt < cur.createdAt) {
      yourFirstReplyByDid.set(targetDid, { createdAt, uri, text });
    }
  }

  // mutual → you: constellation backlinks to each of your posts. Every hit
  // counts towards that mutual's rank; the rkey's own TID timestamp (no
  // extra call) tracks which is earliest per mutual, for the text fetch
  // below.
  const counts = new Map();
  const earliestBacklink = new Map(); // mutualDid -> {rkey, ms}
  if (ownPosts.length && onStep) {
    onStep(`asking constellation who replied to ${ownPosts.length} of your posts…`);
  }
  let next = 0;
  let done = 0;
  async function rankWorker() {
    while (next < ownPosts.length) {
      const post = ownPosts[next++];
      try {
        const backlinks = await fetchBacklinksAll(post.uri, REPLY_SOURCE);
        for (const b of backlinks) {
          if (b.did === mainDid || !mutualSet.has(b.did)) continue;
          counts.set(b.did, (counts.get(b.did) || 0) + 1);
          const ms = tidToMs(b.rkey);
          const cur = earliestBacklink.get(b.did);
          if (!cur || (ms != null && (cur.ms == null || ms < cur.ms))) {
            earliestBacklink.set(b.did, { rkey: b.rkey, ms });
          }
        }
      } catch {
        // one post's backlinks failing just undercounts that post — same
        // spirit as a missed page in a paginated walk, not fatal overall.
      }
      done++;
      if (onProgress) onProgress(done, ownPosts.length, "rank");
      if (onStep && done % 10 === 0) {
        onStep(`checked ${done} / ${ownPosts.length} of your posts for replies…`);
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(RANK_CONCURRENCY, ownPosts.length || 1) }, rankWorker),
  );

  const ranked = mutuals
    .filter((m) => counts.has(m.did))
    .sort((a, b) => counts.get(b.did) - counts.get(a.did) || a.handle.localeCompare(b.handle))
    .slice(0, circleSize);

  if (onStep) {
    onStep(
      ranked.length
        ? `fetching the text of ${ranked.length} first repl${ranked.length === 1 ? "y" : "ies"}…`
        : "no replies to you found via constellation.",
    );
  }
  const circle = [];
  let textDone = 0;
  for (const m of ranked) {
    let theirFirstReply = null;
    const eb = earliestBacklink.get(m.did);
    if (eb) {
      const rec = await fetchRecord(m.did, eb.rkey);
      if (rec && typeof rec.text === "string") {
        theirFirstReply = {
          createdAt: typeof rec.createdAt === "string" ? rec.createdAt : null,
          uri: `at://${m.did}/${POST_TYPE}/${eb.rkey}`,
          text: rec.text,
        };
      }
    }
    circle.push({
      ...m,
      repliesToMain: counts.get(m.did) || 0,
      theirFirstReply,
      yourFirstReply: yourFirstReplyByDid.get(m.did) || null,
    });
    textDone++;
    if (onProgress) onProgress(textDone, ranked.length, "text");
  }

  return { circle, totalMutuals: mutuals.length };
}
