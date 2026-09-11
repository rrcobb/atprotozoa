// xbill.js — orchestration for xbill.bisks.net. cee.wtf's idea (quoted by
// @shimmermathlabs.com, who tagged the bot): download a handle's entire bsky
// repo in one shot, then price that same fetch against the X API's public
// read-rate card ($5 / 1000 posts, $10 / 1000 profiles) — a dollar meter
// that ticks up live as the repo streams past, right next to what it
// actually cost here: nothing.
//
// EXTRA mode (added on a later reply from @shimmermathlabs.com, same
// thread): also walks the handle's mutual-follow ("moot") set and bulk-fetches
// every moot's profile, folding each one into the same running $-meter
// instead of stopping once the repo download finishes. See moots.js.
//
// META mode (a later reply still, same thread): same live meter, but instead
// of narrowing to the moot intersection, it bulk-fetches a profile for every
// DID in the handle's follows *and* followers — the full union, deduped, not
// just the ones who follow back. Turning on META implies the same repo-CAR
// walk and followers lookup EXTRA needs, so it reuses that plumbing rather
// than doing a second pass; if both checkboxes are on, META's superset wins
// and the moot count is still reported for free (it falls out of the same
// two sets with no extra request).
//
// Copy, don't abstract: resolveDid is the same handle-cleaning + resolve
// dance as sites/backscroll's public/lib/backscroll.js.

import { fetchRepoRecordsWithKeys } from "./car.js";
import { resolvePds } from "./identity.js";
import { fetchFollowers, fetchProfilesBatched } from "./moots.js";

const PUB = "https://public.api.bsky.app/xrpc";

// X's posted read-API pricing for the "Basic" tier (per 1,000 objects
// fetched) — the number cee.wtf's original ask specified.
export const PRICE_PER_1000_POSTS = 5;
export const PRICE_PER_1000_PROFILES = 10;

async function jget(url) {
  const r = await fetch(url);
  if (!r.ok) {
    const e = new Error(`HTTP ${r.status}`);
    e.status = r.status;
    throw e;
  }
  return r.json();
}

