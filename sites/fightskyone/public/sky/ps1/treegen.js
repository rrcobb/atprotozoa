// Shared with TechyBen/playtreeone (src/treegen.js); keep the two in step.
// Tree skeleton generation. Produces limbs (polylines with radii) and leaf
// cluster positions; treemesh.js turns those into low-poly geometry.
//
// The maths is a small blend of the classic models:
//  - Honda (1971) / Aono & Kunii (1984): recursive branching with a branch
//    angle, a length ratio per level, and a divergence ("roll") angle.
//  - Phyllotaxis: successive branches roll by the golden angle (137.5 deg).
//  - Weber & Penn (1995): a crown shape envelope scales lateral branch length
//    by height in the crown; tropism bends limbs up/down.
//  - Da Vinci / pipe model: a child's radius ~ parent * sqrt(1 / children).
//  - Conifers are monopodial: one leader trunk with whorls of branches whose
//    length follows a cone envelope.

import * as THREE from '../vendor/three.module.js';
import { Rng } from './rng.js';

const V3 = THREE.Vector3;
const UP = new V3(0, 1, 0);
const X = new V3(1, 0, 0);
const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const deg = d => (d * Math.PI) / 180;

// Fractions are relative to tree height H unless noted.
export const SPECIES = {
  fir: {
    form: 'conifer', leaf: 'spray', ramp: 0,
    height: [11, 19], trunkR: 0.022, crownBase: 0.1,
    whorls: [13, 18], perWhorl: [3, 5], branchLen: 0.24,
    lift: [-0.25, 0.25], droop: 0.12,
    clusterSize: [1.3, 1.8], clusterStep: 0.75,
  },
  larch: {
    form: 'conifer', leaf: 'tuft', ramp: 1,
    height: [13, 22], trunkR: 0.018, crownBase: 0.25,
    whorls: [9, 13], perWhorl: [2, 4], branchLen: 0.28,
    lift: [-0.1, 0.35], droop: 0.2,
    clusterSize: [1.3, 1.9], clusterStep: 1.0,
  },
  beech: {
    form: 'broad', leaf: 'broad', ramp: 0, shape: 'flame', leaves: true,
    height: [15, 23], trunkR: 0.02, trunkLen: 0.88, crownStart: 0.4, trunkBranches: [6, 9],
    levels: 2, children: [2, 3], angle0: [40, 62], angle: [25, 45],
    len0: 0.4, lenRatio: 0.62, tropism: 0.16, bend: 0.18, apexSplit: 0,
    clusterSize: [1.6, 2.3],
  },
  oak: {
    form: 'broad', leaf: 'lobed', ramp: 0, shape: 'sphere', leaves: true,
    height: [9, 14], trunkR: 0.045, trunkLen: 0.42, crownStart: 0.3, trunkBranches: [2, 3],
    levels: 3, children: [2, 3], angle0: [45, 70], angle: [30, 55],
    len0: 0.5, lenRatio: 0.62, tropism: 0.06, bend: 0.38, apexSplit: 3,
    clusterSize: [1.5, 2.1],
  },
  laurel: {
    form: 'broad', leaf: 'round', ramp: 0, shape: 'spread', leaves: true,
    height: [8, 12], trunkR: 0.065, trunkLen: 0.33, crownStart: 0.3, trunkBranches: [2, 3],
    levels: 3, children: [2, 3], angle0: [55, 80], angle: [35, 60],
    len0: 0.62, lenRatio: 0.6, tropism: -0.03, bend: 0.55, apexSplit: 3,
    clusterSize: [1.6, 2.3],
  },
  bare: {
    form: 'broad', leaf: null, ramp: 0, shape: 'sphere', leaves: false,
    height: [10, 16], trunkR: 0.03, trunkLen: 0.5, crownStart: 0.35, trunkBranches: [2, 4],
    levels: 4, children: [2, 3], angle0: [30, 50], angle: [22, 42],
    len0: 0.42, lenRatio: 0.7, tropism: 0.14, bend: 0.25, apexSplit: 3,
  },
  snag: { form: 'snag', leaf: null, height: [4, 11], trunkR: 0.05 },
  shrub: { form: 'shrub', leaf: 'round', ramp: 1, height: [0.8, 1.9], clusterSize: [0.9, 1.4] },
};

