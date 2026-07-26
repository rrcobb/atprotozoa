// game.js — grand moot auto, take two. @isolyth.dev said the first cut
// "wasn't even 3D" — fair, it was a top-down canvas. This one is real WebGL:
// three.js chase-cam, extruded buildings, real-time shadow mapping. Fetches
// still happen in lib/cluster.js (copied verbatim from pacmoot — copy, don't
// abstract); this file is the nine-block city, the car physics, the
// pedestrian wander AI, the honk mechanic, and the 3D scene. Still not
// literal GTA 6. Still not 100,000 square kilometers. It is, however,
// actually 3D now.

import * as THREE from "three";
import { moots, getProfiles } from "./lib/cluster.js";

// ---- the entire map (nine whole blocks now, we doubled it) -----------------
const TILE = 4; // world units (meters) per grid tile
const COLS = 22;
const ROWS = 18;
const BLOCKS = [
  { r: 1, c: 1 },
  { r: 1, c: 6 },
  { r: 1, c: 11 },
  { r: 1, c: 16 },
  { r: 7, c: 3 },
  { r: 7, c: 9 },
  { r: 7, c: 14 },
  { r: 13, c: 6 },
  { r: 13, c: 12 },
];

function isBuilding(r, c) {
  if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;
  for (const b of BLOCKS) {
    if (r >= b.r && r < b.r + 3 && c >= b.c && c < b.c + 3) return true;
  }
  return false;
}
function inBounds(r, c) {
  return r >= 0 && r < ROWS && c >= 0 && c < COLS;
}

const OPEN_TILES = [];
for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    if (!isBuilding(r, c)) OPEN_TILES.push({ r, c });
  }
}

const W = COLS * TILE;
const H = ROWS * TILE;
// world-space is centered on the city so the chase cam orbits around (0,0,0)
const worldX = (x) => x - W / 2;
const worldZ = (y) => y - H / 2;

const ROAD_COLS = [];
const ROAD_ROWS = [];
for (let c = 0; c < COLS; c++) {
  if (OPEN_TILES.filter((t) => t.c === c).length === ROWS) ROAD_COLS.push(c);
}
for (let r = 0; r < ROWS; r++) {
  if (OPEN_TILES.filter((t) => t.r === r).length === COLS) ROAD_ROWS.push(r);
}

// ---- shared helpers ---------------------------------------------------------
function hashInt(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}
function hue(str) {
  return hashInt(str) % 360;
}
function imgReady(img) {
  return img && img.complete && img.naturalWidth > 0;
}

// ---- car physics (unchanged shape, scaled to TILE=4 world units) -----------
const CAR_R = 1.1;
const ACCEL = 23;
const BRAKE = 34;
const FRICTION = 16;
const MAX_SPEED = 19.5;
const MAX_REVERSE = -9;
const TURN_RATE = 2.7;
const HONK_RADIUS = 6.2;
const HONK_COOLDOWN = 0.3;
const GAME_SECONDS = 50;
const MAX_MOOTS = 10;
const PED_SPEED = 1.15; // tiles/sec

function closestPointOnRect(cx, cy, rx, ry, rw, rh) {
  return {
    x: Math.max(rx, Math.min(cx, rx + rw)),
    y: Math.max(ry, Math.min(cy, ry + rh)),
  };
}
function circleHitsBuilding(cx, cy, r) {
  const minC = Math.max(0, Math.floor((cx - r) / TILE));
  const maxC = Math.min(COLS - 1, Math.floor((cx + r) / TILE));
  const minR = Math.max(0, Math.floor((cy - r) / TILE));
  const maxR = Math.min(ROWS - 1, Math.floor((cy + r) / TILE));
  for (let tr = minR; tr <= maxR; tr++) {
    for (let tc = minC; tc <= maxC; tc++) {
      if (!isBuilding(tr, tc)) continue;
      const p = closestPointOnRect(cx, cy, tc * TILE, tr * TILE, TILE, TILE);
      if (Math.hypot(cx - p.x, cy - p.y) < r) return true;
    }
  }
  return false;
}
function makeCar() {
  return { x: W / 2, y: H / 2, angle: -Math.PI / 2, speed: 0 };
}
function updateCar(car, dt, keys) {
  if (keys.up) car.speed += ACCEL * dt;
  else if (keys.down) car.speed -= BRAKE * dt;
  else {
    const decel = FRICTION * dt;
    if (car.speed > 0) car.speed = Math.max(0, car.speed - decel);
    else if (car.speed < 0) car.speed = Math.min(0, car.speed + decel);
  }
  car.speed = Math.max(MAX_REVERSE, Math.min(MAX_SPEED, car.speed));

  const turnFactor = Math.min(1, Math.abs(car.speed) / 4.5);
  const dir = car.speed < 0 ? -1 : 1;
  if (keys.left) car.angle -= TURN_RATE * turnFactor * dir * dt;
  if (keys.right) car.angle += TURN_RATE * turnFactor * dir * dt;

  const vx = Math.cos(car.angle) * car.speed;
  const vy = Math.sin(car.angle) * car.speed;
  const nx = car.x + vx * dt;
  const ny = car.y + vy * dt;

  if (!circleHitsBuilding(nx, car.y, CAR_R)) car.x = nx;
  else car.speed *= 0.25;
  if (!circleHitsBuilding(car.x, ny, CAR_R)) car.y = ny;
  else car.speed *= 0.25;

  car.x = Math.max(CAR_R, Math.min(W - CAR_R, car.x));
  car.y = Math.max(CAR_R, Math.min(H - CAR_R, car.y));
}

