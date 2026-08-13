// Unit tests for the browser scoring module.
// Run with `node --test tests/` (Node 22.18+/24 strips TS types for plain
// annotation-only files like this one with no flag needed; older Node
// needs `node --experimental-strip-types --test tests/`).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CONSTANTS,
  isValidHandle,
  isValidDid,
  isValidAtUri,
  isValidCursor,
  isValidSubject,
  distinctDaysUTC,
  computeEdgeWeights,
  computePrestige,
  toPrestigeIndex,
} from "../public/formulas.mjs";

// ---- validation --------------------------------------------------------------
test("isValidHandle accepts real handles", () => {
  assert.equal(isValidHandle("alice.bsky.social"), true);
  assert.equal(isValidHandle("fromthewestmeadow.com"), true);
  assert.equal(isValidHandle("a.b.c.example.org"), true);
});
test("isValidHandle rejects garbage", () => {
  assert.equal(isValidHandle("not a handle"), false);
  assert.equal(isValidHandle("no-dot"), false);
  assert.equal(isValidHandle(""), false);
  assert.equal(isValidHandle("did:plc:abc"), false);
  assert.equal(isValidHandle("a".repeat(300) + ".com"), false);
});
test("isValidDid accepts plc and web DIDs", () => {
  assert.equal(isValidDid("did:plc:wlj4p2kazhifag6w4nanjnee"), true);
  assert.equal(isValidDid("did:web:example.com"), true);
});
test("isValidDid rejects non-DIDs", () => {
  assert.equal(isValidDid("alice.bsky.social"), false);
  assert.equal(isValidDid("did:plc:short"), false);
  assert.equal(isValidDid(""), false);
});
test("isValidAtUri accepts well-formed at:// uris", () => {
  assert.equal(
    isValidAtUri("at://did:plc:wlj4p2kazhifag6w4nanjnee/app.bsky.feed.post/3abc"),
    true
  );
});
test("isValidAtUri rejects malformed uris", () => {
  assert.equal(isValidAtUri("https://example.com"), false);
  assert.equal(isValidAtUri("at://"), false);
});
test("isValidCursor bounds shape", () => {
  assert.equal(isValidCursor("abc123_.:-"), true);
  assert.equal(isValidCursor("has spaces"), false);
  assert.equal(isValidCursor("a".repeat(600)), false);
  assert.equal(isValidCursor(123), false);
});
test("isValidSubject accepts either handle or DID", () => {
  assert.equal(isValidSubject("alice.bsky.social"), true);
  assert.equal(isValidSubject("did:plc:wlj4p2kazhifag6w4nanjnee"), true);
  assert.equal(isValidSubject("nonsense"), false);
});

// ---- streaks -------------------------------------------------------------------
test("distinctDaysUTC counts distinct calendar days, not raw events", () => {
  const day1 = Date.UTC(2026, 0, 1, 3);
  const day1Again = Date.UTC(2026, 0, 1, 20);
  const day2 = Date.UTC(2026, 0, 2, 1);
  assert.equal(distinctDaysUTC([day1, day1Again, day2]), 2);
});
test("distinctDaysUTC of empty/invalid input is 0", () => {
  assert.equal(distinctDaysUTC([]), 0);
  assert.equal(distinctDaysUTC([NaN]), 0);
});

// ---- reciprocity + edge weighting ----------------------------------------------
test("computeEdgeWeights marks mutual likes reciprocal and boosts weight", () => {
  const edges = [
    { from: "A", to: "B", likeCount: 10, distinctDays: 5 },
    { from: "B", to: "A", likeCount: 3, distinctDays: 1 },
    { from: "C", to: "B", likeCount: 10, distinctDays: 5 }, // one-way
  ];
  const weighted = computeEdgeWeights(edges);
  const ab = weighted.find((e) => e.from === "A" && e.to === "B");
  const cb = weighted.find((e) => e.from === "C" && e.to === "B");
  assert.equal(ab.reciprocal, true);
  assert.equal(cb.reciprocal, false);
  // same raw likeCount/distinctDays, but A->B gets the reciprocity bonus
  // and thus strictly more weight than the one-way C->B edge.
  assert.ok(ab.weight > cb.weight);
});
test("computeEdgeWeights streak bonus caps at STREAK_CAP_DAYS", () => {
  const capped = computeEdgeWeights([
    { from: "A", to: "B", likeCount: 10, distinctDays: CONSTANTS.STREAK_CAP_DAYS * 5 },
  ])[0];
  const atCap = computeEdgeWeights([
    { from: "A", to: "B", likeCount: 10, distinctDays: CONSTANTS.STREAK_CAP_DAYS },
  ])[0];
  assert.equal(capped.weight, atCap.weight);
});

