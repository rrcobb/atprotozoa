// scene.js — the 3D classroom. Plain desks-in-rows layout, a blackboard, and
// an AV cart with a screen mesh the slideshow renders onto (see refry.js).
// No OrbitControls / addons: camera is either a slow establishing pan (nobody
// seated yet) or pinned to a desk with a small head-turn look-around once you
// sit — a "pick your seat" POV, not a free-fly camera.
//
// Exposes one factory, initScene(canvas), returning a small controller the
// page (app.js) drives: seat layout, click-to-sit hit testing, per-session
// seat occupancy markers, and the screen texture the slideshow paints into.

import * as THREE from "three";

export const ROWS = 4;
export const COLS = 5;
const DESK_DX = 2.4;
const DESK_DZ = 2.6;
const ROOM_W = COLS * DESK_DX + 3;
const ROOM_D = ROWS * DESK_DZ + 7;
const FRONT_Z = -ROOM_D / 2; // blackboard wall
const BACK_Z = ROOM_D / 2; // door wall
const DESK_START_Z = FRONT_Z + 3.4;
const EYE_HEIGHT = 1.18;

function seatPos(r, c) {
  return {
    x: (c - (COLS - 1) / 2) * DESK_DX,
    z: DESK_START_Z + r * DESK_DZ,
  };
}

function seatId(r, c) {
  return r + "-" + c;
}

function hashColor(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) & 0xffffff;
  const hue = h % 360;
  return new THREE.Color().setHSL(hue / 360, 0.55, 0.55);
}

