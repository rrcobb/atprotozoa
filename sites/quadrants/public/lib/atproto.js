// atproto.js — read-side helpers: profile lookup and a viewer's follow graph
// (for highlighting moots on a chart). Trimmed from padmoot/public/lib/atproto.js
// (copy, don't abstract). Writing (putRecord) stays in oauth.js's dpopFetch,
// called straight from chart.html once a session exists.

const PUB = "https://api.bsky.app/xrpc";

async function jget(url) {
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  if (!r.ok) {
    const e = new Error(`HTTP ${r.status}`);
    e.status = r.status;
    throw e;
  }
  return r.json();
}

export async function getProfile(did) {
  try {
    return await jget(`${PUB}/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`);
  } catch {
    return null;
  }
}

const GRAPH_PAGES = 400; // backstop, not a budget — raised 2026-08-28 across the moot-family sites (same treatment as kevinmoot's bfs.js FOLLOWERS_PAGES; a fixed page count on getFollows/getFollowers was a speed knob dressed as a data cap, not a correctness bound)

// Every account the viewer follows, DID only — used to highlight "people you
// follow" among a chart's positions. `cap` bounds the page count so a huge
// follow graph doesn't blow the request budget.
export async function getFollowingDids(did, cap = 1200) {
  const out = new Set();
  let cursor = "";
  for (let p = 0; p < GRAPH_PAGES; p++) {
    const u = new URL(`${PUB}/app.bsky.graph.getFollows`);
    u.searchParams.set("actor", did);
    u.searchParams.set("limit", "100");
    if (cursor) u.searchParams.set("cursor", cursor);
    let d;
    try {
      d = await jget(u.toString());
    } catch {
      break;
    }
    for (const f of d.follows || []) out.add(f.did);
    cursor = d.cursor;
    if (!cursor || out.size >= cap) break;
  }
  return out;
}
