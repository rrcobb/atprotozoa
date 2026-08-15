// feed.js — turns the flat record cache in store.js into the shapes pages
// actually render: a scored tree per Shout, and per-Place activity for the
// map. Pure functions over an in-memory snapshot (call store.allRecords()
// once, pass the array in) so a page can re-derive after every ingest.js
// callback without re-touching IndexedDB per frame.
//
// The *TreesAggregate functions (placeActivityFromTrees, routeSegmentsFromTrees,
// nodesAtPlaceFromTrees) work on an array of already-built tree roots — the
// same shape both buildTree() (live) and demo.js's normalize() (seeded demo
// data) produce — so map/place pages render live and demo data through
// identical aggregation code, not a parallel demo-only implementation.

import { COLLECTIONS, scoreFromVotes, isHidden } from "./voidlogic.mjs";

/** @param {Array<{uri:string, collection:string, did:string, value:object}>} records */
export function deriveState(records) {
  const byUri = new Map();
  const childrenByParent = new Map();
  const votesBySubject = new Map();
  const roots = [];

  for (const r of records) {
    byUri.set(r.uri, r);
    if (r.collection === COLLECTIONS.shout) roots.push(r);
    if (r.collection === COLLECTIONS.echo || r.collection === COLLECTIONS.murmur) {
      const list = childrenByParent.get(r.value.parentUri) || [];
      list.push(r.uri);
      childrenByParent.set(r.value.parentUri, list);
    }
    if (r.collection === COLLECTIONS.vote) {
      const list = votesBySubject.get(r.value.subjectUri) || [];
      list.push(r.value.value);
      votesBySubject.set(r.value.subjectUri, list);
    }
  }

  const scoreByUri = new Map();
  for (const [uri, vals] of votesBySubject) {
    scoreByUri.set(uri, scoreFromVotes(vals.map((v) => ({ value: v }))));
  }

  roots.sort((a, b) => Date.parse(b.value.createdAt) - Date.parse(a.value.createdAt));
  return { byUri, childrenByParent, scoreByUri, roots };
}

export function scoreOf(uri, scoreByUri) {
  return scoreByUri.get(uri) || 0;
}

/** Builds a node's subtree, marking each node's own hidden state and whether
 *  an ancestor (inclusive) is hidden — the latter is what feeds should skip
 *  rendering, while the former is what a detail page still shows (collapsed). */
export function buildTree(uri, state, ancestorHidden = false) {
  const rec = state.byUri.get(uri);
  if (!rec) return null;
  const score = scoreOf(uri, state.scoreByUri);
  const hidden = isHidden(score);
  const prunedByAncestor = ancestorHidden;
  const childUris = state.childrenByParent.get(uri) || [];
  const children = childUris
    .map((c) => buildTree(c, state, ancestorHidden || hidden))
    .filter(Boolean)
    .sort((a, b) => Date.parse(a.rec.value.createdAt) - Date.parse(b.rec.value.createdAt));
  return { uri, rec, score, hidden, prunedByAncestor, children };
}

export function allTrees(state) {
  return state.roots.map((r) => buildTree(r.uri, state)).filter(Boolean);
}

/** Every place a subtree ever touched (for a profile's "Places discovered"). */
export function placesInTree(node, out = new Map()) {
  if (!node) return out;
  const p = node.rec.value.place;
  if (p) out.set(p.id, p);
  for (const c of node.children) placesInTree(c, out);
  return out;
}

/** Flattens every node in a tree into a list (root first, depth-first). */
export function flattenTree(node, out = []) {
  if (!node) return out;
  out.push(node);
  for (const c of node.children) flattenTree(c, out);
  return out;
}

/** Per-place activity counts for the world map: how many non-pruned nodes
 *  currently sit at each place, across every thread in `trees`. */
export function placeActivityFromTrees(trees) {
  const counts = new Map(); // place id -> {place, count}
  for (const tree of trees) {
    for (const node of flattenTree(tree)) {
      if (node.prunedByAncestor) continue;
      const p = node.rec.value.place;
      if (!p) continue;
      const entry = counts.get(p.id) || { place: p, count: 0 };
      entry.count++;
      counts.set(p.id, entry);
    }
  }
  return counts;
}
export function placeActivity(state) {
  return placeActivityFromTrees(allTrees(state));
}

/** Every non-pruned node currently sitting at a given place, most recent first. */
export function nodesAtPlaceFromTrees(trees, placeId) {
  const out = [];
  for (const tree of trees) {
    for (const node of flattenTree(tree)) {
      if (node.prunedByAncestor) continue;
      if (node.rec.value.place?.id === placeId) out.push(node);
    }
  }
  return out.sort((a, b) => Date.parse(b.rec.value.createdAt) - Date.parse(a.rec.value.createdAt));
}
export function nodesAtPlace(state, placeId) {
  return nodesAtPlaceFromTrees(allTrees(state), placeId);
}

/** Route segments (parent place -> child place) for map route-line drawing. */
export function routeSegmentsFromTrees(trees) {
  const segs = [];
  for (const tree of trees) {
    (function walk(node) {
      if (!node || node.prunedByAncestor) return;
      for (const child of node.children) {
        if (child.prunedByAncestor) continue;
        const from = node.rec.value.place;
        const to = child.rec.value.place;
        if (from && to && from.id !== to.id) {
          segs.push({ from, to, atMs: Date.parse(child.rec.value.createdAt) });
        }
        walk(child);
      }
    })(tree);
  }
  return segs;
}
export function routeSegments(state) {
  return routeSegmentsFromTrees(allTrees(state));
}
