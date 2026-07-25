// ======================================================================
// cowlick — comb a hairy 3D surface with your finger/mouse.
//   • drag across the fur to comb it flat along your stroke (bend decays
//     back over a few seconds — a per-hair "vector field with memory")
//   • drag empty space to look around; WASD/QE fly the camera
// Pure browser, three.js via CDN ESM import map. No secrets, no server.
// ======================================================================

import * as THREE from "three";
import { MeshSurfaceSampler } from "three/addons/math/MeshSurfaceSampler.js";

// Keep colors literal (no linear/sRGB round-tripping) so the custom hair
// shader's hand-picked hex colors render the way they're written.
THREE.ColorManagement.enabled = false;

const canvas = document.getElementById("stage");
const loadingEl = document.getElementById("loading");
const theoryNote = document.getElementById("theoryNote");
const aboutBtn = document.getElementById("aboutBtn");
const aboutEl = document.getElementById("about");
const closeAbout = document.getElementById("closeAbout");
const surfacePanel = document.getElementById("surfacePanel");

const HAIR_COUNT = window.innerWidth < 700 ? 2200 : 5200;
const HAIR_HEIGHT_SEGS = 5;

// ---- surface presets ---------------------------------------------------
const SURFACES = {
  sphere: {
    build: () => new THREE.SphereGeometry(1.2, 96, 64),
    baseLen: 0.11,
    brush: 0.42,
    camDist: 4.2,
    note: "the sphere always has a cowlick somewhere — go find it.",
  },
  torus: {
    build: () => new THREE.TorusGeometry(1.05, 0.42, 48, 128),
    baseLen: 0.09,
    brush: 0.36,
    camDist: 4.2,
    note: "the torus can be combed perfectly flat, no cowlick required.",
  },
  knot: {
    build: () => new THREE.TorusKnotGeometry(0.8, 0.26, 220, 32),
    baseLen: 0.08,
    brush: 0.32,
    camDist: 4.6,
    note: "same rules, weirder topology.",
  },
  gem: {
    build: () => new THREE.IcosahedronGeometry(1.3, 1),
    baseLen: 0.12,
    brush: 0.42,
    camDist: 4.6,
    note: "a faceted cowlick candidate.",
  },
};

// ---- renderer / scene / camera -----------------------------------------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));

const BG = new THREE.Color(0x0b0c1a);
const scene = new THREE.Scene();
scene.background = BG;
scene.fog = new THREE.Fog(BG, 5, 14);

const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.05, 60);

const keyLight = new THREE.DirectionalLight(0xffffff, 1.4);
const LIGHT_DIR = new THREE.Vector3(0.6, 0.8, 0.5).normalize();
keyLight.position.copy(LIGHT_DIR);
scene.add(keyLight);
scene.add(new THREE.HemisphereLight(0x8890ff, 0x0a0a18, 0.65));

// ---- hair material (shared across surfaces) -----------------------------
const hairMaterial = new THREE.ShaderMaterial({
  vertexShader: document.getElementById("hairVert").textContent,
  fragmentShader: document.getElementById("hairFrag").textContent,
  side: THREE.DoubleSide,
  uniforms: {
    uTime: { value: 0 },
    uDecay: { value: 0.35 },
    uMaxBend: { value: 1.45 },
    uWindAmp: { value: 0.05 },
    uWindFreq: { value: 0.35 },
    uLightDir: { value: LIGHT_DIR.clone() },
    uColorRoot: { value: new THREE.Color(0x4b4870) },
    uColorTip: { value: new THREE.Color(0xcdd6ff) },
    uColorCombed: { value: new THREE.Color(0xffd28a) },
  },
});

const skinMaterial = new THREE.MeshStandardMaterial({
  color: 0x2c2c48,
  roughness: 0.85,
  metalness: 0.05,
});

