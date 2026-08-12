// cobordism — two disks joined by a tunable neck, reproduced from a
// screenshot in a bsky thread (@buildthis.bisks.net can read images; the
// other bot in that thread said it couldn't). Everything below is one
// self-contained module: build the mesh group from the current control
// values, rebuild it whenever a control changes, render a loop.

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const state = {
  topColor: "#7ee08a",
  bottomColor: "#f0899a",
  diskRadius: 3,
  holeRadius: 0.95,
  separation: 2.6,
  neckOn: true,
  waist: 0.4,
  curve: 1.6,
  neckColorA: "#ffd23f",
  neckColorB: "#4fa8ff",
  haloOn: true,
  haloWidth: 0.35,
  segments: 72,
  wireframe: false,
  autoRotate: true,
  rotateSpeed: 0.3,
  bgColor: "#0b0d12",
};

const DEFAULTS = { ...state };

// ---------- scene setup ----------

const mount = document.getElementById("scene");
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
mount.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(state.bgColor);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
camera.position.set(5.5, 3.2, 7.5);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 2;
controls.maxDistance = 30;

scene.add(new THREE.AmbientLight(0xffffff, 0.55));
const key = new THREE.DirectionalLight(0xffffff, 1.1);
key.position.set(4, 6, 5);
scene.add(key);
const rim = new THREE.DirectionalLight(0x88aaff, 0.5);
rim.position.set(-5, -3, -4);
scene.add(rim);

const group = new THREE.Group();
scene.add(group);

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();

// ---------- geometry builders ----------

function hexColor(c) {
  return new THREE.Color(c);
}

function diskMesh(outerR, innerR, y, color, segments, wireframe) {
  const geo = new THREE.RingGeometry(Math.max(innerR, 0.01), outerR, segments, 1);
  const mat = new THREE.MeshStandardMaterial({
    color: hexColor(color),
    side: THREE.DoubleSide,
    roughness: 0.55,
    metalness: 0.05,
    wireframe,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = y;
  return mesh;
}

function radialGradientRing(innerR, outerR, y, colorInner, colorOuter, segments, wireframe, epsSign) {
  const geo = new THREE.RingGeometry(Math.max(innerR, 0.01), outerR, segments, 1);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const cIn = hexColor(colorInner);
  const cOut = hexColor(colorOuter);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getY(i); // ring geometry is built in XY before we rotate it
    const r = Math.sqrt(x * x + z * z);
    const t = THREE.MathUtils.clamp((r - innerR) / Math.max(outerR - innerR, 1e-4), 0, 1);
    tmp.copy(cIn).lerp(cOut, t);
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    roughness: 0.4,
    metalness: 0.1,
    wireframe,
    emissive: 0x111111,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = y + epsSign * 0.006;
  return mesh;
}

function neckMesh(holeR, waist, separation, curve, colorBottom, colorTop, segments, wireframe) {
  const steps = Math.max(8, Math.round(segments / 2));
  const points = [];
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * 2 - 1; // -1 .. 1
    const y = (t * separation) / 2;
    const r = waist + (holeR - waist) * Math.pow(Math.abs(t), curve);
    points.push(new THREE.Vector2(Math.max(r, 0.01), y));
  }
  const geo = new THREE.LatheGeometry(points, segments);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const cBottom = hexColor(colorBottom);
  const cTop = hexColor(colorTop);
  const tmp = new THREE.Color();
  const half = separation / 2 || 1;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const t = THREE.MathUtils.clamp((y + half) / (2 * half), 0, 1);
    tmp.copy(cBottom).lerp(cTop, t);
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    roughness: 0.35,
    metalness: 0.15,
    wireframe,
  });
  return new THREE.Mesh(geo, mat);
}

function rebuild() {
  while (group.children.length) {
    const m = group.children.pop();
    m.geometry.dispose();
    m.material.dispose();
  }

  const half = state.separation / 2;
  const segs = Math.round(state.segments);

  group.add(diskMesh(state.diskRadius, state.holeRadius, half, state.topColor, segs, state.wireframe));
  group.add(diskMesh(state.diskRadius, state.holeRadius, -half, state.bottomColor, segs, state.wireframe));

  if (state.haloOn) {
    const haloInner = Math.max(state.holeRadius - state.haloWidth, 0.02);
    group.add(radialGradientRing(haloInner, state.holeRadius, half, state.neckColorB, state.neckColorA, segs, state.wireframe, 1));
    group.add(radialGradientRing(haloInner, state.holeRadius, -half, state.neckColorB, state.neckColorA, segs, state.wireframe, -1));
  }

  if (state.neckOn) {
    group.add(neckMesh(state.holeRadius, state.waist, state.separation, state.curve, state.neckColorA, state.neckColorB, segs, state.wireframe));
  }

  scene.background = hexColor(state.bgColor);
}

// ---------- controls wiring ----------

function bindRange(id, key, fmt = (v) => v) {
  const el = document.getElementById(id);
  const out = document.getElementById(id + "Val");
  const sync = () => {
    state[key] = parseFloat(el.value);
    if (out) out.textContent = fmt(state[key]);
    rebuild();
  };
  el.addEventListener("input", sync);
  sync();
}

