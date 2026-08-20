// phonepile — a pile of every major phone since the 2007 iPhone, each box
// scaled to that phone's real millimeter dimensions, dropped into a real
// rigid-body physics sandbox (cannon-es) and rendered with three.js. Click
// and drag a phone to grab it (by its center — no torque/anchor math, just a
// velocity-follow "hand") and throw it into the pile; drag empty space to
// orbit. Built for @cee.wtf by @buildthis.
//
// Perf lessons inherited from grand-moot-auto's GPU crash (see its game.js):
// no shadow maps, pixel ratio capped, and a webglcontextlost handler instead
// of silently hanging.

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import * as CANNON from "cannon-es";

const els = {
  loading: document.getElementById("loading"),
  fallback: document.getElementById("fallback"),
  stage: document.getElementById("stage"),
  hint: document.getElementById("hint"),
  pickedCard: document.getElementById("picked-card"),
  pickedName: document.getElementById("picked-name"),
  pickedMaker: document.getElementById("picked-maker"),
  pickedDims: document.getElementById("picked-dims"),
  btnReset: document.getElementById("btn-reset"),
  btnThrow: document.getElementById("btn-throw"),
  btnShare: document.getElementById("btn-share"),
};

function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(
      window.WebGLRenderingContext &&
      (c.getContext("webgl2") || c.getContext("webgl"))
    );
  } catch {
    return false;
  }
}

if (!hasWebGL()) {
  els.loading.classList.add("hide");
  els.fallback.classList.add("show");
  throw new Error("no WebGL");
}

// ---- maker palette -----------------------------------------------------

const MAKER_COLORS = {
  Apple: { bg: "#e9eaee", fg: "#15161a" },
  Samsung: { bg: "#1428a0", fg: "#ffffff" },
  Google: { bg: "#1a73e8", fg: "#ffffff" },
  HTC: { bg: "#0a8a90", fg: "#ffffff" },
  BlackBerry: { bg: "#181818", fg: "#7cc242" },
  Palm: { bg: "#12b8a6", fg: "#062018" },
  Motorola: { bg: "#0076ce", fg: "#ffffff" },
  Nokia: { bg: "#124191", fg: "#ffffff" },
  Xiaomi: { bg: "#ff6900", fg: "#1a0d00" },
  LG: { bg: "#a50034", fg: "#ffffff" },
  Sony: { bg: "#0a0a0a", fg: "#ffffff" },
  Huawei: { bg: "#cf0a2c", fg: "#ffffff" },
  OnePlus: { bg: "#eb0028", fg: "#ffffff" },
};
const DEFAULT_COLOR = { bg: "#333844", fg: "#f4f6fa" };

function makerColor(maker) {
  const key = (maker || "").split("/")[0].trim();
  return MAKER_COLORS[key] || DEFAULT_COLOR;
}

function shade(hex, amt) {
  const c = parseInt(hex.slice(1), 16);
  let r = (c >> 16) & 255;
  let g = (c >> 8) & 255;
  let b = c & 255;
  const mix = (v) => Math.max(0, Math.min(255, Math.round(v + 255 * amt)));
  r = mix(r);
  g = mix(g);
  b = mix(b);
  return `rgb(${r},${g},${b})`;
}

// ---- label textures -----------------------------------------------------

function wrapAndDraw(ctx, text, cx, cy, maxWidth, lineHeight) {
  const words = text.split(" ");
  const lines = [];
  let line = "";
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (line && ctx.measureText(test).width > maxWidth) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  const startY = cy - ((lines.length - 1) / 2) * lineHeight;
  lines.forEach((l, i) => ctx.fillText(l, cx, startY + i * lineHeight));
}