// ---- pedestrian wander AI (unchanged, tile-based) ---------------------------
const DIRS = [
  { dr: -1, dc: 0 },
  { dr: 1, dc: 0 },
  { dr: 0, dc: -1 },
  { dr: 0, dc: 1 },
];
const ALIGN_EPS = 0.04;
function canStepPed(r, c, dr, dc) {
  const nr = r + dr;
  const nc = c + dc;
  return inBounds(nr, nc) && !isBuilding(nr, nc);
}
function makePedEntity(r, c) {
  return { row: r, col: c, dr: 0, dc: 0 };
}
function stepPed(e, dt, speed) {
  const cr = Math.round(e.row);
  const cc = Math.round(e.col);
  const aligned = Math.abs(e.row - cr) < ALIGN_EPS && Math.abs(e.col - cc) < ALIGN_EPS;
  if (aligned) {
    e.row = cr;
    e.col = cc;
    const opts = DIRS.filter((d) => canStepPed(cr, cc, d.dr, d.dc));
    if (opts.length) {
      const keepGoing = opts.find((d) => d.dr === e.dr && d.dc === e.dc);
      const pick =
        keepGoing && Math.random() < 0.6
          ? keepGoing
          : opts[Math.floor(Math.random() * opts.length)];
      e.dr = pick.dr;
      e.dc = pick.dc;
    } else {
      e.dr = 0;
      e.dc = 0;
    }
  }
  e.row += e.dr * speed * dt;
  e.col += e.dc * speed * dt;
}
function farTile(exclude, minDist) {
  const candidates = OPEN_TILES.filter((t) => {
    for (const e of exclude) {
      if (Math.hypot(e.r - t.r, e.c - t.c) < minDist) return false;
    }
    return true;
  });
  const pool = candidates.length ? candidates : OPEN_TILES;
  return pool[Math.floor(Math.random() * pool.length)];
}

// ---- DOM ---------------------------------------------------------------------
const form = document.getElementById("load-form");
const input = document.getElementById("handle-input");
const loadBtn = document.getElementById("load-btn");
const statusEl = document.getElementById("status");
const gameEl = document.getElementById("game");
const boardMeta = document.getElementById("board-meta");
const scoreEl = document.getElementById("score");
const bestEl = document.getElementById("best");
const timeEl = document.getElementById("time");
const canvas = document.getElementById("board");
const startOverlay = document.getElementById("start-overlay");
const startCopy = document.getElementById("start-copy");
const startBtn = document.getElementById("start-btn");
const overOverlay = document.getElementById("over-overlay");
const overTitle = document.getElementById("over-title");
const overCopy = document.getElementById("over-copy");
const againBtn = document.getElementById("again-btn");
const shareLink = document.getElementById("share-link");
const breakthroughBtn = document.getElementById("breakthrough-btn");
const breakthroughFlash = document.getElementById("breakthrough-flash");
const chipRtx = document.getElementById("chip-rtx");
const chipDlss = document.getElementById("chip-dlss");
const chipFsr = document.getElementById("chip-fsr");

