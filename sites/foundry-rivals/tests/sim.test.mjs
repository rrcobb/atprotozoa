import test from "node:test";
import assert from "node:assert";
import { newGame, step, build, buildHub, netWorth } from "../public/sim.js";

test("no hub, no sales", () => {
  const s = newGame(1);
  for (let i = 0; i < 10; i++) step(s);
  assert.equal(s.last.sold, 0);
  assert.ok(s.inv.widget > 0);
});

test("hub + widgets earn revenue and sim stays finite", () => {
  const s = newGame(2);
  assert.ok(buildHub(s, 0));
  s.cash += 5000;
  build(s, "truck");
  for (let i = 0; i < 400; i++) step(s);
  assert.ok(s.totalRevenue > 0);
  assert.ok(Number.isFinite(netWorth(s)));
  for (const r of s.rivals) assert.ok(Number.isFinite(r.price));
});

test("selling gears upgrades town workshops", () => {
  const s = newGame(3);
  buildHub(s, 0);
  s.cash = 50000; s.contract = [14, 10, 8];
  for (let i = 0; i < 6; i++) build(s, "smelter"), build(s, "assembler"), build(s, "truck");
  for (let i = 0; i < 300; i++) step(s);
  assert.ok(s.regions[0].towns.some((t) => t.workshop > 0));
});
