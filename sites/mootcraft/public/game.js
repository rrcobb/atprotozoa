// game.js — mootcraft. A first-person voxel mine (real WebGL, three.js,
// same CDN-importmap pattern as grand-moot-auto/beesky). The world is a
// literal grid (16 x 8 x 16 blocks): bedrock, stone, dirt, grass. Buried in
// the stone/dirt is one "ore" cell per fetched post — from the player and
// their moots (mutuals, via lib/cluster.js, copied verbatim from
// grand-moot-auto — copy, don't abstract). Ore is genuinely invisible until
// you dig through whatever's next to it, the same way Minecraft hides ore:
// it's just an opaque cube occluded by its opaque neighbors, no special
// culling logic needed. Mining it pays out ore exactly equal to that post's
// likeCount.
//
// Deliberately skipping shadow maps and any post-processing here — grand
// moot auto's own history note (.buildthis.json) is a real GPU-crash
// postmortem: native AA + a 2048px shadow map + full-res bloom at once
// tripped a driver timeout and took every other WebGL tab down with it.
// This renderer stays antialias:false, no shadows, no composer, dpr capped
// at 1.5. A headlamp point light does the job shadows can't: it's the only
// light source underground.
import * as THREE from "three";
import { moots, getProfiles, getRecentPosts } from "./lib/cluster.js";

// ---- world -----------------------------------------------------------
const WX = 16, WY = 8, WZ = 16;
const AIR = 0, BEDROCK = 1, STONE = 2, DIRT = 3, GRASS = 4, ORE = 5;
const idx = (gx, gy, gz) => (gx * WY + gy) * WZ + gz;
const worldX = (gx) => gx - WX / 2 + 0.5;
const worldZ = (gz) => gz - WZ / 2 + 0.5;

const REACH = 6.2;
const PLAYER_R = 0.32;
const FLY_SPEED = 4.6;
const FLY_SPEED_V = 3.6;
const LOOK_SENS = 0.0022;
const TOUCH_LOOK_SENS = 0.0065;
const GAME_SECONDS = 75;
const MAX_MOOTS = 7;
const POSTS_PER_ACCOUNT = 4;
const ORE_CAP = 26;

const TERRAIN_TIME = { [STONE]: 0.6, [DIRT]: 0.4, [GRASS]: 0.3 };
const TERRAIN_NAME = { [STONE]: "stone", [DIRT]: "dirt", [GRASS]: "grass" };
const TERRAIN_PALETTE = {
  [GRASS]: { base: "#3f7d43", dark: "#2c5c30", light: "#5aa35f" },
  [DIRT]: { base: "#6b4a2c", dark: "#4a3320", light: "#8a6440" },
  [STONE]: { base: "#6b6a63", dark: "#504f49", light: "#88867d" },
  [BEDROCK]: { base: "#1c1a17", dark: "#0e0d0b", light: "#2c2924" },
};

