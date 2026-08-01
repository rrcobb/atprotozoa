// ghostplanet.js — the 3D set for spaceghost.bisks.net
//
// A WebGL scene (three.js, loaded straight from CDN — no build step on this
// site) for actually being aboard Space Ghost's ship: a console in front of
// you, Space Ghost's ghostly shape across it, Zorak caged off to one side,
// Moltar's flickering control-room screen on the other, and the ghost planet
// drifting outside the viewport behind them all. It's the backdrop the real
// game in index.html runs on top of: if WebGL isn't available or three.js
// fails to load, we bail and the existing CSS starfield in index.html
// carries the whole visual.
//
// index.html calls window.SpaceGhostScene.speak(cls) every time a new
// transcript line lands, so the matching character on set lights up.

import * as THREE from "three";

(function () {
  "use strict";

  var canvas = document.getElementById("glScene");
  if (!canvas) return;

  // quick WebGL support probe — if it fails, bail and leave the flat CSS
  // starfield in index.html to carry the whole background.
  try {
    var probe = document.createElement("canvas");
    var gl = probe.getContext("webgl2") || probe.getContext("webgl");
    if (!gl) return;
  } catch (e) {
    return;
  }

  // keep our literal hex colors rendering as written, not sRGB-remapped
  THREE.ColorManagement.enabled = false;

  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false, powerPreference: "low-power" });
  } catch (e) {
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x05010c, 1);

  var scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x05010c, 0.0022);

  var camera = new THREE.PerspectiveCamera(62, 1, 0.1, 2000);
  camera.position.set(0, 1.2, 4);

  // ---- starfield ----
  (function addStars() {
    var count = 2600;
    var positions = new Float32Array(count * 3);
    var colors = new Float32Array(count * 3);
    var palette = [
      [1, 1, 1],
      [0.75, 0.65, 1],
      [1, 0.82, 0.55],
      [0.6, 0.95, 0.9]
    ];
    for (var i = 0; i < count; i++) {
      var r = 260 + Math.random() * 480;
      var theta = Math.random() * Math.PI * 2;
      var phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
      var c = palette[(Math.random() * palette.length) | 0];
      var flick = 0.55 + Math.random() * 0.45;
      colors[i * 3] = c[0] * flick;
      colors[i * 3 + 1] = c[1] * flick;
      colors[i * 3 + 2] = c[2] * flick;
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    var mat = new THREE.PointsMaterial({
      size: 1.6,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false
    });
    var stars = new THREE.Points(geo, mat);
    scene.add(stars);
  })();

  // ---- the ghost planet, seen out the viewport behind the set ----
  var planetUniforms = {
    uTime: { value: 0 },
    uColorA: { value: new THREE.Color(0x1a0a33) },
    uColorB: { value: new THREE.Color(0x26f2c9) },
    uColorC: { value: new THREE.Color(0xff2f92) },
    uGlow: { value: new THREE.Color(0xd9c9ff) }
  };

  var planetMat = new THREE.ShaderMaterial({
    uniforms: planetUniforms,
    vertexShader: [
      "varying vec3 vNormal;",
      "varying vec3 vPosition;",
      "varying vec3 vViewPosition;",
      "void main() {",
      "  vNormal = normalize(normalMatrix * normal);",
      "  vPosition = position;",
      "  vec4 mv = modelViewMatrix * vec4(position, 1.0);",
      "  vViewPosition = -mv.xyz;",
      "  gl_Position = projectionMatrix * mv;",
      "}"
    ].join("\n"),
    fragmentShader: [
      "uniform float uTime;",
      "uniform vec3 uColorA;",
      "uniform vec3 uColorB;",
      "uniform vec3 uColorC;",
      "uniform vec3 uGlow;",
      "varying vec3 vNormal;",
      "varying vec3 vPosition;",
      "varying vec3 vViewPosition;",
      "void main() {",
      "  float n = sin(vPosition.x * 2.6 + uTime * 0.25) * cos(vPosition.y * 2.1 - uTime * 0.18);",
      "  n += sin(vPosition.z * 3.4 + uTime * 0.12) * 0.6;",
      "  n = n * 0.5 + 0.5;",
      "  vec3 col = mix(uColorA, uColorB, n);",
      "  float n2 = sin(vPosition.y * 4.4 - uTime * 0.32) * 0.5 + 0.5;",
      "  col = mix(col, uColorC, n2 * 0.35);",
      "  vec3 viewDir = normalize(vViewPosition);",
      "  float fresnel = pow(1.0 - max(dot(viewDir, normalize(vNormal)), 0.0), 2.2);",
      "  col += uGlow * fresnel * 0.9;",
      "  gl_FragColor = vec4(col, 1.0);",
      "}"
    ].join("\n")
  });

  var planet = new THREE.Mesh(new THREE.SphereGeometry(26, 64, 64), planetMat);
  planet.position.set(30, 6, -150);
  scene.add(planet);

  var ring = new THREE.Mesh(
    new THREE.RingGeometry(34, 44, 96),
    new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.16, side: THREE.DoubleSide })
  );
  ring.position.copy(planet.position);
  ring.rotation.x = Math.PI / 2.4;
  ring.rotation.y = 0.3;
  scene.add(ring);

  // second, smaller moon for depth
  var moon = new THREE.Mesh(
    new THREE.SphereGeometry(4, 24, 24),
    new THREE.MeshBasicMaterial({ color: 0x8f7fae })
  );
  moon.position.set(-24, 20, -100);
  scene.add(moon);

  // ---- the ship's viewport frame, planet visible through it ----
  (function addViewportFrame() {
    var frameMat = new THREE.MeshBasicMaterial({ color: 0x3a2456 });
    var w = 74, h = 34, t = 1.6, z = -30, cy = 8;
    var top = new THREE.Mesh(new THREE.BoxGeometry(w + t * 2, t, t), frameMat);
    top.position.set(0, cy + h / 2, z);
    var bottom = top.clone();
    bottom.position.set(0, cy - h / 2, z);
    var left = new THREE.Mesh(new THREE.BoxGeometry(t, h, t), frameMat);
    left.position.set(-w / 2, cy, z);
    var right = left.clone();
    right.position.set(w / 2, cy, z);
    scene.add(top, bottom, left, right);
  })();

  // ---- drifting ghosts, out past the viewport ----
  var ghostTexture = (function () {
    var c = document.createElement("canvas");
    c.width = c.height = 128;
    var ctx = c.getContext("2d");
    var g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, "rgba(244,234,255,0.9)");
    g.addColorStop(0.4, "rgba(200,160,255,0.35)");
    g.addColorStop(1, "rgba(200,160,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  })();

  var ghosts = [];
  for (var g = 0; g < 10; g++) {
    var spr = new THREE.Sprite(new THREE.SpriteMaterial({
      map: ghostTexture,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    }));
    var scale = 4 + Math.random() * 7;
    spr.scale.set(scale, scale, 1);
    spr.position.set(
      (Math.random() - 0.5) * 160 + 10,
      6 + (Math.random() - 0.5) * 60,
      -34 - Math.random() * 130
    );
    spr.userData.baseY = spr.position.y;
    spr.userData.speed = 0.15 + Math.random() * 0.25;
    spr.userData.offset = Math.random() * Math.PI * 2;
    scene.add(spr);
    ghosts.push(spr);
  }

  // =========================================================================
  // the set: console in front of you, the crew around it
  // =========================================================================

  var characters = {}; // cls -> { group, pulse, targets:[{mesh, base, bright}] }

  function registerCharacter(cls, group) {
    characters[cls] = { group: group, pulse: 0, targets: [] };
    return characters[cls];
  }

  function addPulseTarget(cls, mesh, baseHex, brightHex) {
    characters[cls].targets.push({
      mesh: mesh,
      base: new THREE.Color(baseHex),
      bright: new THREE.Color(brightHex)
    });
  }

  // ---- console ----
  var consoleButtons = [];
  var console3d = new THREE.Group();
  console3d.position.set(0, -3.4, -6.5);
  (function buildConsole() {
    var body = new THREE.Mesh(
      new THREE.BoxGeometry(15, 1.6, 4),
      new THREE.MeshBasicMaterial({ color: 0x140a24 })
    );
    console3d.add(body);

    var edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(body.geometry),
      new THREE.LineBasicMaterial({ color: 0x3a2456 })
    );
    edges.position.copy(body.position);
    console3d.add(edges);

    var buttonColors = [0xff2f92, 0x26f2c9, 0xffd23f];
    var cols = 12, rows = 2;
    for (var r = 0; r < rows; r++) {
      for (var c2 = 0; c2 < cols; c2++) {
        var hex = buttonColors[(r * cols + c2) % buttonColors.length];
        var btn = new THREE.Mesh(
          new THREE.CylinderGeometry(0.22, 0.22, 0.12, 10),
          new THREE.MeshBasicMaterial({ color: hex })
        );
        btn.position.set(-6.4 + c2 * 1.17, 0.86, -1 + r * 1.2);
        btn.userData.baseColor = new THREE.Color(hex);
        btn.userData.phase = Math.random() * Math.PI * 2;
        btn.userData.speed = 1.4 + Math.random() * 2.2;
        console3d.add(btn);
        consoleButtons.push(btn);
      }
    }
  })();
  scene.add(console3d);

  // ---- Space Ghost, across the console ----
  var sgGroup = new THREE.Group();
  sgGroup.position.set(0, 0.4, -13);
  (function buildSpaceGhost() {
    var cape = new THREE.Mesh(
      new THREE.ConeGeometry(2.6, 5.4, 10, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x2a1140, transparent: true, opacity: 0.88, side: THREE.DoubleSide })
    );
    cape.position.set(0, -1.3, 0);
    sgGroup.add(cape);

    var head = new THREE.Mesh(
      new THREE.SphereGeometry(1.5, 24, 24),
      new THREE.MeshBasicMaterial({ color: 0xf4eaff, transparent: true, opacity: 0.92 })
    );
    head.position.set(0, 2.2, 0);
    sgGroup.add(head);

    var eyeMat = new THREE.MeshBasicMaterial({ color: 0x140a24 });
    var eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 10), eyeMat);
    eyeL.position.set(-0.5, 2.25, 1.3);
    var eyeR = eyeL.clone();
    eyeR.position.set(0.5, 2.25, 1.3);
    sgGroup.add(eyeL, eyeR);

    var bandMat = new THREE.MeshBasicMaterial({ color: 0xff2f92 });
    var bandL = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.12, 8, 16), bandMat);
    bandL.position.set(-2.1, 0.4, 0.6);
    bandL.rotation.y = Math.PI / 2.4;
    var bandR = bandL.clone();
    bandR.position.set(2.1, 0.4, 0.6);
    sgGroup.add(bandL, bandR);

    scene.add(sgGroup);
    var rc = registerCharacter("host", sgGroup);
    rc.baseY = sgGroup.position.y;
    addPulseTarget("host", head, 0xf4eaff, 0xffffff);
    addPulseTarget("host", bandL, 0xff2f92, 0xffffff);
    addPulseTarget("host", bandR, 0xff2f92, 0xffffff);
  })();

  // ---- Zorak, caged off to the left ----
  var zorakGroup = new THREE.Group();
  zorakGroup.position.set(-9.5, -1.6, -10);
  (function buildZorak() {
    var cageMat = new THREE.LineBasicMaterial({ color: 0x4a4517 });
    var cage = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(3, 3.4, 3)),
      cageMat
    );
    zorakGroup.add(cage);

    var bodyMat = new THREE.MeshBasicMaterial({ color: 0x3ddc5b });
    var body = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 12), bodyMat);
    body.scale.set(1, 0.85, 1.6);
    body.position.set(0, -0.2, 0);
    zorakGroup.add(body);

    var head = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.7, 8), bodyMat);
    head.rotation.x = Math.PI / 2;
    head.position.set(0, 0.05, 0.9);
    zorakGroup.add(head);

    var legMat = new THREE.MeshBasicMaterial({ color: 0x2f7a30 });
    for (var i = 0; i < 4; i++) {
      var leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 6), legMat);
      var side = i % 2 === 0 ? -1 : 1;
      leg.position.set(side * 0.55, -0.55, -0.4 + (i < 2 ? 0 : 0.7));
      leg.rotation.z = side * 0.6;
      zorakGroup.add(leg);
    }

    scene.add(zorakGroup);
    var rc = registerCharacter("zorak", zorakGroup);
    rc.baseY = zorakGroup.position.y;
    addPulseTarget("zorak", body, 0x3ddc5b, 0xbfffc9);
    addPulseTarget("zorak", head, 0x3ddc5b, 0xbfffc9);
    addPulseTarget("zorak", cage, 0x4a4517, 0xffd23f);
  })();

  // ---- Moltar, flickering control-room screen to the right ----
  var moltarGroup = new THREE.Group();
  moltarGroup.position.set(9.5, -1.1, -10);
  var moltarCtx, moltarTexture;
  (function buildMoltar() {
    var frame = new THREE.Mesh(
      new THREE.BoxGeometry(3.6, 2.6, 0.3),
      new THREE.MeshBasicMaterial({ color: 0x1c1008 })
    );
    moltarGroup.add(frame);

    var mc = document.createElement("canvas");
    mc.width = 128; mc.height = 96;
    moltarCtx = mc.getContext("2d");
    moltarTexture = new THREE.CanvasTexture(mc);

    var screen = new THREE.Mesh(
      new THREE.PlaneGeometry(3.1, 2.1),
      new THREE.MeshBasicMaterial({ map: moltarTexture })
    );
    screen.position.set(0, 0, 0.17);
    moltarGroup.add(screen);

    scene.add(moltarGroup);
    var rc = registerCharacter("moltar", moltarGroup);
    rc.baseY = moltarGroup.position.y;
    rc.screenMesh = screen;
  })();

  function paintMoltarScreen(intensity) {
    if (!moltarCtx) return;
    var w = moltarCtx.canvas.width, h = moltarCtx.canvas.height;
    moltarCtx.fillStyle = "#1c1008";
    moltarCtx.fillRect(0, 0, w, h);
    var bars = 5 + Math.floor(intensity * 6);
    for (var i = 0; i < bars; i++) {
      var flicker = 0.35 + Math.random() * 0.65 * (0.5 + intensity);
      var hue = Math.random() < 0.7 ? "255,154,77" : "255,210,63";
      moltarCtx.fillStyle = "rgba(" + hue + "," + flicker.toFixed(2) + ")";
      var bw = 6 + Math.random() * 26;
      var bh = 3 + Math.random() * 14;
      moltarCtx.fillRect(Math.random() * (w - bw), Math.random() * (h - bh), bw, bh);
    }
    moltarTexture.needsUpdate = true;
  }
  paintMoltarScreen(0.2);

  // ---- Brak, small and off to the side ----
  var brakGroup = new THREE.Group();
  brakGroup.position.set(4.4, -2.6, -8.5);
  (function buildBrak() {
    var mat = new THREE.MeshBasicMaterial({ color: 0xff7fd8 });
    var body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 14), mat);
    body.scale.set(1, 1.1, 0.9);
    brakGroup.add(body);
    var eyeMat = new THREE.MeshBasicMaterial({ color: 0x140a24 });
    var eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), eyeMat);
    eyeL.position.set(-0.18, 0.1, 0.42);
    var eyeR = eyeL.clone();
    eyeR.position.set(0.18, 0.1, 0.42);
    brakGroup.add(eyeL, eyeR);
    brakGroup.scale.setScalar(0.9);

    scene.add(brakGroup);
    var rc = registerCharacter("brak", brakGroup);
    rc.baseY = brakGroup.position.y;
    addPulseTarget("brak", body, 0xff7fd8, 0xffffff);
  })();

  window.SpaceGhostScene = {
    speak: function (cls) {
      var ch = characters[cls];
      if (ch) ch.pulse = 1;
    }
  };

  // ---- cockpit-window parallax: mouse / touch / gyro nudges the camera ----
  var target = { x: 0, y: 0 };
  var current = { x: 0, y: 0 };
  var baseTiltX = -0.05;

  function onPointer(nx, ny) {
    target.x = nx * 0.3;
    target.y = ny * 0.18;
  }
  window.addEventListener("mousemove", function (e) {
    var nx = (e.clientX / window.innerWidth) * 2 - 1;
    var ny = (e.clientY / window.innerHeight) * 2 - 1;
    onPointer(nx, -ny);
  }, { passive: true });
  window.addEventListener("touchmove", function (e) {
    if (!e.touches || !e.touches[0]) return;
    var t = e.touches[0];
    var nx = (t.clientX / window.innerWidth) * 2 - 1;
    var ny = (t.clientY / window.innerHeight) * 2 - 1;
    onPointer(nx, -ny);
  }, { passive: true });
  if (window.DeviceOrientationEvent) {
    window.addEventListener("deviceorientation", function (e) {
      if (e.gamma == null || e.beta == null) return;
      onPointer(Math.max(-1, Math.min(1, e.gamma / 30)), Math.max(-1, Math.min(1, (e.beta - 45) / 30)));
    }, { passive: true });
  }

  function resize() {
    var w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", resize, { passive: true });
  resize();

  document.body.classList.add("gl-active");

  var clock = new THREE.Clock();
  var drift = 0;
  var moltarRepaintAcc = 0;

  function frame() {
    var dt = clock.getDelta();
    drift += dt;

    planetUniforms.uTime.value = drift;
    planet.rotation.y += dt * 0.03;
    ring.rotation.z += dt * 0.01;

    ghosts.forEach(function (spr) {
      spr.position.y = spr.userData.baseY + Math.sin(drift * spr.userData.speed + spr.userData.offset) * 4;
      spr.position.x += Math.cos(drift * spr.userData.speed * 0.5 + spr.userData.offset) * 0.01;
    });

    consoleButtons.forEach(function (btn) {
      var t = Math.sin(drift * btn.userData.speed + btn.userData.phase) * 0.5 + 0.5;
      btn.material.color.copy(btn.userData.baseColor).multiplyScalar(0.55 + t * 0.6);
    });

    sgGroup.position.y = characters.host.baseY + Math.sin(drift * 0.7) * 0.15;
    brakGroup.position.y = characters.brak.baseY + Math.sin(drift * 1.3 + 1) * 0.1;

    Object.keys(characters).forEach(function (cls) {
      var ch = characters[cls];
      ch.pulse *= 0.93;
      var p = ch.pulse;
      ch.group.scale.setScalar((cls === "brak" ? 0.9 : 1) * (1 + p * 0.16));
      ch.targets.forEach(function (t2) {
        t2.mesh.material.color.copy(t2.base).lerp(t2.bright, p);
      });
    });

    moltarRepaintAcc += dt;
    var moltarPulse = characters.moltar.pulse;
    if (moltarRepaintAcc > (0.12 - moltarPulse * 0.08)) {
      moltarRepaintAcc = 0;
      paintMoltarScreen(0.2 + moltarPulse);
    }

    current.x += (target.x - current.x) * 0.04;
    current.y += (target.y - current.y) * 0.04;
    camera.rotation.y = -current.x;
    camera.rotation.x = baseTiltX - current.y;
    camera.rotation.y += Math.sin(drift * 0.05) * 0.015;

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  if (reduceMotion) {
    renderer.render(scene, camera);
  } else {
    requestAnimationFrame(frame);
  }
})();
