// ghostplanet.js — the 3D backdrop for spaceghost.bisks.net
//
// A WebGL scene (three.js, loaded straight from CDN — no build step on this
// site) standing in for "being aboard the ship, looking at the ghost planet."
// It's decoration behind the real game in index.html, not a replacement for
// it: if WebGL isn't available or three.js fails to load, we just bail and
// the existing CSS starfield in index.html carries the whole visual.

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

  var camera = new THREE.PerspectiveCamera(60, 1, 0.1, 2000);
  camera.position.set(0, 0, 0);

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

  // ---- the ghost planet ----
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
  planet.position.set(46, -10, -170);
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
  moon.position.set(-30, 18, -110);
  scene.add(moon);

  // ---- drifting ghosts ----
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
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    }));
    var scale = 4 + Math.random() * 7;
    spr.scale.set(scale, scale, 1);
    spr.position.set(
      (Math.random() - 0.5) * 160,
      (Math.random() - 0.5) * 90,
      -30 - Math.random() * 140
    );
    spr.userData.baseY = spr.position.y;
    spr.userData.speed = 0.15 + Math.random() * 0.25;
    spr.userData.offset = Math.random() * Math.PI * 2;
    scene.add(spr);
    ghosts.push(spr);
  }

  // ---- cockpit-window parallax: mouse / touch / gyro nudges the camera ----
  var target = { x: 0, y: 0 };
  var current = { x: 0, y: 0 };

  function onPointer(nx, ny) {
    target.x = nx * 0.35;
    target.y = ny * 0.22;
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

    current.x += (target.x - current.x) * 0.04;
    current.y += (target.y - current.y) * 0.04;
    camera.rotation.y = -current.x;
    camera.rotation.x = -current.y;
    camera.rotation.y += Math.sin(drift * 0.05) * 0.02;

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  if (reduceMotion) {
    renderer.render(scene, camera);
  } else {
    requestAnimationFrame(frame);
  }
})();