const TIER_ORDER = ["coal", "iron", "gold", "diamond", "viral"];
const TIER_COLOR = {
  coal: { base: "#3a352e", fleck: "#171410", ring: "#5a5346", emissive: 0x000000, emissiveIntensity: 0 },
  iron: { base: "#8a6a52", fleck: "#c8926a", ring: "#e8b58e", emissive: 0x000000, emissiveIntensity: 0 },
  gold: { base: "#6b551c", fleck: "#e8c23d", ring: "#fff2b0", emissive: 0x4d3a00, emissiveIntensity: 0.3 },
  diamond: { base: "#1b4a52", fleck: "#5fe3e0", ring: "#eafffe", emissive: 0x0d3a3f, emissiveIntensity: 0.5 },
  viral: { base: "#4a1240", fleck: "#ff8be8", ring: "#ffffff", emissive: 0x5a1246, emissiveIntensity: 0.75 },
};
const TIER_HEX = { coal: "#c9c2b0", iron: "#e8b58e", gold: "#ffe27a", diamond: "#8be9e0", viral: "#ff9be8" };
const MINE_TIME = { coal: 0.6, iron: 0.8, gold: 1.0, diamond: 1.3, viral: 1.6 };
function tierFor(likes) {
  if (likes >= 150) return "viral";
  if (likes >= 50) return "diamond";
  if (likes >= 20) return "gold";
  if (likes >= 5) return "iron";
  return "coal";
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function truncate(s, n) {
  s = (s || "").replace(/\s+/g, " ").trim();
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
function imgReady(img) {
  return img && img.complete && img.naturalWidth > 0;
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---- DOM ---------------------------------------------------------------
const form = document.getElementById("load-form");
const input = document.getElementById("handle-input");
if (window.attachHandleTypeahead) window.attachHandleTypeahead(input);
const loadBtn = document.getElementById("load-btn");
const statusEl = document.getElementById("status");
const gameEl = document.getElementById("game");
const oreTotalEl = document.getElementById("ore-total");
const bestEl = document.getElementById("best");
const timeEl = document.getElementById("time");
const tierEls = Object.fromEntries(TIER_ORDER.map((t) => [t, document.getElementById(`c-${t}`)]));
const canvas = document.getElementById("board");
const progressRing = document.getElementById("progress-ring");
const targetLabel = document.getElementById("target-label");
const findFeed = document.getElementById("find-feed");
const lockHint = document.getElementById("lock-hint");
const startOverlay = document.getElementById("start-overlay");
const startCopy = document.getElementById("start-copy");
const startBtn = document.getElementById("start-btn");
const overOverlay = document.getElementById("over-overlay");
const overTitle = document.getElementById("over-title");
const overCopy = document.getElementById("over-copy");
const overBreakdown = document.getElementById("over-breakdown");
const againBtn = document.getElementById("again-btn");
const shareLink = document.getElementById("share-link");

// ---- three.js scene ------------------------------------------------------
const nativeDpr = Math.min(window.devicePixelRatio || 1, 1.5);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
if ("outputColorSpace" in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;

const SKY_COLOR = new THREE.Color(0x274b6b);
const CAVE_COLOR = new THREE.Color(0x0b0906);
const _bgColor = new THREE.Color().copy(SKY_COLOR);

const scene = new THREE.Scene();
scene.background = _bgColor;
scene.fog = new THREE.Fog(_bgColor.getHex(), 10, 34);

const camera = new THREE.PerspectiveCamera(70, 16 / 10, 0.05, 60);

scene.add(new THREE.HemisphereLight(0x8899aa, 0x1a1208, 0.55));
const sun = new THREE.DirectionalLight(0xfff2d8, 0.85);
sun.position.set(20, 30, 10);
scene.add(sun);
const headlamp = new THREE.PointLight(0xfff2d0, 1.7, 11, 2);
scene.add(headlamp);

const sharedBoxGeo = new THREE.BoxGeometry(1, 1, 1);
const highlightMesh = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1.02, 1.02, 1.02)),
  new THREE.LineBasicMaterial({ color: 0xf2ead9 }),
);
highlightMesh.visible = false;
scene.add(highlightMesh);

// ---- block textures (nearest-filter, blocky on purpose) ------------------
function buildBlockTexture(type) {
  const size = 32;
  const cnv = document.createElement("canvas");
  cnv.width = cnv.height = size;
  const g = cnv.getContext("2d");
  const p = TERRAIN_PALETTE[type];
  g.fillStyle = p.base;
  g.fillRect(0, 0, size, size);
  g.globalAlpha = 0.55;
  for (let i = 0; i < 80; i++) {
    g.fillStyle = Math.random() < 0.5 ? p.dark : p.light;
    g.fillRect(Math.random() * size, Math.random() * size, 1.6, 1.6);
  }
  g.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(cnv);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  return tex;
}

function drawOreCanvas(ctx, size, { img, tier, likes, initial }) {
  const info = TIER_COLOR[tier];
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = info.base;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = info.fleck;
  for (let i = 0; i < 26; i++) {
    const x = Math.random() * size, y = Math.random() * size, r = 1.2 + Math.random() * 2.2;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const cx = size / 2, cy = size * 0.42, rad = size * 0.3;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, rad, 0, Math.PI * 2);
  ctx.clip();
  if (imgReady(img)) {
    ctx.drawImage(img, cx - rad, cy - rad, rad * 2, rad * 2);
  } else {
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
    ctx.fillStyle = "#fff";
    ctx.font = `700 ${Math.round(rad)}px ui-monospace, monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(initial || "?", cx, cy + 2);
  }
  ctx.restore();
  ctx.beginPath();
  ctx.arc(cx, cy, rad, 0, Math.PI * 2);
  ctx.lineWidth = 3;
  ctx.strokeStyle = info.ring;
  ctx.stroke();
  const by = size * 0.82;
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  roundRect(ctx, size * 0.14, by - size * 0.09, size * 0.72, size * 0.17, size * 0.08);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = `700 ${Math.round(size * 0.12)}px ui-monospace, monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`❤ ${likes}`, cx, by);
}

// ---- world state -----------------------------------------------------
let grid = null;
let terrainMeshes = [];
const terrainMap = new Map(); // "gx,gy,gz" -> { mesh, instanceId }
const oreMap = new Map(); // "gx,gy,gz" -> post record
let oreSource = []; // fetched posts, before placement
let currentDid = null;

function fillLayers() {
  for (let gx = 0; gx < WX; gx++) {
    for (let gz = 0; gz < WZ; gz++) {
      grid[idx(gx, 0, gz)] = BEDROCK;
      for (let gy = 1; gy <= 4; gy++) grid[idx(gx, gy, gz)] = STONE;
      for (let gy = 5; gy <= 6; gy++) grid[idx(gx, gy, gz)] = DIRT;
      grid[idx(gx, 7, gz)] = GRASS;
    }
  }
}

function placeOre(source) {
  const picks = shuffle(source.slice()).slice(0, ORE_CAP);
  const candidates = [];
  for (let gx = 0; gx < WX; gx++) {
    for (let gy = 1; gy <= 6; gy++) {
      for (let gz = 0; gz < WZ; gz++) candidates.push([gx, gy, gz]);
    }
  }
  shuffle(candidates);
  picks.forEach((post, i) => {
    const [gx, gy, gz] = candidates[i];
    grid[idx(gx, gy, gz)] = ORE;
    oreMap.set(`${gx},${gy},${gz}`, { ...post, tier: tierFor(post.likeCount), broken: false, mesh: null });
  });
}

function buildTerrainMeshes() {
  const groups = { [STONE]: [], [DIRT]: [], [GRASS]: [], [BEDROCK]: [] };
  for (let gx = 0; gx < WX; gx++) {
    for (let gy = 0; gy < WY; gy++) {
      for (let gz = 0; gz < WZ; gz++) {
        const t = grid[idx(gx, gy, gz)];
        if (groups[t]) groups[t].push([gx, gy, gz]);
      }
    }
  }
  const m4 = new THREE.Matrix4();
  for (const t of [STONE, DIRT, GRASS, BEDROCK]) {
    const cells = groups[t];
    if (!cells.length) continue;
    const mat = new THREE.MeshStandardMaterial({ map: buildBlockTexture(t), roughness: 0.95, metalness: 0.02 });
    const mesh = new THREE.InstancedMesh(sharedBoxGeo, mat, cells.length);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // the mesh's own transform sits at the origin, so default frustum
    // culling would test the *unit box's* local bounding sphere against the
    // camera frustum — not the true extent of instances scattered across the
    // whole 16x8x16 world. That would make the entire terrain vanish
    // whenever the camera looks away from world-origin. Just don't cull it.
    mesh.frustumCulled = false;
    cells.forEach(([gx, gy, gz], i) => {
      m4.makeTranslation(worldX(gx), gy + 0.5, worldZ(gz));
      mesh.setMatrixAt(i, m4);
      terrainMap.set(`${gx},${gy},${gz}`, { mesh, instanceId: i });
    });
    mesh.instanceMatrix.needsUpdate = true;
    scene.add(mesh);
    terrainMeshes.push(mesh);
  }
}

function buildOreMesh(rec, gx, gy, gz) {
  const size = 128;
  const cnv = document.createElement("canvas");
  cnv.width = cnv.height = size;
  const ctx = cnv.getContext("2d");
  drawOreCanvas(ctx, size, { img: null, tier: rec.tier, likes: rec.likeCount, initial: rec.initial });
  const tex = new THREE.CanvasTexture(cnv);
  const info = TIER_COLOR[rec.tier];
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    roughness: 0.8,
    metalness: 0.08,
    emissive: info.emissive,
    emissiveIntensity: info.emissiveIntensity,
  });
  const mesh = new THREE.Mesh(sharedBoxGeo, mat);
  mesh.position.set(worldX(gx), gy + 0.5, worldZ(gz));
  scene.add(mesh);
  if (rec.avatar) {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (rec.broken) return;
      drawOreCanvas(ctx, size, { img, tier: rec.tier, likes: rec.likeCount, initial: rec.initial });
      tex.needsUpdate = true;
    };
    img.src = rec.avatar;
  }
  return mesh;
}
function buildOreMeshes() {
  for (const [key, rec] of oreMap) {
    const [gx, gy, gz] = key.split(",").map(Number);
    rec.mesh = buildOreMesh(rec, gx, gy, gz);
  }
}

