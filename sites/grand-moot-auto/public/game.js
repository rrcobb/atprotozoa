// game.js — grand moot auto, take three. @isolyth.dev's punch list from the
// thread: spawns in a building (real bug, fixed below), no PBR/raytracing
// (added a real bloom pass, tied honestly to the RTX toggle), no way to get
// out of the car (E toggles walk mode), no cops (there's a wanted meter and
// a patrol car now), no strip club / blimp / helicopter / planes (all four
// are in the city now, as decor). Fetches still happen in lib/cluster.js
// (copied verbatim from pacmoot — copy, don't abstract). Still not literal
// GTA 6. Still not 100,000 square kilometers. It is, however, actually
// trying now.

import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { moots, getProfiles } from "./lib/cluster.js";

// ---- the entire map (nine whole blocks, one of them is a strip club) ------
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
const CLUB_BLOCK = BLOCKS[5]; // { r: 7, c: 9 } — the one right at map center

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

// every road/road intersection — cops patrol between these, cars always spawn on one
const INTERSECTIONS = [];
for (const r of ROAD_ROWS) for (const c of ROAD_COLS) INTERSECTIONS.push({ r, c });

// nearest road intersection to map center: this used to be W/2,H/2 flat out,
// which — @isolyth.dev was right — sat inside the block at r7/c9. fixed.
const SPAWN = (() => {
  const midR = ROWS / 2;
  const midC = COLS / 2;
  const r = ROAD_ROWS.reduce((a, b) => (Math.abs(b - midR) < Math.abs(a - midR) ? b : a));
  const c = ROAD_COLS.reduce((a, b) => (Math.abs(b - midC) < Math.abs(a - midC) ? b : a));
  return { x: c * TILE + TILE / 2, y: r * TILE + TILE / 2 };
})();

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

// ---- car physics -------------------------------------------------------
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

// ---- getting out of the car ---------------------------------------------
const WALK_SPEED = 3.4;
const WALK_R = 0.45;
const WAVE_RADIUS = 3.4;
const REENTER_RADIUS = 3.2;

// ---- cops ----------------------------------------------------------------
const COP_PATROL_SPEED = 6.2;
const COP_CHASE_SPEED = 10.8;
const WANTED_PER_HONK = 1.4;
const WANTED_DECAY = 0.55; // per second
const WANTED_CHASE_AT = 4.5;
const BUST_RADIUS = 1.75;
const BUST_INVULN = 2.4;

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
  return { x: SPAWN.x, y: SPAWN.y, angle: -Math.PI / 2, speed: 0 };
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

// ---- walking (out of the car) -------------------------------------------
function makeWalker() {
  return { x: SPAWN.x, y: SPAWN.y, angle: -Math.PI / 2 };
}
function updateWalker(w, dt, keys) {
  let dx = 0;
  let dz = 0;
  if (keys.up) dz -= 1;
  if (keys.down) dz += 1;
  if (keys.left) dx -= 1;
  if (keys.right) dx += 1;
  if (!dx && !dz) return;
  const len = Math.hypot(dx, dz);
  dx /= len;
  dz /= len;
  w.angle = Math.atan2(dz, dx);
  const nx = w.x + dx * WALK_SPEED * dt;
  const nz = w.y + dz * WALK_SPEED * dt;
  if (!circleHitsBuilding(nx, w.y, WALK_R)) w.x = nx;
  if (!circleHitsBuilding(w.x, nz, WALK_R)) w.y = nz;
  w.x = Math.max(WALK_R, Math.min(W - WALK_R, w.x));
  w.y = Math.max(WALK_R, Math.min(H - WALK_R, w.y));
}

