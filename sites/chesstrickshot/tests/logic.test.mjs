import test from "node:test";
import assert from "node:assert";
import { LEVELS, newShot, startShot, legal, shoot, undo, captures, countSolutions, makePuzzle } from "../public/logic.js";

test("every level builds a solvable puzzle", () => {
  LEVELS.forEach((_, i) => { const s = newShot(i); assert.ok(countSolutions(s.puzzle) >= 1); assert.equal(s.puzzle.targets.at(-1).t, "k"); });
});
test("sliders are blocked by the first piece; king only falls last", () => {
  const t = [{ x: 3, y: 0, t: "p" }, { x: 6, y: 0, t: "p" }, { x: 0, y: 3, t: "k" }];
  assert.deepEqual(captures("r", 0, 0, t).map((p) => p.x + "," + p.y), ["3,0"]);
  assert.equal(captures("r", 0, 0, [{ x: 0, y: 3, t: "k" }]).length, 1);
});
test("playing a found solution wins; undo restores state", () => {
  const s = startShot(newShot(0));
  const solve = (st) => {
    if (st.status === "won") return true;
    for (const p of legal(st)) { shoot(st, p.x, p.y); if (solve(st)) return true; undo(st); }
    return false;
  };
  assert.ok(solve(s));
  assert.equal(s.status, "won");
  assert.ok(s.style > 0);
  undo(s);
  assert.equal(s.status, "playing");
  assert.equal(s.left.length, 1);
});
test("illegal squares are refused", () => {
  const s = startShot(newShot(3));
  assert.equal(shoot(s, s.pos.x, s.pos.y), false);
  assert.equal(makePuzzle("q", 3, 9).targets.length, 3);
});