function disposeWorld() {
  for (const mesh of terrainMeshes) {
    scene.remove(mesh);
    mesh.material.map?.dispose();
    mesh.material.dispose();
  }
  terrainMeshes = [];
  terrainMap.clear();
  for (const rec of oreMap.values()) {
    rec.broken = true;
    if (rec.mesh) {
      scene.remove(rec.mesh);
      rec.mesh.material.map?.dispose();
      rec.mesh.material.dispose();
    }
  }
  oreMap.clear();
}

let collected = [];
let oreTotal = 0;
let tierCounts = {};
function updateHudCounts() {
  oreTotalEl.textContent = String(oreTotal);
  for (const t of TIER_ORDER) tierEls[t].textContent = String(tierCounts[t] || 0);
}

const player = { x: 0, y: 9.4, z: 0, yaw: 0, pitch: -0.4 };
let miningProgress = 0;
let miningKey = null;
let mining = false;
let currentTarget = null;

function buildWorld(source) {
  disposeWorld();
  grid = new Uint8Array(WX * WY * WZ);
  fillLayers();
  placeOre(source);
  buildTerrainMeshes();
  buildOreMeshes();
  collected = [];
  oreTotal = 0;
  tierCounts = Object.fromEntries(TIER_ORDER.map((t) => [t, 0]));
  updateHudCounts();
  player.x = 0;
  player.y = 9.4;
  player.z = 0;
  player.yaw = 0;
  player.pitch = -0.4;
  miningProgress = 0;
  miningKey = null;
  mining = false;
  currentTarget = null;
  keys.forward = keys.back = keys.left = keys.right = keys.up = keys.down = false;
}

