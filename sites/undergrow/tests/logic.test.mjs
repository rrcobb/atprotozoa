import { test } from "node:test";
import assert from "node:assert/strict";
import * as L from "../public/logic.js";

test("till, plant, water, grow, harvest", () => {
  const s = L.newState();
  s.tool = "till"; assert.ok(L.actOnPlot(s, 0).ok);
  s.tool = "moss"; assert.ok(L.actOnPlot(s, 0).ok);
  s.tool = "water"; assert.ok(L.actOnPlot(s, 0).ok);
  L.endDay(s, () => 0.9); assert.equal(s.plots[0].age, 1);
  s.tool = "water"; L.actOnPlot(s, 0); L.endDay(s, () => 0.9);
  assert.ok(L.ripe(s, s.plots[0]));
  s.tool = "harvest"; assert.ok(L.actOnPlot(s, 0, () => 0.9).ok);
  assert.equal(s.crops.moss, 1);
});

test("unwatered crops don't grow; energy limits actions", () => {
  const s = L.newState(); s.tool = "till";
  for (let i = 0; i < 8; i++) L.actOnPlot(s, i);
  assert.equal(s.energy, 2);
  s.tool = "moss"; L.actOnPlot(s, 0); L.endDay(s, () => 0.9);
  assert.equal(s.plots[0].age, 0);
  assert.equal(s.energy, s.maxEnergy);
});

test("sell, seeds, upgrades", () => {
  const s = L.newState(); s.crops.glow = 3;
  const r = L.sellAll(s); assert.ok(r.total > 0 && s.crops.glow === 0);
  s.coins = 500; assert.ok(L.buyUpgrade(s, "plots")); assert.equal(s.plots.length, 12);
  assert.ok(L.buyUpgrade(s, "tonic")); assert.equal(s.maxEnergy, 12);
  assert.ok(!L.buyUpgrade(s, "tonic"));
});

test("cult path: caps, moss, hollowroot on a sixth night", () => {
  const s = L.newState(); s.caps = 3;
  assert.ok(L.checkCultStage(s)); assert.equal(s.cult.stage, 1);
  assert.ok(!L.offerMoss(s).ok); s.crops.moss = 6; assert.ok(L.offerMoss(s).ok);
  assert.equal(s.seeds.hollow, 1);
  s.crops.hollow = 1; s.day = 5; assert.ok(!L.offerHollow(s).ok);
  s.day = 12; assert.ok(L.offerHollow(s).ok); assert.ok(s.cult.joined);
});

test("gifts: once a day, love > like > meh", () => {
  const s = L.newState(); s.crops.glow = 3;
  assert.equal(L.giftTo(s, "pidge", "glow").tier, "love");
  assert.ok(!L.giftTo(s, "pidge", "glow").ok);
  L.endDay(s, () => 0.9); assert.ok(L.giftTo(s, "kess", "glow").tier === "like");
});
