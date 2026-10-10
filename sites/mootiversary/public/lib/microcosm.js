// microcosm.js — bulk "what points at this?" reads from microcosm.blue's
// Constellation, the firehose-backed backlink index. A drop-in (notes/41):
// copy this file verbatim into public/lib/, never edit the copy. Edits go to
// the canonical copy in sites/listenheimer and get swept (audit/drop-ins.mjs).
//
// Every function here THROWS on any failure. Callers keep the AppView walk as
// the fallback — Constellation is a third-party service with no SLA:
//
//   let dids;
//   try { dids = await likerDids(uri); } catch { dids = await walkGetLikes(uri); }
//
// Returns DIDs (or record refs), never profiles. Hydrate only what you display
// with app.bsky.actor.getProfiles, 25 per call. The index starts 2025-01-28;
// say so in the UI when older data matters.
//
// Source paths are the record field's full path. The ones that have bitten:
// a like's subject is a strongRef, so likers are `app.bsky.feed.like:subject.uri`
// (`:subject` returns total 0 with no error); mention facets have two encodings
// in the wild, summed below. `${CONSTELLATION}/links/all?target=<subject>` lists
// every path that points at a subject if you need a new one.

export const CONSTELLATION = "https://constellation.microcosm.blue";
const XRPC = `${CONSTELLATION}/xrpc/blue.microcosm.links`;
const MAX_PAGES = 400; // 400,000 at 1000/page — a runaway backstop, not a budget

export const SOURCES = {
  followers: "app.bsky.graph.follow:subject",
  likers: "app.bsky.feed.like:subject.uri",
  reposters: "app.bsky.feed.repost:subject.uri",
  quotes: "app.bsky.feed.post:embed.record.uri",
  replies: "app.bsky.feed.post:reply.parent.uri",
  listedBy: "app.bsky.graph.listitem:subject",
  blockedBy: "app.bsky.graph.block:subject",
  mentions: [
    "app.bsky.feed.post:facets[app.bsky.richtext.facet].features[app.bsky.richtext.facet#mention].did",
    "app.bsky.feed.post:facets[].features[app.bsky.richtext.facet#mention].did",
  ],
};

async function jget(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`constellation ${r.status}`);
  return r.json();
}

// Every DID with a `source` record pointing at `subject` (a DID or an at://
// URI). onStep(count) fires per page for progress UIs.
export async function backlinkDids(subject, source, { onStep } = {}) {
  const dids = [];
  const seen = new Set();
  let cursor = "";
  for (let page = 0; page < MAX_PAGES; page++) {
    const u = new URL(`${XRPC}.getBacklinkDids`);
    u.searchParams.set("subject", subject);
    u.searchParams.set("source", source);
    u.searchParams.set("limit", "1000");
    if (cursor) u.searchParams.set("cursor", cursor);
    const d = await jget(u);
    const batch = d.linking_dids || [];
    for (const did of batch) {
      if (seen.has(did)) continue;
      seen.add(did);
      dids.push(did);
    }
    if (onStep) onStep(dids.length);
    cursor = d.cursor;
    if (!cursor || !batch.length) break;
  }
  return dids;
}

// Every record pointing at `subject`, as { did, collection, rkey }.
export async function backlinkRecords(subject, source, { onStep } = {}) {
  const out = [];
  let cursor = "";
  for (let page = 0; page < MAX_PAGES; page++) {
    const u = new URL(`${XRPC}.getBacklinks`);
    u.searchParams.set("subject", subject);
    u.searchParams.set("source", source);
    u.searchParams.set("limit", "1000");
    if (cursor) u.searchParams.set("cursor", cursor);
    const d = await jget(u);
    const batch = d.records || [];
    out.push(...batch);
    if (onStep) onStep(out.length);
    cursor = d.cursor;
    if (!cursor || !batch.length) break;
  }
  return out;
}

// Just the count, one call. Sums across paths when `source` is an array.
export async function backlinkCount(subject, source) {
  let total = 0;
  for (const s of [].concat(source)) {
    const u = new URL(`${XRPC}.getBacklinks`);
    u.searchParams.set("subject", subject);
    u.searchParams.set("source", s);
    u.searchParams.set("limit", "1");
    const d = await jget(u);
    total += Number(d.total) || 0;
  }
  return total;
}

export const followerDids = (did, opts) => backlinkDids(did, SOURCES.followers, opts);
export const likerDids = (postUri, opts) => backlinkDids(postUri, SOURCES.likers, opts);
export const reposterDids = (postUri, opts) => backlinkDids(postUri, SOURCES.reposters, opts);
export const quoteRecords = (postUri, opts) => backlinkRecords(postUri, SOURCES.quotes, opts);
export const replyRecords = (postUri, opts) => backlinkRecords(postUri, SOURCES.replies, opts);
export const mentionCount = (did) => backlinkCount(did, SOURCES.mentions);
export const atUri = (r) => `at://${r.did}/${r.collection}/${r.rkey}`;
