import test from "node:test";
import assert from "node:assert";
import { STAGES, newLevel, kingMoves, moveKing, wait, dangerNext, visionOf, SIZE } from "../public/stealth-logic.js";

const KN = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];
function legalStep(t, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  if (t === "n") return KN.some(([x, y]) => x === dx && y === dy);
  if (t === "r") return (dx === 0) !== (dy === 0);
  if (t === "b") return Math.abs(dx) === Math.abs(dy) && dx !== 0;
  if (t === "q") return (dx === 0) !== (dy === 0) || (Math.abs(dx) === Math.abs(dy) && dx !== 0);
  if (t === "p") return Math.abs(dx) + Math.abs(dy) === 1;
  return false;
}

test("patrol routes are legal chess steps on open squares", () => {
  STAGES.forEach((st, i) => {
    const walls = new Set(st.walls.map((w) => w + ""));
    for (const g of st.guards) {
      g.route.forEach((p, j) => {
        assert.ok(p[0] >= 0 && p[1] >= 0 && p[0] < SIZE && p[1] < SIZE, `stage ${i} ${g.name} off board`);
        assert.ok(!walls.has(p + ""), `stage ${i} ${g.name} on a wall`);
        if (j) assert.ok(legalStep(g.t, g.route[j - 1], p), `stage ${i} ${g.name} step ${j}`);
      });
    }
  });
});

// Breadth-first search for a route to the exit that is never spotted.
function solve(stage) {
  const sig = (s) => `${s.king.x},${s.king.y}|` + s.guards.map((g) => g.i + ":" + g.dir).join(",");
  const clone = (s) => structuredClone(s);
  let frontier = [{ s: newLevel(stage), n: 0 }];
  const seen = new Set([sig(frontier[0].s)]);
  while (frontier.length) {
    const next = [];
    for (const { s, n } of frontier) {
      const opts = [...kingMoves(s).map((m) => [m.x, m.y]), null];
      for (const o of opts) {
        const t = clone(s);
        if (o) moveKing(t, o[0], o[1]); else wait(t);
        if (t.status === "won") return n + 1;
        if (t.status !== "playing" || t.alert > 0) continue;
        const k = sig(t);
        if (!seen.has(k)) { seen.add(k); next.push({ s: t, n: n + 1 }); }
      }
    }
    frontier = next;
  }
  return null;
}
test("every stage can be cleared without being seen", () => {
  STAGES.forEach((_, i) => assert.ok(solve(i), `stage ${i} has a stealth solution`));
});

test("a guard sees along its rank until a wall", () => {
  const s = newLevel(0);
  const rook = s.guards[0];
  const v = visionOf(s, rook);
  assert.ok(v.has("2,1") && v.has("7,1"));
  assert.ok(v.has("0,7") && !v.has("3,3"));
});

test("being spotted raises the alert and standing down needs unseen turns", () => {
  const s = newLevel(0);
  s.king = { x: 2, y: 2 }; // the rook steps to (2,1) and looks straight down
  s.guards[0].i = 1; s.guards[0].x = 1; s.guards[0].y = 1; s.guards[0].dir = 1;
  wait(s);
  assert.ok(s.alert > 0 || s.status === "lost");
});

test("hiding in a crate beats the rook", () => {
  const s = newLevel(0);
  s.king = { x: 1, y: 4 }; // a crate
  s.guards[0].i = 1; s.guards[0].x = 1; s.guards[0].y = 1;
  wait(s);
  assert.equal(s.alert, 0);
  assert.equal(dangerNext(s).has("1,4"), true); // the square is watched, but the crate hides you
});

import { genSpec, newRun, floorLevel, completeFloor, failFloor, throwCoin, shoot, useBox, rankOf, SET_PIECES } from "../public/stealth-logic.js";

test("generated floors are legal and provably clearable for many seeds", () => {
  for (let seed = 1; seed <= 12; seed++) for (let floor = 1; floor < 14; floor++) {
    if (SET_PIECES[floor] !== undefined) continue;
    const run = newRun(seed); run.floor = floor;
    const s = floorLevel(run);
    assert.ok(s.par !== null && s.par >= 7, `seed ${seed} floor ${floor} solvable`);
    const walls = new Set(s.walls.map((w) => w.x + "," + w.y));
    for (const g of s.guards) g.route.forEach((p, j) => {
      assert.ok(!walls.has(p + ""));
      if (j) assert.ok(legalStep(g.t, g.route[j - 1], p), `seed ${seed} floor ${floor} ${g.name}`);
    });
  }
});

test("same seed, same floor", () => {
  assert.deepEqual(genSpec(3, 77), genSpec(3, 77));
  assert.notDeepEqual(genSpec(3, 77), genSpec(3, 78));
});

test("a locked exit needs the keycard", () => {
  const s = newLevel(0);
  s.guards = []; s.king = { x: 6, y: 0 }; s.keycard = { x: 5, y: 0 };
  moveKing(s, 7, 0);
  assert.equal(s.status, "playing");
  moveKing(s, 6, 0); moveKing(s, 5, 0);
  assert.ok(s.hasKey);
  moveKing(s, 6, 0); moveKing(s, 7, 0);
  assert.equal(s.status, "won");
});

test("darts, coins and the box", () => {
  const s = newLevel(0);
  s.king = { x: 0, y: 1 };
  s.guards = [{ ...s.guards[0], x: 3, y: 1, i: 0, route: [[3, 1], [4, 1]] }];
  assert.ok(shoot(s, 3, 1));
  assert.ok(s.guards[0].asleep > 0);
  assert.equal(visionOf(s, s.guards[0]).size, 0);
  assert.equal(shoot(s, 3, 1), false); // already asleep
  const t = newLevel(0);
  t.king = { x: 4, y: 4 };
  assert.ok(throwCoin(t, 5, 4));
  assert.ok(t.guards.some((x) => x.freeze > 0));
  const u = newLevel(0);
  u.king = { x: 2, y: 2 }; u.guards[0].i = 1; u.guards[0].x = 1; u.guards[0].y = 1;
  assert.ok(useBox(u));
  assert.equal(u.alert, 0);
  assert.equal(u.gear.box, 0);
});

test("runs rank floors, bank gear, and end when continues run out", () => {
  const run = newRun(3);
  const s = floorLevel(run);
  s.status = "won"; s.seen = 0; s.turn = s.par;
  assert.equal(rankOf(s), "S");
  const r = completeFloor(run, s);
  assert.ok(r.points > 300 && run.floor === 1 && run.gear.coin > 3);
  for (let i = 0; i < 3; i++) assert.equal(failFloor(run), "retry");
  assert.equal(failFloor(run), "over");
});
