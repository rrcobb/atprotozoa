// scene.js — the 3D geometry itself: two chart wheels facing each other along
// Z, planets marking each person's sky at birth, and lines strung between the
// wheels for every synastry aspect. This is the "actual geometry that exists
// between people" the brief asked for, made literal and orbit-able.

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { BODIES, BODY_META, ZODIAC, ZODIAC_ABBR } from "./synastry.js";

const WHEEL_Z = 6.5;
const RADIUS = 5;

export const WHEEL_COLOR = { A: 0x6ef2c9, B: 0xff9f5f };
export const QUALITY_COLOR = { harmonious: 0x3987e5, tense: 0xe66767, neutral: 0xe0a933 };

function lonToXY(lonDeg, radius) {
  // 0 Aries points "up" (+Y) on the wheel, going clockwise as viewed from
  // outside — matches how a chart wheel reads on paper.
  const rad = (90 - lonDeg) * (Math.PI / 180);
  return [radius * Math.cos(rad), radius * Math.sin(rad)];
}

function makeLabelSprite(text, color, size = 48, scale = 0.55) {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  ctx.font = `${size}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  ctx.fillText(text, 64, 68);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(scale, scale, 1);
  return sprite;
}

function buildWheel(z, colorHex, name) {
  const group = new THREE.Group();
  group.position.z = z;

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(RADIUS - 0.04, RADIUS + 0.04, 128),
    new THREE.MeshBasicMaterial({ color: 0x4a3f66, side: THREE.DoubleSide, transparent: true, opacity: 0.55 })
  );
  group.add(ring);

  const innerRing = new THREE.Mesh(
    new THREE.RingGeometry(RADIUS - 1.6, RADIUS - 1.56, 128),
    new THREE.MeshBasicMaterial({ color: 0x2c2440, side: THREE.DoubleSide, transparent: true, opacity: 0.4 })
  );
  group.add(innerRing);

  // 12 sign ticks + glyphs
  for (let i = 0; i < 12; i++) {
    const lon = i * 30;
    const [x1, y1] = lonToXY(lon, RADIUS - 0.5);
    const [x2, y2] = lonToXY(lon, RADIUS + 0.5);
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x1, y1, 0), new THREE.Vector3(x2, y2, 0)]);
    const tick = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x4a3f66, transparent: true, opacity: 0.6 }));
    group.add(tick);

    const [gx, gy] = lonToXY(lon + 15, RADIUS + 1.05);
    const glyph = makeLabelSprite(ZODIAC_ABBR[ZODIAC[i]], "#a993d6", 34, 0.65);
    glyph.position.set(gx, gy, 0.02);
    group.add(glyph);
  }

  const label = makeLabelSprite(name || "—", colorHexToCss(colorHex), 40, 1.4);
  label.userData.nameLabel = true;
  label.position.set(0, RADIUS + 2.1, 0);
  group.add(label);

  return group;
}

function colorHexToCss(hex) {
  return "#" + hex.toString(16).padStart(6, "0");
}

function planetMarker(colorHex) {
  const geo = new THREE.SphereGeometry(0.14, 16, 16);
  const mat = new THREE.MeshBasicMaterial({ color: colorHex });
  return new THREE.Mesh(geo, mat);
}

function buildStarfield() {
  const COUNT = 900;
  const positions = new Float32Array(COUNT * 3);
  for (let i = 0; i < COUNT; i++) {
    const r = 40 + Math.random() * 60;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({ color: 0x9d8fc9, size: 0.35, transparent: true, opacity: 0.55, sizeAttenuation: true });
  return new THREE.Points(geo, mat);
}

export function initScene(container) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0714);

  const camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 500);
  camera.position.set(11, 6, 16);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.6;
  controls.minDistance = 6;
  controls.maxDistance = 45;

  scene.add(buildStarfield());

  const wheelA = buildWheel(-WHEEL_Z, WHEEL_COLOR.A, "");
  const wheelB = buildWheel(WHEEL_Z, WHEEL_COLOR.B, "");
  scene.add(wheelA, wheelB);

  let dynamicGroup = new THREE.Group();
  scene.add(dynamicGroup);

  function clearDynamic() {
    for (const child of dynamicGroup.children.slice()) {
      dynamicGroup.remove(child);
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    }
  }

  function addWheelContent(group, positions, ascLon, colorHex, aspectList) {
    for (const body of Object.keys(positions)) {
      const meta = BODY_META[body];
      if (!meta) continue;
      const [x, y] = lonToXY(positions[body].lon, RADIUS - 1.0);
      const marker = planetMarker(colorHex);
      marker.position.set(x, y, 0.05);
      group.add(marker);

      const [lx, ly] = lonToXY(positions[body].lon, RADIUS - 1.85);
      const glyph = makeLabelSprite(meta.abbr, "#f2ecff", 34, 0.55);
      glyph.position.set(lx, ly, 0.06);
      group.add(glyph);
    }

    if (typeof ascLon === "number") {
      const [ax, ay] = lonToXY(ascLon, RADIUS + 0.55);
      const [dx, dy] = lonToXY(ascLon + 180, RADIUS + 0.55);
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(dx, dy, -0.01), new THREE.Vector3(ax, ay, -0.01),
      ]);
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0.85 }));
      group.add(line);
      const asclabel = makeLabelSprite("ASC", "#ffe27a", 30, 0.5);
      asclabel.position.set(ax * 1.12, ay * 1.12, 0.02);
      group.add(asclabel);
    }

    for (const entry of aspectList) {
      const [x1, y1] = lonToXY(positions[entry.bodyA].lon, RADIUS - 1.0);
      const [x2, y2] = lonToXY(positions[entry.bodyB].lon, RADIUS - 1.0);
      const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x1, y1, 0.03), new THREE.Vector3(x2, y2, 0.03)]);
      const opacity = 0.55 * (1 - entry.aspect.delta / (entry.aspect.orb * 1.6));
      const mat = new THREE.LineBasicMaterial({ color: QUALITY_COLOR[entry.aspect.quality], transparent: true, opacity: Math.max(0.12, opacity) });
      group.add(new THREE.Line(geo, mat));
    }
  }

  function worldPointFor(wheelGroup, lonDeg) {
    const [x, y] = lonToXY(lonDeg, RADIUS - 1.0);
    return new THREE.Vector3(x, y, wheelGroup.position.z + 0.05);
  }

  function addSynastryLines(list, posA, posB) {
    const positions = [];
    const colors = [];
    const c = new THREE.Color();
    for (const entry of list) {
      const pA = worldPointFor(wheelA, posA[entry.bodyA].lon);
      const pB = worldPointFor(wheelB, posB[entry.bodyB].lon);
      positions.push(pA.x, pA.y, pA.z, pB.x, pB.y, pB.z);
      c.setHex(QUALITY_COLOR[entry.aspect.quality]);
      colors.push(c.r, c.g, c.b, c.r, c.g, c.b);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    const mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.75 });
    const lines = new THREE.LineSegments(geo, mat);
    dynamicGroup.add(lines);
  }

  function update({ nameA, nameB, posA, posB, ascA, ascB, synastry, natalA, natalB, showNatal, maxSynastry }) {
    clearDynamic();

    // (re)build wheel content
    for (const child of wheelA.children.slice()) {
      if (child.userData?.isContent) { wheelA.remove(child); }
    }
    const contentA = new THREE.Group();
    contentA.userData.isContent = true;
    addWheelContent(contentA, posA, ascA, WHEEL_COLOR.A, showNatal ? natalA : []);
    wheelA.add(contentA);

    for (const child of wheelB.children.slice()) {
      if (child.userData?.isContent) { wheelB.remove(child); }
    }
    const contentB = new THREE.Group();
    contentB.userData.isContent = true;
    addWheelContent(contentB, posB, ascB, WHEEL_COLOR.B, showNatal ? natalB : []);
    wheelB.add(contentB);

    const capped = maxSynastry ? synastry.slice(0, maxSynastry) : synastry;
    addSynastryLines(capped, posA, posB);

    setWheelName(wheelA, nameA, WHEEL_COLOR.A);
    setWheelName(wheelB, nameB, WHEEL_COLOR.B);
  }

  function setWheelName(group, text, colorHex) {
    const old = group.children.find((c) => c.userData?.nameLabel);
    if (old) {
      group.remove(old);
      old.material.map.dispose();
      old.material.dispose();
    }
    const label = makeLabelSprite(text || "—", colorHexToCss(colorHex), 42, 1.5);
    label.userData.nameLabel = true;
    label.position.set(0, RADIUS + 2.1, 0);
    group.add(label);
  }

  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);

  let raf = null;
  function animate() {
    raf = requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }
  animate();

  function setAutoRotate(v) {
    controls.autoRotate = v;
  }

  function capture() {
    renderer.render(scene, camera);
    return renderer.domElement.toDataURL("image/png");
  }

  function dispose() {
    if (raf) cancelAnimationFrame(raf);
    resizeObserver.disconnect();
    renderer.dispose();
  }

  return { update, setAutoRotate, capture, dispose, controls, camera };
}
