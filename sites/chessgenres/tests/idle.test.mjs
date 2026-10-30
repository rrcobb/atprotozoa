import test from "node:test";
import assert from "node:assert";
import { LINES, newGame, tick, click, buyMachines, buyMax, buySpeed, buyGuild, lineRate, goldPerSec, machineCost, speedCost, guildCost, visible, fmt, save, load } from "../public/idle-logic.js";

test("clicking makes pawns and gold", () => {
  const g = newGame(); click(g);
  assert.equal(g.made.pawn, 1); assert.equal(g.gold, 1);
});
test("machines produce over time and buying costs gold", () => {
  const g = newGame(); g.gold = 15;
  assert.equal(buyMachines(g, "pawn", 5), 1);
  assert.equal(g.gold, 0);
  tick(g, 10);
  assert.equal(Math.round(g.made.pawn), 10);
  assert.equal(Math.round(g.gold), 10);
});
test("milestones and speed upgrades multiply a line", () => {
  const g = newGame(); g.owned.rook = 25;
  assert.equal(lineRate(g, "rook"), 50);
  g.gold = 1e9; assert.ok(buySpeed(g, "rook"));
  assert.equal(lineRate(g, "rook"), 100);
  assert.ok(!buySpeed(g, "pawn")); // none owned
});
test("fmt, save/load, bad saves", () => {
  assert.equal(fmt(999), "999"); assert.equal(fmt(1500), "1.50K"); assert.equal(fmt(2.5e9), "2.50B");
  const g = newGame(); g.gold = 42; g.owned.knight = 3;
  const h = load(save(g)); assert.equal(h.gold, 42); assert.equal(h.owned.knight, 3);
  assert.equal(load("nonsense").gold, 0);
});

// Greedy player: keep buying whatever pays back fastest. Checks the dragon
// goal is reachable and takes a sensible amount of play, not seconds or weeks.
export function simulate(maxSeconds = 4 * 3600) {
  const g = newGame();
  let clicks = 0;
  for (let s = 0; s < maxSeconds && !g.won; s++) {
    if (s < 60) { for (let i = 0; i < 4; i++) click(g); }
    tick(g, 1);
    for (let guard = 0; guard < 50; guard++) {
      const gps = goldPerSec(g) || 1;
      let best = null, bestPay = Infinity;
      LINES.forEach((l, i) => {
        if (!visible(g, i)) return;
        const c = machineCost(l.id, g.owned[l.id]);
        const bump = (lineRate({ ...g, owned: { ...g.owned, [l.id]: g.owned[l.id] + 1 } }, l.id) - lineRate(g, l.id)) * l.value;
        const p = c / Math.max(bump, 1e-9);
        if (p < bestPay) { bestPay = p; best = () => buyMachines(g, l.id, 1) };
        if (g.owned[l.id] > 0) {
          const sc = speedCost(l.id, g.speed[l.id]);
          const sp = sc / Math.max(lineRate(g, l.id) * l.value, 1e-9);
          if (sp < bestPay) { bestPay = sp; best = () => buySpeed(g, l.id); }
        }
      });
      const gc = guildCost(g.guild);
      if (gc / gps < bestPay) { bestPay = gc / gps; best = () => buyGuild(g); }
      // Buy only when affordable; otherwise wait a second.
      const before = g.gold;
      if (!best) break;
      const snapshot = JSON.stringify(g);
      const ok = best();
      if (!ok || g.gold === before) { Object.assign(g, JSON.parse(snapshot)); break; }
    }
  }
  return { seconds: g.t, won: g.won, g };
}

test("greedy play reaches 1000 dragons/s in a play-session or two", () => {
  const r = simulate();
  console.log("greedy reaches goal after", Math.round(r.seconds / 60), "min; won:", r.won);
  assert.ok(r.won);
  assert.ok(r.seconds > 30 * 60);
  assert.ok(r.seconds < 3 * 3600);
});

test("long corvid: crows raid on a timer and scarecrows blunt them", async () => {
  const m = await import("../public/idle-logic.js");
  const g = m.newGame(true); g.gold = 1000;
  assert.equal(m.tick(g, 39), 0); assert.equal(g.gold, 1000);
  assert.equal(m.tick(g, 1), 1); assert.equal(Math.round(g.gold), 700);
  assert.equal(m.tick(g, 80), 2); assert.equal(g.raids, 3);
  g.gold = 1e6; assert.ok(m.buyScare(g)); assert.ok(m.theft(g) < m.CROW_THEFT);
  const e = m.newGame(); e.gold = 1000; m.tick(e, 500); assert.equal(e.gold, 1000); // normal mode: no crows
  assert.ok(m.machineCost("pawn", 10, true) > m.machineCost("pawn", 10));
  const h = m.load(m.save(g)); assert.equal(h.hard, true); assert.equal(h.scare, 1);
});
