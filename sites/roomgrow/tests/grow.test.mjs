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

import { saveUrl, parseRoom } from "../public/grow.js";

test("saveUrl is a confirm=1 GET with the room, key and encoded shader", () => {
  const s = replay(1, 5);
  const u = new URL(saveUrl("https://w.example", { x: 3, y: -1, key: "rwk1_abc" }, s));
  assert.equal(u.pathname, "/api/agent/set_shader");
  assert.equal(u.searchParams.get("confirm"), "1");
  assert.equal(u.searchParams.get("x"), "3");
  assert.equal(u.searchParams.get("y"), "-1");
  assert.equal(u.searchParams.get("key"), "rwk1_abc");
  assert.equal(u.searchParams.get("wgsl"), render(s));
});

test("parseRoom reads the build answer or a bare cell", () => {
  assert.deepEqual(parseRoom('{"ok":true,"x":3,"y":-1,"key":"rwk1_x"}'), { x: 3, y: -1, key: "rwk1_x" });
  assert.deepEqual(parseRoom("3,-1"), { x: 3, y: -1, key: "" });
  assert.deepEqual(parseRoom("-2 5"), { x: -2, y: 5, key: "" });
  assert.equal(parseRoom(""), null);
  assert.equal(parseRoom("hello"), null);
});
