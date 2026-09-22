import test from "node:test";
import assert from "node:assert/strict";
import { coverRect, containRect, cropToNaturalRect, growRadius, zoomFactor, originalSizeRect } from "../public/lib/geometry.js";

test("coverRect fills a square box with no gaps, centering the overflow axis", () => {
  // 800x400 image (2:1) into a 400x400 box: cover scales to height (400/400=1
  // beats 400/800=0.5), width overflows and gets centered off both edges
  const r = coverRect(800, 400, 400);
  assert.equal(r.h, 400);
  assert.equal(r.w, 800);
  assert.equal(r.y, 0);
  assert.equal(r.x, (400 - 800) / 2);
});

test("containRect fits the whole image with no overflow, centering the gap axis", () => {
  const r = containRect(800, 400, 400);
  assert.equal(r.w, 400);
  assert.equal(r.h, 200);
  assert.equal(r.x, 0);
  assert.equal(r.y, (400 - 200) / 2);
});

test("coverRect and containRect agree on a square image (no overflow either way)", () => {
  const cover = coverRect(600, 600, 400);
  const contain = containRect(600, 600, 400);
  assert.deepEqual(cover, contain);
  assert.equal(cover.w, 400);
  assert.equal(cover.x, 0);
});

test("cropToNaturalRect round-trips a full-frame crop back to the whole image", () => {
  // 1000x1000 natural image, contain-fit into 400: displayed at (0,0,400,400)
  const src = cropToNaturalRect(1000, 1000, 400, { x: 0, y: 0, size: 400 });
  assert.equal(src.sx, 0);
  assert.equal(src.sy, 0);
  assert.equal(src.ssize, 1000);
});

test("cropToNaturalRect maps a centered half-size crop to the image's center quarter", () => {
  const src = cropToNaturalRect(1000, 1000, 400, { x: 100, y: 100, size: 200 });
  assert.equal(src.sx, 250);
  assert.equal(src.sy, 250);
  assert.equal(src.ssize, 500);
});

test("cropToNaturalRect accounts for the letterboxed offset on a non-square image", () => {
  // 800x400 (2:1) contain-fit into 400: displayed at (0, 100, 400, 200) —
  // a crop starting exactly at the letterbox edge should map to natural x=0
  const src = cropToNaturalRect(800, 400, 400, { x: 0, y: 100, size: 100 });
  assert.equal(src.sx, 0);
  assert.equal(src.sy, 0);
  assert.equal(src.ssize, 200);
});

test("growRadius(0) is a small fixed dot, independent of canvas size", () => {
  assert.equal(growRadius(250, 250, 500, 0), 0.9);
});

test("growRadius(1) reaches (and slightly exceeds) the farthest corner", () => {
  const seedX = 100, seedY = 100, size = 500;
  const farthest = Math.max(
    Math.hypot(0 - seedX, 0 - seedY),
    Math.hypot(size - seedX, 0 - seedY),
    Math.hypot(0 - seedX, size - seedY),
    Math.hypot(size - seedX, size - seedY),
  );
  const r = growRadius(seedX, seedY, size, 1);
  assert.ok(r >= farthest, `radius ${r} should fully cover farthest corner ${farthest}`);
  assert.ok(r < farthest * 1.05, `radius ${r} should not overshoot by much`);
});

test("growRadius grows monotonically with t", () => {
  const seedX = 250, seedY = 250, size = 500;
  let prev = 0;
  for (const t of [0, 0.1, 0.25, 0.5, 0.75, 1]) {
    const r = growRadius(seedX, seedY, size, t);
    assert.ok(r >= prev, `radius should not shrink as t increases (t=${t})`);
    prev = r;
  }
});

test("growRadius covers ~t of the canvas area at slider position t (the point of sqrt(t))", () => {
  // seed dead-center so all 4 corners are equidistant, area = pi*r^2 should
  // track t * (pi * maxRadius^2) fairly closely
  const size = 500;
  const seedX = size / 2, seedY = size / 2;
  const maxRadius = growRadius(seedX, seedY, size, 1);
  for (const t of [0.25, 0.5, 0.75]) {
    const r = growRadius(seedX, seedY, size, t);
    const areaFrac = (r * r) / (maxRadius * maxRadius);
    assert.ok(Math.abs(areaFrac - t) < 0.03, `t=${t} gave area fraction ${areaFrac}`);
  }
});

test("zoomFactor(0) is untouched (no zoom)", () => {
  assert.equal(zoomFactor(500, 0), 1);
});

test("zoomFactor(1) magnifies a 0.9px patch to exactly fill the canvas", () => {
  const size = 500;
  const z = zoomFactor(size, 1);
  assert.ok(Math.abs(z - size / 0.9) < 1e-9);
});

test("zoomFactor grows monotonically with t", () => {
  const size = 500;
  let prev = 0;
  for (const t of [0, 0.1, 0.25, 0.5, 0.75, 1]) {
    const z = zoomFactor(size, t);
    assert.ok(z >= prev, `zoom should not shrink as t increases (t=${t})`);
    prev = z;
  }
});

test("zoomFactor accepts a custom seed size and still hits the exact endpoints", () => {
  const size = 500;
  assert.equal(zoomFactor(size, 0, 40), 1);
  const z = zoomFactor(size, 1, 40);
  assert.ok(Math.abs(z - size / 40) < 1e-9);
});

test("zoomFactor ramps by a constant ratio per equal step of t (perceptually even)", () => {
  // log(zoom) should be linear in t, so equal steps of t produce equal
  // *ratios* of magnification rather than a fast-then-slow feel
  const size = 500;
  const steps = [0.2, 0.4, 0.6, 0.8, 1];
  const ratios = [];
  let prev = zoomFactor(size, 0);
  for (const t of steps) {
    const z = zoomFactor(size, t);
    ratios.push(z / prev);
    prev = z;
  }
  for (let i = 1; i < ratios.length; i++) {
    assert.ok(Math.abs(ratios[i] - ratios[0]) < 1e-6, `step ratio ${ratios[i]} should match ${ratios[0]}`);
  }
});

test("originalSizeRect(0) is a small dot centered on the seed", () => {
  const r = originalSizeRect(500, 120, 340, 0);
  assert.ok(Math.abs(r.w - 0.9) < 1e-9);
  assert.ok(Math.abs(r.x - (120 - 0.45)) < 1e-9);
  assert.ok(Math.abs(r.y - (340 - 0.45)) < 1e-9);
});

test("originalSizeRect(1) exactly covers the canvas regardless of seed position", () => {
  for (const [seedX, seedY] of [[0, 0], [500, 500], [10, 480], [250, 250]]) {
    const r = originalSizeRect(500, seedX, seedY, 1);
    assert.equal(r.x, 0);
    assert.equal(r.y, 0);
    assert.equal(r.w, 500);
    assert.equal(r.h, 500);
  }
});

test("originalSizeRect grows monotonically (width) with t", () => {
  let prev = 0;
  for (const t of [0, 0.1, 0.25, 0.5, 0.75, 1]) {
    const r = originalSizeRect(500, 250, 250, t);
    assert.ok(r.w >= prev, `width should not shrink as t increases (t=${t})`);
    prev = r.w;
  }
});
