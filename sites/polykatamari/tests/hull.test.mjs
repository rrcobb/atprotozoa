import test from "node:test";
import assert from "node:assert";
import { startPyramid, addPoint, normalize, emptiestDirection } from "../public/hull.js";

test("grows to a closed triangulated sphere (F = 2V - 4)", () => {
  let { pts, faces } = startPyramid();
  assert.equal(faces.length, 2 * pts.length - 4);
  for (let i = 0; i < 60; i++) {
    faces = addPoint(pts, faces, emptiestDirection(pts));
    assert.equal(faces.length, 2 * pts.length - 4, "euler at " + pts.length);
  }
  // every edge shared by exactly two faces, in opposite directions
  const e = new Map();
  for (const f of faces) for (let k = 0; k < 3; k++) { const key = f[k] + "," + f[(k + 1) % 3]; e.set(key, (e.get(key) || 0) + 1); }
  for (const [k, n] of e) { assert.equal(n, 1); const [u, v] = k.split(","); assert.ok(e.has(v + "," + u)); }
});

test("random directions keep the hull closed", () => {
  let { pts, faces } = startPyramid();
  for (let i = 0; i < 40; i++) faces = addPoint(pts, faces, normalize([Math.random() - .5, Math.random() - .5, Math.random() - .5]));
  assert.equal(faces.length, 2 * pts.length - 4);
});
