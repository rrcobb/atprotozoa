import test from "node:test";
import assert from "node:assert";
import { PATH, attackSquares, isPathSquare, waveSpawns, WAVES } from "../public/logic.js";

test("path is contiguous orthogonal steps", () => {
  for (let i = 1; i < PATH.length; i++) {
    const d = Math.abs(PATH[i][0] - PATH[i-1][0]) + Math.abs(PATH[i][1] - PATH[i-1][1]);
    assert.equal(d, 1);
  }
});
test("attack sets", () => {
  assert.equal(attackSquares("knight", 3, 3).length, 8);
  assert.equal(attackSquares("knight", 0, 0).length, 2);
  assert.equal(attackSquares("rook", 3, 3).length, 14);
  assert.equal(attackSquares("bishop", 0, 0).length, 7);
  assert.equal(attackSquares("queen", 3, 3).length, 27);
});
test("row 7 and row 1 mostly free", () => {
  assert.ok(!isPathSquare(7, 3));
  assert.ok(isPathSquare(0, 3));
});
test("final wave has a boss", () => {
  assert.ok(waveSpawns(WAVES).some(s => s.kind === "boss"));
});