// ---- collision -----------------------------------------------------------
function cellSolid(gx, gy, gz) {
  if (gy < 0) return true;
  if (gy >= WY) return false;
  if (gx < 0 || gx >= WX || gz < 0 || gz >= WZ) return false;
  return grid[idx(gx, gy, gz)] !== AIR;
}
function aabbHits(x, y, z, r) {
  const x0 = Math.floor(x - r + WX / 2), x1 = Math.floor(x + r + WX / 2);
  const y0 = Math.floor(y - r), y1 = Math.floor(y + r);
  const z0 = Math.floor(z - r + WZ / 2), z1 = Math.floor(z + r + WZ / 2);
  for (let gx = x0; gx <= x1; gx++) {
    for (let gy = y0; gy <= y1; gy++) {
      for (let gz = z0; gz <= z1; gz++) {
        if (cellSolid(gx, gy, gz)) return true;
      }
    }
  }
  return false;
}
function tryMove(dx, dy, dz) {
  let { x, y, z } = player;
  if (dx) {
    const nx = x + dx;
    if (!aabbHits(nx, y, z, PLAYER_R)) x = nx;
  }
  if (dz) {
    const nz = z + dz;
    if (!aabbHits(x, y, nz, PLAYER_R)) z = nz;
  }
  if (dy) {
    const ny = y + dy;
    if (!aabbHits(x, ny, z, PLAYER_R)) y = ny;
  }
  player.x = THREE.MathUtils.clamp(x, -WX / 2 + 0.5, WX / 2 - 0.5);
  player.y = THREE.MathUtils.clamp(y, 0.6, 30);
  player.z = THREE.MathUtils.clamp(z, -WZ / 2 + 0.5, WZ / 2 - 0.5);
}

