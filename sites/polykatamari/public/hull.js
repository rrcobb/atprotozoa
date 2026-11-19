// Incremental convex hull for points on the unit sphere. Every point is a hull
// vertex, so a point is never "inside" and the hull is just a triangulation
// of the sphere. Faces are [a,b,c] index triples, counter-clockwise from outside.

const EPS = 1e-9;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export function normalize(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

// square pyramid inscribed in the unit sphere: apex up, base slightly below the equator
export function startPyramid() {
  const y = -0.2, a = Math.sqrt((1 - y * y) / 2);
  const pts = [[0, 1, 0], [a, y, a], [-a, y, a], [-a, y, -a], [a, y, -a]];
  const faces = [[0, 1, 2], [0, 2, 3], [0, 3, 4], [0, 4, 1], [1, 3, 2], [1, 4, 3]];
  return { pts, faces: faces.map((f) => orient(pts, f)) };
}

// flip a face if its normal points toward the origin (origin is inside the hull)
function orient(pts, f) {
  const [a, b, c] = f.map((i) => pts[i]);
  return dot(cross(sub(b, a), sub(c, a)), a) >= 0 ? f : [f[0], f[2], f[1]];
}

export function addPoint(pts, faces, p) {
  const idx = pts.length;
  pts.push(p);
  const visible = [];
  const keep = [];
  for (const f of faces) {
    const [a, b, c] = f.map((i) => pts[i]);
    const n = cross(sub(b, a), sub(c, a));
    (dot(n, sub(p, a)) > EPS ? visible : keep).push(f);
  }
  // horizon = directed edges of visible faces whose reverse is not also in a visible face
  const edges = new Map();
  for (const f of visible) for (let k = 0; k < 3; k++) edges.set(f[k] + "," + f[(k + 1) % 3], [f[k], f[(k + 1) % 3]]);
  for (const [, [u, v]] of edges) {
    if (!edges.has(v + "," + u)) keep.push([u, v, idx]);
  }
  return keep;
}

// the unit direction farthest from every existing point (best-of fibonacci candidates)
export function emptiestDirection(pts, n = 400) {
  let best = null, bestD = -2;
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n, r = Math.sqrt(1 - y * y), t = i * 2.399963229728653;
    const c = [Math.cos(t) * r, y, Math.sin(t) * r];
    let nearest = -2;
    for (const q of pts) nearest = Math.max(nearest, dot(c, q));
    // smaller max-dot = farther from everything
    if (best === null || nearest < bestD) { best = c; bestD = nearest; }
  }
  return best;
}

export function maxDot(pts, p) {
  let m = -2;
  for (const q of pts) m = Math.max(m, dot(p, q));
  return m;
}
