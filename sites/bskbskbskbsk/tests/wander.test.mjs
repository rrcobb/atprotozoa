import { test } from "node:test";
import assert from "node:assert/strict";
import { wanderStep, pickTarget, hasArrived } from "../public/lib/wander.js";

test("wanderStep moves toward the target and never overshoots it", () => {
  const p = wanderStep(0, 0, 100, 100, 0.5);
  assert.equal(p.x, 50);
  assert.equal(p.y, 50);
});

test("wanderStep with speed 0 doesn't move, speed 1 jumps straight there", () => {
  assert.deepEqual(wanderStep(10, 20, 90, 40, 0), { x: 10, y: 20 });
  assert.deepEqual(wanderStep(10, 20, 90, 40, 1), { x: 90, y: 40 });
});

test("wanderStep clamps an out-of-range speed instead of overshooting", () => {
  const p = wanderStep(0, 0, 100, 0, 1.5);
  assert.equal(p.x, 100);
});

test("repeated wanderStep calls converge on the target", () => {
  let x = 0,
    y = 0;
  for (let i = 0; i < 50; i++) ({ x, y } = wanderStep(x, y, 500, 300, 0.2));
  assert.ok(hasArrived(x, y, 500, 300, 1));
});

test("pickTarget stays within the margin-inset bounds for any rng in [0,1)", () => {
  const width = 400,
    height = 200,
    margin = 0.1;
  for (const r of [0, 0.5, 0.999]) {
    const { x, y } = pickTarget(width, height, () => r, margin);
    assert.ok(x >= width * margin && x <= width * (1 - margin));
    assert.ok(y >= height * margin && y <= height * (1 - margin));
  }
});

test("pickTarget is deterministic for a fixed rng", () => {
  const a = pickTarget(300, 150, () => 0.25);
  const b = pickTarget(300, 150, () => 0.25);
  assert.deepEqual(a, b);
});

test("hasArrived is false while far away, true once within threshold", () => {
  assert.equal(hasArrived(0, 0, 100, 0, 3), false);
  assert.equal(hasArrived(98, 0, 100, 0, 3), true);
});