// ---- raycast target (marching, not intersectObjects — the grid is the
// source of truth and both terrain instances and ore meshes read from it) --
const _rayOrigin = new THREE.Vector3();
const _rayDir = new THREE.Vector3();
const _sample = new THREE.Vector3();
function pickTarget() {
  camera.getWorldPosition(_rayOrigin);
  camera.getWorldDirection(_rayDir);
  const step = 0.05;
  for (let t = 0; t <= REACH; t += step) {
    _sample.copy(_rayOrigin).addScaledVector(_rayDir, t);
    const gx = Math.floor(_sample.x + WX / 2);
    const gy = Math.floor(_sample.y);
    const gz = Math.floor(_sample.z + WZ / 2);
    if (gx < 0 || gx >= WX || gy < 0 || gy >= WY || gz < 0 || gz >= WZ) continue;
    const type = grid[idx(gx, gy, gz)];
    if (type !== AIR) return { gx, gy, gz, type, key: `${gx},${gy},${gz}` };
  }
  return null;
}

function labelFor(t) {
  if (t.type === BEDROCK) return "bedrock — unbreakable";
  if (t.type === ORE) {
    const r = oreMap.get(t.key);
    return `${r.tier} ore · @${r.handle} · “${truncate(r.text, 30)}” · ❤ ${r.likeCount}`;
  }
  return TERRAIN_NAME[t.type];
}

// ---- particles + find feed -------------------------------------------
let particles = [];
function spawnParticle(text, pos, color) {
  const cnv = document.createElement("canvas");
  cnv.width = 300;
  cnv.height = 60;
  const g = cnv.getContext("2d");
  g.font = "700 26px ui-monospace, monospace";
  g.fillStyle = color || "#f2ead9";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, 150, 30);
  const tex = new THREE.CanvasTexture(cnv);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(3, 0.6, 1);
  sprite.position.copy(pos);
  sprite.position.y += 0.9;
  scene.add(sprite);
  particles.push({ sprite, life: 1 });
}
function updateParticles(dt) {
  for (const p of particles) {
    p.sprite.position.y += dt * 1.3;
    p.life -= dt * 0.6;
    p.sprite.material.opacity = Math.max(0, p.life);
  }
  const dead = particles.filter((p) => p.life <= 0);
  for (const p of dead) {
    scene.remove(p.sprite);
    p.sprite.material.map?.dispose();
    p.sprite.material.dispose();
  }
  particles = particles.filter((p) => p.life > 0);
}
function clearParticles() {
  for (const p of particles) {
    scene.remove(p.sprite);
    p.sprite.material.map?.dispose();
    p.sprite.material.dispose();
  }
  particles = [];
}
function pushFindFeed(text) {
  const div = document.createElement("div");
  div.className = "entry";
  div.textContent = text;
  findFeed.appendChild(div);
  setTimeout(() => div.remove(), 3700);
  while (findFeed.children.length > 6) findFeed.firstChild.remove();
}
function clearFindFeed() {
  findFeed.innerHTML = "";
}

// ---- mining --------------------------------------------------------------
function collectOre(rec, worldPos) {
  oreTotal += rec.likeCount;
  tierCounts[rec.tier] = (tierCounts[rec.tier] || 0) + 1;
  collected.push(rec);
  updateHudCounts();
  spawnParticle(`+${rec.likeCount} ❤ @${rec.handle}`, worldPos, TIER_HEX[rec.tier]);
  pushFindFeed(`⛏ ${rec.tier} · @${rec.handle} · ❤ ${rec.likeCount}`);
}
function breakBlock(t) {
  grid[idx(t.gx, t.gy, t.gz)] = AIR;
  if (t.type === ORE) {
    const rec = oreMap.get(t.key);
    oreMap.delete(t.key);
    rec.broken = true;
    if (rec.mesh) {
      scene.remove(rec.mesh);
      rec.mesh.material.map?.dispose();
      rec.mesh.material.dispose();
    }
    collectOre(rec, new THREE.Vector3(worldX(t.gx), t.gy + 0.5, worldZ(t.gz)));
  } else {
    const rec = terrainMap.get(t.key);
    if (rec) {
      const m4 = new THREE.Matrix4().makeScale(0.0001, 0.0001, 0.0001);
      rec.mesh.setMatrixAt(rec.instanceId, m4);
      rec.mesh.instanceMatrix.needsUpdate = true;
      terrainMap.delete(t.key);
    }
  }
}
function setRing(pct, show) {
  progressRing.style.setProperty("--p", String(pct));
  progressRing.classList.toggle("show", show);
}
function updateMining(dt) {
  if (!mining || !currentTarget) {
    miningProgress = 0;
    miningKey = null;
    setRing(0, false);
    return;
  }
  const t = currentTarget;
  if (t.type === BEDROCK) {
    miningProgress = 0;
    miningKey = null;
    setRing(0, false);
    return;
  }
  if (miningKey !== t.key) {
    miningKey = t.key;
    miningProgress = 0;
  }
  const req = t.type === ORE ? MINE_TIME[oreMap.get(t.key).tier] : TERRAIN_TIME[t.type];
  miningProgress += dt;
  setRing(Math.min(100, (miningProgress / req) * 100), true);
  if (miningProgress >= req) {
    breakBlock(t);
    miningProgress = 0;
    miningKey = null;
    setRing(0, false);
  }
}
function updateTargetUI() {
  if (!currentTarget) {
    targetLabel.classList.remove("show");
    highlightMesh.visible = false;
    return;
  }
  const t = currentTarget;
  targetLabel.textContent = labelFor(t);
  targetLabel.classList.add("show");
  highlightMesh.position.set(worldX(t.gx), t.gy + 0.5, worldZ(t.gz));
  highlightMesh.visible = true;
}

