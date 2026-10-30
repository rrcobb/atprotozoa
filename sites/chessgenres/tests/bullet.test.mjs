import test from "node:test";
import assert from "node:assert";
import { newGame, step, bomb, spawn, bossPhase, result, W, H, BOSS_T, HIT_R } from "../public/bullet-logic.js";

test("king is clamped to the board and moves with input", () => {
  const s = newGame(1);
  step(s, 0.1, { mx: -1, my: 0 }); assert.ok(s.p.x < W / 2);
  for (let i = 0; i < 100; i++) step(s, 0.1, { mx: -1, my: -1 });
  assert.ok(s.p.x >= 10 && s.p.y >= 10);
});
test("a bullet on the hitbox costs a life, then invulnerability", () => {
  const s = newGame(1);
  s.bullets.push({ x: s.p.x, y: s.p.y, vx: 0, vy: 0, r: 5, g: false });
  step(s, 0.01); assert.equal(s.lives, 2); assert.ok(s.p.inv > 0);
  s.bullets.push({ x: s.p.x, y: s.p.y, vx: 0, vy: 0, r: 5, g: false });
  step(s, 0.01); assert.equal(s.lives, 2);
});
test("grazing scores once without hurting", () => {
  const s = newGame(1);
  s.bullets.push({ x: s.p.x + 12, y: s.p.y, vx: 0, vy: 0, r: 3, g: false });
  step(s, 0.01); step(s, 0.01);
  assert.equal(s.grazes, 1); assert.equal(s.lives, 3);
});
test("losing all lives ends the run", () => {
  const s = newGame(1);
  for (let i = 0; i < 3; i++) { s.p.inv = 0; s.bullets.push({ x: s.p.x, y: s.p.y, vx: 0, vy: 0, r: 5, g: false }); step(s, 0.01); }
  assert.ok(s.over && !s.won);
});
test("bomb clears bullets and is limited", () => {
  const s = newGame(1);
  s.bullets.push({ x: 10, y: 10, vx: 0, vy: 0, r: 5, g: false });
  assert.ok(bomb(s)); assert.equal(s.bullets.length, 0);
  assert.ok(bomb(s)); assert.ok(!bomb(s));
});
test("auto-fire kills a pawn and scores", () => {
  const s = newGame(1);
  const e = spawn(s, "pawn", s.p.x); e.y = 300; e.f = 99;
  for (let i = 0; i < 120 && e.hp > 0; i++) step(s, 0.02);
  assert.ok(e.hp <= 0); assert.ok(s.score >= 100);
});
test("enemies fire patterns shaped like their moves", () => {
  const s = newGame(1); s.script = [];
  const b = spawn(s, "bishop", 240); b.y = 100; b.f = 0; step(s, 0.01);
  assert.equal(s.bullets.length, 4);
  s.bullets.length = 0; s.p.x = 20;
  const q = spawn(s, "queen", 240); q.y = 110; q.hp = q.max * 0.5; q.f2 = 0; step(s, 0.01);
  assert.equal(bossPhase(q), 1); assert.ok(s.bullets.length > 10);
});
test("the queen arrives on schedule and killing her wins", () => {
  const s = newGame(1);
  for (let t = 0; t < BOSS_T + 1; t += 0.5) { s.p.inv = 9; step(s, 0.5); }
  const q = s.enemies.find((e) => e.kind === "queen"); assert.ok(q);
  q.hp = 1; q.y = 100; s.shots.push({ x: q.x, y: q.y });
  step(s, 0.001);
  assert.ok(s.won && s.over); assert.ok(result(s).total >= 10000);
});
test("a full scripted run with a dodging bot stays finite", () => {
  const s = newGame(7);
  for (let i = 0; i < 4000 && !s.over; i++) step(s, 1 / 60, { mx: Math.sin(i / 40), my: 0 });
  assert.ok(Number.isFinite(s.p.x) && s.bullets.length < 3000);
});
