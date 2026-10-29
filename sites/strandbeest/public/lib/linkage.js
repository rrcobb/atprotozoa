// Theo Jansen's linkage, solved from his "Holy Numbers". One leg is a crank
// (radius m) driving a chain of rods; every joint is the intersection of two
// circles around already-known joints, so every rod keeps its length exactly at
// every crank angle. Local coords: x forward, y DOWN, origin at the crank axis.
export const L = { a: 38, b: 41.5, c: 39.3, d: 40.1, e: 55.8, f: 39.4, g: 36.7, h: 65.7, i: 49, j: 50, k: 61.9, l: 7.8, m: 15 };

// The rods, as [from, to, length] over the joint names solveLeg returns.
export const RODS = [
  ["C", "J1", L.j], ["F", "J1", L.b], ["F", "J2", L.c], ["J1", "J2", L.d],
  ["J2", "J3", L.e], ["C", "J3", L.k], ["J2", "J4", L.g], ["J3", "J4", L.f],
  ["J3", "J5", L.h], ["J4", "J5", L.i],
];

function circles(p, r1, q, r2, side) {
  const dx = q.x - p.x, dy = q.y - p.y, D = Math.hypot(dx, dy);
  const x = (r1 * r1 - r2 * r2 + D * D) / (2 * D);
  const hh = Math.sqrt(Math.max(0, r1 * r1 - x * x));
  return { x: p.x + (dx * x) / D - (side * dy * hh) / D, y: p.y + (dy * x) / D + (side * dx * hh) / D };
}

export function solveLeg(theta) {
  const O = { x: 0, y: 0 }, F = { x: -L.a, y: -L.l };
  const C = { x: L.m * Math.cos(theta), y: L.m * Math.sin(theta) };
  const J1 = circles(F, L.b, C, L.j, 1);
  const J2 = circles(F, L.c, J1, L.d, 1);
  const J3 = circles(J2, L.e, C, L.k, 1);
  const J4 = circles(J2, L.g, J3, L.f, 1);
  const J5 = circles(J3, L.h, J4, L.i, -1); // J5 is the foot
  return { O, F, C, J1, J2, J3, J4, J5 };
}

// Foot geometry derived once from the linkage itself: how low the sole goes,
// and how fast the planted foot slides backwards per radian of crank. Moving the
// world by STANCE_SPEED * dTheta keeps planted feet from skating.
const N = 1440;
let soleY = -Infinity;
const foot = [];
for (let n = 0; n < N; n++) { const f = solveLeg((n / N) * Math.PI * 2).J5; foot.push(f); soleY = Math.max(soleY, f.y); }
export const SOLE_Y = soleY;
// Contact window: from the foot's most forward point until it lifts 6 units off
// the sole. Net backward slide over that window is the speed the world must move.
export const STANCE_Y = SOLE_Y - 6; // foot counts as planted below this y
let n0 = 0;
for (let n = 0; n < N; n++) if (foot[n].x > foot[n0].x) n0 = n;
let n1 = n0;
while (foot[n1 % N].y > STANCE_Y && n1 < n0 + N) n1++;
export const STANCE_SPEED = (foot[n0].x - foot[n1 % N].x) / (((n1 - n0) / N) * Math.PI * 2); // units of travel per radian of crank
