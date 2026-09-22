// Pure math for the wandering dot: no DOM, no Web Audio, so it's testable
// under node. A real laser pointer doesn't glide smoothly to a target and
// stop — it jumps to a new spot, over-corrects a little, and pauses. This
// models that with an eased step toward a target plus an occasional
// overshoot, rather than plain linear interpolation.

// Steps (x, y) a fraction `speed` (0..1) of the remaining distance toward
// (targetX, targetY) — an exponential ease, so movement is fast right after
// a new target is picked and settles near the end.
export function wanderStep(x, y, targetX, targetY, speed) {
  const s = Math.max(0, Math.min(1, speed));
  return { x: x + (targetX - x) * s, y: y + (targetY - y) * s };
}

// Picks the next target point inside [0,width) x [0,height), keeping a
// margin so the dot never sits flush against an edge. `rng` is a () => [0,1)
// source, injected so tests can be deterministic.
export function pickTarget(width, height, rng, margin = 0.12) {
  const mx = width * margin;
  const my = height * margin;
  return {
    x: mx + rng() * (width - 2 * mx),
    y: my + rng() * (height - 2 * my),
  };
}

// True once the dot has settled close enough to its target to need a new
// one — squared distance to avoid a sqrt on every animation frame.
export function hasArrived(x, y, targetX, targetY, threshold = 3) {
  const dx = x - targetX;
  const dy = y - targetY;
  return dx * dx + dy * dy <= threshold * threshold;
}
