import test from "node:test";
import assert from "node:assert/strict";
import { solveLeg, RODS, SOLE_Y, STANCE_SPEED } from "../public/lib/linkage.js";
import { heightAt } from "../public/lib/terrain.js";

test("every rod keeps its length around the whole crank cycle", () => {
  for (let n = 0; n < 720; n++) {
    const J = solveLeg((n / 720) * Math.PI * 2);
    for (const [p, q, len] of RODS) {
      const d = Math.hypot(J[p].x - J[q].x, J[p].y - J[q].y);
      assert.ok(Math.abs(d - len) < 1e-6, `${p}-${q} ${d} vs ${len} at ${n}`);
    }
    for (const p of Object.values(J)) assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
  }
});

test("foot has a flat planted stretch that slides backwards", () => {
  assert.ok(SOLE_Y > 100 && SOLE_Y < 115);
  assert.ok(STANCE_SPEED > 15 && STANCE_SPEED < 30, String(STANCE_SPEED));
});

test("terrain is deterministic, continuous, and starts at the beach", () => {
  for (const mode of ["dunes", "climb", "wild"]) {
    for (const r of [0, 0.3, 1]) {
      let prev = heightAt(0, mode, r), maxStep = 0;
      assert.equal(heightAt(1234.5, mode, r), heightAt(1234.5, mode, r));
      for (let x = 1; x < 60000; x += 1) {
        const h = heightAt(x, mode, r);
        maxStep = Math.max(maxStep, Math.abs(h - prev));
        prev = h;
      }
      assert.ok(maxStep < 2.2, `${mode} ${r} step ${maxStep}`);
    }
    assert.ok(Math.abs(heightAt(0, mode, 0.3)) < 80);
  }
});

test("climb mode reaches high mountains and comes back to the coast", () => {
  assert.ok(heightAt(11000, "climb", 0.3) > 2000);
  assert.ok(heightAt(22000, "climb", 0.3) < 150);
});