function labelCanvas(phone, flip) {
  const maxDim = 640;
  let cw = Math.round(phone.width_mm * 5.4);
  let ch = Math.round(phone.height_mm * 5.4);
  if (Math.max(cw, ch) > maxDim) {
    const f = maxDim / Math.max(cw, ch);
    cw = Math.round(cw * f);
    ch = Math.round(ch * f);
  }
  cw = Math.max(cw, 48);
  ch = Math.max(ch, 48);

  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d");
  const colors = makerColor(phone.maker);

  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, cw, ch);

  // a faint camera-bump dot near the top so it reads as "phone" at a glance
  ctx.fillStyle = "rgba(0,0,0,0.14)";
  ctx.beginPath();
  ctx.arc(cw * 0.5, ch * 0.08, Math.min(cw, ch) * 0.035, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  if (flip) {
    ctx.translate(cw, 0);
    ctx.scale(-1, 1);
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = colors.fg;

  const nameSize = Math.max(11, Math.min(cw, ch) * 0.115);
  ctx.font = `700 ${nameSize}px ui-monospace, "JetBrains Mono", monospace`;
  wrapAndDraw(ctx, phone.name, cw / 2, ch * 0.52, cw * 0.86, nameSize * 1.12);

  ctx.font = `600 ${nameSize * 0.58}px ui-monospace, monospace`;
  ctx.globalAlpha = 0.82;
  ctx.fillText(
    `${Math.round(phone.width_mm)}×${Math.round(phone.height_mm)}×${phone.depth_mm.toFixed(1)}mm`,
    cw / 2,
    ch * 0.78,
  );
  ctx.font = `600 ${nameSize * 0.52}px ui-monospace, monospace`;
  ctx.globalAlpha = 0.6;
  ctx.fillText(`${phone.maker} · ${phone.year}`, cw / 2, ch * 0.87);
  ctx.globalAlpha = 1;
  ctx.restore();

  return canvas;
}

// ---- physics setup --------------------------------------------------------

const TRAY_HALF = 0.42;
const WALL_HEIGHT = 0.5;
const WALL_THICK = 0.02;
const FIXED_STEP = 1 / 60;

const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
world.broadphase = new CANNON.SAPBroadphase(world);
world.allowSleep = true;
world.solver.iterations = 10;

const groundMat = new CANNON.Material("ground");
const phoneMat = new CANNON.Material("phone");
world.addContactMaterial(
  new CANNON.ContactMaterial(groundMat, phoneMat, { friction: 0.45, restitution: 0.05 }),
);
world.addContactMaterial(
  new CANNON.ContactMaterial(phoneMat, phoneMat, { friction: 0.3, restitution: 0.15 }),
);
world.defaultContactMaterial.friction = 0.4;
world.defaultContactMaterial.restitution = 0.1;

function addStaticBox(hx, hy, hz, x, y, z) {
  const body = new CANNON.Body({
    mass: 0,
    shape: new CANNON.Box(new CANNON.Vec3(hx, hy, hz)),
    material: groundMat,
    position: new CANNON.Vec3(x, y, z),
  });
  world.addBody(body);
  return body;
}

addStaticBox(TRAY_HALF, 0.01, TRAY_HALF, 0, -0.01, 0); // floor
addStaticBox(WALL_THICK / 2, WALL_HEIGHT / 2, TRAY_HALF + WALL_THICK, -TRAY_HALF - WALL_THICK / 2, WALL_HEIGHT / 2, 0);
addStaticBox(WALL_THICK / 2, WALL_HEIGHT / 2, TRAY_HALF + WALL_THICK, TRAY_HALF + WALL_THICK / 2, WALL_HEIGHT / 2, 0);
addStaticBox(TRAY_HALF + WALL_THICK, WALL_HEIGHT / 2, WALL_THICK / 2, 0, WALL_HEIGHT / 2, -TRAY_HALF - WALL_THICK / 2);
addStaticBox(TRAY_HALF + WALL_THICK, WALL_HEIGHT / 2, WALL_THICK / 2, 0, WALL_HEIGHT / 2, TRAY_HALF + WALL_THICK / 2);

// ---- three.js scene ---------------------------------------------------

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0c10);
scene.fog = new THREE.Fog(0x0a0c10, 1.1, 3.4);

const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.02, 20);
camera.position.set(0.05, 0.95, 1.0);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  preserveDrawingBuffer: true,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
els.stage.appendChild(renderer.domElement);

renderer.domElement.addEventListener(
  "webglcontextlost",
  (e) => {
    e.preventDefault();
    els.hint.textContent = "the GPU dropped — reloading…";
    els.hint.classList.remove("hide");
    setTimeout(() => location.reload(), 1200);
  },
  false,
);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.12, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.09;
controls.minDistance = 0.35;
controls.maxDistance = 2.4;
controls.maxPolarAngle = Math.PI / 2 - 0.02;
controls.update();

scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x0d0f14, 1.1));
const sun = new THREE.DirectionalLight(0xfff2e0, 1.5);
sun.position.set(0.8, 1.6, 0.9);
scene.add(sun);
const fill = new THREE.DirectionalLight(0x5fb8ff, 0.35);
fill.position.set(-1, 0.6, -0.6);
scene.add(fill);

// floor
const floorGeo = new THREE.PlaneGeometry(TRAY_HALF * 2.6, TRAY_HALF * 2.6);
const floorMat = new THREE.MeshStandardMaterial({ color: 0x11151c, roughness: 0.95, metalness: 0.05 });
const floorMesh = new THREE.Mesh(floorGeo, floorMat);
floorMesh.rotation.x = -Math.PI / 2;
scene.add(floorMesh);

