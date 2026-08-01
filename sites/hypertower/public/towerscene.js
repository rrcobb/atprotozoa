// towerscene.js — the 3D tower viewport for hypertower.bisks.net
//
// Pure rendering: stacked blocks, the falling piece (solid cells vs the
// translucent "ghost" cells hanging off the visible w=0 plane), a drag-to-
// orbit camera, and a slowly tumbling wireframe tesseract in the background
// for flavor. hypertower.js (the game engine + UI) calls the functions on
// window.HyperTowerScene after every state change; this file owns no game
// logic of its own — see hypertower.js for the 4D rotation math and rules.
//
// GX/GY/GZ below must match the DIMS in hypertower.js — small intentional
// duplication, not a shared import (house style: copy, don't abstract).

import * as THREE from "three";

(function () {
  "use strict";

  var canvas = document.getElementById("towerCanvas");
  if (!canvas) return;

  try {
    var probe = document.createElement("canvas");
    var gl = probe.getContext("webgl2") || probe.getContext("webgl");
    if (!gl) { document.body.classList.add("no-webgl"); return; }
  } catch (e) {
    document.body.classList.add("no-webgl");
    return;
  }

  THREE.ColorManagement.enabled = false;

  var GX = 5, GY = 16, GZ = 5;
  var MAX_CELLS = GX * GY * GZ;

  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
  } catch (e) {
    document.body.classList.add("no-webgl");
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x070212, 1);

  var scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x070212, 0.02);

  var center = new THREE.Vector3(GX / 2, GY * 0.42, GZ / 2);
  var camera = new THREE.PerspectiveCamera(48, 1, 0.1, 300);

  // ---- orbit camera (drag / touch to look around, wheel to zoom) ----
  var orbit = { theta: Math.PI * 0.27, phi: Math.PI * 0.36, radius: Math.max(GX, GZ, GY) * 1.5 };
  function updateCamera() {
    var p = orbit.phi;
    camera.position.set(
      center.x + orbit.radius * Math.sin(p) * Math.sin(orbit.theta),
      center.y + orbit.radius * Math.cos(p),
      center.z + orbit.radius * Math.sin(p) * Math.cos(orbit.theta)
    );
    camera.lookAt(center);
  }
  updateCamera();

  var dragging = false, lastX = 0, lastY = 0, dragged = false;
  canvas.addEventListener("pointerdown", function (e) {
    dragging = true; dragged = false; lastX = e.clientX; lastY = e.clientY;
    canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", function (e) {
    if (!dragging) return;
    var dx = e.clientX - lastX, dy = e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    if (Math.abs(dx) + Math.abs(dy) > 2) dragged = true;
    orbit.theta -= dx * 0.006;
    orbit.phi = Math.max(0.18, Math.min(Math.PI - 0.18, orbit.phi - dy * 0.006));
    updateCamera();
  });
  window.addEventListener("pointerup", function () { dragging = false; });
  canvas.addEventListener("wheel", function (e) {
    e.preventDefault();
    orbit.radius = Math.max(GX * 1.2, Math.min(GY * 3, orbit.radius + e.deltaY * 0.02));
    updateCamera();
  }, { passive: false });

  // ---- lights ----
  scene.add(new THREE.AmbientLight(0x8878ff, 0.6));
  var keyLight = new THREE.DirectionalLight(0xffffff, 0.85);
  keyLight.position.set(6, 16, 8);
  scene.add(keyLight);
  var rimA = new THREE.PointLight(0xff2fd0, 1.2, 45);
  rimA.position.set(-4, GY * 0.75, -4);
  scene.add(rimA);
  var rimB = new THREE.PointLight(0x26f2ff, 1.0, 45);
  rimB.position.set(GX + 4, GY * 0.25, GZ + 4);
  scene.add(rimB);

  // ---- starfield ----
  (function stars() {
    var n = 1200;
    var pos = new Float32Array(n * 3);
    for (var i = 0; i < n; i++) {
      var r = 35 + Math.random() * 85;
      var th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = center.x + r * Math.sin(ph) * Math.cos(th);
      pos[i * 3 + 1] = center.y + r * Math.cos(ph);
      pos[i * 3 + 2] = center.z + r * Math.sin(ph) * Math.sin(th);
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    var mat = new THREE.PointsMaterial({ color: 0xd8caff, size: 0.16, sizeAttenuation: true, transparent: true, opacity: 0.75, depthWrite: false });
    scene.add(new THREE.Points(geo, mat));
  })();

  // ---- tower bounds + floor grid + height rungs ----
  var boundsGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(GX, GY, GZ));
  var bounds = new THREE.LineSegments(boundsGeo, new THREE.LineBasicMaterial({ color: 0x7c5cf0, transparent: true, opacity: 0.55 }));
  bounds.position.set(GX / 2, GY / 2, GZ / 2);
  scene.add(bounds);

  var floorGrid = new THREE.GridHelper(Math.max(GX, GZ) + 2, Math.max(GX, GZ) + 2, 0x26f2c9, 0x231a44);
  floorGrid.position.set(GX / 2, 0, GZ / 2);
  scene.add(floorGrid);

  for (var ly = 4; ly < GY; ly += 4) {
    var rungGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(GX, 0.001, GZ));
    var rung = new THREE.LineSegments(rungGeo, new THREE.LineBasicMaterial({ color: 0x40306a, transparent: true, opacity: 0.45 }));
    rung.position.set(GX / 2, ly, GZ / 2);
    scene.add(rung);
  }

  // ---- background: a slowly tumbling wireframe tesseract, pure decoration ----
  var tess = (function () {
    var verts4 = [];
    for (var a = -1; a <= 1; a += 2) for (var b = -1; b <= 1; b += 2)
      for (var c = -1; c <= 1; c += 2) for (var d = -1; d <= 1; d += 2)
        verts4.push([a, b, c, d]);
    var edges = [];
    for (var i = 0; i < verts4.length; i++) {
      for (var j = i + 1; j < verts4.length; j++) {
        var diff = 0;
        for (var k = 0; k < 4; k++) if (verts4[i][k] !== verts4[j][k]) diff++;
        if (diff === 1) edges.push([i, j]);
      }
    }
    var positions = new Float32Array(edges.length * 2 * 3);
    var geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    var mat = new THREE.LineBasicMaterial({ color: 0xff5fe0, transparent: true, opacity: 0.55 });
    var obj = new THREE.LineSegments(geo, mat);
    obj.position.set(GX / 2, GY + 5.5, GZ / 2);
    scene.add(obj);
    return { verts4: verts4, edges: edges, geo: geo, obj: obj, a1: 0, a2: 0 };
  })();

  function updateTesseract(dt) {
    tess.a1 += dt * 0.35;
    tess.a2 += dt * 0.22;
    var c1 = Math.cos(tess.a1), s1 = Math.sin(tess.a1);
    var c2 = Math.cos(tess.a2), s2 = Math.sin(tess.a2);
    var pos = tess.geo.attributes.position.array;
    var pi = 0;
    var pts3 = [];
    for (var i = 0; i < tess.verts4.length; i++) {
      var v = tess.verts4[i];
      var x = v[0] * c1 - v[3] * s1;
      var w = v[0] * s1 + v[3] * c1;
      var y = v[1] * c2 - v[2] * s2;
      var z = v[1] * s2 + v[2] * c2;
      var scale = 1.8 / (2.4 - w * 0.5);
      pts3.push([x * scale, y * scale, z * scale]);
    }
    for (var e = 0; e < tess.edges.length; e++) {
      var p0 = pts3[tess.edges[e][0]], p1 = pts3[tess.edges[e][1]];
      pos[pi++] = p0[0]; pos[pi++] = p0[1]; pos[pi++] = p0[2];
      pos[pi++] = p1[0]; pos[pi++] = p1[1]; pos[pi++] = p1[2];
    }
    tess.geo.attributes.position.needsUpdate = true;
    tess.obj.rotation.y += dt * 0.06;
  }

  // ---- stacked blocks (instanced for cheap re-draw every lock/clear) ----
  var blockGeo = new THREE.BoxGeometry(0.92, 0.92, 0.92);
  var blockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.22 });
  var stackMesh = new THREE.InstancedMesh(blockGeo, blockMat, MAX_CELLS);
  stackMesh.count = 0;
  scene.add(stackMesh);
  var dummy = new THREE.Object3D();
  var tmpColor = new THREE.Color();

  function setStack(cells) {
    var count = Math.min(cells.length, MAX_CELLS);
    for (var i = 0; i < count; i++) {
      var c = cells[i];
      dummy.position.set(c.x + 0.5, c.y + 0.5, c.z + 0.5);
      dummy.updateMatrix();
      stackMesh.setMatrixAt(i, dummy.matrix);
      tmpColor.setRGB(c.color[0], c.color[1], c.color[2]);
      stackMesh.setColorAt(i, tmpColor);
    }
    stackMesh.count = count;
    stackMesh.instanceMatrix.needsUpdate = true;
    if (stackMesh.instanceColor) stackMesh.instanceColor.needsUpdate = true;
  }

  // ---- falling piece: solid (w=0) cells full-size, ghost cells small + translucent ----
  var pieceGroup = new THREE.Group();
  scene.add(pieceGroup);
  var pieceMeshes = [];

  function ensurePieceMesh() {
    var geo = new THREE.BoxGeometry(1, 1, 1);
    var mat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x110011, roughness: 0.32, metalness: 0.3 });
    var mesh = new THREE.Mesh(geo, mat);
    var wire = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }));
    mesh.add(wire);
    pieceGroup.add(mesh);
    pieceMeshes.push(mesh);
    return mesh;
  }

  function setPiece(cells) {
    while (pieceMeshes.length < cells.length) ensurePieceMesh();
    for (var i = 0; i < pieceMeshes.length; i++) pieceMeshes[i].visible = i < cells.length;
    for (var j = 0; j < cells.length; j++) {
      var c = cells[j];
      var mesh = pieceMeshes[j];
      var flat = c.w === 0;
      mesh.position.set(c.x + 0.5, c.y + 0.5, c.z + 0.5);
      mesh.scale.setScalar(flat ? 0.95 : 0.6 - Math.min(Math.abs(c.w) - 1, 1) * 0.12);
      mesh.material.color.setRGB(c.color[0], c.color[1], c.color[2]);
      mesh.material.emissive.setRGB(c.color[0] * 0.3, c.color[1] * 0.3, c.color[2] * 0.3);
      mesh.material.transparent = !flat;
      mesh.material.opacity = flat ? 1 : 0.3;
      mesh.material.depthWrite = flat;
    }
  }

  function clearPiece() {
    setPiece([]);
  }

  // ---- resize ----
  function resize() {
    var w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    var needed = Math.abs(renderer.domElement.width - w * (window.devicePixelRatio || 1)) > 1 || Math.abs(renderer.domElement.height - h * (window.devicePixelRatio || 1)) > 1;
    if (needed) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
  }
  window.addEventListener("resize", resize);

  // ---- loop ----
  var clock = new THREE.Clock();
  function tick() {
    requestAnimationFrame(tick);
    resize();
    updateTesseract(clock.getDelta());
    renderer.render(scene, camera);
  }
  resize();
  tick();

  window.HyperTowerScene = {
    setStack: setStack,
    setPiece: setPiece,
    clearPiece: clearPiece,
    wasDragged: function () { return dragged; }
  };
})();
