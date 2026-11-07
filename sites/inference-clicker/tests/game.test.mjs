import test from "node:test";
import assert from "node:assert/strict";
import * as G from "../public/lib/game.js";

const seq = (...v) => { let i = 0; return () => v[i++ % v.length]; };

test("clicking earns tokens and buying a gpu produces them", () => {
  const s = G.newState(0);
  for (let i = 0; i < 15; i++) G.click(s);
  assert.equal(G.buyGpu(s, "t4"), true);
  assert.equal(s.tokens, 0);
  G.step(s, 1, () => 0.99);
  assert.ok(s.tokens > 0.4 && s.tokens < 0.7);
});

test("a region with no replicas goes down, one with replicas can fail over", () => {
  const s = G.newState(0);
  s.gpus.t4 = 10;
  const ev = G.step(s, 1, seq(0, 0.5, 0.99, 0.99));
  assert.ok(s.down["us-east-1"] > 0);
  assert.equal(G.tps(s), 0);
  assert.equal(ev[0].kind, "bad");
  const t = G.newState(0);
  t.gpus.t4 = 10;
  t.regions["us-east-1"].replicas = 1;
  const ev2 = G.step(t, 1, seq(0, 0.1, 0.99, 0.99));
  assert.equal(t.down["us-east-1"], undefined);
  assert.equal(t.stats.failovers, 1);
  assert.match(ev2[0].text, /replica/);
});

test("an outage heals after its duration", () => {
  const s = G.newState(0);
  s.down["us-east-1"] = 2;
  G.step(s, 1, () => 0.99);
  const ev = G.step(s, 1.5, () => 0.99);
  assert.equal(s.down["us-east-1"], undefined);
  assert.match(ev[0].text, /back/);
});

test("a new model can be worse than the last, and evals auto-serve the best", () => {
  const s = G.newState(0);
  s.tokens = 1e9;
  s.models.push({ id: "m1", gen: 1, name: "sprout-1", q: 1.7 });
  s.nextGen = 2;
  assert.equal(G.startTraining(s), true);
  const ev = G.offline(s, 1e5, () => 0).events; // lowest roll
  const latest = s.models[s.models.length - 1];
  assert.ok(latest.q < 1.7, `gen 2 low roll ${latest.q} should be below 1.7`);
  assert.equal(ev[0].kind, "bad");
  assert.equal(G.servingModel(s).id, latest.id); // evals 0: latest, even though worse
  s.upgrades.evals = 1;
  assert.equal(G.servingModel(s).id, "m1"); // latest + 1 previous: picks the better one
  G.setServing(s, "m0");
  assert.equal(G.servingModel(s).id, "m0");
});

test("training is gated by cost and one run at a time", () => {
  const s = G.newState(0);
  assert.equal(G.startTraining(s), false);
  s.tokens = 1e4;
  assert.equal(G.startTraining(s), true);
  assert.equal(G.startTraining(s), false);
});

test("offline earnings are capped and half rate", () => {
  const s = G.newState(0);
  s.gpus.a10g = 10;
  const r = G.offline(s, 1e9);
  assert.equal(r.seconds, G.OFFLINE_CAP_SECONDS);
  assert.ok(Math.abs(r.gained - 40 * G.OFFLINE_CAP_SECONDS * 0.5) < 1);
});

test("save round-trips through a record with only integers at top level", () => {
  const s = G.newState(0);
  s.tokens = 123.456; s.lifetime = 999.5; s.gpus.h100 = 3; s.upgrades.spec = 2;
  const rec = G.toRecord(s, 1700000000000);
  for (const [k, v] of Object.entries(rec)) assert.ok(typeof v !== "number" || Number.isInteger(v), k);
  const back = G.fromRecord(JSON.parse(JSON.stringify(rec)));
  assert.equal(back.gpus.h100, 3);
  assert.equal(back.upgrades.spec, 2);
  assert.equal(back.tokens, 123.456);
  assert.equal(G.loadState("garbage").tokens, 0);
});

test("fmt", () => {
  assert.equal(G.fmt(0), "0");
  assert.equal(G.fmt(1500), "1.50K");
  assert.equal(G.fmt(2.5e9), "2.50B");
  assert.equal(G.fmt(12), "12");
});

test("pulls cost tokens, hit pity, and level duplicates", () => {
  const s = G.newState(0);
  assert.equal(G.pull(s, 1), null);
  s.tokens = 1e6;
  const r = G.pull(s, 10, () => 0); // always the first roll: commons only until pity
  assert.equal(r.length, 10);
  assert.equal(s.pulls, 10);
  assert.ok(r.slice(0, 9).every((x) => x.id === "intern"));
  assert.notEqual(r[9].id, "intern"); // 10th pull is epic or better
  assert.equal(s.pity.sr, 0);
  assert.equal(G.charLevel(s, "intern"), 5);
  assert.equal(G.pullCost(s, 10), G.pullCost(s, 1) * 9);
});

test("baddies add tokens/s and outages; good cast cut outages", () => {
  const s = G.newState(0);
  s.gpus.a10g = 10;
  const base = G.tps(s);
  s.chars.ransom = 1;
  assert.ok(G.tps(s) > base * 1.11);
  assert.ok(G.failMult(s) > 1.09);
  s.chars.sre = 5;
  assert.ok(G.failMult(s) < 1);
});

test("achievements unlock once and add 1% each", () => {
  const s = G.newState(0);
  s.gpus.t4 = 1;
  s.clicks = 1;
  const ev = G.checkAchievements(s, 5);
  assert.ok(ev.some((e) => /wcdonalds/.test(e.text)));
  assert.equal(G.checkAchievements(s, 6).length, 0);
  assert.equal(s.ach.wcdonalds, 5);
  assert.ok(Math.abs(G.achMult(s) - (1 + 0.01 * G.achCount(s))) < 1e-9);
});

test("NG+ keeps the cast and trophies, resets the company, and bites back", () => {
  const s = G.newState(0);
  assert.equal(G.ngPlus(s), false);
  s.lifetime = G.NG_THRESHOLD;
  s.tokens = 5; s.gpus.t4 = 9; s.chars.tenx = 2; s.ach.coldstart = 1; s.pulls = 7;
  assert.equal(G.ngPlus(s, 1), true);
  assert.equal(s.ng, 1);
  assert.equal(s.lifetime, 0);
  assert.deepEqual(s.gpus, {});
  assert.equal(s.chars.tenx, 2);
  assert.equal(s.pulls, 7);
  assert.ok(s.ach.coldstart);
  assert.equal(G.ngMult(s), 2);
  assert.ok(G.gpuCost(s, G.GPUS[0]) > G.GPUS[0].cost);
  const back = G.loadState(JSON.stringify(s));
  assert.equal(back.ng, 1);
  assert.equal(back.chars.tenx, 2);
  assert.ok(G.progress(back) > G.progress(G.newState(0)) + 1e17);
});
