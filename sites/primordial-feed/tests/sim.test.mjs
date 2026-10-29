import test from "node:test";
import assert from "node:assert";
import { Tank, traitsFor, hueOf, MAX_ORGS } from "../public/sim.js";

test("traits derive from text", () => {
  const t = traitsFor({ text: "Why does nobody read the documentation? Is it really that hard?" });
  assert.equal(t.diet, "predator");
  assert.ok(Math.abs(t.palate.reduce((a, b) => a + b, 0) - 1) < 1e-9);
  assert.equal(traitsFor({ text: "look https://example.com/x" }).diet, "filter");
  assert.equal(traitsFor({ text: "ok sure thing", isReply: true }).diet, "scavenger");
});

test("tank runs: things are born, die, and stay bounded", () => {
  let s = 7; const rng = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const tank = new Tank(rng);
  const dead = [];
  tank.onDeath = (o) => dead.push(o);
  for (let step = 0; step < 6000; step++) {
    if (step % 3 === 0) tank.admit({ text: "post number " + step + " about " + ["cats", "rust", "tea", "politics"][step % 4] + " and things?" });
    tank.step(0.1);
    assert.ok(tank.orgs.length <= MAX_ORGS);
  }
  assert.ok(dead.length > 0, "something died");
  assert.ok(tank.orgs.length > 0, "something survived");
  assert.ok(Number.isFinite(hueOf(tank.orgs[0].palate)));
});
