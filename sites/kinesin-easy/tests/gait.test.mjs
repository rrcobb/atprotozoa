import test from "node:test";
import assert from "node:assert/strict";
import { PHYS, GAIT, STAGE_SECONDS, GAIT_REACH, ATP, atpStep, motorTick, approach } from "../public/app.js";

function sim(walkFor, restFor, seconds) {
  const s = { drift: 0, driftVel: 0, distance: 0, steps: 0 };
  let rL = PHYS.reachRest, rR = PHYS.reachRest, lL = 100, lR = 100, atp = ATP.max, st = 0, t = 0;
  const dt = 1 / 60;
  let maxDrift = 0;
  for (let i = 0; i < seconds * 60; i++) {
    const walking = (i * dt) % (walkFor + restFor) < walkFor;
    let held;
    if (walking && atp > 0) { t += dt; while (t >= STAGE_SECONDS) { t -= STAGE_SECONDS; st = (st + 1) % GAIT.length; } held = new Set(GAIT[st]); }
    else held = new Set(["o", "p"]);
    rL = approach(rL, held.has("q") ? GAIT_REACH : PHYS.reachRest, held.has("q") ? PHYS.reachRate : PHYS.reachRelax, dt);
    rR = approach(rR, held.has("w") ? GAIT_REACH : PHYS.reachRest, held.has("w") ? PHYS.reachRate : PHYS.reachRelax, dt);
    lL = approach(lL, held.has("o") ? 100 : 0, held.has("o") ? PHYS.lockRate : PHYS.lockRelax, dt);
    lR = approach(lR, held.has("p") ? 100 : 0, held.has("p") ? PHYS.lockRate : PHYS.lockRelax, dt);
    const b = s.distance;
    const tick = motorTick(s, rL, rR, lL, lR, dt);
    if (!walking) s.distance = b;
    atp = atpStep(atp, walking, s.distance, dt);
    maxDrift = Math.max(maxDrift, Math.abs(s.drift));
    if (tick.detached || atp <= 0) return { end: tick.detached ? "drift" : "atp", s, t: i * dt, maxDrift };
  }
  return { end: null, s, maxDrift };
}

test("holding walk makes progress and eventually runs out of ATP, not drift", () => {
  const r = sim(1e9, 0, 600);
  console.log(r.end, r.s.distance.toFixed(0), r.t, r.maxDrift);
  assert.equal(r.end, "atp");
  assert.ok(r.s.distance > 200);
});

test("resting never detaches", () => {
  const r = sim(0, 1, 120);
  assert.equal(r.end, null);
  assert.equal(r.s.distance, 0);
});
