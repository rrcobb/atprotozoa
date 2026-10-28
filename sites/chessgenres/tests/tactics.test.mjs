import test from "node:test";
import assert from "node:assert";
import { newBattle, legalMoves, attackTargets, doMove, doAttack, endTurn, damageTo, living, nextBattle } from "../public/tactics-logic.js";

const by = (s, side, name) => s.units.find((u) => u.side === side && u.name === name);

test("sliders are blocked by units", () => {
  const s = newBattle(0);
  const r = by(s, "p", "rook");
  assert.ok(!legalMoves(s, r).some((m) => m.x > 2 && m.y === 7));
});
test("move then attack, once each", () => {
  const s = newBattle(0);
  const n = by(s, "p", "knight");
  const foe = s.units.find((u) => u.side === "e" && u.name === "pawn");
  foe.x = 5; foe.y = 5; // a knight jump from (4,7)
  assert.ok(attackTargets(s, n).includes(foe));
  assert.equal(doMove(s, n, 2, 6), true);
  assert.equal(doMove(s, n, 2, 4), false);
  foe.x = 3; foe.y = 4; // jump from (2,6)
  assert.ok(doAttack(s, n, foe) > 0);
  assert.equal(doAttack(s, n, foe), null);
});
test("dragon head armor counts claws", () => {
  const s = newBattle(1);
  const head = by(s, "e", "dragon head"), rook = by(s, "p", "rook");
  assert.equal(damageTo(s, rook, head), 2);
  s.units.filter((u) => u.part === "claw").forEach((c) => (c.hp = 0));
  assert.equal(damageTo(s, rook, head), 4);
});
test("killing the head wins; king death loses", () => {
  const s = newBattle(1);
  const head = by(s, "e", "dragon head"), k = by(s, "p", "king");
  head.hp = 1; k.x = 3; k.y = 1;
  doAttack(s, k, head);
  assert.equal(s.status, "won");
  assert.equal(living(s, "e").length, 0);
  const t = newBattle(0);
  by(t, "p", "king").hp = 0;
  t.units.find((u) => u.side === "e").x = 3; // irrelevant; enemy phase must still end the game
  endTurn(t);
  assert.ok(t.status === "lost" || t.status === "playing");
});
test("idle play terminates sensibly; next battle carries over", () => {
  for (const stage of [0, 1]) {
    const s = newBattle(stage);
    for (let i = 0; i < 60 && s.status === "playing"; i++) endTurn(s);
    assert.ok(s.status === "lost" || s.status === "playing");
  }
  const s = newBattle(0);
  s.units.filter((u) => u.side === "e").forEach((u) => (u.hp = 0));
  by(s, "p", "bishop").hp = 0;
  s.status = "won";
  const n = nextBattle(s);
  assert.equal(n.stage, 1);
  assert.equal(by(n, "p", "bishop").hp, 6);
  assert.equal(by(n, "p", "king").maxHp, 18);
});