// ---- movement --------------------------------------------------------
const UP = new THREE.Vector3(0, 1, 0);
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
function horizontalVectors(yaw) {
  _fwd.set(0, 0, -1).applyAxisAngle(UP, yaw);
  _right.set(1, 0, 0).applyAxisAngle(UP, yaw);
}
const keys = { forward: false, back: false, left: false, right: false, up: false, down: false };

function update(dt) {
  horizontalVectors(player.yaw);
  let mx = 0, mz = 0;
  if (keys.forward) { mx += _fwd.x; mz += _fwd.z; }
  if (keys.back) { mx -= _fwd.x; mz -= _fwd.z; }
  if (keys.right) { mx += _right.x; mz += _right.z; }
  if (keys.left) { mx -= _right.x; mz -= _right.z; }
  const len = Math.hypot(mx, mz);
  if (len > 0) { mx /= len; mz /= len; }
  const dy = (keys.up ? 1 : 0) - (keys.down ? 1 : 0);
  tryMove(mx * FLY_SPEED * dt, dy * FLY_SPEED_V * dt, mz * FLY_SPEED * dt);

  camera.position.set(player.x, player.y, player.z);
  camera.rotation.set(player.pitch, player.yaw, 0, "YXZ");
  camera.updateMatrixWorld();
  headlamp.position.set(player.x, player.y, player.z);

  const capT = THREE.MathUtils.clamp((player.y - 6) / 3, 0, 1);
  _bgColor.copy(CAVE_COLOR).lerp(SKY_COLOR, capT);
  scene.fog.color.copy(_bgColor);
  scene.fog.near = THREE.MathUtils.lerp(2, 10, capT);
  scene.fog.far = THREE.MathUtils.lerp(11, 34, capT);

  currentTarget = pickTarget();
  updateTargetUI();
  updateMining(dt);
  updateParticles(dt);

  if (running) {
    timeLeft -= dt;
    if (timeLeft <= 0) {
      timeLeft = 0;
      endGame();
    }
    timeEl.textContent = String(Math.ceil(timeLeft));
  }
}

// ---- input ---------------------------------------------------------------
const KEY_MAP = {
  w: "forward", W: "forward", ArrowUp: "forward",
  s: "back", S: "back", ArrowDown: "back",
  a: "left", A: "left", ArrowLeft: "left",
  d: "right", D: "right", ArrowRight: "right",
};
window.addEventListener("keydown", (e) => {
  if (e.key === " ") {
    if (running) { keys.up = true; e.preventDefault(); }
    return;
  }
  if (e.key === "Shift") {
    if (running) keys.down = true;
    return;
  }
  const k = KEY_MAP[e.key];
  if (!k || !running) return;
  e.preventDefault();
  keys[k] = true;
});
window.addEventListener("keyup", (e) => {
  if (e.key === " ") { keys.up = false; return; }
  if (e.key === "Shift") { keys.down = false; return; }
  const k = KEY_MAP[e.key];
  if (k) keys[k] = false;
});