export async function resolveDid(actor) {
  const a = (actor || "")
    .trim()
    .replace(/^@/, "")
    .replace(/^at:\/\//, "")
    .replace(/^https?:\/\/(bsky\.app\/profile\/)?/, "")
    .split("/")[0];
  if (!a) throw new Error("empty handle");
  if (a.startsWith("did:")) return a;
  const d = await jget(`${PUB}/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(a)}`);
  if (!d.did) throw new Error(`couldn't resolve "${a}"`);
  return d.did;
}

export async function fetchProfile(did) {
  return jget(`${PUB}/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`);
}

// Runs the whole meter: resolve → fetch profile (counts as the one "user
// profile" fetch a real archival job would also need) → resolve PDS →
// download + walk the repo CAR, tallying app.bsky.feed.post records live →
// (EXTRA or META mode) find the account's follows/followers and bulk-fetch
// profiles for either the moot intersection (EXTRA) or the full follows ∪
// followers union (META). `onTick(state)` fires on every meaningful step
// (status text, byte/record progress, and every single matched post) with a
// running cost snapshot, so the caller can drive a dollar counter that
// visibly climbs instead of jumping straight to its final value.
export async function runMeter(handleRaw, { onTick, extraMode, metaMode } = {}) {
  const tick = onTick || (() => {});
  const needsGraph = !!(extraMode || metaMode);

  tick({ phase: "resolving", status: `resolving @${handleRaw.replace(/^@/, "")}…` });
  const did = await resolveDid(handleRaw);

  tick({ phase: "profile", status: "fetching profile…" });
  const profile = await fetchProfile(did).catch(() => null);
  let profilesFetched = 1; // the one profile lookup needed to attribute the archive to a person
  let postsFetched = 0;
  tick({
    phase: "profile",
    status: "profile fetched",
    profilesFetched,
    postsFetched,
    cost: costOf(postsFetched, profilesFetched),
  });

  tick({ phase: "pds", status: "locating PDS…" });
  const pds = await resolvePds(did);
  if (!pds) throw new Error("couldn't find a PDS for this account");

  // EXTRA/META mode needs this same account's own follows, and those live in
  // the very repo we're already downloading for posts — pull both $types out
  // of the one CAR walk instead of paying for a second
  // com.atproto.sync.getRepo download of the same account.
  const wantedTypes = needsGraph ? ["app.bsky.feed.post", "app.bsky.graph.follow"] : "app.bsky.feed.post";
  const { records, bytes } = await fetchRepoRecordsWithKeys(pds, did, wantedTypes, (count, item, meta) => {
    if (meta && meta.status) {
      tick({ phase: "downloading", status: meta.status, postsFetched, profilesFetched, cost: costOf(postsFetched, profilesFetched) });
      return;
    }
    if (!item || (item.value && item.value.$type !== "app.bsky.feed.post")) return;
    postsFetched++;
    tick({
      phase: "walking",
      status: `walking repo… ${postsFetched.toLocaleString()} post${postsFetched === 1 ? "" : "s"} counted so far`,
      postsFetched,
      profilesFetched,
      cost: costOf(postsFetched, profilesFetched),
      latest: item,
    });
  });

  postsFetched = records.filter((r) => r.value && r.value.$type === "app.bsky.feed.post").length;

  let mootsFound = 0;
  let followsFound = 0;
  let followersFound = 0;
  if (needsGraph) {
    const follows = records
      .filter((r) => r.value && r.value.$type === "app.bsky.graph.follow")
      .map((r) => r.value.subject)
      .filter(Boolean);
    followsFound = follows.length;
    tick({
      phase: "graph",
      status: metaMode ? "META mode: fetching their followers…" : "EXTRA mode: finding who follows them back…",
      postsFetched,
      profilesFetched,
      cost: costOf(postsFetched, profilesFetched),
    });
    const followers = await fetchFollowers(did);
    followersFound = followers.length;
    const followerSet = new Set(followers);
    const moots = follows.filter((d) => d !== did && followerSet.has(d));
    mootsFound = moots.length;

    if (metaMode) {
      // The full union, not just the intersection — every follow and every
      // follower, self excluded, deduped so nobody's profile is billed twice.
      const targets = [...new Set([...follows, ...followers])].filter((d) => d !== did);
      tick({
        phase: "meta",
        status: `META mode: ${followsFound.toLocaleString()} follows, ${followersFound.toLocaleString()} followers (${targets.length.toLocaleString()} unique) — fetching profiles…`,
        postsFetched,
        profilesFetched,
        moots: mootsFound,
        follows: followsFound,
        followers: followersFound,
        cost: costOf(postsFetched, profilesFetched),
      });
      await fetchProfilesBatched(targets, (_gotInBatch, totalFetched) => {
        profilesFetched = 1 + totalFetched;
        tick({
          phase: "meta",
          status: `fetching follow/follower profiles… ${totalFetched.toLocaleString()}/${targets.length.toLocaleString()}`,
          postsFetched,
          profilesFetched,
          moots: mootsFound,
          follows: followsFound,
          followers: followersFound,
          cost: costOf(postsFetched, profilesFetched),
        });
      });
    } else {
      tick({
        phase: "moots",
        status: `found ${mootsFound.toLocaleString()} moot${mootsFound === 1 ? "" : "s"} — fetching their profiles…`,
        postsFetched,
        profilesFetched,
        moots: mootsFound,
        cost: costOf(postsFetched, profilesFetched),
      });
      await fetchProfilesBatched(moots, (_gotInBatch, totalMootProfiles) => {
        profilesFetched = 1 + totalMootProfiles;
        tick({
          phase: "moots",
          status: `fetching moot profiles… ${totalMootProfiles.toLocaleString()}/${mootsFound.toLocaleString()}`,
          postsFetched,
          profilesFetched,
          moots: mootsFound,
          cost: costOf(postsFetched, profilesFetched),
        });
      });
    }
  }

  const cost = costOf(postsFetched, profilesFetched);
  tick({ phase: "done", status: "done", postsFetched, profilesFetched, cost });

  return {
    did,
    handle: (profile && profile.handle) || handleRaw.replace(/^@/, ""),
    displayName: (profile && profile.displayName) || "",
    avatar: (profile && profile.avatar) || "",
    postsFetched,
    profilesFetched,
    mootsFetched: mootsFound,
    followsFetched: followsFound,
    followersFetched: followersFound,
    extraMode: !!extraMode,
    metaMode: !!metaMode,
    bytes,
    cost,
    postsCost: (postsFetched / 1000) * PRICE_PER_1000_POSTS,
    profilesCost: (profilesFetched / 1000) * PRICE_PER_1000_PROFILES,
  };
}

export function costOf(posts, profiles) {
  return (posts / 1000) * PRICE_PER_1000_POSTS + (profiles / 1000) * PRICE_PER_1000_PROFILES;
}

export function fmtUsd(n) {
  return "$" + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