// ---- cop AI: patrol between road intersections, chase when wanted is high
function pickIntersection() {
  return INTERSECTIONS[Math.floor(Math.random() * INTERSECTIONS.length)];
}
function makeCop() {
  const start = pickIntersection();
  return {
    x: start.c * TILE + TILE / 2,
    y: start.r * TILE + TILE / 2,
    angle: 0,
    mode: "patrol",
    target: pickIntersection(),
    invuln: 0,
  };
}
function updateCop(cop, dt, targetX, targetY, chasing) {
  cop.mode = chasing ? "chase" : "patrol";
  let tx;
  let ty;
  if (chasing) {
    tx = targetX;
    ty = targetY;
  } else {
    tx = cop.target.c * TILE + TILE / 2;
    ty = cop.target.r * TILE + TILE / 2;
    const dist = Math.hypot(tx - cop.x, ty - cop.y);
    if (dist < 0.3) cop.target = pickIntersection();
  }
  const dx = tx - cop.x;
  const dy = ty - cop.y;
  const dist = Math.hypot(dx, dy);
  if (dist > 0.02) {
    cop.angle = Math.atan2(dy, dx);
    const spd = chasing ? COP_CHASE_SPEED : COP_PATROL_SPEED;
    const step = Math.min(dist, spd * dt);
    cop.x += (dx / dist) * step;
    cop.y += (dy / dist) * step;
  }
  if (cop.invuln > 0) cop.invuln -= dt;
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
if (window.attachHandleTypeahead) window.attachHandleTypeahead(input);
const loadBtn = document.getElementById("load-btn");
const statusEl = document.getElementById("status");
const gameEl = document.getElementById("game");
const boardMeta = document.getElementById("board-meta");
const scoreEl = document.getElementById("score");
const bestEl = document.getElementById("best");
const timeEl = document.getElementById("time");
const heatEl = document.getElementById("heat");
const modeEl = document.getElementById("mode-indicator");
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
const bustedFlash = document.getElementById("busted-flash");
const chipRtx = document.getElementById("chip-rtx");
const chipDlss = document.getElementById("chip-dlss");
const chipFsr = document.getElementById("chip-fsr");

// ---- three.js scene -----------------------------------------------------
// perf note: this used to run antialias:true (wasted — EffectComposer's final
// pass is a full-screen blit, native MSAA on the canvas buys almost nothing
// there) alongside a 2048px soft shadow map and a full-res bloom mip chain, at
// up to 2x device pixel ratio. On a weaker/mobile GPU that combo is enough to
// trip a driver timeout (TDR), which on Chromium kills the shared GPU process
// — and every other tab's WebGL context with it. Trimmed all four below.
const nativeDpr = Math.min(window.devicePixelRatio || 1, 1.5);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
if ("outputColorSpace" in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;

const BG = new THREE.Color(0x08050c);
const scene = new THREE.Scene();
scene.background = BG;
scene.fog = new THREE.Fog(BG, 30, 95);

const camera = new THREE.PerspectiveCamera(62, 16 / 10, 0.1, 220);

// a real (if small) post-processing pipeline: bloom on emissive surfaces —
// neon signs, headlights, the club marquee — honestly tied to the RTX chip.
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.85, 0.65, 0.18);
composer.addPass(bloomPass);

scene.add(new THREE.HemisphereLight(0x6a5aa8, 0x0a0812, 0.7));
const sun = new THREE.DirectionalLight(0xfff2e0, 1.5);
sun.position.set(40, 55, 25);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
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
  const isClub = b === CLUB_BLOCK;
  const h = isClub ? 5 : 6 + (hashInt(seed) % 11); // 6..16 tall, club is squat
  const size = 3 * TILE - 0.6;
  const tex = windowTexBase.clone();
  tex.needsUpdate = true;
  tex.repeat.set(3, Math.max(1, Math.round(h / 2.2)));
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    emissiveMap: tex,
    emissive: new THREE.Color(isClub ? 0xff2ea6 : 0x12101c),
    emissiveIntensity: isClub ? 0.9 : 0.55,
    color: new THREE.Color().setHSL(hue(seed) / 360, isClub ? 0.6 : 0.28, isClub ? 0.25 : 0.42),
    roughness: isClub ? 0.4 : 0.6,
    metalness: isClub ? 0.35 : 0.15,
  });
  const mesh = new THREE.Mesh(buildingGeo, mat);
  mesh.scale.set(size, h, size);
  mesh.position.set(worldX(b.c * TILE + 1.5 * TILE), h / 2, worldZ(b.r * TILE + 1.5 * TILE));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);

  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(buildingGeo),
    new THREE.LineBasicMaterial({ color: isClub ? 0xff2ea6 : 0x34e0d8, transparent: true, opacity: 0.35 }),
  );
  edges.scale.copy(mesh.scale);
  edges.position.copy(mesh.position);
  scene.add(edges);

  if (isClub) {
    // the marquee — a glowing sign + pink light. this is the strip club.
    const signCnv = document.createElement("canvas");
    signCnv.width = 256;
    signCnv.height = 64;
    const sg = signCnv.getContext("2d");
    sg.fillStyle = "#1a0212";
    sg.fillRect(0, 0, 256, 64);
    sg.font = "700 34px ui-monospace, monospace";
    sg.fillStyle = "#ff6fc7";
    sg.textAlign = "center";
    sg.textBaseline = "middle";
    sg.fillText("MOOT CLUB", 128, 32);
    const signTex = new THREE.CanvasTexture(signCnv);
    const signMat = new THREE.SpriteMaterial({ map: signTex, transparent: true, depthWrite: false });
    const sign = new THREE.Sprite(signMat);
    sign.scale.set(6, 1.5, 1);
    sign.position.set(mesh.position.x, h + 1.4, mesh.position.z);
    scene.add(sign);
    const clubLight = new THREE.PointLight(0xff2ea6, 8, 16, 2);
    clubLight.position.set(mesh.position.x, h + 1.4, mesh.position.z);
    scene.add(clubLight);
  }
}