canvas.addEventListener("mousedown", (e) => {
  if (!running) return;
  if (document.pointerLockElement === canvas && e.button === 0) mining = true;
});
document.addEventListener("mouseup", (e) => {
  if (e.button === 0) mining = false;
});
canvas.addEventListener("click", () => {
  if (!running) return;
  if (document.pointerLockElement !== canvas) canvas.requestPointerLock();
});
document.addEventListener("mousemove", (e) => {
  if (document.pointerLockElement !== canvas) return;
  player.yaw -= e.movementX * LOOK_SENS;
  player.pitch -= e.movementY * LOOK_SENS;
  player.pitch = THREE.MathUtils.clamp(player.pitch, -1.4, 1.4);
});
document.addEventListener("pointerlockchange", () => {
  const locked = document.pointerLockElement === canvas;
  lockHint.classList.toggle("show", running && !locked);
  if (!locked) mining = false;
});

let lastTouch = null;
canvas.addEventListener(
  "touchstart",
  (e) => {
    if (!running) return;
    const t = e.touches[0];
    lastTouch = { x: t.clientX, y: t.clientY };
  },
  { passive: true },
);
canvas.addEventListener(
  "touchmove",
  (e) => {
    if (!running || !lastTouch) return;
    const t = e.touches[0];
    const dx = t.clientX - lastTouch.x, dy = t.clientY - lastTouch.y;
    player.yaw -= dx * TOUCH_LOOK_SENS;
    player.pitch -= dy * TOUCH_LOOK_SENS;
    player.pitch = THREE.MathUtils.clamp(player.pitch, -1.4, 1.4);
    lastTouch = { x: t.clientX, y: t.clientY };
    e.preventDefault();
  },
  { passive: false },
);
canvas.addEventListener("touchend", () => { lastTouch = null; });

for (const [id, k] of [
  ["t-up", "forward"], ["t-down", "back"], ["t-left", "left"], ["t-right", "right"],
  ["t-rise", "up"], ["t-fall", "down"],
]) {
  const btn = document.getElementById(id);
  btn.addEventListener("pointerdown", (e) => { e.preventDefault(); if (running) keys[k] = true; });
  btn.addEventListener("pointerup", (e) => { e.preventDefault(); keys[k] = false; });
  btn.addEventListener("pointerleave", () => { keys[k] = false; });
}
const tMine = document.getElementById("t-mine");
tMine.addEventListener("pointerdown", (e) => { e.preventDefault(); if (running) mining = true; });
tMine.addEventListener("pointerup", (e) => { e.preventDefault(); mining = false; });
tMine.addEventListener("pointerleave", () => { mining = false; });

// ---- session state ---------------------------------------------------
let running = false;
let timeLeft = GAME_SECONDS;
let rafId = null;
let lastT = 0;
let clock = 0;

function bestKey(did) {
  return `mootcraft:best:${did}`;
}
function getBest(did) {
  return parseInt(localStorage.getItem(bestKey(did)) || "0", 10) || 0;
}
function setBest(did, v) {
  try { localStorage.setItem(bestKey(did), String(v)); } catch {}
}

function loop(t) {
  if (!running) return;
  const dt = Math.min((t - lastT) / 1000, 0.05) || 0;
  lastT = t;
  clock += dt;
  update(dt);
  renderer.render(scene, camera);
  rafId = requestAnimationFrame(loop);
}

function endGame() {
  running = false;
  if (rafId) cancelAnimationFrame(rafId);
  mining = false;
  if (document.pointerLockElement === canvas) document.exitPointerLock();
  const best = getBest(currentDid);
  const newBest = oreTotal > best;
  if (newBest) setBest(currentDid, oreTotal);
  bestEl.textContent = String(newBest ? oreTotal : best);
  overTitle.textContent = "shift's over";
  let bestFind = null;
  for (const c of collected) {
    if (!bestFind || c.likeCount > bestFind.likeCount) bestFind = c;
  }
  overCopy.textContent = collected.length
    ? newBest
      ? `mined ${oreTotal} ore across ${collected.length} posts — new best.`
      : `mined ${oreTotal} ore across ${collected.length} posts. best is still ${best}.`
    : "didn't crack a single vein — try again, dig faster.";
  overBreakdown.textContent = bestFind
    ? `best vein: @${bestFind.handle} — ❤ ${bestFind.likeCount} (${bestFind.tier})`
    : "";
  const shareText = bestFind
    ? `just mined ${oreTotal} ore out of my moots' posts in mootcraft — best vein was @${bestFind.handle} at ${bestFind.likeCount} likes. https://mootcraft.bisks.net/`
    : `spent 75 seconds digging through my moots' posts in mootcraft and came up empty. https://mootcraft.bisks.net/`;
  shareLink.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(shareText);
  overOverlay.classList.remove("hidden");
  lockHint.classList.remove("show");
}

