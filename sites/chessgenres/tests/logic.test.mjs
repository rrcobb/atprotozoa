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

import { makePath, mulberry32, waveTheme, hitDamage, defenders, towerDmg, towerCd, upgradeCost, pickTarget, offerRelics, describeWave, isBossWave, hpScale, PIECES } from "../public/logic.js";

const mk = (type, r, c) => ({ type, r, c, cells: attackSquares(type, r, c), up: { power: 0, haste: 0 }, def: 0 });

test("procedural roads are valid, seeded and varied", () => {
  const shapes = new Set();
  for (let s = 1; s <= 40; s++) {
    const p = makePath(s);
    assert.ok(p.length >= 20);
    assert.deepEqual(p, makePath(s));
    shapes.add(p.join("|"));
    const seen = new Set(p.map((x) => x.join()));
    assert.equal(seen.size, p.length);
    for (let i = 1; i < p.length; i++) assert.equal(Math.abs(p[i][0] - p[i-1][0]) + Math.abs(p[i][1] - p[i-1][1]), 1);
    assert.ok(!isPathSquare(-1, -1, p));
  }
  assert.ok(shapes.size > 20);
});
test("waves vary by seed theme, and bosses repeat in endless", () => {
  assert.equal(waveTheme(5, 1), "mixed");
  const themes = new Set(); for (let s = 1; s < 30; s++) themes.add(waveTheme(s, 6));
  assert.ok(themes.size > 1);
  assert.ok(isBossWave(20) && !isBossWave(15));
  assert.ok(waveSpawns(20).some((s) => s.kind === "boss"));
  assert.ok(waveSpawns(5).some((s) => s.kind === "king"));
  assert.ok(waveSpawns(7, "rush").filter((s) => s.kind === "knight").length >= 21);
  assert.match(describeWave(4, "armored"), /armored/);
  assert.ok(hpScale(5, 1.25) > hpScale(5, 1));
  assert.ok(mulberry32(1)() !== mulberry32(2)());
});
test("armor, guarding, upgrades and targeting", () => {
  assert.equal(hitDamage(10, 3), 7);
  assert.equal(hitDamage(10, 50), 2.5);
  assert.equal(hitDamage(10, 50, true), 10);
  const a = mk("rook", 3, 3), b = mk("rook", 3, 6), c = mk("rook", 0, 3), d = mk("rook", 6, 3);
  assert.equal(defenders([a, b], a), 1);
  assert.equal(defenders([a, b, c, d], a), 2); // capped at two guards
  const base = towerDmg(a);
  a.def = 2; assert.ok(Math.abs(towerDmg(a) - base * 1.4) < 1e-9);
  a.up.power = 1; assert.ok(towerDmg(a) > base * 1.4);
  assert.ok(towerDmg(a, ["dmg"]) > towerDmg(a));
  a.up.haste = 2; assert.ok(towerCd(a) < PIECES.rook.cd);
  assert.ok(upgradeCost("rook", a) > upgradeCost("rook", mk("rook", 1, 1)));
  const list = [{ t: 1, hp: 50 }, { t: 5, hp: 10 }, { t: 3, hp: 90 }];
  assert.equal(pickTarget(list, "first").t, 5);
  assert.equal(pickTarget(list, "strong").hp, 90);
  assert.equal(pickTarget(list, "weak").hp, 10);
  assert.equal(pickTarget([], "first"), null);
});
test("relic offers are three distinct picks", () => {
  const o = offerRelics(mulberry32(3), ["dmg"]);
  assert.equal(o.length, 3);
  assert.equal(new Set(o).size, 3);
  assert.ok(!o.includes("dmg"));
});
