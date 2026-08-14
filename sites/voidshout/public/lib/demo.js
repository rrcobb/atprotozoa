// demo.js — loads public/data/demo.json and reshapes it into the exact node
// shape feed.js's buildTree() produces, so every page renders demo and live
// data through the SAME card/tree code. Every node carries isDemo: true and
// nothing here ever touches store.js or the network — the whole point of
// demo mode is that it's clearly separate from real data (see chrome.js).

import { COLLECTIONS } from "./voidlogic.mjs";

let cache = null;

export async function loadDemoRoots() {
  if (cache) return cache;
  const res = await fetch("/data/demo.json");
  const data = await res.json();
  cache = data.threads.map((t) => normalize(t, COLLECTIONS.shout));
  return cache;
}

function normalize(raw, collection) {
  const value = {
    place: raw.place,
    createdAt: raw.createdAt,
    text: raw.text,
    rootUri: raw.rootUri,
    parentUri: raw.parentUri,
  };
  const children = (raw.children || []).map((c) =>
    normalize(c, c.type === "murmur" ? COLLECTIONS.murmur : COLLECTIONS.echo),
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