function bindColor(id, key) {
  const el = document.getElementById(id);
  el.addEventListener("input", () => {
    state[key] = el.value;
    rebuild();
  });
}

function bindCheckbox(id, key, onChange) {
  const el = document.getElementById(id);
  el.addEventListener("change", () => {
    state[key] = el.checked;
    rebuild();
    if (onChange) onChange();
  });
}

bindRange("diskRadius", "diskRadius", (v) => v.toFixed(2));
bindRange("holeRadius", "holeRadius", (v) => v.toFixed(2));
bindRange("separation", "separation", (v) => v.toFixed(2));
bindRange("waist", "waist", (v) => v.toFixed(2));
bindRange("curve", "curve", (v) => v.toFixed(2));
bindRange("haloWidth", "haloWidth", (v) => v.toFixed(2));
bindRange("segments", "segments", (v) => Math.round(v));
bindRange("rotateSpeed", "rotateSpeed", (v) => v.toFixed(2));

bindColor("topColor", "topColor");
bindColor("bottomColor", "bottomColor");
bindColor("neckColorA", "neckColorA");
bindColor("neckColorB", "neckColorB");
bindColor("bgColor", "bgColor");

bindCheckbox("neckOn", "neckOn");
bindCheckbox("haloOn", "haloOn");
bindCheckbox("wireframe", "wireframe");
bindCheckbox("autoRotate", "autoRotate");

document.getElementById("toggle").addEventListener("click", () => {
  document.getElementById("panel").classList.toggle("hidden");
});

document.getElementById("resetBtn").addEventListener("click", () => {
  Object.assign(state, DEFAULTS);
  for (const [id, key] of [
    ["diskRadius", "diskRadius"], ["holeRadius", "holeRadius"], ["separation", "separation"],
    ["waist", "waist"], ["curve", "curve"], ["haloWidth", "haloWidth"],
    ["segments", "segments"], ["rotateSpeed", "rotateSpeed"],
  ]) {
    const el = document.getElementById(id);
    el.value = state[key];
    el.dispatchEvent(new Event("input"));
  }
  for (const [id, key] of [
    ["topColor", "topColor"], ["bottomColor", "bottomColor"],
    ["neckColorA", "neckColorA"], ["neckColorB", "neckColorB"], ["bgColor", "bgColor"],
  ]) {
    document.getElementById(id).value = state[key];
  }
  for (const [id, key] of [["neckOn", "neckOn"], ["haloOn", "haloOn"], ["wireframe", "wireframe"], ["autoRotate", "autoRotate"]]) {
    document.getElementById(id).checked = state[key];
  }
  rebuild();
});

// ---------- status toast ----------

let statusTimer = null;
function toast(msg) {
  const el = document.getElementById("status");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => el.classList.remove("show"), 2200);
}

// ---------- screenshot / share ----------

const SITE_URL = "https://cobordism.bisks.net/";

function frameForCapture(cb) {
  requestAnimationFrame(() => requestAnimationFrame(cb));
}

document.getElementById("screenshotBtn").addEventListener("click", () => {
  frameForCapture(() => {
    const url = renderer.domElement.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = "cobordism.png";
    a.click();
    toast("saved screenshot");
  });
});

function canShareFiles() {
  if (!navigator.share || !navigator.canShare) return false;
  const probe = new File([""], "probe.png", { type: "image/png" });
  return navigator.canShare({ files: [probe] });
}

document.getElementById("shareBtn").addEventListener("click", async () => {
  frameForCapture(async () => {
    const shareText = `built a wobbly little cobordism — two disks joined by a tube, tuned by hand: ${SITE_URL}`;
    if (canShareFiles()) {
      renderer.domElement.toBlob(async (blob) => {
        const file = new File([blob], "cobordism.png", { type: "image/png" });
        try {
          await navigator.share({ files: [file], text: shareText, title: "cobordism" });
          return;
        } catch (e) {
          // fall through to intent link
        }
        window.open(
          "https://bsky.app/intent/compose?text=" + encodeURIComponent(shareText),
          "_blank"
        );
      }, "image/png");
    } else {
      window.open(
        "https://bsky.app/intent/compose?text=" + encodeURIComponent(shareText),
        "_blank"
      );
    }
  });
});

// ---------- export standalone three.js code ----------

document.getElementById("exportBtn").addEventListener("click", () => {
  const html = buildExportHTML(state);
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "cobordism-export.html";
  a.click();
  URL.revokeObjectURL(url);
  toast("exported standalone html");
});