// tray outline cage, cheap wireframe so bounds read clearly without transparency sorting
const cageMat = new THREE.LineBasicMaterial({ color: 0x2a3446, transparent: true, opacity: 0.6 });
function cageRect(y) {
  const pts = [
    new THREE.Vector3(-TRAY_HALF, y, -TRAY_HALF),
    new THREE.Vector3(TRAY_HALF, y, -TRAY_HALF),
    new THREE.Vector3(TRAY_HALF, y, TRAY_HALF),
    new THREE.Vector3(-TRAY_HALF, y, TRAY_HALF),
    new THREE.Vector3(-TRAY_HALF, y, -TRAY_HALF),
  ];
  return new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), cageMat);
}
scene.add(cageRect(0.001));
const corners = [
  [-TRAY_HALF, -TRAY_HALF],
  [TRAY_HALF, -TRAY_HALF],
  [TRAY_HALF, TRAY_HALF],
  [-TRAY_HALF, TRAY_HALF],
];
for (const [x, z] of corners) {
  const geo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(x, 0, z),
    new THREE.Vector3(x, WALL_HEIGHT, z),
  ]);
  scene.add(new THREE.Line(geo, cageMat));
}

// ---- phones -------------------------------------------------------------

function massFor(phone) {
  if (phone.weight_g) return Math.min(0.4, Math.max(0.08, phone.weight_g / 1000));
  const volume = (phone.width_mm / 1000) * (phone.height_mm / 1000) * (phone.depth_mm / 1000);
  return Math.min(0.4, Math.max(0.08, volume * 2200));
}

function randomQuat() {
  const axis = new CANNON.Vec3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1);
  axis.normalize();
  const q = new CANNON.Quaternion();
  q.setFromAxisAngle(axis, Math.random() * Math.PI * 2);
  return q;
}

const links = []; // { mesh, body, phone }

function buildPhone(phone) {
  const w = phone.width_mm / 1000;
  const h = phone.height_mm / 1000;
  const d = Math.max(phone.depth_mm, 3) / 1000;

  const colors = makerColor(phone.maker);
  const edgeMat = new THREE.MeshStandardMaterial({
    color: shade(colors.bg, -0.4),
    roughness: 0.55,
    metalness: 0.4,
  });
  const texFront = new THREE.CanvasTexture(labelCanvas(phone, false));
  const texBack = new THREE.CanvasTexture(labelCanvas(phone, true));
  texFront.colorSpace = THREE.SRGBColorSpace;
  texBack.colorSpace = THREE.SRGBColorSpace;
  const faceFront = new THREE.MeshStandardMaterial({ map: texFront, roughness: 0.45, metalness: 0.05 });
  const faceBack = new THREE.MeshStandardMaterial({ map: texBack, roughness: 0.45, metalness: 0.05 });

  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [
    edgeMat,
    edgeMat,
    edgeMat,
    edgeMat,
    faceFront,
    faceBack,
  ]);
  scene.add(mesh);

  const body = new CANNON.Body({
    mass: massFor(phone),
    shape: new CANNON.Box(new CANNON.Vec3(w / 2, h / 2, d / 2)),
    material: phoneMat,
    position: new CANNON.Vec3(0, 1, 0),
  });
  body.linearDamping = 0.02;
  body.angularDamping = 0.05;
  world.addBody(body);

  mesh.userData.phone = phone;
  mesh.userData.body = body;
  links.push({ mesh, body, phone });
}

function spawnPile() {
  const perLayer = 14;
  links.forEach(({ body }, i) => {
    const layer = Math.floor(i / perLayer);
    const r = TRAY_HALF * 0.55;
    const ang = Math.random() * Math.PI * 2;
    const rad = Math.random() * r;
    body.position.set(Math.cos(ang) * rad, 0.14 + layer * 0.09 + Math.random() * 0.02, Math.sin(ang) * rad);
    body.velocity.set(0, 0, 0);
    body.angularVelocity.set(0, 0, 0);
    body.quaternion.copy(randomQuat());
    body.wakeUp();
  });
}

function throwAll() {
  for (const { body } of links) {
    body.wakeUp();
    body.velocity.set((Math.random() - 0.5) * 4, 3 + Math.random() * 3, (Math.random() - 0.5) * 4);
    body.angularVelocity.set(
      (Math.random() - 0.5) * 10,
      (Math.random() - 0.5) * 10,
      (Math.random() - 0.5) * 10,
    );
  }
}

// ---- load data & boot ----------------------------------------------------

let phoneMeshes = [];