// ---- PageRank-style prestige ----------------------------------------------------
test("computePrestige gives equal score to symmetric nodes with no edges", () => {
  const { scores } = computePrestige(["A", "B", "C"], []);
  assert.equal(scores.get("A"), scores.get("B"));
  assert.equal(scores.get("B"), scores.get("C"));
});
test("computePrestige ranks a heavily-liked node above a barely-liked one", () => {
  const edges = computeEdgeWeights([
    { from: "L1", to: "popular", likeCount: 20, distinctDays: 10 },
    { from: "L2", to: "popular", likeCount: 20, distinctDays: 10 },
    { from: "L3", to: "popular", likeCount: 20, distinctDays: 10 },
    { from: "L1", to: "obscure", likeCount: 1, distinctDays: 1 },
  ]);
  const { scores } = computePrestige(["L1", "L2", "L3", "popular", "obscure"], edges);
  assert.ok(scores.get("popular") > scores.get("obscure"));
});
test("computePrestige: being liked by a high-prestige account matters more than by a low one", () => {
  // "hub" is liked by many (high prestige); "loner" is liked by nobody.
  const base = [
    { from: "f1", to: "hub", likeCount: 5, distinctDays: 5 },
    { from: "f2", to: "hub", likeCount: 5, distinctDays: 5 },
    { from: "f3", to: "hub", likeCount: 5, distinctDays: 5 },
    { from: "f4", to: "hub", likeCount: 5, distinctDays: 5 },
  ];
  const throughHub = computeEdgeWeights([...base, { from: "hub", to: "target", likeCount: 5, distinctDays: 5 }]);
  const throughLoner = computeEdgeWeights([...base, { from: "loner", to: "target", likeCount: 5, distinctDays: 5 }]);
  const nodes = ["f1", "f2", "f3", "f4", "hub", "loner", "target"];
  const a = computePrestige(nodes, throughHub).scores.get("target");
  const b = computePrestige(nodes, throughLoner).scores.get("target");
  assert.ok(a > b);
});
test("computePrestige handles dangling nodes (no outgoing edges) without losing mass", () => {
  const edges = computeEdgeWeights([{ from: "dangling", to: "A", likeCount: 5, distinctDays: 1 }]);
  const { scores } = computePrestige(["dangling", "A"], edges);
  const total = [...scores.values()].reduce((a, b) => a + b, 0);
  // standard PageRank keeps sum(scores) == N regardless of dangling nodes
  assert.ok(Math.abs(total - 2) < 1e-6);
});
test("computePrestige converges within the configured iteration budget", () => {
  const edges = computeEdgeWeights([
    { from: "A", to: "B", likeCount: 5, distinctDays: 2 },
    { from: "B", to: "C", likeCount: 5, distinctDays: 2 },
    { from: "C", to: "A", likeCount: 5, distinctDays: 2 },
  ]);
  const result = computePrestige(["A", "B", "C"], edges);
  assert.ok(result.iterations <= CONSTANTS.ITERATIONS);
  assert.equal(result.converged, true);
});
test("computePrestige on empty graph returns no scores, no crash", () => {
  const { scores, iterations } = computePrestige([], []);
  assert.equal(scores.size, 0);
  assert.equal(iterations, 0);
});

// ---- graph expansion changes ranks (brief item 27) ------------------------------
test("adding a new scanned node can change an existing node's score", () => {
  const before = computePrestige(
    ["A", "B"],
    computeEdgeWeights([{ from: "A", to: "B", likeCount: 5, distinctDays: 3 }])
  ).scores.get("B");
  // Expand the graph: a new highly-connected liker C also likes B, and is
  // itself liked by several others (raising C's own prestige, and thus the
  // prestige C passes on to B).
  const expandedEdges = computeEdgeWeights([
    { from: "A", to: "B", likeCount: 5, distinctDays: 3 },
    { from: "C", to: "B", likeCount: 5, distinctDays: 3 },
    { from: "D", to: "C", likeCount: 5, distinctDays: 3 },
    { from: "E", to: "C", likeCount: 5, distinctDays: 3 },
  ]);
  const after = computePrestige(["A", "B", "C", "D", "E"], expandedEdges).scores.get("B");
  assert.notEqual(before, after);
});

// ---- provisional promotion (modeled via account status, tested at the shape level) --
test("toPrestigeIndex rescales score to a mean-100 display index", () => {
  const { scores } = computePrestige(["A", "B"], []);
  // no edges -> both scores are 1.0 exactly -> PI 100.0
  assert.equal(toPrestigeIndex(scores.get("A")), 100);
});

// Scan pagination and AppView I/O are intentionally browser-only.