function buildExportHTML(s) {
  const cfg = JSON.stringify(
    {
      topColor: s.topColor,
      bottomColor: s.bottomColor,
      diskRadius: s.diskRadius,
      holeRadius: s.holeRadius,
      separation: s.separation,
      neckOn: s.neckOn,
      waist: s.waist,
      curve: s.curve,
      neckColorA: s.neckColorA,
      neckColorB: s.neckColorB,
      haloOn: s.haloOn,
      haloWidth: s.haloWidth,
      segments: Math.round(s.segments),
      wireframe: s.wireframe,
      autoRotate: s.autoRotate,
      rotateSpeed: s.rotateSpeed,
      bgColor: s.bgColor,
    },
    null,
    2
  );

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>cobordism (exported)</title>
<!--
  Standalone export from https://cobordism.bisks.net/ — no build step,
  no bundler. The only dependency is three.js itself, loaded from a CDN
  via an import map. Open this file directly in a browser.
-->
<style>html,body{margin:0;height:100%;background:${s.bgColor};overflow:hidden}canvas{display:block}</style>
</head>
<body>
<script type="importmap">
{ "imports": { "three": "https://unpkg.com/three@0.160.0/build/three.module.js" } }
<\/script>
<script type="module">
import * as THREE from "three";

const CONFIG = ${cfg};

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(CONFIG.bgColor);

const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
camera.position.set(5.5, 3.2, 7.5);
camera.lookAt(0, 0, 0);

scene.add(new THREE.AmbientLight(0xffffff, 0.55));
const key = new THREE.DirectionalLight(0xffffff, 1.1);
key.position.set(4, 6, 5);
scene.add(key);
const rim = new THREE.DirectionalLight(0x88aaff, 0.5);
rim.position.set(-5, -3, -4);
scene.add(rim);

function diskMesh(outerR, innerR, y, color, segments) {
  const geo = new THREE.RingGeometry(Math.max(innerR, 0.01), outerR, segments, 1);
  const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), side: THREE.DoubleSide, roughness: 0.55, metalness: 0.05, wireframe: CONFIG.wireframe });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = y;
  return mesh;
}

function radialGradientRing(innerR, outerR, y, colorInner, colorOuter, segments, epsSign) {
  const geo = new THREE.RingGeometry(Math.max(innerR, 0.01), outerR, segments, 1);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const cIn = new THREE.Color(colorInner), cOut = new THREE.Color(colorOuter), tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getY(i);
    const r = Math.sqrt(x * x + z * z);
    const t = THREE.MathUtils.clamp((r - innerR) / Math.max(outerR - innerR, 1e-4), 0, 1);
    tmp.copy(cIn).lerp(cOut, t);
    colors[i*3]=tmp.r; colors[i*3+1]=tmp.g; colors[i*3+2]=tmp.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.4, metalness: 0.1, wireframe: CONFIG.wireframe, emissive: 0x111111 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = y + epsSign * 0.006;
  return mesh;
}

function neckMesh(holeR, waist, separation, curve, colorBottom, colorTop, segments) {
  const steps = Math.max(8, Math.round(segments / 2));
  const points = [];
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * 2 - 1;
    const y = (t * separation) / 2;
    const r = waist + (holeR - waist) * Math.pow(Math.abs(t), curve);
    points.push(new THREE.Vector2(Math.max(r, 0.01), y));
  }
  const geo = new THREE.LatheGeometry(points, segments);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const cBottom = new THREE.Color(colorBottom), cTop = new THREE.Color(colorTop), tmp = new THREE.Color();
  const half = separation / 2 || 1;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const t = THREE.MathUtils.clamp((y + half) / (2 * half), 0, 1);
    tmp.copy(cBottom).lerp(cTop, t);
    colors[i*3]=tmp.r; colors[i*3+1]=tmp.g; colors[i*3+2]=tmp.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.35, metalness: 0.15, wireframe: CONFIG.wireframe });
  return new THREE.Mesh(geo, mat);
}

const group = new THREE.Group();
scene.add(group);
const half = CONFIG.separation / 2;
group.add(diskMesh(CONFIG.diskRadius, CONFIG.holeRadius, half, CONFIG.topColor, CONFIG.segments));
group.add(diskMesh(CONFIG.diskRadius, CONFIG.holeRadius, -half, CONFIG.bottomColor, CONFIG.segments));
if (CONFIG.haloOn) {
  const haloInner = Math.max(CONFIG.holeRadius - CONFIG.haloWidth, 0.02);
  group.add(radialGradientRing(haloInner, CONFIG.holeRadius, half, CONFIG.neckColorB, CONFIG.neckColorA, CONFIG.segments, 1));
  group.add(radialGradientRing(haloInner, CONFIG.holeRadius, -half, CONFIG.neckColorB, CONFIG.neckColorA, CONFIG.segments, -1));
}
if (CONFIG.neckOn) {
  group.add(neckMesh(CONFIG.holeRadius, CONFIG.waist, CONFIG.separation, CONFIG.curve, CONFIG.neckColorA, CONFIG.neckColorB, CONFIG.segments));
}

addEventListener("resize", () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
renderer.setSize(innerWidth, innerHeight);

function animate() {
  requestAnimationFrame(animate);
  if (CONFIG.autoRotate) group.rotation.y += CONFIG.rotateSpeed * 0.016;
  renderer.render(scene, camera);
}
animate();
<\/script>
</body>
</html>
`;
}

// ---------- render loop ----------

let last = performance.now();
function animate(now) {
  requestAnimationFrame(animate);
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  if (state.autoRotate) group.rotation.y += state.rotateSpeed * dt;
  controls.update();
  renderer.render(scene, camera);
}

rebuild();
requestAnimationFrame(animate);
