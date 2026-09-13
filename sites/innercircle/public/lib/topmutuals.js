// topmutuals.js — resolve a Bluesky handle's mutuals (people it follows who
// follow it back — copied and trimmed from sites/mootrace's lib/mutuals.js,
// itself from clustercrawl/lib/cluster.js — copy, don't abstract), then rank
// them by how many times each has replied to the searched handle: their
// "inner circle."
//
// Ranking needs a real count, not just a yes/no, so every mutual's WHOLE
// repo gets downloaded as one CAR (com.atproto.sync.getRepo, one request no
// matter how much history exists — see notes/40-new-site-playbook.md's
// cee.wtf bulk-read order) rather than a paginated listRecords/
// getAuthorFeed walk. That same scan records each mutual's *earliest* reply
// to EVERY did it's ever replied to (not just the searched handle), so the
// top-40 x top-40 grid public/index.html builds afterwards reuses this data
// directly — no second repo download for the people who make the cut.

import { fetchRepoRecordsWithKeys } from "./car.js";
import { resolvePds } from "./identity.js";

const PUB = "https://api.bsky.app/xrpc";
const POST_TYPE = "app.bsky.feed.post";

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
    for (const it of d[key] || []) out.push(it);
    cursor = d.cursor;
    if (!cursor) break;
  }
  return out;
}

// Resolve a handle to { did, handle, self, mutuals }. `mutuals` is the plain
// follow ∩ follow-back set, self excluded, no widening.
export async function mutualsOf(actor, { onStep } = {}) {
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

  return { did, handle: self.handle, self, mutuals };
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