// ---- three.js scene -----------------------------------------------------
const nativeDpr = Math.min(window.devicePixelRatio || 1, 2);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
if ("outputColorSpace" in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;

const BG = new THREE.Color(0x08050c);
const scene = new THREE.Scene();
scene.background = BG;
scene.fog = new THREE.Fog(BG, 30, 95);

const camera = new THREE.PerspectiveCamera(62, 16 / 10, 0.1, 220);

scene.add(new THREE.HemisphereLight(0x6a5aa8, 0x0a0812, 0.7));
const sun = new THREE.DirectionalLight(0xfff2e0, 1.5);
sun.position.set(40, 55, 25);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -70;
sun.shadow.camera.right = 70;
sun.shadow.camera.top = 60;
sun.shadow.camera.bottom = -60;
sun.shadow.camera.near = 5;
sun.shadow.camera.far = 160;
sun.shadow.camera.updateProjectionMatrix();
sun.shadow.bias = -0.0015;
scene.add(sun);
scene.add(sun.target);

const carGlow = new THREE.PointLight(0xff2ea6, 6, 14, 2);
carGlow.position.set(0, 3, 0);
scene.add(carGlow);

// ---- ground: canvas-drawn city map, projected onto a big plane -------------
function buildGroundTexture() {
  const PX = 24;
  const cnv = document.createElement("canvas");
  cnv.width = COLS * PX;
  cnv.height = ROWS * PX;
  const g = cnv.getContext("2d");
  g.fillStyle = "#171223";
  g.fillRect(0, 0, cnv.width, cnv.height);

  g.strokeStyle = "rgba(255, 233, 153, 0.3)";
  g.lineWidth = 3;
  g.setLineDash([16, 14]);
  for (const c of ROAD_COLS) {
    const x = c * PX + PX / 2;
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, cnv.height);
    g.stroke();
  }
  for (const r of ROAD_ROWS) {
    const y = r * PX + PX / 2;
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(cnv.width, y);
    g.stroke();
  }
  g.setLineDash([]);

  for (const b of BLOCKS) {
    const h = hue(`${b.r * 31 + b.c}`);
    g.fillStyle = `hsl(${h} 30% 10%)`;
    g.fillRect(b.c * PX, b.r * PX, 3 * PX, 3 * PX);
  }

  const tex = new THREE.CanvasTexture(cnv);
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(W, H),
  new THREE.MeshStandardMaterial({ map: buildGroundTexture(), roughness: 0.95, metalness: 0.02 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// ---- buildings: extruded boxes with a repeating "hyper realistic" window map
function buildWindowTexture() {
  const cnv = document.createElement("canvas");
  cnv.width = cnv.height = 64;
  const g = cnv.getContext("2d");
  g.fillStyle = "#0b0714";
  g.fillRect(0, 0, 64, 64);
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (Math.random() < 0.32) continue;
      g.fillStyle = Math.random() < 0.15 ? "#ff8b7f" : "rgba(255, 233, 190, 0.85)";
      g.fillRect(c * 8 + 1, r * 8 + 1, 5, 5);
    }
  }
  const tex = new THREE.CanvasTexture(cnv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}
const windowTexBase = buildWindowTexture();

const buildingGeo = new THREE.BoxGeometry(1, 1, 1);
for (const b of BLOCKS) {
  const seed = `${b.r}-${b.c}`;
  const h = 6 + (hashInt(seed) % 11); // 6..16 tall
  const size = 3 * TILE - 0.6;
  const tex = windowTexBase.clone();
  tex.needsUpdate = true;
  tex.repeat.set(3, Math.max(1, Math.round(h / 2.2)));
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    emissiveMap: tex,
    emissive: new THREE.Color(0x12101c),
    emissiveIntensity: 0.55,
    color: new THREE.Color().setHSL(hue(seed) / 360, 0.28, 0.42),
    roughness: 0.6,
    metalness: 0.15,
  });
  const mesh = new THREE.Mesh(buildingGeo, mat);
  mesh.scale.set(size, h, size);
  mesh.position.set(worldX(b.c * TILE + 1.5 * TILE), h / 2, worldZ(b.r * TILE + 1.5 * TILE));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);

  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(buildingGeo),
    new THREE.LineBasicMaterial({ color: 0x34e0d8, transparent: true, opacity: 0.35 }),
  );
  edges.scale.copy(mesh.scale);
  edges.position.copy(mesh.position);
  scene.add(edges);
}

