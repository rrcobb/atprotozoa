// Headless auto-tune. Runs the real sim on a copy of the current settings for a
// few candidate leg-spring stiffnesses and picks the one that walks fastest while
// still lifting its swing feet nearly as high as the bare linkage does.
import { step, ground } from "./sim.js";
import { solveLeg, SOLE_Y } from "./linkage.js";

// Bare-linkage clearance of the foot over its sole, 90th percentile: the lift a
// leg would have if nothing sagged or dragged.
const IDEAL = (() => {
  const c = [];
  for (let i = 0; i < 720; i++) c.push(SOLE_Y - solveLeg((i / 720) * Math.PI * 2).J5.y);
  return c.sort((a, b) => a - b)[Math.floor(720 * 0.9)];
})();
const TRIAL_SECONDS = 14; // long enough to settle (first 4 s ignored) and cover several strides
const SETTLE_SECONDS = 4;

function trial(S0, stiff) {
  const S = { ...S0, stiff, running: true, speed: Math.max(S0.speed, 0.3), D: 0, theta: 0, time: 0, bodyH: null, near: [], far: [] };
  const clear = [];
  let snap = true;
  for (let i = 0; i < TRIAL_SECONDS * 60; i++) {
    const legs = step(S, 1 / 60, snap, null); snap = false;
    if (i > SETTLE_SECONDS * 60) for (const L of legs) { const c = L.footH - ground(S, L.footX); if (c > 1.5) clear.push(c); }
  }
  clear.sort((a, b) => a - b);
  return { lift: clear[Math.floor(clear.length * 0.9)] || 0, v: S.D / TRIAL_SECONDS };
}

// Returns { stiff, lift, ideal } for the best candidate.
export function autotune(S0) {
  let best = null;
  for (let stiff = 10; stiff <= 30; stiff += 2) {
    const r = trial(S0, stiff);
    // A leg that lifts under 92% of the linkage's own clearance drags; reject it.
    const score = r.lift >= IDEAL * 0.92 ? r.v : r.v * (r.lift / IDEAL) - 1000;
    if (!best || score > best.score) best = { stiff, lift: r.lift, score };
  }
  return { stiff: best.stiff, lift: best.lift, ideal: IDEAL };
}
