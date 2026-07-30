// hive.js — the 3D honeycomb: turns a { self, pool } moots result (see
// lib/moots.js) into a navigable hex-grid beehive built with three.js.
//
// Layout: pointy-top hexagonal axial coordinates (q, r), laid out in the XY
// plane, spiralling out ring by ring from the centre — same "rings" spiral
// as redblobgames' hex-grid reference, just implemented locally. Ring 0 is
// the queen's cell (self); rings 1..N fill with one mutual per cell, in the
// order lib/moots.js returned them. Each cell is a hollow hexagonal tunnel:
// six wax side walls (one shared InstancedMesh — 200 identical prisms is a
// lot of draw calls otherwise) running from an open front face at z=0 back
// to a closed cap at z=-DEPTH, where the mutual's avatar sits like a coin at
// the bottom of a well. Fly down a tunnel to see whose it is; back out and
// drift sideways to the next.
//
// Camera: free-fly (WASD + Q/E for up/down, drag to look, wheel to throttle)
// — same shape of controls as sites/cowlick, rewritten small for this scene.
// No physics, no collision — bees don't worry about walls.

import * as THREE from "three";

const AXIAL_DIRS = [
  { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
  { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 },
];

function hexSpiral(maxRing) {
  const out = [{ q: 0, r: 0 }];
  for (let ring = 1; ring <= maxRing; ring++) {
    let hex = { q: AXIAL_DIRS[4].q * ring, r: AXIAL_DIRS[4].r * ring };
    for (let side = 0; side < 6; side++) {
      for (let step = 0; step < ring; step++) {
        out.push(hex);
        hex = { q: hex.q + AXIAL_DIRS[side].q, r: hex.r + AXIAL_DIRS[side].r };
      }
    }
  }
  return out;
}

function ringsNeeded(count) {
  let n = 0;
  while (1 + 3 * n * (n + 1) < count) n++;
  return n;
}

function axialToWorld(q, r, spacing) {
  return {
    x: spacing * Math.sqrt(3) * (q + r / 2),
    y: spacing * 1.5 * r,
  };
}

function hexCorner(i, radius) {
  const a = (Math.PI / 180) * (60 * i - 30);
  return { x: radius * Math.cos(a), y: radius * Math.sin(a) };
}

const TINTS = [
  "#e8a838", "#d9762b", "#c9553f", "#b8894a", "#e0b84a",
  "#cf7f2b", "#a86a3a", "#df9a3d", "#c46a2e", "#b5893f",
];
function tintFor(did) {
  let h = 0;
  for (const c of did || "x") h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  return TINTS[h % TINTS.length];
}

function initials(name) {
  const s = (name || "?").trim();
  return s ? s[0].toUpperCase() : "?";
}

function makePlaceholderTexture(label, colorHex) {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d");
  ctx.fillStyle = colorHex;
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = "rgba(0,0,0,0.12)";
  ctx.fillRect(0, 160, 256, 96);
  ctx.fillStyle = "#fff6e0";
  ctx.font = "700 128px system-ui, -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, 128, 118);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeLabelSprite(text, opts = {}) {
  const { fg = "#fff6e0", bg = "rgba(20,12,4,0.78)", scale = 1 } = opts;
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d");
  const font = "600 40px ui-monospace, 'JetBrains Mono', monospace";
  ctx.font = font;
  const w = Math.max(120, Math.ceil(ctx.measureText(text).width) + 48);
  c.width = w;
  c.height = 64;
  ctx.font = font;
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(0, 0, w, 64, 14);
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, w / 2, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: true, transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set((w / 64) * 2.1 * scale, 2.1 * scale, 1);
  return sprite;
}

function makeBeeTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d");
  ctx.font = "96px serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("🐝", 64, 72);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const SPACING = 7.6; // centre-to-centre distance between neighbouring cells
const CELL_RADIUS = SPACING * 0.9; // slightly smaller so a wax gap shows between cells
const DEPTH = 15; // tunnel length, front (z=0) to back cap (z=-DEPTH)
const QUEEN_SCALE = 1.7;

function buildWallGeometry(radius, depth) {
  const positions = [];
  const uvs = [];
  for (let i = 0; i < 6; i++) {
    const c0 = hexCorner(i, radius);
    const c1 = hexCorner((i + 1) % 6, radius);
    const fa = [c0.x, c0.y, 0];
    const fb = [c1.x, c1.y, 0];
    const ba = [c0.x, c0.y, -depth];
    const bb = [c1.x, c1.y, -depth];
    positions.push(...fa, ...ba, ...bb, ...fa, ...bb, ...fb);
    uvs.push(0, 1, 0, 0, 1, 0, 0, 1, 1, 0, 1, 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.computeVertexNormals();
  return geo;
}

function buildCapGeometry(radius) {
  const shape = new THREE.Shape();
  for (let i = 0; i < 6; i++) {
    const c = hexCorner(i, radius);
    if (i === 0) shape.moveTo(c.x, c.y);
    else shape.lineTo(c.x, c.y);
  }
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
}

function buildRimGeometry(radius) {
  const pts = [];
  for (let i = 0; i <= 6; i++) {
    const c = hexCorner(i % 6, radius);
    pts.push(new THREE.Vector3(c.x, c.y, 0));
  }
  return new THREE.BufferGeometry().setFromPoints(pts);
}

export function createHive(canvas, { mountImgProxy } = {}) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    preserveDrawingBuffer: true, // needed for the share screenshot's toBlob()
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));

  const BG = new THREE.Color(0x0c0703);
  const scene = new THREE.Scene();
  scene.background = BG;
  scene.fog = new THREE.FogExp2(BG.getHex(), 0.016);

  const camera = new THREE.PerspectiveCamera(66, 1, 0.05, 500);
  camera.position.set(0, 0, 34);

  scene.add(new THREE.HemisphereLight(0xffcf8a, 0x1a0e04, 0.85));
  const key = new THREE.DirectionalLight(0xffe2ad, 1.1);
  key.position.set(10, 18, 22);
  scene.add(key);

  const wallMaterial = new THREE.MeshStandardMaterial({
    color: 0xc9862f,
    roughness: 0.55,
    metalness: 0.08,
    emissive: 0x21100a,
    emissiveIntensity: 0.35,
    side: THREE.DoubleSide,
  });
  const rimMaterial = new THREE.LineBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0.55 });

  const wallGeo = buildWallGeometry(CELL_RADIUS, DEPTH);
  const capGeo = buildCapGeometry(CELL_RADIUS);
  const rimGeo = buildRimGeometry(CELL_RADIUS);

  const queenWallGeo = buildWallGeometry(CELL_RADIUS * QUEEN_SCALE, DEPTH * 1.15);
  const queenCapGeo = buildCapGeometry(CELL_RADIUS * QUEEN_SCALE);
  const queenRimGeo = buildRimGeometry(CELL_RADIUS * QUEEN_SCALE);
  const queenWallMaterial = new THREE.MeshStandardMaterial({
    color: 0xffcf5c,
    roughness: 0.4,
    metalness: 0.15,
    emissive: 0x8a5a10,
    emissiveIntensity: 0.6,
    side: THREE.DoubleSide,
  });

  const group = new THREE.Group();
  scene.add(group);

  const capMeshes = []; // { mesh, entry } — entry is null for empty spiral slots (shouldn't happen, count matches)
  const entries = []; // public list for the sidebar: { index, handle, displayName, x, y }
  let instancedWalls = null;

  function textureUrlFor(rawAvatar) {
    if (!rawAvatar) return null;
    if (!mountImgProxy) return rawAvatar;
    return `${mountImgProxy}?u=${encodeURIComponent(rawAvatar)}`;
  }

  function buildScene({ self, pool }) {
    // clear any previous hive (loading a second handle without a reload)
    while (group.children.length) group.remove(group.children[0]);
    capMeshes.length = 0;
    entries.length = 0;

    const cells = hexSpiral(ringsNeeded(1 + pool.length)).slice(0, 1 + pool.length);
    const loader = new THREE.TextureLoader();
    loader.crossOrigin = "anonymous";

    // queen cell — self, ring 0, always cells[0]
    {
      const rim = new THREE.LineLoop(queenRimGeo, rimMaterial);
      const wall = new THREE.Mesh(queenWallGeo, queenWallMaterial);
      const cap = new THREE.Mesh(queenCapGeo, new THREE.MeshBasicMaterial({
        map: makePlaceholderTexture(initials(self.displayName || self.handle), "#8a5a10"),
      }));
      cap.position.z = -DEPTH * 1.15;
      wall.add(rim);
      group.add(wall, cap);
      const label = makeLabelSprite(`👑 @${self.handle}`, { fg: "#2a1a02", bg: "rgba(255,207,92,0.92)", scale: 1.15 });
      label.position.set(0, CELL_RADIUS * QUEEN_SCALE + 2.4, 2);
      group.add(label);
      capMeshes.push({ mesh: cap, entry: { index: 0, handle: self.handle, displayName: self.displayName, did: self.did, avatar: self.avatar, isSelf: true } });
      entries.push({ index: 0, handle: self.handle, displayName: self.displayName, did: self.did, avatar: self.avatar, isSelf: true, x: 0, y: 0, depth: DEPTH * 1.15 });

      if (self.avatar) {
        loader.load(textureUrlFor(self.avatar), (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          cap.material.map = tex;
          cap.material.needsUpdate = true;
        }, undefined, () => {});
      }
    }

    // instanced walls for every mutual cell (positions set below)
    const n = cells.length - 1;
    instancedWalls = new THREE.InstancedMesh(wallGeo, wallMaterial, Math.max(1, n));
    instancedWalls.count = n;
    group.add(instancedWalls);

    const m4 = new THREE.Matrix4();
    for (let i = 1; i < cells.length; i++) {
      const p = pool[i - 1];
      const { q, r } = cells[i];
      const { x, y } = axialToWorld(q, r, SPACING);

      m4.makeTranslation(x, y, 0);
      instancedWalls.setMatrixAt(i - 1, m4);

      const rim = new THREE.LineLoop(rimGeo, rimMaterial);
      rim.position.set(x, y, 0);
      group.add(rim);

      const capMat = new THREE.MeshBasicMaterial({
        map: makePlaceholderTexture(initials(p.displayName || p.handle), tintFor(p.did)),
      });
      const cap = new THREE.Mesh(capGeo, capMat);
      cap.position.set(x, y, -DEPTH);
      group.add(cap);

      capMeshes.push({ mesh: cap, entry: { index: i, handle: p.handle, displayName: p.displayName, did: p.did, avatar: p.avatar, isSelf: false } });
      entries.push({ index: i, handle: p.handle, displayName: p.displayName, did: p.did, avatar: p.avatar, isSelf: false, x, y, depth: DEPTH });

      if (p.avatar) {
        loader.load(textureUrlFor(p.avatar), (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          capMat.map = tex;
          capMat.needsUpdate = true;
        }, undefined, () => {});
      }
    }
    instancedWalls.instanceMatrix.needsUpdate = true;

    // reset camera to spawn, looking down -Z at the queen's cell
    camera.position.set(0, 3.2, 30);
    yaw = 0;
    pitch = -0.05;
    applyLook();

    return entries.slice();
  }

  // ---- free-fly controls -------------------------------------------------
  let yaw = 0;
  let pitch = 0;
  const keys = new Set();
  let dragging = false;
  let dragMoved = 0;
  let lastX = 0;
  let lastY = 0;
  let throttle = 1;
  let onSelect = null;
  let flying = null; // { from, to, fromQuat, toQuat, t0, dur } during a flyTo tween

  function applyLook() {
    camera.quaternion.setFromEuler(new THREE.Euler(pitch, yaw, 0, "YXZ"));
  }

  function isTypingTarget(el) {
    return el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA");
  }

  function onKeyDown(e) {
    if (isTypingTarget(document.activeElement)) return;
    keys.add(e.code);
  }
  function onKeyUp(e) {
    keys.delete(e.code);
  }
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

  function pointerDown(e) {
    dragging = true;
    dragMoved = 0;
    lastX = e.clientX;
    lastY = e.clientY;
    flying = null;
    try { canvas.setPointerCapture(e.pointerId); } catch {}
  }
  function pointerMove(e) {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    dragMoved += Math.abs(dx) + Math.abs(dy);
    yaw -= dx * 0.0032;
    pitch -= dy * 0.0032;
    pitch = Math.max(-1.5, Math.min(1.5, pitch));
    applyLook();
  }
  function pointerUp(e) {
    dragging = false;
    try { canvas.releasePointerCapture(e.pointerId); } catch {}
    if (dragMoved < 6) tryPick(e.clientX, e.clientY);
  }
  canvas.addEventListener("pointerdown", pointerDown);
  canvas.addEventListener("pointermove", pointerMove);
  canvas.addEventListener("pointerup", pointerUp);
  canvas.addEventListener("pointercancel", () => { dragging = false; });
  canvas.addEventListener("wheel", (e) => {
    throttle = Math.max(0.25, Math.min(4, throttle - e.deltaY * 0.001));
    e.preventDefault();
  }, { passive: false });

  const raycaster = new THREE.Raycaster();
  function tryPick(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(capMeshes.map((c) => c.mesh));
    if (hits.length && onSelect) {
      const hitMesh = hits[0].object;
      const found = capMeshes.find((c) => c.mesh === hitMesh);
      if (found) onSelect(found.entry);
    }
  }

  const FORWARD_SPEED = 16;
  function step(dt) {
    if (flying) {
      const t = Math.min(1, (performance.now() - flying.t0) / flying.dur);
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // easeInOutQuad
      camera.position.lerpVectors(flying.from, flying.to, e);
      camera.quaternion.slerpQuaternions(flying.fromQuat, flying.toQuat, e);
      if (t >= 1) {
        yaw = new THREE.Euler().setFromQuaternion(camera.quaternion, "YXZ").y;
        pitch = new THREE.Euler().setFromQuaternion(camera.quaternion, "YXZ").x;
        flying = null;
      }
    } else if (!isTypingTarget(document.activeElement)) {
      const boost = (keys.has("ShiftLeft") || keys.has("ShiftRight")) ? 2.6 : 1;
      const speed = FORWARD_SPEED * throttle * boost * dt;
      if (keys.has("KeyW") || keys.has("ArrowUp")) camera.translateZ(-speed);
      if (keys.has("KeyS") || keys.has("ArrowDown")) camera.translateZ(speed);
      if (keys.has("KeyA") || keys.has("ArrowLeft")) camera.translateX(-speed);
      if (keys.has("KeyD") || keys.has("ArrowRight")) camera.translateX(speed);
      if (keys.has("KeyQ")) camera.translateY(-speed);
      if (keys.has("KeyE")) camera.translateY(speed);
      if (thrustHeld) camera.translateZ(-speed);
    }

    // gentle bee wander
    const t = performance.now() / 1000;
    for (const b of bees) {
      b.sprite.position.set(
        b.cx + Math.sin(t * b.sx + b.ph) * b.rx,
        b.cy + Math.sin(t * b.sy * 1.3 + b.ph) * b.ry,
        b.cz + Math.cos(t * b.sz + b.ph) * b.rz,
      );
    }

    const maxR = SPACING * (ringsNeeded(entries.length || 1) + 3) + 20;
    if (camera.position.length() > maxR) camera.position.setLength(maxR);

    renderer.render(scene, camera);
  }

  // ---- decorative wandering bees ------------------------------------------
  const beeTex = makeBeeTexture();
  const bees = [];
  function seedBees(radius) {
    for (const b of bees) group.remove(b.sprite);
    bees.length = 0;
    const count = 10;
    for (let i = 0; i < count; i++) {
      const mat = new THREE.SpriteMaterial({ map: beeTex, transparent: true });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.set(1.4, 1.4, 1);
      const cx = (Math.random() - 0.5) * radius * 1.6;
      const cy = (Math.random() - 0.5) * radius * 0.9;
      const cz = -Math.random() * DEPTH * 3 - 4;
      group.add(sprite);
      bees.push({
        sprite, cx, cy, cz,
        rx: 3 + Math.random() * 4, ry: 2 + Math.random() * 3, rz: 3 + Math.random() * 5,
        sx: 0.2 + Math.random() * 0.3, sy: 0.2 + Math.random() * 0.3, sz: 0.15 + Math.random() * 0.25,
        ph: Math.random() * Math.PI * 2,
      });
    }
  }

  let thrustHeld = false;
  let raf = null;
  let lastT = performance.now();
  function frame() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    step(dt);
    raf = requestAnimationFrame(frame);
  }

  function resize(w, h) {
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }

  function flyToIndex(index) {
    const entry = entries[index];
    if (!entry) return;
    // hover just outside the tunnel mouth (z=0 plane), looking straight down
    // the tunnel at the cap. Same approach point regardless of grid position
    // — it's always "in front of this cell's opening", not derived from a
    // scene-relative direction, so it can't skew off toward the wrong side.
    const approach = new THREE.Vector3(entry.x, entry.y, 8);
    const target = new THREE.Vector3(entry.x, entry.y, -entry.depth);
    const toQuat = new THREE.Quaternion();
    const m = new THREE.Matrix4().lookAt(approach, target, new THREE.Vector3(0, 1, 0));
    toQuat.setFromRotationMatrix(m);
    flying = {
      from: camera.position.clone(),
      to: approach,
      fromQuat: camera.quaternion.clone(),
      toQuat,
      t0: performance.now(),
      dur: 1100,
    };
  }

  function screenshot() {
    return new Promise((resolve) => {
      renderer.render(scene, camera);
      canvas.toBlob((blob) => resolve(blob), "image/png");
    });
  }

  function setThrust(held) { thrustHeld = held; }

  function start() {
    lastT = performance.now();
    if (!raf) frame();
  }
  function stop() {
    if (raf) cancelAnimationFrame(raf);
    raf = null;
  }
  function dispose() {
    stop();
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    renderer.dispose();
  }

  return {
    load(data) {
      const list = buildScene(data);
      seedBees(SPACING * (ringsNeeded(list.length) + 1));
      return list;
    },
    resize,
    flyToIndex,
    screenshot,
    setThrust,
    start,
    stop,
    dispose,
    set onSelect(fn) { onSelect = fn; },
  };
}
