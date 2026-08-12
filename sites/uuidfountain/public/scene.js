// uuidfountain — the three.js scene. A pool of recycled sprites, each
// textured with a real crypto.randomUUID() fragment, launched from a nozzle
// in a cone and pulled back down by gravity. No physics engine: this is
// simple per-particle verlet-ish integration, which is all a fountain needs.
//
// Exposes window.fountainScene = { setLatestId, spawnBurst, setPaused }
// so app.js (the counter / DOM / share logic) can stay independent of the
// render loop. app.js has no `three` import, so it may run before this
// module's CDN fetch resolves — every call from app.js is optional-chained.

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const COLORS = ["#5ce1e6", "#ff3d81", "#ffb347", "#8b7bff"];
const POOL_SIZE = 220;
const GRAVITY = 9.2;
const NOZZLE_HEIGHT = 1.55;
const SPREAD = 0.42; // max radians off vertical
const SPEED_MIN = 5.4;
const SPEED_MAX = 8.6;
const GROUND_Y = 0;

const canvasHost = document.getElementById("scene");
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.setSize(innerWidth, innerHeight);
canvasHost.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color("#05060c");
scene.fog = new THREE.FogExp2("#05060c", 0.052);

const camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.1, 100);
camera.position.set(6.5, 4.2, 8.5);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 2.2, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.6;
controls.minDistance = 4;
controls.maxDistance = 22;
controls.maxPolarAngle = Math.PI * 0.49;
controls.update();

scene.add(new THREE.AmbientLight("#2a3560", 1.1));
const key = new THREE.PointLight("#5ce1e6", 18, 22, 2);
key.position.set(3, 6, 3);
scene.add(key);
const rim = new THREE.PointLight("#ff3d81", 14, 22, 2);
rim.position.set(-4, 3, -3);
scene.add(rim);

// ---- ground -----------------------------------------------------------
const ground = new THREE.Mesh(
  new THREE.CircleGeometry(30, 64),
  new THREE.MeshStandardMaterial({ color: "#0a0f1e", roughness: 0.55, metalness: 0.35 }),
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

const ring = new THREE.Mesh(
  new THREE.RingGeometry(2.6, 2.75, 64),
  new THREE.MeshBasicMaterial({ color: "#5ce1e6", transparent: true, opacity: 0.35, side: THREE.DoubleSide }),
);
ring.rotation.x = -Math.PI / 2;
ring.position.y = 0.01;
scene.add(ring);

// ---- nozzle -------------------------------------------------------------
const nozzle = new THREE.Mesh(
  new THREE.CylinderGeometry(0.16, 0.5, NOZZLE_HEIGHT, 24),
  new THREE.MeshStandardMaterial({ color: "#141b33", roughness: 0.3, metalness: 0.8, emissive: "#101a33" }),
);
nozzle.position.y = NOZZLE_HEIGHT / 2;
scene.add(nozzle);

const nozzleGlow = new THREE.PointLight("#ffffff", 6, 4, 2);
nozzleGlow.position.y = NOZZLE_HEIGHT;
scene.add(nozzleGlow);

// ---- texture pool: real UUID fragments drawn onto small canvases -------
function makeUuidTexture() {
  const c = document.createElement("canvas");
  c.width = 320;
  c.height = 72;
  const ctx = c.getContext("2d");
  const canvas = { canvas: c, ctx };
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  paintUuidTexture(canvas, cryptoUuid(), COLORS[(Math.random() * COLORS.length) | 0]);
  tex.needsUpdate = true;
  return { tex, canvas };
}

function cryptoUuid() {
  return crypto.randomUUID();
}

function paintUuidTexture({ canvas, ctx }, text, color) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = "700 34px 'JetBrains Mono', ui-monospace, monospace";
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.shadowColor = color;
  ctx.shadowBlur = 18;
  ctx.fillStyle = color;
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
}

const TEXTURE_POOL_SIZE = 40;
const texturePool = Array.from({ length: TEXTURE_POOL_SIZE }, makeUuidTexture);

