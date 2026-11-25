import test from "node:test";
import assert from "node:assert";
import { makeUnit, enemyPlan, enemyTeam, mulberry32, activeSynergies, applySynergies, interest, streakBonus, maxBoard,
  offerRelics, isBossRound, autoScore, ARCHETYPES, ROUNDS, tick, result } from "../public/auto-logic.js";

test("enemy plans are seeded, scoutable and varied", () => {
  const a = enemyPlan(4, mulberry32(9)), b = enemyPlan(4, mulberry32(9));
  assert.equal(a.label, b.label);
  assert.deepEqual(a.units.map((u) => [u.type, u.r, u.c]), b.units.map((u) => [u.type, u.r, u.c]));
  const labels = new Set();
  for (let s = 1; s < 60; s++) labels.add(enemyPlan(8, mulberry32(s)).label);
  assert.ok(labels.size >= 4);
  for (let s = 1; s < 40; s++) {
    const u = enemyTeam(12, mulberry32(s));
    assert.ok(u.length <= 21);
    assert.equal(new Set(u.map((x) => x.r * 8 + x.c)).size, u.length, "no stacked pieces");
  }
});
test("giant queens return every ten rounds, bigger each time", () => {
  assert.ok(isBossRound(ROUNDS) && isBossRound(2 * ROUNDS) && !isBossRound(5));
  const g1 = enemyTeam(10, mulberry32(1)).find((u) => u.giant), g2 = enemyTeam(20, mulberry32(1)).find((u) => u.giant);
  assert.ok(g2.maxhp > g1.maxhp);
  assert.ok(!enemyTeam(9, mulberry32(1)).some((u) => u.giant));
});
test("synergies need enough of a kind and scale stats", () => {
  const army = (...ts) => ts.map((t, i) => makeUnit(t, 1, 0, 7, i));
  assert.equal(activeSynergies(army("p", "p")).length, 0);
  const s = activeSynergies(army("p", "p", "p", "n", "n"));
  assert.deepEqual(s.map((x) => x.type).sort(), ["n", "p"]);
  assert.ok(activeSynergies(army("n", "b", "r", "q")).some((x) => x.type === "*"));
  const units = army("n", "n"), base = units[0].atk;
  applySynergies(units);
  assert.ok(units[0].atk > base);
  const solo = army("r"), hp = solo[0].maxhp;
  applySynergies(solo, ["plate"]);
  assert.ok(solo[0].maxhp > hp && solo[0].hp === solo[0].maxhp);
});
test("economy: interest and streaks are capped, augments are distinct", () => {
  assert.equal(interest(4), 0); assert.equal(interest(10), 2); assert.equal(interest(500), 3);
  assert.equal(streakBonus(1), 0); assert.equal(streakBonus(3), 2); assert.equal(streakBonus(40), 3);
  assert.equal(maxBoard(3, 1), maxBoard(3) + 1);
  const o = offerRelics(mulberry32(5), ["slot"]);
  assert.equal(new Set(o).size, 3); assert.ok(!o.includes("slot"));
  assert.ok(autoScore({ round: 5, hp: 4, gold: 3, won: false }) < autoScore({ round: 5, hp: 4, gold: 3, won: true }));
  assert.ok(Object.keys(ARCHETYPES).length >= 5);
});
test("a synergized squad beats the same squad without it", () => {
  const fight = (boost) => {
    const mine = [makeUnit("n", 1, 0, 4, 1), makeUnit("n", 1, 0, 4, 6)];
    if (boost) applySynergies(mine);
    const foes = [makeUnit("n", 1, 1, 2, 0), makeUnit("n", 1, 1, 2, 5)];
    let t = 0, res = null, all = mine.concat(foes);
    while (!res && t < 200) { tick(all); res = result(all, ++t); }
    return res;
  };
  assert.equal(fight(true), "player");
  assert.equal(fight(false), "enemy");
});