// ---- the player's car --------------------------------------------------
function buildCarGroup(bodyHue) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color().setHSL(bodyHue / 360, 0.55, 0.55),
    roughness: 0.35,
    metalness: 0.4,
  });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.8, 1.4), bodyMat);
  body.position.y = 0.55;
  body.castShadow = true;
  group.add(body);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.55, 1.15), bodyMat);
  cabin.position.set(-0.1, 1.05, 0);
  cabin.castShadow = true;
  group.add(cabin);

  const headlight = new THREE.MeshStandardMaterial({ color: 0xffe999, emissive: 0xffe999, emissiveIntensity: 1.5 });
  const taillight = new THREE.MeshStandardMaterial({ color: 0xff2ea6, emissive: 0xff2ea6, emissiveIntensity: 1.5 });
  for (const sign of [-1, 1]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 0.3), headlight);
    hl.position.set(1.21, 0.5, sign * 0.5);
    group.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 0.3), taillight);
    tl.position.set(-1.21, 0.5, sign * 0.5);
    group.add(tl);
  }
  return group;
}
let carGroup = buildCarGroup(300);
scene.add(carGroup);

// ---- avatar sprites (canvas circle -> billboard) ------------------------
function drawAvatarCanvas(ctx, size, { img, hue: h, initial }) {
  ctx.clearRect(0, 0, size, size);
  ctx.save();
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
  ctx.clip();
  if (imgReady(img)) {
    ctx.drawImage(img, 0, 0, size, size);
  } else {
    ctx.fillStyle = `hsl(${h} 55% 42%)`;
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.font = `${Math.round(size * 0.5)}px ui-monospace, monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(initial || "?", size / 2, size / 2 + 2);
  }
  ctx.restore();
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = 3;
  ctx.stroke();
}
function makeAvatarSprite({ url, hue: h, initial }) {
  const size = 96;
  const cnv = document.createElement("canvas");
  cnv.width = cnv.height = size;
  const ctx = cnv.getContext("2d");
  drawAvatarCanvas(ctx, size, { img: null, hue: h, initial });
  const texture = new THREE.CanvasTexture(cnv);
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1.7, 1.7, 1);
  if (url) {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      drawAvatarCanvas(ctx, size, { img, hue: h, initial });
      texture.needsUpdate = true;
    };
    img.src = url;
  }
  return sprite;
}
function disposeSprite(sprite) {
  if (!sprite) return;
  scene.remove(sprite);
  sprite.material.map?.dispose();
  sprite.material.dispose();
}

// ---- honk rings + floating "+1 @handle" text, as real 3D objects ----------
const ringGeo = new THREE.RingGeometry(0.85, 1, 40);
ringGeo.rotateX(-Math.PI / 2);
let honkRings = [];
function spawnHonkRing(x, z) {
  const mat = new THREE.MeshBasicMaterial({ color: 0x34e0d8, transparent: true, opacity: 1, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(ringGeo, mat);
  mesh.position.set(x, 0.06, z);
  scene.add(mesh);
  honkRings.push({ mesh, life: 1 });
}
let particles = [];
function spawnParticle(text, x, z) {
  const cnv = document.createElement("canvas");
  cnv.width = 256;
  cnv.height = 64;
  const g = cnv.getContext("2d");
  g.font = "700 34px ui-monospace, monospace";
  g.fillStyle = "#34e0d8";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, 128, 32);
  const texture = new THREE.CanvasTexture(cnv);
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(3.2, 0.8, 1);
  sprite.position.set(x, 1.6, z);
  scene.add(sprite);
  particles.push({ sprite, life: 1 });
}

// ---- game state ------------------------------------------------------------
let cluster = null;
let car = null;
let playerHue = 0;
let playerInitial = "?";
let playerSprite = null;
let peds = []; // { entity, sprite, handle, speedMul, bobSeed }
let running = false;
let score = 0;
let timeLeft = GAME_SECONDS;
let rafId = null;
let lastT = 0;
let clock = 0;
let honkCooldown = 0;
let breakthroughUsed = false;
let breakthroughTimeLeft = 0;

const keys = { up: false, down: false, left: false, right: false };

// ---- fake graphics settings — two of the three are real now ---------------
const gfx = { rtx: true, dlss: true, fsr: true };
function applyFilters() {
  if (canvas.classList.contains("breakthrough")) return;
  const filters = [];
  if (gfx.fsr) filters.push("contrast(1.05)", "hue-rotate(-2deg)");
  canvas.style.filter = filters.join(" ");
}
function applyGfx() {
  sun.castShadow = gfx.rtx;
  handleResize();
  applyFilters();
}
function toggleChip(key, chipEl, onLabel) {
  gfx[key] = !gfx[key];
  chipEl.classList.toggle("on", gfx[key]);
  chipEl.textContent = gfx[key] ? onLabel : onLabel.split(" ")[0] + " OFF";
  applyGfx();
}
chipRtx.addEventListener("click", () => toggleChip("rtx", chipRtx, "RTX ON"));
chipDlss.addEventListener("click", () => toggleChip("dlss", chipDlss, "DLSS 5"));
chipFsr.addEventListener("click", () => toggleChip("fsr", chipFsr, "FSR 4"));

function doBreakthrough() {
  if (breakthroughUsed || !running) return;
  breakthroughUsed = true;
  breakthroughTimeLeft = 2.5;
  breakthroughBtn.disabled = true;
  canvas.classList.add("breakthrough");
  breakthroughFlash.classList.add("show");
}
breakthroughBtn.addEventListener("click", doBreakthrough);

// ---- input --------------------------------------------------------------
const KEY_MAP = {
  ArrowUp: "up", w: "up", W: "up",
  ArrowDown: "down", s: "down", S: "down",
  ArrowLeft: "left", a: "left", A: "left",
  ArrowRight: "right", d: "right", D: "right",
};
window.addEventListener("keydown", (e) => {
  if (e.key === " ") {
    if (running) { e.preventDefault(); doHonk(); }
    return;
  }
  const k = KEY_MAP[e.key];
  if (!k || !running) return;
  e.preventDefault();
  keys[k] = true;
});
window.addEventListener("keyup", (e) => {
  const k = KEY_MAP[e.key];
  if (!k) return;
  keys[k] = false;
});
for (const [id, k] of [
  ["t-up", "up"], ["t-down", "down"], ["t-left", "left"], ["t-right", "right"],
]) {
  const btn = document.getElementById(id);
  btn.addEventListener("pointerdown", (e) => { e.preventDefault(); keys[k] = true; });
  btn.addEventListener("pointerup", (e) => { e.preventDefault(); keys[k] = false; });
  btn.addEventListener("pointerleave", () => { keys[k] = false; });
}
document.getElementById("t-honk").addEventListener("pointerdown", (e) => {
  e.preventDefault();
  if (running) doHonk();
});

function doHonk() {
  if (honkCooldown > 0) return;
  honkCooldown = HONK_COOLDOWN;
  spawnHonkRing(worldX(car.x), worldZ(car.y));
  for (const p of peds) {
    const px = p.entity.col * TILE + TILE / 2;
    const py = p.entity.row * TILE + TILE / 2;
    if (Math.hypot(px - car.x, py - car.y) < HONK_RADIUS) {
      const gain = breakthroughTimeLeft > 0 ? 2 : 1;
      score += gain;
      scoreEl.textContent = String(score);
      spawnParticle(`+${gain} @${p.handle}`, worldX(px), worldZ(py));
      const exclude = [{ r: Math.round(car.y / TILE), c: Math.round(car.x / TILE) }];
      for (const other of peds) {
        if (other !== p) exclude.push({ r: Math.round(other.entity.row), c: Math.round(other.entity.col) });
      }
      const t = farTile(exclude, 4);
      p.entity.row = t.r;
      p.entity.col = t.c;
      p.entity.dr = 0;
      p.entity.dc = 0;
    }
  }
}

// ---- state helpers -----------------------------------------------------
function setStatus(msg, isError) {
  statusEl.textContent = msg || "";
  statusEl.classList.toggle("error", !!isError);
}
function bestKey(did) {
  return `grandmootauto:best:${did}`;
}
function getBest(did) {
  return parseInt(localStorage.getItem(bestKey(did)) || "0", 10) || 0;
}
function setBest(did, v) {
  try { localStorage.setItem(bestKey(did), String(v)); } catch {}
}

function clearTransient() {
  for (const p of particles) disposeSprite(p.sprite);
  particles = [];
  for (const r of honkRings) { scene.remove(r.mesh); r.mesh.material.dispose(); }
  honkRings = [];
}

function resetPositions() {
  car = makeCar();
  for (const p of peds) {
    const t = farTile([{ r: Math.round(car.y / TILE), c: Math.round(car.x / TILE) }], 3);
    p.entity.row = t.r;
    p.entity.col = t.c;
    p.entity.dr = 0;
    p.entity.dc = 0;
  }
  clearTransient();
  honkCooldown = 0;
  breakthroughUsed = false;
  breakthroughTimeLeft = 0;
  breakthroughBtn.disabled = false;
  canvas.classList.remove("breakthrough");
  breakthroughFlash.classList.remove("show");
  applyFilters();
  keys.up = keys.down = keys.left = keys.right = false;
}

// ---- render / camera -----------------------------------------------------
function syncScene(dt) {
  carGroup.position.set(worldX(car.x), 0, worldZ(car.y));
  carGroup.rotation.y = -car.angle;
  carGlow.position.set(worldX(car.x), 2.6, worldZ(car.y));

  if (playerSprite) {
    playerSprite.position.set(worldX(car.x), 2.15, worldZ(car.y));
  }

  for (const p of peds) {
    const px = worldX(p.entity.col * TILE + TILE / 2);
    const pz = worldZ(p.entity.row * TILE + TILE / 2);
    const bob = Math.sin(clock * 4 + p.bobSeed) * 0.06;
    p.sprite.position.set(px, 1.15 + bob, pz);
  }

  for (const r of honkRings) {
    const radius = HONK_RADIUS * (1 - r.life) + 0.6;
    r.mesh.scale.setScalar(radius);
    r.mesh.material.opacity = Math.max(0, r.life);
  }
  for (const p of particles) {
    p.sprite.position.y += dt * 1.5;
    p.sprite.material.opacity = Math.max(0, p.life);
  }

  const forward = { x: Math.cos(car.angle), z: Math.sin(car.angle) };
  const carPos = new THREE.Vector3(worldX(car.x), 0.7, worldZ(car.y));
  const desired = carPos.clone()
    .addScaledVector(new THREE.Vector3(forward.x, 0, forward.z), -7.5)
    .add(new THREE.Vector3(0, 4.4, 0));
  camera.position.lerp(desired, Math.min(1, dt * 5));
  const lookTarget = carPos.clone().addScaledVector(new THREE.Vector3(forward.x, 0, forward.z), 4);
  lookTarget.y += 0.6;
  camera.lookAt(lookTarget);
  sun.target.position.copy(carPos);
}

function update(dt) {
  updateCar(car, dt, keys);
  for (const p of peds) stepPed(p.entity, dt, PED_SPEED * p.speedMul);
  if (honkCooldown > 0) honkCooldown -= dt;

  for (const p of particles) p.life -= dt * 0.7;
  const deadParticles = particles.filter((p) => p.life <= 0);
  for (const p of deadParticles) disposeSprite(p.sprite);
  particles = particles.filter((p) => p.life > 0);

  for (const r of honkRings) r.life -= dt * 2.2;
  const deadRings = honkRings.filter((r) => r.life <= 0);
  for (const r of deadRings) { scene.remove(r.mesh); r.mesh.material.dispose(); }
  honkRings = honkRings.filter((r) => r.life > 0);

  if (breakthroughTimeLeft > 0) {
    breakthroughTimeLeft -= dt;
    if (breakthroughTimeLeft <= 0) {
      canvas.classList.remove("breakthrough");
      breakthroughFlash.classList.remove("show");
      applyFilters();
    }
  }

  timeLeft -= dt;
  if (timeLeft <= 0) {
    timeLeft = 0;
    endGame();
  }
  timeEl.textContent = String(Math.ceil(timeLeft));
}

function loop(t) {
  if (!running) return;
  const dt = Math.min((t - lastT) / 1000, 0.05) || 0;
  lastT = t;
  clock += dt;
  update(dt);
  syncScene(dt);
  renderer.render(scene, camera);
  rafId = requestAnimationFrame(loop);
}

function endGame() {
  running = false;
  cancelAnimationFrame(rafId);
  canvas.classList.remove("breakthrough");
  breakthroughFlash.classList.remove("show");
  applyFilters();
  const best = getBest(cluster.did);
  const newBest = score > best;
  if (newBest) setBest(cluster.did, score);
  bestEl.textContent = String(newBest ? score : best);
  overTitle.textContent = "time!";
  overCopy.textContent = newBest
    ? `recruited ${score} moots — new best. the shadows were real the whole time.`
    : `recruited ${score} moots. best is still ${best}.`;
  const shareText = `just recruited ${score} of my moots in grand moot auto — now with actual WebGL 3D and real-time shadows. still not literally GTA 6. https://grand-moot-auto.bisks.net`;
  shareLink.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(shareText);
  overOverlay.classList.remove("hidden");
}

function startGame() {
  score = 0;
  timeLeft = GAME_SECONDS;
  scoreEl.textContent = "0";
  timeEl.textContent = String(GAME_SECONDS);
  resetPositions();
  syncScene(0);
  startOverlay.classList.add("hidden");
  overOverlay.classList.add("hidden");
  running = true;
  lastT = performance.now();
  rafId = requestAnimationFrame(loop);
}
startBtn.addEventListener("click", startGame);
againBtn.addEventListener("click", startGame);

// ---- resize --------------------------------------------------------------
function handleResize() {
  const w = canvas.clientWidth || canvas.parentElement.clientWidth || 640;
  const h = canvas.clientHeight || Math.round((w * 10) / 16);
  const dlssScale = gfx.dlss ? 0.6 : 1;
  renderer.setPixelRatio(nativeDpr * dlssScale);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", handleResize);

// ---- loading a network ----------------------------------------------------
async function loadNetwork(actor) {
  running = false;
  if (rafId) cancelAnimationFrame(rafId);
  gameEl.hidden = true;
  loadBtn.disabled = true;
  setStatus("resolving handle…");

  let c;
  try {
    c = await moots(actor, { onStep: (s) => setStatus(s) });
  } catch (e) {
    setStatus(`couldn't load that: ${e.message}`, true);
    loadBtn.disabled = false;
    return;
  }

  if (!c.pool.length) {
    setStatus("no moots or follows to populate the city with.", true);
    loadBtn.disabled = false;
    return;
  }

  cluster = c;
  const picked = c.pool.slice().sort(() => Math.random() - 0.5).slice(0, MAX_MOOTS);

  setStatus("loading avatars…");
  const profiles = await getProfiles([c.did, ...picked.map((p) => p.did)]);
  const byDid = new Map(profiles.map((p) => [p.did, p]));

  const selfFull = byDid.get(c.did) || {};
  playerHue = hue(c.did);
  playerInitial = (selfFull.displayName || c.handle || "?")[0].toUpperCase();

  disposeSprite(playerSprite);
  playerSprite = makeAvatarSprite({ url: selfFull.avatar || c.self.avatar, hue: playerHue, initial: playerInitial });
  scene.add(playerSprite);

  scene.remove(carGroup);
  carGroup.traverse((o) => { if (o.material) o.material.dispose?.(); if (o.geometry) o.geometry.dispose?.(); });
  carGroup = buildCarGroup(playerHue);
  scene.add(carGroup);

  for (const p of peds) disposeSprite(p.sprite);
  car = makeCar();
  peds = picked.map((p) => {
    const full = byDid.get(p.did) || {};
    const h = hue(p.did);
    const initial = (full.displayName || p.handle || "?")[0].toUpperCase();
    return {
      entity: makePedEntity(1, 1),
      sprite: (() => {
        const s = makeAvatarSprite({ url: full.avatar || p.avatar, hue: h, initial });
        scene.add(s);
        return s;
      })(),
      handle: p.handle,
      speedMul: 0.8 + (hashInt(p.did) % 40) / 100,
      bobSeed: hashInt(p.did) % 100,
    };
  });
  resetPositions();
  syncScene(0);

  boardMeta.textContent = `${c.kind} · ${picked.length} of ${c.counts.pool} roaming the map`;
  bestEl.textContent = String(getBest(c.did));
  startCopy.textContent = `you're @${c.handle}. ${picked.length} moots are somewhere out there, minding their business.`;
  startOverlay.classList.remove("hidden");
  overOverlay.classList.add("hidden");
  gameEl.hidden = false;
  loadBtn.disabled = false;
  setStatus("");
  handleResize();
  renderer.render(scene, camera);
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const actor = input.value.trim();
  if (!actor) return;
  loadNetwork(actor);
});

if (input.value.trim()) loadNetwork(input.value.trim());
