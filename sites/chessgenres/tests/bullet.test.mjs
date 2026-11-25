import test from "node:test";
import assert from "node:assert";
import { newGame, step, bomb, spawn, spawnBoss, bossPhase, result, isRecord, buildScript, rng, BOSSES, STAGES, DIFFS, W, DEATHBOMB, MAX_POWER, MAX_MULT } from "../public/bullet-logic.js";

const calm = (s) => { s.p.inv = 0; s.script = []; return s; };
const still = (s, p = s.p) => s.bullets.push({ x: p.x, y: p.y, vx: 0, vy: 0, r: 5, g: false, age: 0 });

test("king is clamped to the board and moves with input", () => {
  const s = newGame(1);
  step(s, 0.1, { mx: -1, my: 0 }); assert.ok(s.p.x < W / 2);
  for (let i = 0; i < 100; i++) step(s, 0.1, { mx: -1, my: -1 });
  assert.ok(s.p.x >= 10 && s.p.y >= 10);
});
test("a bullet on the hitbox costs a life after the castle window, then invulnerability", () => {
  const s = calm(newGame(1));
  still(s); step(s, 0.01);
  assert.equal(s.lives, 3); assert.ok(s.p.dying > 0); // still inside the deathbomb window
  step(s, DEATHBOMB + 0.01);
  assert.equal(s.lives, 2); assert.ok(s.p.inv > 0);
  still(s); step(s, 0.01); step(s, 0.3); assert.equal(s.lives, 2);
});
test("castling in the instant after a hit saves the life", () => {
  const s = calm(newGame(1));
  still(s); step(s, 0.01);
  assert.ok(bomb(s));
  step(s, 0.5);
  assert.equal(s.lives, 3); assert.equal(s.bombs, DIFFS.normal.bombs - 1);
});
test("grazing scores once, builds the chain, and never hurts", () => {
  const s = calm(newGame(1));
  s.bullets.push({ x: s.p.x + 12, y: s.p.y, vx: 0, vy: 0, r: 3, g: false, age: 0 });
  step(s, 0.01); step(s, 0.01);
  assert.equal(s.grazes, 1); assert.equal(s.lives, 3); assert.ok(s.mult > 1);
  for (let i = 0; i < 200; i++) { s.bullets.push({ x: s.p.x + 12, y: s.p.y, vx: 0, vy: 0, r: 3, g: false, age: 0 }); step(s, 0.001); }
  assert.ok(s.mult <= MAX_MULT);
});
test("the chain fades when you stop grazing", () => {
  const s = calm(newGame(1)); s.mult = 2;
  for (let i = 0; i < 400; i++) step(s, 0.02);
  assert.equal(s.mult, 1);
});
test("losing all lives ends the run", () => {
  const s = calm(newGame(1));
  for (let i = 0; i < 3; i++) { s.p.inv = 0; still(s); step(s, 0.01); step(s, DEATHBOMB + 0.01); }
  assert.ok(s.over && !s.won);
});
test("bomb clears bullets and is limited", () => {
  const s = calm(newGame(1));
  s.bullets.push({ x: 10, y: 10, vx: 0, vy: 0, r: 5, g: false, age: 0 });
  assert.ok(bomb(s)); assert.equal(s.bullets.length, 0);
  assert.ok(bomb(s)); assert.ok(!bomb(s));
});
test("difficulty changes lives and bombs", () => {
  assert.equal(newGame(1, { diff: "easy" }).lives, 5);
  assert.equal(newGame(1, { diff: "hard" }).lives, 2);
  assert.equal(newGame(1, { diff: "hard" }).bombs, 1);
});
test("auto-fire kills a pawn, scores and may drop an item", () => {
  const s = calm(newGame(1));
  const e = spawn(s, "pawn", s.p.x); e.y = 300; e.f = 99;
  for (let i = 0; i < 120 && e.hp > 0; i++) step(s, 0.02);
  assert.ok(e.hp <= 0); assert.ok(s.score >= 100); assert.ok(s.items.length >= 1);
});
test("power items add bolts up to the cap, and a hit costs a level", () => {
  const s = calm(newGame(1));
  for (let i = 0; i < 6; i++) { s.items.push({ x: s.p.x, y: s.p.y, type: "power", vx: 0, vy: 0 }); step(s, 0.01); }
  assert.equal(s.power, MAX_POWER);
  s.shots.length = 0; s.p.fire = 0; step(s, 0.01); assert.equal(s.shots.length, 6);
  s.p.inv = 0; still(s); step(s, 0.01); step(s, DEATHBOMB + 0.01); assert.equal(s.power, MAX_POWER - 1);
});
test("enemies fire patterns shaped like their moves", () => {
  const s = calm(newGame(1));
  const b = spawn(s, "bishop", 240); b.y = 100; b.f = 0; step(s, 0.01);
  assert.equal(s.bullets.length, 4);
});
test("every boss card fires bullets and the card number advances with damage", () => {
  for (const id of Object.keys(BOSSES)) {
    const s = calm(newGame(3)); s.p.inv = 99;
    const e = spawnBoss(s, id);
    for (let i = 0; i < 400; i++) { step(s, 0.02); }
    assert.ok(e.arrived, id);
    let seen = 0;
    for (let ci = 0; ci < BOSSES[id].cards.length; ci++) {
      e.hp = Math.max(1, Math.floor(e.max * (ci === 0 ? 1 : BOSSES[id].cards[ci - 1].until) - 1));
      if (ci > 0) { s.shots.push({ x: e.x, y: e.y, vx: 0 }); step(s, 0.001); }
      assert.equal(bossPhase(e), ci, id + " card " + ci);
      s.bullets.length = 0;
      for (let i = 0; i < 300; i++) { step(s, 0.02); }
      seen += s.bullets.length;
      assert.ok(Number.isFinite(e.x) && Number.isFinite(e.y));
    }
    assert.ok(seen > 0, id + " fired nothing");
  }
});
test("a card that is never beaten times out into the next one", () => {
  const s = calm(newGame(1)); s.p.inv = 99;
  const e = spawnBoss(s, "battery");
  for (let i = 0; i < 400; i++) step(s, 0.02); // arrives
  for (let i = 0; i < Math.ceil((BOSSES.battery.cards[0].limit + 2) / 0.02); i++) step(s, 0.02);
  assert.ok(e.ci >= 1);
});
test("a spell card broken without a hit or castle pays a bonus", () => {
  const s = calm(newGame(1)); s.p.inv = 99;
  const e = spawnBoss(s, "battery");
  for (let i = 0; i < 400; i++) step(s, 0.02);
  s.score = 0; s.cardHit = false; e.hp = Math.floor(e.max * 0.66);
  s.shots.push({ x: e.x, y: e.y, vx: 0 }); step(s, 0.001);
  assert.equal(e.ci, 1); assert.ok(s.score >= 3000);
});
test("scripts end in a stage boss and have a mid-boss", () => {
  assert.equal(STAGES.length, 3);
  STAGES.forEach((st, i) => {
    const sc = buildScript(i, rng(4));
    assert.equal(sc[sc.length - 1].boss, st.boss);
    assert.ok(sc.some((q) => q.boss && BOSSES[q.boss].mid));
    for (let k = 1; k < sc.length; k++) assert.ok(sc[k].t >= sc[k - 1].t);
  });
});
test("killing the stage boss clears the stage and moves on; the last one wins", () => {
  const s = calm(newGame(1)); s.p.inv = 99;
  s.st = 100; s.script = [];
  const e = spawnBoss(s, "battery");
  for (let i = 0; i < 400; i++) step(s, 0.02);
  e.hp = 1; e.def = { ...e.def, cards: [e.def.cards[0]] }; e.ci = 0;
  s.shots.push({ x: e.x, y: e.y, vx: 0 }); step(s, 0.001);
  assert.equal(s.phase, "clear");
  for (let i = 0; i < 200; i++) step(s, 0.02);
  assert.equal(s.stage, 1); assert.equal(s.phase, "play");
  // final stage
  const f = calm(newGame(1, { stage: 2 })); f.p.inv = 99; f.script = [];
  const q = spawnBoss(f, "queen");
  for (let i = 0; i < 400; i++) step(f, 0.02);
  q.hp = 1; q.ci = 3; f.shots.push({ x: q.x, y: q.y, vx: 0 }); step(f, 0.001);
  for (let i = 0; i < 200; i++) step(f, 0.02);
  assert.ok(f.won && f.over); assert.ok(result(f).total >= 30000);
});
test("the script clock pauses while a boss is alive", () => {
  const s = calm(newGame(1)); s.p.inv = 99; spawnBoss(s, "fork");
  const t = s.st; for (let i = 0; i < 100; i++) step(s, 0.02);
  assert.equal(s.st, t);
});
test("extra lives arrive at score thresholds", () => {
  const s = calm(newGame(1)); s.score = 30000; step(s, 0.01); assert.equal(s.lives, 4);
});
test("high scores only count full runs", () => {
  assert.ok(isRecord(0, { full: true, total: 5 })); assert.ok(!isRecord(10, { full: true, total: 5 })); assert.ok(!isRecord(0, { full: false, total: 5 }));
});
test("a full scripted run with a dodging bot stays finite on every stage", () => {
  for (const stage of [0, 1, 2]) {
    const s = newGame(7, { stage, diff: "hard" });
    for (let i = 0; i < 6000 && !s.over; i++) step(s, 1 / 60, { mx: Math.sin(i / 40), my: 0 });
    assert.ok(Number.isFinite(s.p.x) && s.bullets.length < 3000, "stage " + stage);
  }
});
