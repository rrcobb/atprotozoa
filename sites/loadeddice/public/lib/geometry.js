// Convex polyhedra from face planes. A die is n unit normals + n plane distances:
// the solid is the intersection of the half-spaces n_k . x <= d_k. Pushing a
// plane's distance out shrinks that face (a plane that no longer touches the
// solid has no face at all); pulling it in grows it. No DOM, testable in node.

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// n roughly evenly spread directions (golden-angle spiral). Not symmetric on
// purpose: a "d7" built from these is a lumpy, honest 7-faced thing.
export function fibNormals(n) {
  const out = [];
  const ga = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n;
    const r = Math.sqrt(1 - y * y);
    out.push([Math.cos(ga * i) * r, y, Math.sin(ga * i) * r]);
  }
  return out;
}

const EPS = 1e-7;
export const TARGET_VOLUME = (4 / 3) * Math.PI * 0.75 ** 3; // every die is scaled to this volume

// Returns null when the planes don't close into a bounded solid.
export function buildPoly(normals, dist) {
  const n = normals.length;
  const verts = []; // { p, planes:Set }
  for (let a = 0; a < n; a++)
    for (let b = a + 1; b < n; b++) {
      for (let c = b + 1; c < n; c++) {
        const na = normals[a], nb = normals[b], nc = normals[c];
        const bc = cross(nb, nc);
        const det = dot(na, bc);
        if (Math.abs(det) < 1e-9) continue;
        const ca = cross(nc, na), ab = cross(na, nb);
        const p = [0, 1, 2].map((i) => (dist[a] * bc[i] + dist[b] * ca[i] + dist[c] * ab[i]) / det);
        let ok = true;
        for (let k = 0; k < n; k++) if (dot(normals[k], p) > dist[k] + EPS) { ok = false; break; }
        if (!ok) continue;
        const hit = verts.find((v) => Math.abs(v.p[0] - p[0]) + Math.abs(v.p[1] - p[1]) + Math.abs(v.p[2] - p[2]) < 1e-6);
        if (hit) { hit.planes.add(a); hit.planes.add(b); hit.planes.add(c); }
        else verts.push({ p, planes: new Set([a, b, c]) });
      }
    }
  if (verts.length < 4) return null;

  // faces: for each plane, the vertices lying on it, ordered counter-clockwise
  const faces = [];
  for (let k = 0; k < n; k++) {
    const idx = [];
    verts.forEach((v, i) => { if (v.planes.has(k) || Math.abs(dot(normals[k], v.p) - dist[k]) < 1e-6) idx.push(i); });
    if (idx.length < 3) continue;
    const nk = normals[k];
    const c = [0, 0, 0];
    for (const i of idx) for (let j = 0; j < 3; j++) c[j] += verts[i].p[j] / idx.length;
    const ref = Math.abs(nk[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const u = norm(cross(ref, nk)), w = cross(nk, u);
    idx.sort((i, j) => {
      const pi = sub(verts[i].p, c), pj = sub(verts[j].p, c);
      return Math.atan2(dot(pi, w), dot(pi, u)) - Math.atan2(dot(pj, w), dot(pj, u));
    });
    faces.push({ k, idx });
  }
  // Euler check: V - E + F = 2 means the solid is closed (bounded)
  let e2 = 0;
  for (const f of faces) e2 += f.idx.length;
  if (verts.length - e2 / 2 + faces.length !== 2) return null;

  // volume + centroid via tetrahedra from the origin (inside, since every d > 0)
  let vol = 0;
  const cen = [0, 0, 0];
  for (const f of faces)
    for (let t = 1; t < f.idx.length - 1; t++) {
      const a = verts[f.idx[0]].p, b = verts[f.idx[t]].p, c = verts[f.idx[t + 1]].p;
      const v = dot(a, cross(b, c)) / 6;
      vol += v;
      for (let j = 0; j < 3; j++) cen[j] += (v * (a[j] + b[j] + c[j])) / 4;
    }
  if (!(vol > 1e-9)) return null;
  for (let j = 0; j < 3; j++) cen[j] /= vol;

  // recentre on the centre of mass and scale to a common volume
  const s = (TARGET_VOLUME / vol) ** (1 / 3);
  const P = verts.map((v) => sub(v.p, cen).map((x) => x * s));
  let radius = 0;
  for (const p of P) radius = Math.max(radius, len(p));

  const out = [];
  for (const f of faces) {
    const nk = normals[f.k];
    const dk = (dist[f.k] - dot(nk, cen)) * s; // plane distance from the new origin
    let area = 0, omega = 0;
    const fc = [0, 0, 0];
    for (const i of f.idx) for (let j = 0; j < 3; j++) fc[j] += P[i][j] / f.idx.length;
    for (let t = 1; t < f.idx.length - 1; t++) {
      const a = P[f.idx[0]], b = P[f.idx[t]], c = P[f.idx[t + 1]];
      area += len(cross(sub(b, a), sub(c, a))) / 2;
      // Van Oosterom–Strakhov solid angle of triangle abc seen from the origin
      const la = len(a), lb = len(b), lc = len(c);
      const num = Math.abs(dot(a, cross(b, c)));
      const den = la * lb * lc + dot(a, b) * lc + dot(a, c) * lb + dot(b, c) * la;
      omega += 2 * Math.atan2(num, den);
    }
    // does the foot of the perpendicular from the centre of mass land inside the face?
    // If not the die can't rest on it; it tips over the edge it is beyond.
    const foot = [nk[0] * dk, nk[1] * dk, nk[2] * dk];
    let tipEdge = -1, worst = -1e-9;
    for (let t = 0; t < f.idx.length; t++) {
      const a = P[f.idx[t]], b = P[f.idx[(t + 1) % f.idx.length]];
      const side = dot(cross(sub(b, a), sub(foot, a)), nk);
      if (side < worst) { worst = side; tipEdge = t; }
    }
    out.push({ k: f.k, n: nk, d: dk, idx: f.idx, area, omega, c: fc, tipEdge });
  }
  // resolve tipEdge to the neighbouring face across that edge
  for (const f of out) {
    f.tipTo = -1;
    if (f.tipEdge < 0) continue;
    const a = f.idx[f.tipEdge], b = f.idx[(f.tipEdge + 1) % f.idx.length];
    const nb = out.find((g) => g !== f && g.idx.includes(a) && g.idx.includes(b));
    if (nb) f.tipTo = out.indexOf(nb);
  }
  return { verts: P, faces: out, radius, normals, dist };
}

// P(die comes to rest on face) ~ the solid angle the face covers as seen from the
// centre of mass (the usual dice-bias estimate), with the mass of faces the
// die can't balance on handed to the neighbour it tips onto. Indexed like poly.faces.
export function restProbs(poly) {
  const F = poly.faces;
  let total = 0;
  for (const f of F) total += f.omega;
  const p = F.map((f) => f.omega / total);
  const out = p.slice();
  F.forEach((f, i) => { if (f.tipTo >= 0) { out[i] -= p[i]; out[f.tipTo] += p[i]; } });
  return out;
}

// With the die resting on face j, its body-frame "up" is -n_j exactly (the
// rotation sends n_j to straight down), so the top face is the face whose normal
// points most nearly along -n_j. Returns poly.faces index per resting face.
export function topFaceFor(poly) {
  return poly.faces.map((fj) => {
    let best = -1, bd = -2;
    poly.faces.forEach((fi, i) => {
      if (fi === fj) return;
      const d = -dot(fi.n, fj.n);
      if (d > bd) { bd = d; best = i; }
    });
    return best;
  });
}

// P(top face = face i), indexed like poly.faces
export function topProbs(poly) {
  const rest = restProbs(poly), top = topFaceFor(poly);
  const out = new Array(poly.faces.length).fill(0);
  rest.forEach((p, j) => { out[top[j]] += p; });
  return out;
}

export function topFaceUp(poly, rotateInv) {
  // face whose world normal is most upward; rotateInv(v) maps world -> body
  const up = rotateInv([0, 1, 0]);
  let best = 0, bd = -2;
  poly.faces.forEach((f, i) => { const d = dot(f.n, up); if (d > bd) { bd = d; best = i; } });
  return best;
}