function randomUnit(rng) {
  const v = new V3();
  do v.set(rng.float(-1, 1), rng.float(-1, 1), rng.float(-1, 1));
  while (v.lengthSq() > 1 || v.lengthSq() < 1e-4);
  return v.normalize();
}

// Walk a limb in `segs` steps, bending randomly and toward/away from UP.
function walk(start, dir, len, r0, r1, segs, bend, tropism, rng) {
  const pts = [start.clone()], radii = [r0], dirs = [dir.clone()];
  const d = dir.clone(), p = start.clone();
  for (let i = 1; i <= segs; i++) {
    d.addScaledVector(randomUnit(rng), bend).addScaledVector(UP, tropism).normalize();
    p.addScaledVector(d, len / segs);
    pts.push(p.clone());
    radii.push(r0 + ((r1 - r0) * i) / segs);
    dirs.push(d.clone());
  }
  return { pts, radii, dirs, len };
}

function sampleLimb(limb, t) {
  const f = Math.min(Math.max(t, 0), 1) * (limb.pts.length - 1);
  const i = Math.min(Math.floor(f), limb.pts.length - 2), k = f - i;
  return {
    p: limb.pts[i].clone().lerp(limb.pts[i + 1], k),
    r: limb.radii[i] + (limb.radii[i + 1] - limb.radii[i]) * k,
    d: limb.dirs[i + 1].clone(),
  };
}

// Rotate `dir` away from itself by `angle`, around an axis rolled by `roll`.
function branchDir(dir, angle, roll) {
  const side = new V3().crossVectors(dir, Math.abs(dir.y) < 0.95 ? UP : X).normalize();
  side.applyAxisAngle(dir, roll);
  return dir.clone().applyAxisAngle(side, angle).normalize();
}

// Crown envelope: lateral length factor by position t in the crown (0 base, 1 top).
function envelope(shape, t) {
  switch (shape) {
    case 'cone': return 1 - 0.85 * t;
    case 'flame': return 0.3 + 0.7 * (t < 0.65 ? t / 0.65 : (1 - t) / 0.35);
    case 'spread': return 1 - 0.4 * t;
    default: return 0.3 + 0.7 * Math.sin(Math.PI * t); // sphere
  }
}

function pushLimb(tree, limb, level) {
  tree.limbs.push({ pts: limb.pts, radii: limb.radii, level });
}

function addCluster(tree, sp, rng, p, scale = 1) {
  tree.clusters.push({
    p: p.clone(),
    size: rng.range(sp.clusterSize) * scale,
    variant: rng.int(0, 3),
    rot: rng.float(-0.5, 0.5),
    phase: rng.next(),
  });
}

function growBroadLimb(tree, sp, rng, start, dir, len, r, level) {
  const terminal = level >= sp.levels;
  const limb = walk(start, dir, len, r, Math.max(r * 0.45, 0.01), 3, sp.bend, sp.tropism, rng);
  pushLimb(tree, limb, level);
  if (tree.limbs.length > 700) return;
  if (terminal) {
    if (sp.leaves) for (let i = 1; i < limb.pts.length; i++) addCluster(tree, sp, rng, limb.pts[i], i === limb.pts.length - 1 ? 1 : 0.8);
    return;
  }
  const n = rng.irange(sp.children);
  let roll = rng.float(0, Math.PI * 2);
  for (let i = 0; i < n; i++) {
    const t = 0.35 + (0.65 * (i + rng.float(0.4, 1))) / n;
    roll += GOLDEN + rng.float(-0.4, 0.4);
    const s = sampleLimb(limb, t);
    const cr = Math.max(s.r * Math.sqrt(1 / (n + 1)) * 1.25, 0.01);
    growBroadLimb(tree, sp, rng, s.p, branchDir(s.d, deg(rng.range(sp.angle)), roll),
      len * sp.lenRatio * rng.float(0.8, 1.15), cr, level + 1);
  }
  if (sp.leaves && level === sp.levels - 1) addCluster(tree, sp, rng, limb.pts[limb.pts.length - 1], 0.9);
}

