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

import { HIST_MAX } from "../public/sim.js";
test("history records every column in step and decimates past HIST_MAX", () => {
  const s = newGame(7);
  for (let i = 0; i < HIST_MAX * 3; i++) step(s);
  const h = s.hist;
  assert.ok(h.stride > 1);
  assert.ok(h.day.length <= HIST_MAX);
  for (const k in h.cols) assert.equal(h.cols[k].length, h.day.length, k);
  assert.ok(h.day[h.day.length - 1] >= HIST_MAX * 3 - h.stride);
});