function buildHairGeometry(heightSegs) {
  const rows = heightSegs + 1;
  const positions = [];
  for (let r = 0; r < rows; r++) {
    const t = r / heightSegs;
    positions.push(-0.5, t, 0, 0.5, t, 0);
  }
  const indices = [];
  for (let r = 0; r < heightSegs; r++) {
    const a = r * 2, b = r * 2 + 1, c = r * 2 + 2, d = r * 2 + 3;
    indices.push(a, b, c, b, d, c);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  return geo;
}

// ---- live rig (rebuilt per surface) --------------------------------------
let surfaceMesh = null;
let hairMesh = null;
let roots = null; // Float32Array, world-space hair roots (object space == world here)
let combDirArr = null;
let combTimeArr = null;
let combStrengthArr = null;
let brushRadius = 0.4;
let elapsed = 0;

const UP = new THREE.Vector3(0, 1, 0);
const RIGHT = new THREE.Vector3(1, 0, 0);
const tmpPos = new THREE.Vector3();
const tmpNormal = new THREE.Vector3();
const tmpTangent = new THREE.Vector3();

function disposeRig() {
  if (surfaceMesh) {
    scene.remove(surfaceMesh);
    surfaceMesh.geometry.dispose();
    surfaceMesh = null;
  }
  if (hairMesh) {
    scene.remove(hairMesh);
    hairMesh.geometry.dispose();
    hairMesh = null;
  }
}

function setSurface(kind) {
  const cfg = SURFACES[kind];
  disposeRig();

  const surfGeo = cfg.build();
  surfGeo.computeVertexNormals();
  surfaceMesh = new THREE.Mesh(surfGeo, skinMaterial);
  scene.add(surfaceMesh);

  const sampler = new MeshSurfaceSampler(surfaceMesh).build();

  const count = HAIR_COUNT;
  roots = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const tangents = new Float32Array(count * 3);
  combDirArr = new Float32Array(count * 3);
  combTimeArr = new Float32Array(count).fill(-1e6);
  combStrengthArr = new Float32Array(count).fill(0);
  const seedArr = new Float32Array(count);
  const lenArr = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    sampler.sample(tmpPos, tmpNormal);
    const ref = Math.abs(tmpNormal.y) < 0.9 ? UP : RIGHT;
    tmpTangent.crossVectors(ref, tmpNormal).normalize();

    const i3 = i * 3;
    roots[i3] = tmpPos.x; roots[i3 + 1] = tmpPos.y; roots[i3 + 2] = tmpPos.z;
    normals[i3] = tmpNormal.x; normals[i3 + 1] = tmpNormal.y; normals[i3 + 2] = tmpNormal.z;
    tangents[i3] = tmpTangent.x; tangents[i3 + 1] = tmpTangent.y; tangents[i3 + 2] = tmpTangent.z;
    combDirArr[i3] = tmpTangent.x; combDirArr[i3 + 1] = tmpTangent.y; combDirArr[i3 + 2] = tmpTangent.z;

    seedArr[i] = Math.random();
    lenArr[i] = cfg.baseLen * (0.7 + Math.random() * 0.6);
  }

  const geo = buildHairGeometry(HAIR_HEIGHT_SEGS);
  geo.setAttribute("aRoot", new THREE.InstancedBufferAttribute(roots, 3));
  geo.setAttribute("aNormal", new THREE.InstancedBufferAttribute(normals, 3));
  geo.setAttribute("aTangent", new THREE.InstancedBufferAttribute(tangents, 3));
  geo.setAttribute("aCombDir", new THREE.InstancedBufferAttribute(combDirArr, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute("aCombTime", new THREE.InstancedBufferAttribute(combTimeArr, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute("aCombStrength", new THREE.InstancedBufferAttribute(combStrengthArr, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seedArr, 1));
  geo.setAttribute("aLen", new THREE.InstancedBufferAttribute(lenArr, 1));

  hairMesh = new THREE.InstancedMesh(geo, hairMaterial, count);
  hairMesh.frustumCulled = false;
  scene.add(hairMesh);

  brushRadius = cfg.brush;

  camPos.set(0, 0, cfg.camDist);
  yaw = 0;
  pitch = 0;

  theoryNote.textContent = cfg.note;
}

// ---- camera fly rig -------------------------------------------------------
const camPos = new THREE.Vector3(0, 0, 4.2);
let yaw = 0;
let pitch = 0;
const euler = new THREE.Euler(0, 0, 0, "YXZ");
const forward3 = new THREE.Vector3();
const right3 = new THREE.Vector3();
const moveVec = new THREE.Vector3();

const keys = new Set();
const MOVE_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE", "ShiftLeft", "ShiftRight"]);
addEventListener("keydown", (e) => {
  if (MOVE_KEYS.has(e.code)) e.preventDefault();
  keys.add(e.code);
});
addEventListener("keyup", (e) => keys.delete(e.code));
addEventListener("blur", () => keys.clear());

function updateCamera(dt) {
  euler.set(pitch, yaw, 0, "YXZ");
  camera.quaternion.setFromEuler(euler);

  forward3.set(0, 0, -1).applyQuaternion(camera.quaternion);
  right3.set(1, 0, 0).applyQuaternion(camera.quaternion);
  moveVec.set(0, 0, 0);
  if (keys.has("KeyW")) moveVec.add(forward3);
  if (keys.has("KeyS")) moveVec.sub(forward3);
  if (keys.has("KeyD")) moveVec.add(right3);
  if (keys.has("KeyA")) moveVec.sub(right3);
  if (keys.has("KeyE")) moveVec.y += 1;
  if (keys.has("KeyQ")) moveVec.y -= 1;

  if (moveVec.lengthSq() > 0) {
    moveVec.normalize();
    const boost = keys.has("ShiftLeft") || keys.has("ShiftRight") ? 2.6 : 1;
    camPos.addScaledVector(moveVec, 2.1 * boost * dt);
  }
  if (camPos.length() < 0.55) camPos.setLength(0.55);
  camera.position.copy(camPos);
}

// ---- pointer interaction: comb the fur / look around -----------------------
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let pointerActive = false;
let mode = null; // 'comb' | 'look'
const combPrevPoint = new THREE.Vector3();
const dragDir = new THREE.Vector3();
let lastPointerX = 0, lastPointerY = 0;
const LOOK_SPEED = 0.0032;

function setNdc(e) {
  const r = canvas.getBoundingClientRect();
  ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
  ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
}

function onPointerDown(e) {
  pointerActive = true;
  setNdc(e);
  canvas.setPointerCapture(e.pointerId);
  raycaster.setFromCamera(ndc, camera);
  const hits = surfaceMesh ? raycaster.intersectObject(surfaceMesh, false) : [];
  if (hits.length) {
    mode = "comb";
    combPrevPoint.copy(hits[0].point);
    canvas.classList.add("combing");
    canvas.classList.remove("looking");
  } else {
    mode = "look";
    lastPointerX = e.clientX;
    lastPointerY = e.clientY;
    canvas.classList.add("looking");
    canvas.classList.remove("combing");
  }
}

function onPointerMove(e) {
  if (!pointerActive) return;
  if (mode === "comb") {
    setNdc(e);
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObject(surfaceMesh, false);
    if (!hits.length) return;
    const point = hits[0].point;
    dragDir.subVectors(point, combPrevPoint);
    if (dragDir.lengthSq() > 1e-8) {
      const normal = hits[0].face.normal.clone().transformDirection(surfaceMesh.matrixWorld);
      dragDir.addScaledVector(normal, -dragDir.dot(normal));
      if (dragDir.lengthSq() > 1e-8) {
        dragDir.normalize();
        applyBrush(point, dragDir);
      }
    }
    combPrevPoint.copy(point);
  } else if (mode === "look") {
    const dx = e.clientX - lastPointerX;
    const dy = e.clientY - lastPointerY;
    lastPointerX = e.clientX;
    lastPointerY = e.clientY;
    yaw -= dx * LOOK_SPEED;
    pitch -= dy * LOOK_SPEED;
    pitch = Math.max(-1.5, Math.min(1.5, pitch));
  }
}

function onPointerUp(e) {
  pointerActive = false;
  mode = null;
  canvas.classList.remove("combing", "looking");
  try { canvas.releasePointerCapture(e.pointerId); } catch {}
}

canvas.addEventListener("pointerdown", onPointerDown);
canvas.addEventListener("pointermove", onPointerMove);
canvas.addEventListener("pointerup", onPointerUp);
canvas.addEventListener("pointercancel", onPointerUp);

function applyBrush(point, dir) {
  let touched = false;
  const r2 = brushRadius * brushRadius;
  for (let i = 0; i < roots.length / 3; i++) {
    const i3 = i * 3;
    const dx = roots[i3] - point.x;
    const dy = roots[i3 + 1] - point.y;
    const dz = roots[i3 + 2] - point.z;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 >= r2) continue;
    const d = Math.sqrt(d2);
    const falloff = 1 - d / brushRadius;
    combDirArr[i3] = dir.x; combDirArr[i3 + 1] = dir.y; combDirArr[i3 + 2] = dir.z;
    combTimeArr[i] = elapsed;
    combStrengthArr[i] = Math.max(combStrengthArr[i] * 0.4, falloff);
    touched = true;
  }
  if (touched) {
    const geo = hairMesh.geometry;
    geo.attributes.aCombDir.needsUpdate = true;
    geo.attributes.aCombTime.needsUpdate = true;
    geo.attributes.aCombStrength.needsUpdate = true;
  }
}

// ---- surface switcher UI --------------------------------------------------
surfacePanel.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-surface]");
  if (!btn) return;
  for (const b of surfacePanel.querySelectorAll("button")) b.classList.remove("active");
  btn.classList.add("active");
  setSurface(btn.dataset.surface);
});

aboutBtn.addEventListener("click", () => aboutEl.classList.add("show"));
closeAbout.addEventListener("click", () => aboutEl.classList.remove("show"));
aboutEl.addEventListener("click", (e) => {
  if (e.target === aboutEl) aboutEl.classList.remove("show");
});

// ---- resize -----------------------------------------------------------
function resize() {
  const w = innerWidth, h = innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}
addEventListener("resize", resize);

// ---- main loop --------------------------------------------------------
let lastTs = 0;
function frame(ts) {
  const dt = lastTs ? Math.min(0.05, (ts - lastTs) / 1000) : 0.016;
  lastTs = ts;
  elapsed += dt;

  updateCamera(dt);
  hairMaterial.uniforms.uTime.value = elapsed;

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

resize();
setSurface("sphere");
loadingEl.classList.add("hide");
requestAnimationFrame(frame);