function growBroad(tree, sp, rng, H) {
  const r0 = H * sp.trunkR;
  const lean = randomUnit(rng).multiplyScalar(0.08);
  lean.y = 0;
  const trunk = walk(new V3(), UP.clone().add(lean).normalize(), H * sp.trunkLen, r0, r0 * 0.55, 5, sp.bend * 0.25, 0.04, rng);
  trunk.radii[0] *= 1.35; // root flare
  pushLimb(tree, trunk, 0);

  let roll = rng.float(0, Math.PI * 2);
  const nLat = rng.irange(sp.trunkBranches);
  for (let i = 0; i < nLat; i++) {
    const tc = (i + rng.float(0.2, 0.8)) / nLat;
    const t = sp.crownStart + (1 - sp.crownStart) * tc;
    roll += GOLDEN + rng.float(-0.3, 0.3);
    const s = sampleLimb(trunk, Math.min(t, 0.97));
    const len = H * sp.len0 * envelope(sp.shape, tc) * rng.float(0.8, 1.15);
    growBroadLimb(tree, sp, rng, s.p, branchDir(s.d, deg(rng.range(sp.angle0)), roll), len, s.r * 0.6, 1);
  }
  const tip = sampleLimb(trunk, 1);
  if (sp.apexSplit) {
    for (let i = 0; i < sp.apexSplit; i++) {
      roll += GOLDEN + rng.float(-0.3, 0.3);
      growBroadLimb(tree, sp, rng, tip.p, branchDir(tip.d, deg(rng.range(sp.angle)), roll),
        H * sp.len0 * rng.float(0.75, 1.05), tip.r * 0.8, 1);
    }
  } else {
    // Leader continues to the top of the crown.
    growBroadLimb(tree, sp, rng, tip.p, tip.d, H * (1 - sp.trunkLen) + 1, tip.r * 0.8, 1);
  }
}

function growConifer(tree, sp, rng, H) {
  const r0 = H * sp.trunkR;
  const trunk = walk(new V3(), UP.clone(), H, r0, r0 * 0.08, 7, 0.03, 0.05, rng);
  trunk.radii[0] *= 1.3;
  pushLimb(tree, trunk, 0);
  const nW = rng.irange(sp.whorls);
  let roll = rng.float(0, Math.PI * 2);
  for (let w = 0; w < nW; w++) {
    const t = (w + rng.float(0.2, 0.8)) / nW; // 0 crown base, 1 top
    const s = sampleLimb(trunk, sp.crownBase + (1 - sp.crownBase) * t);
    const L = H * sp.branchLen * Math.pow(1 - t, 0.85) * rng.float(0.8, 1.15) + 0.4;
    const n = rng.irange(sp.perWhorl);
    roll += GOLDEN;
    for (let k = 0; k < n; k++) {
      const az = roll + (k * Math.PI * 2) / n + rng.float(-0.3, 0.3);
      const lift = sp.lift[0] + (sp.lift[1] - sp.lift[0]) * t + rng.float(-0.1, 0.1);
      const dir = new V3(Math.cos(az) * Math.cos(lift), Math.sin(lift), Math.sin(az) * Math.cos(lift));
      const limb = walk(s.p, dir, L, s.r * 0.4 + 0.01, 0.01, 3, 0.08, -sp.droop, rng);
      pushLimb(tree, limb, 1);
      for (let d = L * 0.3; d <= L + 0.01; d += sp.clusterStep) {
        addCluster(tree, sp, rng, sampleLimb(limb, d / L).p, 0.65 + 0.35 * (1 - t));
      }
    }
  }
  addCluster(tree, sp, rng, trunk.pts[trunk.pts.length - 1], 0.7);
  addCluster(tree, sp, rng, sampleLimb(trunk, 0.95).p, 0.8);
}