// ---- flyovers: blimp, helicopter (with a spotlight), and a distant plane --
const cityCenter = new THREE.Vector3(0, 0, 0);
const cityRadius = Math.max(W, H) * 0.62;

const blimpGroup = new THREE.Group();
const blimpBody = new THREE.Mesh(
  new THREE.SphereGeometry(3.6, 16, 12),
  new THREE.MeshStandardMaterial({ color: 0x3a3348, roughness: 0.6, metalness: 0.1 }),
);
blimpBody.scale.set(1, 0.55, 0.55);
blimpBody.castShadow = true;
blimpGroup.add(blimpBody);
function bannerTexture(text) {
  const cnv = document.createElement("canvas");
  cnv.width = 512;
  cnv.height = 64;
  const g = cnv.getContext("2d");
  g.fillStyle = "#ff2ea6";
  g.fillRect(0, 0, 512, 64);
  g.font = "700 30px ui-monospace, monospace";
  g.fillStyle = "#08050c";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, 256, 32);
  return new THREE.CanvasTexture(cnv);
}
const banner = new THREE.Mesh(
  new THREE.PlaneGeometry(9, 1.3),
  new THREE.MeshBasicMaterial({ map: bannerTexture("GRAND MOOT AUTO"), side: THREE.DoubleSide }),
);
banner.position.set(-5.2, -1.4, 0);
blimpGroup.add(banner);
scene.add(blimpGroup);

const heliGroup = new THREE.Group();
const heliBody = new THREE.Mesh(
  new THREE.BoxGeometry(1.4, 0.7, 0.8),
  new THREE.MeshStandardMaterial({ color: 0x1c2230, roughness: 0.45, metalness: 0.4 }),
);
heliBody.castShadow = true;
heliGroup.add(heliBody);
const rotor = new THREE.Mesh(
  new THREE.BoxGeometry(3.6, 0.05, 0.12),
  new THREE.MeshStandardMaterial({ color: 0x0c0e14, roughness: 0.5 }),
);
rotor.position.y = 0.5;
heliGroup.add(rotor);
const heliSpot = new THREE.SpotLight(0xdfefff, 12, 40, Math.PI / 8, 0.4, 1.2);
heliSpot.position.set(0, 0, 0);
heliGroup.add(heliSpot);
heliSpot.target.position.set(0, -17, 0); // straight down in local space, unaffected by yaw
heliGroup.add(heliSpot.target);
scene.add(heliGroup);

const planeGroup = new THREE.Group();
const planeBody = new THREE.Mesh(
  new THREE.ConeGeometry(0.4, 2.2, 6),
  new THREE.MeshStandardMaterial({ color: 0x30364a, roughness: 0.5, metalness: 0.3 }),
);
planeBody.rotation.z = Math.PI / 2;
planeGroup.add(planeBody);
const planeLight = new THREE.PointLight(0xff5555, 3, 6);
planeLight.position.set(-1.1, 0, 0);
planeGroup.add(planeLight);
scene.add(planeGroup);
let planeT = -1; // -1 while off-screen waiting to re-launch

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

