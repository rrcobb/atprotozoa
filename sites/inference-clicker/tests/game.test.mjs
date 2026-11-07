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
