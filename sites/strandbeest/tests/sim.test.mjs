import test from "node:test";
import assert from "node:assert/strict";
import { step } from "../public/lib/sim.js";

const mk = (o = {}) => ({
  legs: 16, speed: 0.45, rough: 0.3, mode: "climb", suspension: true, gravity: 1,
  rigid: false, travel: 1, stiff: 14, tilt: 1, bodyRate: 4, ride: 0, spacing: 1, phase: "jansen", parallel: true,
  running: true, D: 0, theta: 0, time: 0, roughS: 0.3, modeOff: 0, bodyH: null, cam: 0, alt0: 0, near: [], far: [], steep: 1, claws: 1, ...o,
});
function run(S, secs) {
  let legs, worst = 0, snap = true;
  for (let i = 0; i < secs * 60; i++) {
    legs = step(S, 1 / 60, snap, null); snap = false;
    for (const L of legs) worst = Math.max(worst, -(L.footH - 0) * 0); // placeholder
    assert.ok(Number.isFinite(S.D) && Number.isFinite(S.bodyH) && Number.isFinite(S.slope), `blew up at frame ${i}`);
  }
  return legs;
}
for (const [name, o] of [["full speed", { speed: 1 }],
  ["sprung", {}], ["unsprung", { suspension: false }], ["rigid+sprung", { rigid: true }],
  ["rigid+unsprung", { rigid: true, suspension: false }], ["2 legs", { legs: 2 }], ["64 legs", { legs: 64 }],
  ["wild rough", { mode: "wild", rough: 1 }], ["stiff", { stiff: 60 }], ["soft", { stiff: 1 }], ["low g", { gravity: 0.3 }],
]) {
  test(`walks forward on its own: ${name}`, () => {
    const S = mk(o); const legs = run(S, 30);
    assert.ok(S.D > 100, `${name}: only moved ${S.D.toFixed(1)}`);
    const sink = Math.max(...legs.map((L) => Math.max(0, S.mode ? 0 : 0)));
    console.log(name, "D", S.D.toFixed(0), "vx", S.vx.toFixed(1), "h", S.bodyH.toFixed(1), "slope", S.slope.toFixed(2));
  });
}
test("stops when speed is zero", () => {
  const S = mk(); run(S, 5); S.speed = 0; run(S, 3);
  assert.ok(Math.abs(S.vx) < 3, String(S.vx));
});

test("wild mountains are climbable at the default steepness and claw grip", () => {
  const S = { legs: 16, speed: 0.45, rough: 0.3, roughS: 0.3, mode: "wild", suspension: true, gravity: 1, rigid: false, travel: 1, stiff: 16, tilt: 1, bodyRate: 4, ride: 0, spacing: 1, phase: "jansen", parallel: true, running: true, D: 0, theta: 0, time: 0, modeOff: 0, bodyH: null, near: [], far: [], steep: 0.7, claws: 3 };
  let snap = true;
  for (let i = 0; i < 60 * 120; i++) { step(S, 1 / 60, snap, null); snap = false; }
  assert.ok(S.D > 8000, "walked " + S.D);
});