// ---- the cop car: same shape, blue/red light bar on the roof --------------
function buildCopGroup() {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x0d1a3a, roughness: 0.3, metalness: 0.5 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.8, 1.4), bodyMat);
  body.position.y = 0.55;
  body.castShadow = true;
  group.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.55, 1.15), new THREE.MeshStandardMaterial({ color: 0xeaeaf2, roughness: 0.4 }));
  cabin.position.set(-0.1, 1.05, 0);
  cabin.castShadow = true;
  group.add(cabin);
  const barMat = new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xff2222, emissiveIntensity: 2 });
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.18, 0.5), barMat);
  bar.position.set(-0.1, 1.42, 0);
  group.add(bar);
  return { group, barMat };
}
const copVisual = buildCopGroup();
scene.add(copVisual.group);
copVisual.group.visible = false;

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
function spawnHonkRing(x, z, color) {
  const mat = new THREE.MeshBasicMaterial({ color: color ?? 0x34e0d8, transparent: true, opacity: 1, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(ringGeo, mat);
  mesh.position.set(x, 0.06, z);
  scene.add(mesh);
  honkRings.push({ mesh, life: 1 });
}
let particles = [];
function spawnParticle(text, x, z, color) {
  const cnv = document.createElement("canvas");
  cnv.width = 256;
  cnv.height = 64;
  const g = cnv.getContext("2d");
  g.font = "700 34px ui-monospace, monospace";
  g.fillStyle = color ?? "#34e0d8";
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
let walker = null;
let mode = "drive"; // "drive" | "walk"
let cop = null;
let wanted = 0;
let bustFlashT = 0;
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

function actorPos() {
  return mode === "drive" ? { x: car.x, y: car.y } : { x: walker.x, y: walker.y };
}

// ---- fake graphics settings — most of them are real now -------------------
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

// ---- get out of the car ---------------------------------------------------
function toggleMode() {
  if (!running) return;
  if (mode === "drive") {
    mode = "walk";
    walker.x = car.x + Math.cos(car.angle + Math.PI / 2) * 1.6;
    walker.y = car.y + Math.sin(car.angle + Math.PI / 2) * 1.6;
    walker.angle = car.angle;
    setStatus("on foot — walk up to the car and press E to get back in.");
  } else {
    const dist = Math.hypot(walker.x - car.x, walker.y - car.y);
    if (dist > REENTER_RADIUS) {
      setStatus("too far from the car.", true);
      return;
    }
    mode = "drive";
    setStatus("");
  }
  modeEl.textContent = mode === "drive" ? "driving" : "on foot";
}

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
  if (e.key === "e" || e.key === "E") {
    if (running) { e.preventDefault(); toggleMode(); }
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
document.getElementById("t-exit").addEventListener("pointerdown", (e) => {
  e.preventDefault();
  if (running) toggleMode();
});

function doHonk() {
  if (honkCooldown > 0) return;
  honkCooldown = HONK_COOLDOWN;
  const { x: ax, y: ay } = actorPos();
  const radius = mode === "drive" ? HONK_RADIUS : WAVE_RADIUS;
  spawnHonkRing(worldX(ax), worldZ(ay));
  if (mode === "drive") wanted = Math.min(10, wanted + WANTED_PER_HONK);
  for (const p of peds) {
    const px = p.entity.col * TILE + TILE / 2;
    const py = p.entity.row * TILE + TILE / 2;
    if (Math.hypot(px - ax, py - ay) < radius) {
      const gain = breakthroughTimeLeft > 0 ? 2 : 1;
      score += gain;
      scoreEl.textContent = String(score);
      spawnParticle(`+${gain} @${p.handle}`, worldX(px), worldZ(py));
      const exclude = [{ r: Math.round(ay / TILE), c: Math.round(ax / TILE) }];
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
  walker = makeWalker();
  mode = "drive";
  modeEl.textContent = "driving";
  cop = makeCop();
  wanted = 0;
  bustFlashT = 0;
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
  bustedFlash.classList.remove("show");
  applyFilters();
  keys.up = keys.down = keys.left = keys.right = false;
}

// ---- render / camera -----------------------------------------------------
function syncScene(dt) {
  carGroup.position.set(worldX(car.x), 0, worldZ(car.y));
  carGroup.rotation.y = -car.angle;
  carGroup.visible = true;

  const actorDriving = mode === "drive";
  const { x: ax, y: ay } = actorPos();
  const actorAngle = actorDriving ? car.angle : walker.angle;

  carGlow.position.set(worldX(car.x), 2.6, worldZ(car.y));

  if (playerSprite) {
    const bob = actorDriving ? 0 : Math.sin(clock * 6) * 0.05;
    const height = actorDriving ? 2.15 : 1.2 + bob;
    playerSprite.position.set(worldX(ax), height, worldZ(ay));
    playerSprite.visible = true;
  }

  for (const p of peds) {
    const px = worldX(p.entity.col * TILE + TILE / 2);
    const pz = worldZ(p.entity.row * TILE + TILE / 2);
    const bob = Math.sin(clock * 4 + p.bobSeed) * 0.06;
    p.sprite.position.set(px, 1.15 + bob, pz);
  }

  // cop car + light bar
  copVisual.group.visible = true;
  copVisual.group.position.set(worldX(cop.x), 0, worldZ(cop.y));
  copVisual.group.rotation.y = -cop.angle;
  const flash = cop.mode === "chase" ? Math.sin(clock * 14) : Math.sin(clock * 5);
  copVisual.barMat.color.setHex(flash > 0 ? 0xff2222 : 0x2244ff);
  copVisual.barMat.emissive.setHex(flash > 0 ? 0xff2222 : 0x2244ff);

  // flyovers
  const blimpAngle = clock * 0.05;
  blimpGroup.position.set(
    Math.cos(blimpAngle) * cityRadius * 0.8,
    26 + Math.sin(clock * 0.2) * 1.5,
    Math.sin(blimpAngle) * cityRadius * 0.8,
  );
  blimpGroup.rotation.y = -blimpAngle - Math.PI / 2;

  const heliAngle = clock * 0.35;
  const heliPos = new THREE.Vector3(Math.cos(heliAngle) * cityRadius * 0.45, 17, Math.sin(heliAngle) * cityRadius * 0.45);
  heliGroup.position.copy(heliPos);
  heliGroup.rotation.y = -heliAngle - Math.PI / 2;
  rotor.rotation.y = clock * 40;
  heliSpot.visible = gfx.rtx;

  if (planeT < 0 && Math.random() < dt * 0.05) planeT = 0;
  if (planeT >= 0) {
    planeT += dt * 0.045;
    const px = -cityRadius * 1.6 + planeT * cityRadius * 3.2;
    planeGroup.position.set(px, 40, -cityRadius * 0.9);
    planeGroup.visible = true;
    planeLight.intensity = Math.sin(clock * 10) > 0 ? 3 : 0;
    if (planeT > 1) planeT = -1;
  } else {
    planeGroup.visible = false;
  }

  for (const r of honkRings) {
    const radius = (mode === "drive" ? HONK_RADIUS : WAVE_RADIUS) * (1 - r.life) + 0.6;
    r.mesh.scale.setScalar(radius);
    r.mesh.material.opacity = Math.max(0, r.life);
  }
  for (const p of particles) {
    p.sprite.position.y += dt * 1.5;
    p.sprite.material.opacity = Math.max(0, p.life);
  }

  const forward = { x: Math.cos(actorAngle), z: Math.sin(actorAngle) };
  const actorWorld = new THREE.Vector3(worldX(ax), actorDriving ? 0.7 : 0.4, worldZ(ay));
  const back = actorDriving ? -7.5 : -4.4;
  const up = actorDriving ? 4.4 : 2.9;
  const ahead = actorDriving ? 4 : 2.6;
  const desired = actorWorld.clone()
    .addScaledVector(new THREE.Vector3(forward.x, 0, forward.z), back)
    .add(new THREE.Vector3(0, up, 0));
  camera.position.lerp(desired, Math.min(1, dt * 5));
  const lookTarget = actorWorld.clone().addScaledVector(new THREE.Vector3(forward.x, 0, forward.z), ahead);
  lookTarget.y += 0.6;
  camera.lookAt(lookTarget);
  sun.target.position.copy(actorWorld);
}

function update(dt) {
  if (mode === "drive") updateCar(car, dt, keys);
  else updateWalker(walker, dt, keys);
  for (const p of peds) stepPed(p.entity, dt, PED_SPEED * p.speedMul);
  if (honkCooldown > 0) honkCooldown -= dt;

  wanted = Math.max(0, wanted - WANTED_DECAY * dt);
  const chasing = wanted >= WANTED_CHASE_AT;
  const { x: ax, y: ay } = actorPos();
  updateCop(cop, dt, ax, ay, chasing);
  heatEl.textContent = "!".repeat(Math.min(5, Math.ceil(wanted))) || "–";
  heatEl.classList.toggle("accent", chasing);

  if (cop.invuln <= 0 && Math.hypot(cop.x - ax, cop.y - ay) < BUST_RADIUS) {
    const lost = Math.ceil(score / 2);
    score -= lost;
    scoreEl.textContent = String(score);
    wanted = 0;
    cop.invuln = BUST_INVULN;
    cop.target = pickIntersection();
    spawnParticle(`busted -${lost}`, worldX(ax), worldZ(ay), "#ff5555");
    bustFlashT = 0.7;
    bustedFlash.classList.add("show");
  }
  if (bustFlashT > 0) {
    bustFlashT -= dt;
    if (bustFlashT <= 0) bustedFlash.classList.remove("show");
  }

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
  if (gfx.rtx) composer.render();
  else renderer.render(scene, camera);
  rafId = requestAnimationFrame(loop);
}

function endGame() {
  running = false;
  cancelAnimationFrame(rafId);
  canvas.classList.remove("breakthrough");
  breakthroughFlash.classList.remove("show");
  bustedFlash.classList.remove("show");
  applyFilters();
  const best = getBest(cluster.did);
  const newBest = score > best;
  if (newBest) setBest(cluster.did, score);
  bestEl.textContent = String(newBest ? score : best);
  overTitle.textContent = "time!";
  overCopy.textContent = newBest
    ? `recruited ${score} moots — new best. the cops never caught you (or you shook them off).`
    : `recruited ${score} moots. best is still ${best}.`;
  const shareText = `just recruited ${score} of my moots in grand moot auto — cops, a strip club, a blimp, and real bloom now. still not literally GTA 6. https://bisks.net/games/grand-moot-auto`;
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
  composer.setSize(w, h);
  // bloom's mip-chain blur is expensive and reads as identical at half res
  // (it's a blur — nobody notices the downsample), so give it half the pixels.
  bloomPass.setSize(Math.max(1, Math.round(w / 2)), Math.max(1, Math.round(h / 2)));
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
// debounce resize: dragging/rotating fires a burst of events, and each one
// reallocates full-size GPU render targets (composer + bloom) — coalescing
// to one per frame avoids a reallocation storm mid-resize.
let resizeQueued = false;
window.addEventListener("resize", () => {
  if (resizeQueued) return;
  resizeQueued = true;
  requestAnimationFrame(() => {
    resizeQueued = false;
    handleResize();
  });
});

// stop pushing frames at a backgrounded tab — a hidden canvas still burning
// GPU cycles is exactly the kind of sustained load that helped tip a driver
// into a timeout/crash last time.
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    if (rafId) cancelAnimationFrame(rafId);
  } else if (running) {
    lastT = performance.now();
    rafId = requestAnimationFrame(loop);
  }
});

// if the GPU drops the context (driver crash/timeout), three.js quietly
// no-ops further renders — which leaves the player staring at a frozen
// canvas with no way out short of reloading. Do that reload for them instead
// of limping along on a dead context.
canvas.addEventListener(
  "webglcontextlost",
  (e) => {
    e.preventDefault();
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    setStatus("the GPU dropped the context — reloading…", true);
    window.location.reload();
  },
  false,
);

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
  if (gfx.rtx) composer.render();
  else renderer.render(scene, camera);
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const actor = input.value.trim();
  if (!actor) return;
  loadNetwork(actor);
});

if (input.value.trim()) loadNetwork(input.value.trim());
