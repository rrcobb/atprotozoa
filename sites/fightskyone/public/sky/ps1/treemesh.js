// Shared with TechyBen/playtreeone (src/treemesh.js); keep the two in step.
// Skeleton -> low-poly geometry.
//  - Branches: tapered prisms, 3-6 sides depending on branch level.
//  - Leaves: one quad per cluster. Every vertex stores the cluster centre;
//    the vertex shader expands it into a camera-facing card (a billboard).

import * as THREE from '../vendor/three.module.js';
import { ATLAS_COLUMNS } from './leafgen.js';

const V3 = THREE.Vector3;
const UP = new V3(0, 1, 0);
const X = new V3(1, 0, 0);
const SIDES = [6, 5, 4, 3, 3];

export function buildBranchGeometry(tree, detail = 1) {
  const pos = [], nrm = [], uv = [], ao = [], idx = [];
  for (const limb of tree.limbs) {
    const sides = Math.max(3, Math.round(SIDES[Math.min(limb.level, 4)] * detail));
    const n = limb.pts.length;
    const base = pos.length / 3;
    const around = Math.max(1, Math.round((2 * Math.PI * limb.radii[0]) / 0.6));
    let side = null, v = 0;
    for (let i = 0; i < n; i++) {
      const p = limb.pts[i], r = limb.radii[i];
      const tan = (i < n - 1 ? limb.pts[i + 1].clone().sub(p) : p.clone().sub(limb.pts[i - 1])).normalize();
      if (i > 0 && i < n - 1) tan.add(p.clone().sub(limb.pts[i - 1]).normalize()).normalize();
      // Parallel-transport-ish frame so rings don't twist.
      side = side
        ? side.sub(tan.clone().multiplyScalar(side.dot(tan))).normalize()
        : new V3().crossVectors(tan, Math.abs(tan.y) < 0.99 ? UP : X).normalize();
      const bin = new V3().crossVectors(tan, side).normalize();
      if (i > 0) v += p.distanceTo(limb.pts[i - 1]);
      // Darker low down and on inner limbs: a cheap ambient occlusion.
      const occl = Math.min(1, 0.55 + 0.45 * Math.min(1, p.y / 2.5)) * (limb.level >= 2 ? 0.92 : 1);
      for (let s = 0; s <= sides; s++) {
        const a = (s / sides) * Math.PI * 2;
        const c = Math.cos(a), sn = Math.sin(a);
        const nx = side.x * c + bin.x * sn, ny = side.y * c + bin.y * sn, nz = side.z * c + bin.z * sn;
        pos.push(p.x + nx * r, p.y + ny * r, p.z + nz * r);
        nrm.push(nx, ny, nz);
        uv.push((s / sides) * around, v * 0.5);
        ao.push(occl);
      }
    }
    for (let i = 0; i < n - 1; i++) {
      for (let s = 0; s < sides; s++) {
        const a = base + i * (sides + 1) + s, b = a + sides + 1;
        idx.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aAo', new THREE.Float32BufferAttribute(ao, 1));
  g.setIndex(idx);
  return g;
}

const CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, 1]];

export function buildLeafGeometry(tree, atlasTile) {
  const N = tree.clusters.length;
  const pos = new Float32Array(N * 12), nrm = new Float32Array(N * 12);
  const corner = new Float32Array(N * 8), uv = new Float32Array(N * 8), rnd = new Float32Array(N * 8);
  const idx = [];
  const inset = 1 - 1 / atlasTile; // keep samples off the neighbouring tile
  tree.clusters.forEach((c, k) => {
    for (let j = 0; j < 4; j++) {
      const i = k * 4 + j, [cx, cy] = CORNERS[j];
      pos.set([c.p.x, c.p.y, c.p.z], i * 3);
      nrm.set([c.n.x, c.n.y, c.n.z], i * 3);
      corner.set([cx * c.size * 0.5, cy * c.size * 0.5], i * 2);
      uv.set([(c.variant + 0.5 + cx * 0.5 * inset) / ATLAS_COLUMNS, 0.5 - cy * 0.5 * inset], i * 2);
      rnd.set([c.rot, c.phase], i * 2);
    }
    const b = k * 4;
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('aCorner', new THREE.BufferAttribute(corner, 2));
  g.setAttribute('aRand', new THREE.BufferAttribute(rnd, 2));
  g.setIndex(idx);
  return g;
}

// Unit impostor quad: x in [-0.5, 0.5], y in [0, 1]; the shader sizes it.
export function buildImpostorQuad() {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}