// Keep the visible strings fresh without redrawing every particle every
// frame: rotate a couple of pool textures on an interval.
setInterval(() => {
  for (let i = 0; i < 3; i++) {
    const slot = texturePool[(Math.random() * texturePool.length) | 0];
    paintUuidTexture(slot.canvas, cryptoUuid(), COLORS[(Math.random() * COLORS.length) | 0]);
    slot.tex.needsUpdate = true;
  }
}, 90);

// ---- particle pool --------------------------------------------------------
const group = new THREE.Group();
scene.add(group);

const particles = [];

function randomVelocity(speedBoost = 1) {
  const polar = Math.random() * SPREAD;
  const azimuth = Math.random() * Math.PI * 2;
  const speed = (SPEED_MIN + Math.random() * (SPEED_MAX - SPEED_MIN)) * speedBoost;
  return new THREE.Vector3(
    Math.sin(polar) * Math.cos(azimuth) * speed,
    Math.cos(polar) * speed,
    Math.sin(polar) * Math.sin(azimuth) * speed,
  );
}

function spawnParticle(p, speedBoost = 1) {
  p.position.set((Math.random() - 0.5) * 0.15, NOZZLE_HEIGHT, (Math.random() - 0.5) * 0.15);
  p.velocity.copy(randomVelocity(speedBoost));
  p.age = 0;
  p.life = 1.6 + Math.random() * 0.9;
  p.sprite.material.map = texturePool[(Math.random() * texturePool.length) | 0].tex;
  p.sprite.material.opacity = 0;
  const s = 0.55 + Math.random() * 0.35;
  p.baseScale = s;
  p.sprite.scale.set(s * 2.2, s * 0.5, 1);
  p.sprite.position.copy(p.position);
}

for (let i = 0; i < POOL_SIZE; i++) {
  const material = new THREE.SpriteMaterial({
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  group.add(sprite);
  const p = { sprite, position: new THREE.Vector3(), velocity: new THREE.Vector3(), age: 0, life: 1, baseScale: 1 };
  // Stagger initial ages so the fountain doesn't spawn in one synchronized pulse.
  spawnParticle(p);
  p.age = Math.random() * p.life;
  particles.push(p);
}

let paused = false;

function stepParticle(p, dt) {
  p.age += dt;
  if (p.age >= p.life || p.position.y < GROUND_Y - 0.4) {
    spawnParticle(p);
    return;
  }
  p.velocity.y -= GRAVITY * dt;
  p.position.addScaledVector(p.velocity, dt);
  p.sprite.position.copy(p.position);
  const lifeT = p.age / p.life;
  const fade = lifeT < 0.12 ? lifeT / 0.12 : lifeT > 0.75 ? 1 - (lifeT - 0.75) / 0.25 : 1;
  p.sprite.material.opacity = Math.max(0, Math.min(1, fade)) * 0.95;
  p.sprite.material.needsUpdate = true;
}

// ---- resize -------------------------------------------------------------
addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---- render loop ----------------------------------------------------------
let last = performance.now();
function tick(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  if (!paused) {
    for (const p of particles) stepParticle(p, dt);
    nozzleGlow.intensity = 5 + Math.sin(now * 0.01) * 2;
    ring.material.opacity = 0.28 + Math.sin(now * 0.004) * 0.08;
  }
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

// ---- public API for app.js -------------------------------------------------
window.fountainScene = {
  setPaused(v) {
    paused = !!v;
  },
  // Force a batch of particles to respawn immediately at higher speed, for
  // the "manual overdraft" button — a visible whoosh, not a literal 1:1 of
  // the counter (rendering hundreds of thousands of live sprites isn't
  // reasonable; the HUD number is the honest count, this is the show).
  spawnBurst(n = 40) {
    let done = 0;
    for (const p of particles) {
      if (done >= n) break;
      spawnParticle(p, 1.35);
      p.age = 0;
      done++;
    }
  },
};
