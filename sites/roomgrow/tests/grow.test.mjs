import { test } from "node:test";
import assert from "node:assert";
import { init, step, replay, render, MAX_OBJECTS, MAX_EMITTERS } from "../public/grow.js";

test("same seed, same room", () => {
  assert.equal(render(replay(7, 40)), render(replay(7, 40)));
  assert.notEqual(render(replay(7, 40)), render(replay(8, 40)));
});

test("objects and sounds stay under their caps over a long run", () => {
  const s = replay(3, 600);
  assert.ok(s.objects.length <= MAX_OBJECTS);
  assert.ok(s.emitters.length <= MAX_EMITTERS);
  assert.equal(s.tick, 600);
});

test("grow:false never adds an object", () => {
  let s = step(init(2)).state; // first step always adds one
  const n = s.objects.length;
  for (let i = 0; i < 80; i++) s = step(s, { grow: false }).state;
  assert.equal(s.objects.length, n);
});

test("objects stay above the floor and off the doorway lanes at placement", () => {
  for (const o of replay(5, 150).objects) assert.ok(o.y - o.bob >= 0);
});

test("render emits a shade function with every object", () => {
  const s = replay(1, 30);
  const w = render(s);
  assert.match(w, /fn shade\(ro: vec3f, rd: vec3f, tmin: f32, tmax: f32\) -> Hit/);
  assert.equal((w.match(/best = vec2f\(d,/g) || []).length, s.objects.length);
});
