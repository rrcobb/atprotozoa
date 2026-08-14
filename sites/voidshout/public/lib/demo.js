// demo.js — loads public/data/demo.json and reshapes it into the exact node
// shape feed.js's buildTree() produces, so every page renders demo and live
// data through the SAME card/tree code. Every node carries isDemo: true and
// nothing here ever touches store.js or the network — the whole point of
// demo mode is that it's clearly separate from real data (see chrome.js).
//
// demo.json's createdAt values are fixed absolute timestamps, but every
// consumer treats them as "recent": timeAgo() (render.js) turns them into
// "Xm/h/d ago", and /map/'s route lines only draw carries from the last 6
// hours (map/index.html). Left as literal dates, the fixture ages out —
// every card creeps toward "N days ago" and the map's dashed routes vanish
// forever once the newest child record crosses the 6h cutoff. So on load we
// shift every timestamp by a constant offset that pins the fixture's
// *newest* record to "just now", preserving every relative gap between
// records — demo mode looks equally fresh (and the map's routes equally
// visible) no matter when it's actually viewed.

import { COLLECTIONS } from "./voidlogic.mjs";

let cache = null;

export async function loadDemoRoots() {
  if (cache) return cache;
  const res = await fetch("/data/demo.json");
  const data = await res.json();
  const offsetMs = Date.now() - latestCreatedAtMs(data.threads);
  cache = data.threads.map((t) => normalize(t, COLLECTIONS.shout, offsetMs));
  return cache;
}

function latestCreatedAtMs(threads) {
  let max = -Infinity;
  (function walk(nodes) {
    for (const n of nodes) {
      max = Math.max(max, Date.parse(n.createdAt));
      if (n.children) walk(n.children);
    }
  })(threads);
  return max;
}

function normalize(raw, collection, offsetMs) {
  const value = {
    place: raw.place,
    createdAt: new Date(Date.parse(raw.createdAt) + offsetMs).toISOString(),
    text: raw.text,
    rootUri: raw.rootUri,
    parentUri: raw.parentUri,
  };
  const children = (raw.children || []).map((c) =>
    normalize(c, c.type === "murmur" ? COLLECTIONS.murmur : COLLECTIONS.echo, offsetMs),
  );
  return {
    uri: raw.uri,
    rec: { uri: raw.uri, collection, did: raw.did, value },
    homeName: raw.home,
    handle: raw.handle,
    score: raw.score,
    hidden: raw.score <= -5,
    prunedByAncestor: !!raw.prunedByAncestor,
    isDemo: true,
    children,
  };
}