function growSnag(tree, sp, rng, H) {
  const r0 = Math.max(0.2, H * sp.trunkR);
  const trunk = walk(new V3(), UP.clone(), H, r0, r0 * 0.6, 5, 0.06, 0.03, rng);
  trunk.radii[0] *= 1.3;
  pushLimb(tree, trunk, 0);
  const tip = sampleLimb(trunk, 1);
  const spikes = rng.int(2, 3);
  for (let i = 0; i < spikes; i++) {
    const d = branchDir(tip.d, rng.float(0.05, 0.4), rng.float(0, Math.PI * 2));
    pushLimb(tree, walk(tip.p, d, rng.float(0.4, 1.4), tip.r * 0.45, 0.01, 2, 0.1, 0, rng), 1);
  }
  const stubs = rng.int(1, 4);
  for (let i = 0; i < stubs; i++) {
    const s = sampleLimb(trunk, rng.float(0.3, 0.9));
    const d = branchDir(s.d, deg(rng.float(50, 90)), rng.float(0, Math.PI * 2));
    pushLimb(tree, walk(s.p, d, rng.float(0.4, 1.5), s.r * 0.3, 0.02, 2, 0.15, -0.05, rng), 1);
  }
}

function growShrub(tree, sp, rng, H) {
  const stems = rng.int(3, 6);
  for (let i = 0; i < stems; i++) {
    const a = rng.float(0, Math.PI * 2);
    const dir = new V3(Math.cos(a) * 0.7, 0.75, Math.sin(a) * 0.7).normalize();
    const limb = walk(new V3(), dir, H * rng.float(0.7, 1.1), 0.035, 0.01, 2, 0.25, 0.05, rng);
    pushLimb(tree, limb, 2);
    addCluster(tree, sp, rng, limb.pts[1], 0.8);
    addCluster(tree, sp, rng, limb.pts[2], 1);
  }
  addCluster(tree, sp, rng, new V3(0, H * 0.5, 0), 1.1);
}

export function generateTree(speciesId, seed) {
  const sp = SPECIES[speciesId];
  const rng = new Rng(seed);
  const tree = { species: speciesId, limbs: [], clusters: [] };
  const H = rng.range(sp.height);
  if (sp.form === 'conifer') growConifer(tree, sp, rng, H);
  else if (sp.form === 'broad') growBroad(tree, sp, rng, H);
  else if (sp.form === 'snag') growSnag(tree, sp, rng, H);
  else growShrub(tree, sp, rng, H);

  // Bounds (around the trunk axis, for impostor framing) and crown centre.
  let minY = 0, maxY = 0, radius = 0;
  const grow = (p, pad) => {
    minY = Math.min(minY, p.y - pad);
    maxY = Math.max(maxY, p.y + pad);
    radius = Math.max(radius, Math.hypot(p.x, p.z) + pad);
  };
  for (const l of tree.limbs) l.pts.forEach((p, i) => grow(p, l.radii[i]));
  const centre = new V3();
  for (const c of tree.clusters) { grow(c.p, c.size * 0.5); centre.add(c.p); }
  if (tree.clusters.length) centre.divideScalar(tree.clusters.length);
  // Cluster normals point out of the crown (and a little up) for ball-like shading.
  for (const c of tree.clusters) {
    c.n = c.p.clone().sub(centre);
    if (c.n.lengthSq() < 1e-4) c.n.set(0, 1, 0);
    c.n.normalize();
    c.n.y += 0.3;
    c.n.normalize();
  }
  tree.bounds = { minY, maxY, radius: Math.max(radius, 0.5) };
  tree.crownCentre = centre;
  return tree;
}