function startGame(isReplay) {
  if (isReplay) buildWorld(oreSource);
  timeLeft = GAME_SECONDS;
  timeEl.textContent = String(GAME_SECONDS);
  updateHudCounts();
  clearParticles();
  clearFindFeed();
  startOverlay.classList.add("hidden");
  overOverlay.classList.add("hidden");
  running = true;
  clock = 0;
  lastT = performance.now();
  rafId = requestAnimationFrame(loop);
  lockHint.classList.toggle("show", document.pointerLockElement !== canvas);
}
startBtn.addEventListener("click", () => startGame(false));
againBtn.addEventListener("click", () => startGame(true));

// ---- resize / lifecycle ---------------------------------------------------
function handleResize() {
  const w = canvas.clientWidth || canvas.parentElement.clientWidth || 640;
  const h = canvas.clientHeight || Math.round((w * 10) / 16);
  renderer.setPixelRatio(nativeDpr);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
let resizeQueued = false;
window.addEventListener("resize", () => {
  if (resizeQueued) return;
  resizeQueued = true;
  requestAnimationFrame(() => {
    resizeQueued = false;
    handleResize();
  });
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    if (rafId) cancelAnimationFrame(rafId);
  } else if (running) {
    lastT = performance.now();
    rafId = requestAnimationFrame(loop);
  }
});
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

// ---- loading a network -----------------------------------------------
function setStatus(msg, isError) {
  statusEl.textContent = msg || "";
  statusEl.classList.toggle("error", !!isError);
}

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
    setStatus("no moots or follows to dig through.", true);
    loadBtn.disabled = false;
    return;
  }

  setStatus("picking moots…");
  const chosen = shuffle(c.pool.slice()).slice(0, MAX_MOOTS);

  setStatus("loading avatars…");
  const profiles = await getProfiles([c.did, ...chosen.map((p) => p.did)]);
  const byDid = new Map(profiles.map((p) => [p.did, p]));

  setStatus("reading recent posts…");
  const accounts = [
    { did: c.did, handle: c.handle },
    ...chosen.map((p) => ({ did: p.did, handle: p.handle })),
  ];
  const postLists = await Promise.all(accounts.map((a) => getRecentPosts(a.did, POSTS_PER_ACCOUNT)));

  const source = [];
  accounts.forEach((a, i) => {
    const full = byDid.get(a.did) || {};
    const displayName = full.displayName || a.handle;
    const initial = (displayName || a.handle || "?")[0].toUpperCase();
    for (const post of postLists[i]) {
      source.push({
        did: a.did,
        handle: a.handle,
        avatar: full.avatar || "",
        initial,
        text: post.text,
        likeCount: post.likeCount,
        uri: post.uri,
      });
    }
  });

  if (!source.length) {
    setStatus("no text posts to bury down there — try a different handle.", true);
    loadBtn.disabled = false;
    return;
  }

  oreSource = source;
  currentDid = c.did;
  buildWorld(oreSource);

  startCopy.textContent = `you're @${c.handle}. ${source.length} posts from you + ${chosen.length} moots are buried down there.`;
  bestEl.textContent = String(getBest(c.did));
  startOverlay.classList.remove("hidden");
  overOverlay.classList.add("hidden");
  gameEl.hidden = false;
  loadBtn.disabled = false;
  setStatus("");
  handleResize();
  camera.position.set(player.x, player.y, player.z);
  camera.rotation.set(player.pitch, player.yaw, 0, "YXZ");
  renderer.render(scene, camera);
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const actor = input.value.trim();
  if (!actor) return;
  loadNetwork(actor);
});

if (input.value.trim()) loadNetwork(input.value.trim());
