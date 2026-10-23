import test from "node:test";
import assert from "node:assert";
import { evaluate, simulateDuel, stationary, yieldPerTick, holdContents, diffShips, TICK_MS, wallet, shipValue } from "../public/lib/engine.js";

const miner = { name: "m", hull: "frigate", reactor: "fission", skills: ["mine", "haul", "scan"], matrix: [[1,1,1],[1,1,1],[1,1,1]], mods: ["hold"] };
const fighter = { name: "f", hull: "frigate", reactor: "fusion", skills: ["strike", "beam", "bulwark"], matrix: [[1,2,1],[2,1,1],[3,1,0]], mods: [] };

test("evaluate enforces reactor constraints", () => {
  assert.ok(evaluate(miner).ok);
  assert.ok(evaluate(fighter).ok);
  assert.ok(!evaluate({ ...miner, reactor: "singularity" }).ok); // hull too small
  const bad = evaluate({ ...fighter, reactor: "fission" }); // beam is energy
  assert.ok(!bad.ok);
  const over = evaluate({ ...miner, skills: ["haul", "salvage", "mine", "scan"], matrix: [] });
  assert.ok(!over.ok); // 8+10+6+5+4 = 33 > 30
});

test("stationary distribution sums to 1 and yield is the weighted mean", () => {
  const pi = stationary(miner);
  assert.ok(Math.abs(pi.reduce((a, b) => a + b, 0) - 1) < 1e-9);
  assert.ok(Math.abs(yieldPerTick(miner) - (9 + 14 + 3) / 3) < 1e-6);
  // a periodic chain still converges
  const flip = { ...miner, skills: ["mine", "haul"], matrix: [[0, 1], [1, 0]] };
  assert.ok(Math.abs(yieldPerTick(flip) - 11.5) < 1e-6);
});

test("hold fills lazily and is bounded by cargo", () => {
  const t0 = 1_000_000;
  assert.equal(holdContents(miner, t0, t0), 0);
  assert.ok(holdContents(miner, t0, t0 + 5 * TICK_MS) > 0);
  assert.equal(holdContents(miner, t0, t0 + 1e6 * TICK_MS), 180); // 120 + 60 hold ext
});

test("duels are deterministic", () => {
  const other = { ...fighter, name: "g", matrix: [[1,1,1],[1,1,1],[1,1,1]] };
  const r1 = simulateDuel(fighter, other), r2 = simulateDuel(fighter, other);
  assert.deepEqual(r1, r2);
  assert.ok(["a", "b", "draw"].includes(r1.winner));
  assert.ok(r1.rounds > 0);
});

test("diff and wallet", () => {
  assert.deepEqual(diffShips(null, miner), ["new ship"]);
  const d = diffShips(miner, { ...miner, hull: "cruiser", mods: [] });
  assert.ok(d.some((x) => x.includes("hull")) && d.some((x) => x.includes("−mods")));
  assert.equal(shipValue(miner), 100);
  assert.equal(wallet([{ ...miner, docked: 50 }, { ...fighter, retired: true, docked: 10 }]), 500 + 50 - 100 + 10);
});
