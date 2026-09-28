// Tests for public/lib/generator.js — the pure region-graph + mad-lib logic
// behind atlaslibs (no DOM). Run with `node --test tests/*.test.mjs`.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  REGIONS,
  buildAdjacency,
  regionById,
  neighborsOf,
  distantFrom,
  relationshipNote,
  generateStory,
  SCENES,
  sceneText,
} from "../public/lib/generator.js";

test("every region has a unique id", () => {
  const ids = REGIONS.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("adjacency is symmetric and self-loop-free", () => {
  const adj = buildAdjacency();
  for (const r of REGIONS) {
    assert.ok(!adj.get(r.id).has(r.id), `${r.id} should not neighbor itself`);
    for (const n of adj.get(r.id)) {
      assert.ok(adj.get(n).has(r.id), `${n} should list ${r.id} back as a neighbor`);
    }
  }
});

test("buildAdjacency rejects a pair naming an unknown region", () => {
  assert.throws(() => buildAdjacency([["mainland", "atlantis"]]));
});

test("every region has at least one neighbor, so a story always has a neighbor scene", () => {
  for (const r of REGIONS) {
    assert.ok(neighborsOf(r.id).length > 0, `${r.id} has no neighbors`);
  }
});

test("distantFrom never includes the region itself or one of its neighbors", () => {
  for (const r of REGIONS) {
    const near = new Set(neighborsOf(r.id).map((n) => n.id));
    const far = distantFrom(r.id);
    assert.ok(!far.some((f) => f.id === r.id));
    assert.ok(!far.some((f) => near.has(f.id)));
  }
});

test("distantFrom plus neighborsOf plus self covers every region", () => {
  for (const r of REGIONS) {
    const near = neighborsOf(r.id).length;
    const far = distantFrom(r.id).length;
    assert.equal(near + far + 1, REGIONS.length);
  }
});

test("regionById finds real regions and returns null for a bogus id", () => {
  assert.equal(regionById("mainland").name, "the English Mainland");
  assert.equal(regionById("nowhere"), null);
});

test("relationshipNote is defined both directions for the politics-isle/mainland pair", () => {
  assert.ok(relationshipNote("politics-isle", "mainland"));
  assert.ok(relationshipNote("mainland", "politics-isle"));
});

test("relationshipNote returns null for a pair with no special-case flavor", () => {
  assert.equal(relationshipNote("japan-shore", "portugal-landing"), null);
});

// A tiny deterministic PRNG (mulberry32) so generateStory's picks are
// reproducible across runs instead of depending on Math.random.
function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test("generateStory always picks a neighbor that is actually adjacent to home", () => {
  for (let seed = 0; seed < 200; seed++) {
    const s = generateStory(mulberry32(seed));
    const near = new Set(neighborsOf(s.home.id).map((n) => n.id));
    assert.ok(near.has(s.neighbor.id), `seed ${seed}: ${s.neighbor.id} is not a neighbor of ${s.home.id}`);
  }
});

test("generateStory always picks a distant region that is neither home nor its neighbor", () => {
  for (let seed = 0; seed < 200; seed++) {
    const s = generateStory(mulberry32(seed));
    assert.notEqual(s.distant.id, s.home.id);
    assert.notEqual(s.distant.id, s.neighbor.id);
  }
});

test("generateStory produces a title and tagline string every time", () => {
  for (let seed = 0; seed < 50; seed++) {
    const s = generateStory(mulberry32(seed));
    assert.equal(typeof s.title, "string");
    assert.ok(s.title.length > 0);
    assert.equal(typeof s.tagline, "string");
    assert.ok(s.tagline.length > 0);
  }
});

test("every scene builds non-empty text for a generated story", () => {
  const s = generateStory(mulberry32(7));
  for (let i = 0; i < SCENES.length; i++) {
    const text = sceneText(i, s);
    assert.equal(typeof text, "string");
    assert.ok(text.length > 20, `scene "${SCENES[i].title}" produced suspiciously short text`);
  }
});

test("the politics-isle/mainland relationship note is used when they land together", () => {
  // Search seeds until we hit the pairing, then confirm the special-case
  // note (not the generic rival/ally line) drives the neighbor scene.
  let found = false;
  for (let seed = 0; seed < 2000 && !found; seed++) {
    const s = generateStory(mulberry32(seed));
    if (
      (s.home.id === "politics-isle" && s.neighbor.id === "mainland") ||
      (s.home.id === "mainland" && s.neighbor.id === "politics-isle")
    ) {
      found = true;
      assert.ok(s.note);
      assert.ok(s.isRival);
      const text = sceneText(1, s);
      assert.ok(text.includes(s.note));
    }
  }
  assert.ok(found, "never sampled the politics-isle/mainland pairing in 2000 seeds");
});
