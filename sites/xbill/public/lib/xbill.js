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
// Copy, don't abstract: resolveDid is the same handle-cleaning + resolve
// dance as sites/backscroll's public/lib/backscroll.js.

import { fetchRepoRecordsWithKeys } from "./car.js";
import { resolvePds } from "./identity.js";
import { computeMoots, fetchProfilesBatched } from "./moots.js";

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
// (EXTRA mode only) find every moot and bulk-fetch their profiles too.
// `onTick(state)` fires on every meaningful step (status text, byte/record
// progress, and every single matched post) with a running cost snapshot, so
// the caller can drive a dollar counter that visibly climbs instead of
// jumping straight to its final value.
export async function runMeter(handleRaw, { onTick, extraMode } = {}) {
  const tick = onTick || (() => {});

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

  // EXTRA mode needs this same account's own follows to compute their moot
  // set, and those live in the very repo we're already downloading for
  // posts — pull both $types out of the one CAR walk instead of paying for a
  // second com.atproto.sync.getRepo download of the same account.
  const wantedTypes = extraMode ? ["app.bsky.feed.post", "app.bsky.graph.follow"] : "app.bsky.feed.post";
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
  if (extraMode) {
    const follows = records
      .filter((r) => r.value && r.value.$type === "app.bsky.graph.follow")
      .map((r) => r.value.subject)
      .filter(Boolean);
    tick({
      phase: "moots",
      status: "EXTRA mode: finding who follows them back…",
      postsFetched,
      profilesFetched,
      cost: costOf(postsFetched, profilesFetched),
    });
    const moots = await computeMoots(did, follows);
    mootsFound = moots.length;
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
    extraMode: !!extraMode,
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
