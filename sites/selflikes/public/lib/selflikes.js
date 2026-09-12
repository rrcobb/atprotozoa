// selflikes.js — find posts someone has liked that they themselves wrote.
//
// @octopodeeznuts.bsky.social asked, replying to a thread about accidentally
// liking your own post: is it feasible to list an account's self-likes? It
// is, and it's cheap: app.bsky.feed.like records live in the liker's own
// repo, and a self-like's subject.uri points right back into that same
// repo's app.bsky.feed.post collection. So one repo download (see
// lib/car.js, per the "prefer bulk reads" standing order) gets both the like
// records AND the post bodies they point at in a single request — there's no
// public self-like index to query, but there doesn't need to be one.

import { fetchRepoRecordsWithKeys } from "./car.js";
import { resolvePds } from "./identity.js";

const PUB = "https://api.bsky.app/xrpc";

function rkeyOf(uri) {
  const parts = String(uri || "").split("/");
  return parts[parts.length - 1];
}

// Normalizes a handle/DID/profile-URL/at-URI into { did, handle }.
export async function resolveActor(actorRaw) {
  const actor = (actorRaw || "")
    .trim()
    .replace(/^@/, "")
    .replace(/^at:\/\//, "")
    .replace(/^https?:\/\/(bsky\.app\/profile\/)?/, "")
    .split("/")[0];
  if (!actor) throw new Error("enter a handle or DID");

  let did = actor;
  if (!actor.startsWith("did:")) {
    const r = await fetch(`${PUB}/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(actor)}`);
    if (!r.ok) throw new Error(`couldn't resolve "${actor}"`);
    const d = await r.json();
    if (!d.did) throw new Error(`couldn't resolve "${actor}"`);
    did = d.did;
  }

  let handle = actor.startsWith("did:") ? null : actor;
  try {
    const p = await (await fetch(`${PUB}/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`)).json();
    if (p.handle) handle = p.handle;
  } catch (_) {
    // public profile lookup is only for display niceties (handle, avatar) — a repo-only account still works
  }

  return { did, handle: handle || did };
}

// Fallback used only if the repo CAR download/parse fails (oversized repo,
// non-CORS PDS, malformed CAR): paginates com.atproto.repo.listRecords for
// just the like collection, with no page cap (pagination is already the
// fallback path here, so capping it would just reintroduce the bug the
// "prefer bulk reads" / "question every cap" standing orders fixed), then
// resolves post bodies individually only for the handful of records that
// turn out to be self-likes.
async function fallbackWalk(pds, did, onProgress) {
  const base = pds.replace(/\/$/, "");
  const likes = [];
  let cursor = "";
  for (;;) {
    const u = new URL(`${base}/xrpc/com.atproto.repo.listRecords`);
    u.searchParams.set("repo", did);
    u.searchParams.set("collection", "app.bsky.feed.like");
    u.searchParams.set("limit", "100");
    if (cursor) u.searchParams.set("cursor", cursor);
    const r = await fetch(u.toString());
    if (!r.ok) throw new Error("listRecords: " + r.statusText);
    const d = await r.json();
    for (const rec of d.records || []) likes.push(rec);
    if (onProgress) onProgress(`walking your likes... ${likes.length} seen so far`);
    cursor = d.records?.length ? d.cursor : null;
    if (!cursor) break;
  }

  const prefix = `at://${did}/app.bsky.feed.post/`;
  const selfLikes = likes.filter((l) => typeof l.value?.subject?.uri === "string" && l.value.subject.uri.startsWith(prefix));

  for (const sl of selfLikes) {
    try {
      const u = new URL(`${base}/xrpc/com.atproto.repo.getRecord`);
      u.searchParams.set("repo", did);
      u.searchParams.set("collection", "app.bsky.feed.post");
      u.searchParams.set("rkey", rkeyOf(sl.value.subject.uri));
      const r = await fetch(u.toString());
      sl.post = r.ok ? (await r.json()).value : null;
    } catch (_) {
      sl.post = null;
    }
  }
  return selfLikes.map((l) => ({
    likeUri: l.uri,
    likedAt: l.value.createdAt,
    postUri: l.value.subject.uri,
    post: l.post,
  }));
}

// Every self-like `did` has ever made: a like record of theirs whose subject
// points back into their own app.bsky.feed.post collection. Sorted newest
// like first.
export async function findSelfLikes(did, { onProgress } = {}) {
  const pds = await resolvePds(did);
  if (!pds) throw new Error("couldn't find a PDS for this account");

  let out;
  try {
    const { records } = await fetchRepoRecordsWithKeys(
      pds,
      did,
      ["app.bsky.feed.like", "app.bsky.feed.post"],
      onProgress,
    );
    const prefix = `at://${did}/app.bsky.feed.post/`;
    const postByRkey = new Map();
    for (const r of records) {
      if (r.value.$type === "app.bsky.feed.post") postByRkey.set(rkeyOf(r.uri), r.value);
    }
    out = [];
    for (const r of records) {
      if (r.value.$type !== "app.bsky.feed.like") continue;
      const subjectUri = r.value.subject?.uri;
      if (typeof subjectUri !== "string" || !subjectUri.startsWith(prefix)) continue;
      out.push({
        likeUri: r.uri,
        likedAt: r.value.createdAt,
        postUri: subjectUri,
        post: postByRkey.get(rkeyOf(subjectUri)) || null,
      });
    }
  } catch (err) {
    if (onProgress) onProgress(`repo download didn't work (${err.message}) — falling back to a paginated walk`);
    out = await fallbackWalk(pds, did, onProgress);
  }

  // A self-like whose post is gone (deleted since) can't be shown as "you
  // liked this" in any useful way — the pdsls record link doesn't work
  // either once the record's gone from the repo, not just from the AppView
  // index, so there's nothing left to point at. Drop those entirely instead
  // of showing a dead link (@heika.dog, following up after the pdsls-link fix).
  out = out.filter((sl) => sl.post);

  out.sort((a, b) => new Date(b.likedAt) - new Date(a.likedAt));
  return out;
}

export function postUrl(uri, handle) {
  return `https://bsky.app/profile/${encodeURIComponent(handle)}/post/${rkeyOf(uri)}`;
}
