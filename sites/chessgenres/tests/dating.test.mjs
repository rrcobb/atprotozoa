import test from "node:test";
import assert from "node:assert";
import { CAST, APPROACHES, newGame, date, confess, DAYS, LOVE } from "../public/dating-logic.js";

test("every cast member loves exactly one approach and has a line for each tier", () => {
  for (const c of CAST) {
    assert.deepEqual(Object.keys(c.prefs).sort(), APPROACHES.map((a) => a.id).sort());
    assert.equal(Object.values(c.prefs).filter((d) => d === 3).length, 1);
    for (const d of Object.values(c.prefs)) assert.ok(c.say[d], c.id + " missing line for " + d);
  }
  assert.equal(new Set(CAST.map((c) => Object.entries(c.prefs).find(([, d]) => d === 3)[0])).size, CAST.length);
});
test("dates raise one heart, cool the others, and clamp at zero", () => {
  const g = newGame();
  date(g, "knight", "leap");
  assert.equal(g.aff.knight, 3); assert.equal(g.aff.bishop, 0);
  date(g, "knight", "leap"); date(g, "bishop", "bold");
  assert.equal(g.aff.knight, 5); assert.equal(g.aff.bishop, 0);
  assert.equal(date(g, "knight", "nope"), null);
});
test("ten days then confession; loving approach wins", () => {
  const g = newGame();
  for (let i = 0; i < DAYS; i++) assert.ok(date(g, "rook", "direct"));
  assert.equal(g.phase, "confess");
  assert.equal(date(g, "rook", "direct"), null);
  assert.ok(g.aff.rook >= LOVE);
  assert.equal(confess(g, "rook").kind, "checkmate");
  assert.equal(g.phase, "over");
});
test("endings: rejected, friends, stalemate", () => {
  let g = newGame(); for (let i = 0; i < DAYS; i++) date(g, "king", "leap");
  assert.equal(confess(g, "king").kind, "rejected");
  g = newGame(); for (let i = 0; i < 4; i++) date(g, "queen", "bold");
  for (let i = DAYS - 4; i > 0; i--) date(g, "queen", "sidelong");
  assert.equal(confess(g, "queen").kind, "friends");
  g = newGame(); for (let i = 0; i < DAYS; i++) date(g, "queen", "sidelong");
  assert.equal(confess(g, null).kind, "stalemate");
});