fetch("./data/phones.json")
  .then((r) => {
    if (!r.ok) throw new Error(`phones.json ${r.status}`);
    return r.json();
  })
  .then((phones) => {
    for (const phone of phones) buildPhone(phone);
    phoneMeshes = links.map((l) => l.mesh);
    spawnPile();
    els.loading.classList.add("hide");
    setTimeout(() => els.hint.classList.add("hide"), 6000);
    animate();
  })
  .catch((err) => {
    console.error(err);
    els.loading.querySelector("p").textContent = "couldn't load the phone data — try reloading";
  });

// ---- drag-to-throw --------------------------------------------------------

const raycaster = new THREE.Raycaster();
const pointerNDC = new THREE.Vector2();
const dragPlane = new THREE.Plane();
const planeHit = new THREE.Vector3();
const dragTarget = new THREE.Vector3();
const scratch = new THREE.Vector3();
let dragging = null; // { body }

const DRAG_FOLLOW_TIME = 0.07;
const DRAG_MAX_SPEED = 9;

function toNDC(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointerNDC.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointerNDC.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

function showPicked(phone) {
  els.pickedName.textContent = phone.name;
  els.pickedMaker.textContent = `${phone.maker} · ${phone.year}`;
  els.pickedDims.textContent = `${phone.height_mm}×${phone.width_mm}×${phone.depth_mm}mm`;
  els.pickedCard.classList.add("show");
}

renderer.domElement.addEventListener("pointerdown", (e) => {
  if (!phoneMeshes.length) return;
  toNDC(e);
  raycaster.setFromCamera(pointerNDC, camera);
  const hits = raycaster.intersectObjects(phoneMeshes, false);
  if (!hits.length) return;

  const mesh = hits[0].object;
  const body = mesh.userData.body;
  body.wakeUp();
  dragging = { body };
  dragTarget.copy(hits[0].point);
  controls.enabled = false;

  const camDir = new THREE.Vector3();
  camera.getWorldDirection(camDir);
  dragPlane.setFromNormalAndCoplanarPoint(camDir, hits[0].point);

  showPicked(mesh.userData.phone);
  els.hint.classList.add("hide");
  try {
    renderer.domElement.setPointerCapture(e.pointerId);
  } catch {
    /* not supported everywhere, drag still works without capture */
  }
});

renderer.domElement.addEventListener("pointermove", (e) => {
  if (!dragging) return;
  toNDC(e);
  raycaster.setFromCamera(pointerNDC, camera);
  if (raycaster.ray.intersectPlane(dragPlane, planeHit)) {
    dragTarget.copy(planeHit);
  }
});

function endDrag() {
  dragging = null;
  controls.enabled = true;
}
renderer.domElement.addEventListener("pointerup", endDrag);
renderer.domElement.addEventListener("pointercancel", endDrag);

// ---- animate ---------------------------------------------------------

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  if (dragging) {
    const b = dragging.body;
    scratch.set(dragTarget.x - b.position.x, dragTarget.y - b.position.y, dragTarget.z - b.position.z);
    scratch.divideScalar(DRAG_FOLLOW_TIME);
    const speed = scratch.length();
    if (speed > DRAG_MAX_SPEED) scratch.multiplyScalar(DRAG_MAX_SPEED / speed);
    b.velocity.set(scratch.x, scratch.y, scratch.z);
  }

  world.step(FIXED_STEP, dt, 5);

  for (const { mesh, body } of links) {
    mesh.position.copy(body.position);
    mesh.quaternion.copy(body.quaternion);
  }

  controls.update();
  renderer.render(scene, camera);
}

window.addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---- controls -----------------------------------------------------------

els.btnReset.addEventListener("click", () => {
  spawnPile();
  els.pickedCard.classList.remove("show");
});
els.btnThrow.addEventListener("click", throwAll);

function buildShareText() {
  return "I just threw a pile of every phone ever made (147 of them, real dimensions) around in physics: https://phonepile.bisks.net/";
}

async function canvasBlob() {
  return new Promise((resolve, reject) => {
    renderer.domElement.toBlob((b) => (b ? resolve(b) : reject(new Error("no blob"))), "image/png");
  });
}

els.btnShare.addEventListener("click", async (e) => {
  e.preventDefault();
  const shareText = buildShareText();
  try {
    const blob = await canvasBlob();
    const file = new File([blob], "phonepile.png", { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], text: shareText, title: "phonepile" });
      return;
    }
  } catch {
    /* fall through to the plain intent link below */
  }
  window.open("https://bsky.app/intent/compose?text=" + encodeURIComponent(shareText), "_blank", "noopener");
});
