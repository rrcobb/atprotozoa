// Shared with TechyBen/playtreeone (src/impostor.js); keep the two in step.
// Shadow maps and impostor baking.
//
// Impostors: each tree variant is rendered (lit, self-shadowed, no fog) from
// N angles around its trunk into one atlas row. Far trees then draw a single
// Y-axis billboard that picks the cell nearest the viewing angle.

import * as THREE from '../vendor/three.module.js';
import { U, DUMMY_TEX } from './materials.js';

const BIAS = new THREE.Matrix4().set(
  0.5, 0, 0, 0.5,
  0, 0.5, 0, 0.5,
  0, 0, 0.5, 0.5,
  0, 0, 0, 1,
);

export function makeShadowTarget(size) {
  return new THREE.WebGLRenderTarget(size, size, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    depthTexture: new THREE.DepthTexture(size, size),
  });
}

// Render depth from `cam` and point every material's shadow uniforms at it.
// `biasMeters` is converted to depth units of the (orthographic) light camera.
export function renderShadowMap(renderer, scene, cam, rt, biasMeters = 0.35) {
  const prevPass = U.uPass.value;
  U.uPass.value = 1;
  U.uShadowMap.value = DUMMY_TEX; // never sample the target being written
  renderer.setRenderTarget(rt);
  renderer.setClearColor(0xffffff, 1);
  renderer.clear();
  renderer.render(scene, cam);
  U.uPass.value = prevPass;
  U.uShadowMap.value = rt.depthTexture;
  U.uShadowMatrix.value.multiplyMatrices(BIAS, cam.projectionMatrix).multiply(cam.matrixWorldInverse);
  U.uShadowBias.value = biasMeters / (cam.far - cam.near);
}

let bakeShadowRT = null;

export function bakeImpostor(renderer, variant, { views = 8, cellH: maxCell = 64 } = {}) {
  const { bounds } = variant.tree;
  const W = bounds.radius * 2 * 1.04;
  const H = (bounds.maxY - bounds.minY) * 1.02;
  const minY = bounds.minY;
  // The longer side of a cell gets `maxCell` pixels (wide shrubs stay small).
  const cellH = W > H ? Math.max(4, Math.round((maxCell * H) / W)) : maxCell;
  const cellW = Math.max(4, Math.round((cellH * W) / H));

  const rt = new THREE.WebGLRenderTarget(cellW * views, cellH, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
  });

  const scene = new THREE.Scene();
  const parts = [new THREE.Mesh(variant.branchGeo, variant.branchMat)];
  if (variant.leafGeo) parts.push(new THREE.Mesh(variant.leafGeo, variant.leafMat));
  for (const p of parts) { p.frustumCulled = false; scene.add(p); }

  const saved = {
    pass: U.uPass.value, on: U.uShadowOn.value, map: U.uShadowMap.value,
    matrix: U.uShadowMatrix.value.clone(), bias: U.uShadowBias.value,
    autoClear: renderer.autoClear, target: renderer.getRenderTarget(),
    clear: renderer.getClearColor(new THREE.Color()), alpha: renderer.getClearAlpha(),
  };

  // Self-shadowing for the bake, so impostors match the near meshes.
  if (!bakeShadowRT) bakeShadowRT = makeShadowTarget(256);
  const cy = minY + H / 2;
  const R = Math.max(W, H) * 0.75;
  const centre = new THREE.Vector3(0, cy, 0);
  const lightCam = new THREE.OrthographicCamera(-R, R, R, -R, 0.1, R * 4);
  lightCam.position.copy(centre).addScaledVector(U.uSunDir.value, R * 2);
  lightCam.lookAt(centre);
  lightCam.updateMatrixWorld();
  renderShadowMap(renderer, scene, lightCam, bakeShadowRT, 0.3);
  U.uShadowOn.value = 1;

  U.uPass.value = 2;
  renderer.setRenderTarget(rt);
  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  renderer.autoClear = false;
  const D = R * 2 + 5;
  const cam = new THREE.OrthographicCamera(-W / 2, W / 2, H / 2, -H / 2, 0.1, D + R * 2);
  for (let i = 0; i < views; i++) {
    const a = (i / views) * Math.PI * 2;
    cam.position.set(Math.sin(a) * D, cy, Math.cos(a) * D);
    cam.lookAt(0, cy, 0);
    cam.updateMatrixWorld();
    rt.viewport.set(i * cellW, 0, cellW, cellH);
    rt.scissor.set(i * cellW, 0, cellW, cellH);
    rt.scissorTest = true;
    renderer.setRenderTarget(rt);
    renderer.render(scene, cam);
  }
  rt.scissorTest = false;
  rt.viewport.set(0, 0, cellW * views, cellH);
  rt.scissor.set(0, 0, cellW * views, cellH);

  U.uPass.value = saved.pass;
  U.uShadowOn.value = saved.on;
  U.uShadowMap.value = saved.map;
  U.uShadowMatrix.value.copy(saved.matrix);
  U.uShadowBias.value = saved.bias;
  renderer.autoClear = saved.autoClear;
  renderer.setClearColor(saved.clear, saved.alpha);
  renderer.setRenderTarget(saved.target);

  return { rt, texture: rt.texture, views, cellW, cellH, W, H, minY };
}