function chalkTexture(text) {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 256;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#0e3324";
  ctx.fillRect(0, 0, c.width, c.height);
  // chalk dust smudges
  ctx.globalAlpha = 0.08;
  ctx.fillStyle = "#fff";
  for (let i = 0; i < 40; i++) {
    ctx.beginPath();
    ctx.arc(Math.random() * c.width, Math.random() * c.height, 20 + Math.random() * 60, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.font = "italic 700 92px 'Comic Sans MS', 'Segoe Print', cursive";
  ctx.fillStyle = "#f2f2ea";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.save();
  ctx.translate(c.width / 2 + (Math.random() - 0.5) * 4, c.height / 2);
  ctx.rotate((Math.random() - 0.5) * 0.02);
  ctx.fillText(text, 0, 0);
  ctx.restore();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function initScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#1b1712");
  scene.fog = new THREE.Fog("#1b1712", 14, 30);

  const camera = new THREE.PerspectiveCamera(62, 1, 0.05, 100);

  // ---- lighting -------------------------------------------------------
  scene.add(new THREE.HemisphereLight("#cfd8e8", "#332920", 0.55));
  const fluorescents = [];
  for (let i = 0; i < 3; i++) {
    const light = new THREE.PointLight("#eef3ff", 9, 14, 2);
    light.position.set((i - 1) * (ROOM_W / 3.2), 3.5, DESK_START_Z + ((ROWS - 1) * DESK_DZ) / 2);
    scene.add(light);
    fluorescents.push(light);
  }
  const frontFill = new THREE.PointLight("#ffe9c2", 4.5, 12, 2);
  frontFill.position.set(0, 2.6, FRONT_Z + 2);
  scene.add(frontFill);

  // ---- room shell -------------------------------------------------------
  const floorMat = new THREE.MeshStandardMaterial({ color: "#5b4a36", roughness: 0.9 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_W, ROOM_D), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0;
  scene.add(floor);

  const ceilMat = new THREE.MeshStandardMaterial({ color: "#e7e2d6", roughness: 1 });
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_W, ROOM_D), ceilMat);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = 4.2;
  scene.add(ceiling);

  const wallMat = new THREE.MeshStandardMaterial({ color: "#c9b98f", roughness: 0.95 });
  const wallH = 4.2;
  const backWall = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_W, wallH), wallMat);
  backWall.position.set(0, wallH / 2, FRONT_Z);
  scene.add(backWall);
  const doorWall = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_W, wallH), wallMat);
  doorWall.position.set(0, wallH / 2, BACK_Z);
  doorWall.rotation.y = Math.PI;
  scene.add(doorWall);
  const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_D, wallH), wallMat);
  leftWall.position.set(-ROOM_W / 2, wallH / 2, 0);
  leftWall.rotation.y = Math.PI / 2;
  scene.add(leftWall);
  const rightWall = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_D, wallH), wallMat);
  rightWall.position.set(ROOM_W / 2, wallH / 2, 0);
  rightWall.rotation.y = -Math.PI / 2;
  scene.add(rightWall);

  // windows on the right wall: glowing panes for a bit of outside light
  const windowMat = new THREE.MeshBasicMaterial({ color: "#7fb6d8" });
  for (let i = 0; i < 3; i++) {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.9), windowMat);
    win.position.set(ROOM_W / 2 - 0.02, 2.3, FRONT_Z + 3 + i * 3.4);
    win.rotation.y = -Math.PI / 2;
    scene.add(win);
  }

  // blackboard, front wall
  const boardTex = chalkTexture("be excellent to each other");
  const board = new THREE.Mesh(
    new THREE.PlaneGeometry(6.2, 1.7),
    new THREE.MeshStandardMaterial({ map: boardTex, roughness: 0.9 }),
  );
  board.position.set(-1.4, 2.4, FRONT_Z + 0.02);
  scene.add(board);
  const boardFrame = new THREE.Mesh(
    new THREE.BoxGeometry(6.5, 2, 0.06),
    new THREE.MeshStandardMaterial({ color: "#4a3626" }),
  );
  boardFrame.position.set(-1.4, 2.4, FRONT_Z + 0.01);
  scene.add(boardFrame);

  // clock, because every classroom has one
  const clock = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.35, 0.06, 24),
    new THREE.MeshStandardMaterial({ color: "#f4f1e6" }),
  );
  clock.rotation.x = Math.PI / 2;
  clock.position.set(3.4, 3.3, FRONT_Z + 0.03);
  scene.add(clock);

  // ---- desks --------------------------------------------------------------
  const deskGroup = new THREE.Group();
  scene.add(deskGroup);
  const hitboxes = [];
  const seatMarkers = {};
  const noteMarkers = {};
  const deskWoodMat = new THREE.MeshStandardMaterial({ color: "#caa06a", roughness: 0.7 });
  const chairMat = new THREE.MeshStandardMaterial({ color: "#3d4757", roughness: 0.6 });

  // a scrap of folded notebook paper — the sprite shown on whichever desk
  // currently holds the shared passed note
  const noteTex = (function paperTexture() {
    const c = document.createElement("canvas");
    c.width = 128;
    c.height = 128;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#f4ecd8";
    ctx.fillRect(14, 20, 100, 88);
    ctx.strokeStyle = "#a68f63";
    ctx.lineWidth = 3;
    ctx.strokeRect(14, 20, 100, 88);
    ctx.strokeStyle = "#8fa0b5";
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(24, 40 + i * 15);
      ctx.lineTo(104, 40 + i * 15);
      ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  })();
  const noteMat = new THREE.SpriteMaterial({ map: noteTex, depthTest: false });

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const { x, z } = seatPos(r, c);
      const group = new THREE.Group();
      group.position.set(x, 0, z);

      const top = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.08, 0.7), deskWoodMat);
      top.position.y = 0.72;
      group.add(top);
      const legGeo = new THREE.BoxGeometry(0.07, 0.72, 0.07);
      for (const [lx, lz] of [
        [-0.48, -0.28],
        [0.48, -0.28],
        [-0.48, 0.28],
        [0.48, 0.28],
      ]) {
        const leg = new THREE.Mesh(legGeo, chairMat);
        leg.position.set(lx, 0.36, lz);
        group.add(leg);
      }
      const seatMesh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.5), chairMat);
      seatMesh.position.set(0, 0.46, 0.55);
      group.add(seatMesh);
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.06), chairMat);
      back.position.set(0, 0.72, 0.78);
      group.add(back);

      // occupancy marker: a little "student" peg, hidden until someone sits
      const peg = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.18, 0.42, 4, 8),
        new THREE.MeshStandardMaterial({ color: "#888" }),
      );
      body.position.set(0, 0.85, 0.55);
      peg.add(body);
      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.15, 12, 12),
        new THREE.MeshStandardMaterial({ color: "#e8c39e" }),
      );
      head.position.set(0, 1.22, 0.55);
      peg.add(head);
      peg.visible = false;
      group.add(peg);

      const noteSprite = new THREE.Sprite(noteMat);
      noteSprite.scale.set(0.3, 0.3, 0.3);
      noteSprite.position.set(0.32, 0.86, 0.2);
      noteSprite.visible = false;
      group.add(noteSprite);
      noteMarkers[seatId(r, c)] = noteSprite;

      deskGroup.add(group);

      const hit = new THREE.Mesh(
        new THREE.BoxGeometry(1.3, 1.6, 1.4),
        new THREE.MeshBasicMaterial({ visible: false }),
      );
      hit.position.set(x, 0.7, z + 0.15);
      hit.userData.seat = seatId(r, c);
      hitboxes.push(hit);
      scene.add(hit);

      seatMarkers[seatId(r, c)] = { peg, body };
    }
  }

  // ---- AV cart --------------------------------------------------------
  const cartGroup = new THREE.Group();
  const cartRestX = 0.6;
  const cartRestZ = FRONT_Z + 2.1;
  cartGroup.position.set(cartRestX, 0, cartRestZ);
  scene.add(cartGroup);

  const cartMat = new THREE.MeshStandardMaterial({ color: "#7a7f86", roughness: 0.55, metalness: 0.35 });
  const cartBody = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.55), cartMat);
  cartBody.position.y = 0.75;
  cartGroup.add(cartBody);
  const wheelGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.06, 12);
  for (const [wx, wz] of [
    [-0.35, -0.2],
    [0.35, -0.2],
    [-0.35, 0.2],
    [0.35, 0.2],
  ]) {
    const wheel = new THREE.Mesh(wheelGeo, new THREE.MeshStandardMaterial({ color: "#111" }));
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.1, wz);
    cartGroup.add(wheel);
  }
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.6, 0.08), cartMat);
  neck.position.set(0, 1.5, 0);
  cartGroup.add(neck);

  const screenCanvas = document.createElement("canvas");
  screenCanvas.width = 512;
  screenCanvas.height = 384;
  const screenCtx = screenCanvas.getContext("2d");
  screenCtx.fillStyle = "#111";
  screenCtx.fillRect(0, 0, screenCanvas.width, screenCanvas.height);
  const screenTex = new THREE.CanvasTexture(screenCanvas);
  screenTex.colorSpace = THREE.SRGBColorSpace;

  const tvBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.98, 0.78, 0.5),
    new THREE.MeshStandardMaterial({ color: "#26251f", roughness: 0.6 }),
  );
  tvBody.position.set(0, 2.05, 0);
  cartGroup.add(tvBody);
  const screenMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.82, 0.6),
    new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false }),
  );
  screenMesh.position.set(0, 2.06, 0.256);
  cartGroup.add(screenMesh);
  const glow = new THREE.PointLight("#8fc7ff", 1.6, 6, 2);
  glow.position.set(0, 2.06, 0.6);
  cartGroup.add(glow);

  // wheel-in intro: cart starts off to the side, glides to rest
  cartGroup.position.x = cartRestX - 5.5;
  let cartArrived = false;

  // ---- camera state -----------------------------------------------------
  let seated = null; // seatId string | null
  const camTarget = new THREE.Vector3();
  const camPos = new THREE.Vector3();
  let camPosCur = new THREE.Vector3(0, 3.4, BACK_Z - 1.2);
  let camLookCur = new THREE.Vector3(0, 1.6, 0);
  let lookYaw = 0,
    lookPitch = 0,
    lookYawTarget = 0,
    lookPitchTarget = 0;

  function overviewPose(t) {
    camPos.set(Math.sin(t * 0.08) * (ROOM_W * 0.18), 3.3, BACK_Z - 1.2);
    camTarget.set(Math.sin(t * 0.08) * 2, 1.5, 0);
  }
  function seatPose(id) {
    const [r, c] = id.split("-").map(Number);
    const { x, z } = seatPos(r, c);
    camPos.set(x, EYE_HEIGHT, z + 0.72);
    // Look toward the AV cart's screen, not straight ahead at the wall — a
    // desk off to the side would otherwise stare at blank wall with the
    // screen out of head-turn range entirely.
    camTarget.set(cartRestX, 1.9, FRONT_Z + 0.6);
  }

  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2();

  function pick(clientX, clientY, rect) {
    pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointerNdc, camera);
    const hits = raycaster.intersectObjects(hitboxes, false);
    return hits.length ? hits[0].object.userData.seat : null;
  }

  function resize(w, h) {
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  }

  // nx, ny: pointer/touch position relative to the canvas center, each in
  // roughly [-1, 1] — this is a fixed-seat head turn, not a free-look drag,
  // so it maps straight to an absolute target rather than accumulating.
  function setLook(nx, ny) {
    lookYawTarget = THREE.MathUtils.clamp(-nx * 0.8, -0.85, 0.85);
    lookPitchTarget = THREE.MathUtils.clamp(-ny * 0.3, -0.35, 0.35);
  }

  function sitAt(id) {
    seated = id;
    lookYawTarget = lookYaw = lookPitchTarget = lookPitch = 0;
  }
  function standUp() {
    seated = null;
  }

  function setSeats(seatsObj, mySeat) {
    for (const [id, marker] of Object.entries(seatMarkers)) {
      const occ = seatsObj[id];
      marker.peg.visible = !!occ && id !== mySeat;
      if (occ) marker.body.material.color.copy(hashColor(occ.sid));
    }
  }

  function setNote(holderSeat) {
    for (const [id, sprite] of Object.entries(noteMarkers)) {
      sprite.visible = id === holderSeat;
    }
  }

  let t0 = performance.now();
  function frame(now) {
    const t = (now - t0) / 1000;

    if (!cartArrived) {
      cartGroup.position.x += (cartRestX - cartGroup.position.x) * 0.02;
      if (Math.abs(cartGroup.position.x - cartRestX) < 0.01) {
        cartGroup.position.x = cartRestX;
        cartArrived = true;
      }
    }

    for (const l of fluorescents) {
      l.intensity = 9 + Math.sin(t * 37 + l.position.x) * 0.15 * (Math.random() < 0.02 ? 3 : 1);
    }

    lookYaw += (lookYawTarget - lookYaw) * 0.12;
    lookPitch += (lookPitchTarget - lookPitch) * 0.12;

    if (seated) seatPose(seated);
    else overviewPose(t);

    camPosCur.lerp(camPos, seated ? 0.08 : 0.03);
    const lookWithOffset = camTarget.clone();
    lookWithOffset.x += lookYaw * 3;
    lookWithOffset.y += lookPitch * 2;
    camLookCur.lerp(lookWithOffset, seated ? 0.15 : 0.03);

    camera.position.copy(camPosCur);
    camera.lookAt(camLookCur);

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return {
    resize,
    pick,
    setLook,
    sitAt,
    standUp,
    setSeats,
    setNote,
    screenCanvas,
    screenCtx,
    screenTex,
    ROWS,
    COLS,
  };
}
