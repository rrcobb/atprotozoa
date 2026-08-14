// graph.js — page through an account's followers or following list off
// Bluesky's public AppView. Trimmed/adapted from sites/followwall's
// lib/followers.js (copy, don't abstract) — generalized to either
// direction instead of just getFollowers.

import { jget } from "./identity.js";

const PUB = "https://public.api.bsky.app/xrpc";

// Hard cap so a mega-account doesn't turn one page load into thousands of
// requests — plenty to browse, and each entry is a click away from its own
// on-demand block-status check anyway (see blocklists.js), so there's no
// need to ever pull the *whole* graph automatically.
const MAX_PAGES = 5; // 5 * 100 = up to 500 entries

const ENDPOINT = {
  followers: { xrpc: "app.bsky.graph.getFollowers", key: "followers" },
  following: { xrpc: "app.bsky.graph.getFollows", key: "follows" },
};

export async function fetchConnections(did, direction, { onStep } = {}) {
  const { xrpc, key } = ENDPOINT[direction];
  const out = [];
  let cursor = "";
  for (let pg = 0; pg < MAX_PAGES; pg++) {
    if (onStep) onStep(`reading ${direction}… (page ${pg + 1}, ${out.length} found so far)`);
    const u = new URL(`${PUB}/${xrpc}`);
    u.searchParams.set("actor", did);
    u.searchParams.set("limit", "100");
    if (cursor) u.searchParams.set("cursor", cursor);
    let d;
    try {
      d = await jget(u.toString());
    } catch {
      break;
    }
    for (const f of d[key] || []) {
      out.push({
        did: f.did,
        handle: f.handle,
        displayName: f.displayName || f.handle,
        avatar: f.avatar || "",
      });
    }
    cursor = d.cursor;
    if (!cursor || !(d[key] || []).length) break;
  }
  return out;
}
