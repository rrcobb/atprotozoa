// hypertower.js — game engine + UI for hypertower.bisks.net
//
// The idea (asked for by @goose.art, replying to @goose.art's own "has
// anyone made 4d tetris"): tetromino-shaped pieces spawn already tumbled
// through the fourth dimension, so most of their cells hang off the visible
// 3D "plane" (w=0) as translucent ghosts. There are six 90°-rotation
// controls, one per plane of 4D space: XY/XZ/YZ are the ordinary rotations
// you already know from Tetris, and XW/YW/ZW are the new ones — the only
// rotations that can drag a cell's w-coordinate back to zero. Get a piece
// fully flat (every cell w=0) before it lands and you place the whole
// thing; land it half-scrambled and only the flat cells become real,
// wasting the rest. Flattened or not, gravity never stops, so a run always
// keeps moving.
//
// Math note: canonical pieces live entirely in the w=0 hyperplane, and the
// spawn scramble is a signed-permutation matrix (product of 90° coordinate
// rotations). For such a matrix, a cell's new w-coordinate is ±(one of the
// cell's original x/y/z coordinates) if the scramble swapped w with x, y,
// or z, and exactly 0 if it never touched w. So pure XY/XZ/YZ rotations
// provably never move a cell off-plane, and any scramble is undoable by
// some sequence of XW/YW/ZW moves — every spawn is solvable by definition.

"use strict";
(function () {
  // ---- dimensions (keep in sync with towerscene.js) ----
  var GX = 5, GY = 16, GZ = 5;
  var LOCK_DELAY = 480;

  // ---- 4D rotation matrices: one elementary 90° rotation per coordinate plane ----
  function identity4() { return [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]; }
  function elemRot(a, b) {
    var m = identity4();
    m[a][a] = 0; m[a][b] = -1;
    m[b][b] = 0; m[b][a] = 1;
    return m;
  }
  var PLANES = { xy: [0, 1], xz: [0, 2], xw: [0, 3], yz: [1, 2], yw: [1, 3], zw: [2, 3] };
  var PLANE_KEYS = Object.keys(PLANES);
  var ROT = {};
  PLANE_KEYS.forEach(function (k) { ROT[k] = elemRot(PLANES[k][0], PLANES[k][1]); });

  function matMul(A, B) {
    var R = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
    for (var i = 0; i < 4; i++) for (var j = 0; j < 4; j++) {
      var s = 0;
      for (var k = 0; k < 4; k++) s += A[i][k] * B[k][j];
      R[i][j] = s;
    }
    return R;
  }
  function matVec(M, v) {
    var r = [0, 0, 0, 0];
    for (var i = 0; i < 4; i++) {
      var s = 0;
      for (var j = 0; j < 4; j++) s += M[i][j] * v[j];
      r[i] = s;
    }
    return r;
  }

  // ---- piece library: canonical tetromino footprints, all flat (w=0) ----
  var SHAPES = {
    I: { cells: [[-1, 0, 0, 0], [0, 0, 0, 0], [1, 0, 0, 0], [2, 0, 0, 0]], color: [0.30, 0.86, 0.96] },
    O: { cells: [[0, 0, 0, 0], [1, 0, 0, 0], [0, 1, 0, 0], [1, 1, 0, 0]], color: [1.0, 0.85, 0.28] },
    T: { cells: [[-1, 0, 0, 0], [0, 0, 0, 0], [1, 0, 0, 0], [0, 1, 0, 0]], color: [0.78, 0.4, 1.0] },
    S: { cells: [[0, 0, 0, 0], [1, 0, 0, 0], [-1, 1, 0, 0], [0, 1, 0, 0]], color: [0.38, 1.0, 0.58] },
    Z: { cells: [[-1, 0, 0, 0], [0, 0, 0, 0], [0, 1, 0, 0], [1, 1, 0, 0]], color: [1.0, 0.38, 0.48] },
    J: { cells: [[-1, 0, 0, 0], [0, 0, 0, 0], [1, 0, 0, 0], [1, 1, 0, 0]], color: [0.4, 0.55, 1.0] },
    L: { cells: [[-1, 0, 0, 0], [0, 0, 0, 0], [1, 0, 0, 0], [-1, 1, 0, 0]], color: [1.0, 0.62, 0.24] }
  };
  var SHAPE_KEYS = Object.keys(SHAPES);

  function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }

  function computeDropInterval(level) { return Math.max(115, 780 - (level - 1) * 55); }

  // ---- grid ----
  function makeGrid() {
    var g = [];
    for (var x = 0; x < GX; x++) {
      g[x] = [];
      for (var y = 0; y < GY; y++) {
        g[x][y] = [];
        for (var z = 0; z < GZ; z++) g[x][y][z] = null;
      }
    }
    return g;
  }

  // ---- piece helpers ----
  function newPiece() {
    var key = pick(SHAPE_KEYS);
    var shape = SHAPES[key];
    var m = identity4();
    var scrambleCount = 3 + ((Math.random() * 3) | 0);
    for (var i = 0; i < scrambleCount; i++) m = matMul(ROT[pick(PLANE_KEYS)], m);
    return {
      key: key,
      color: shape.color,
      canonical: shape.cells,
      matrix: m,
      pos: { x: (GX / 2) | 0, y: GY - 2, z: (GZ / 2) | 0 }
    };
  }

  function pieceCells(piece) { return piece.canonical.map(function (c) { return matVec(piece.matrix, c); }); }
  function worldCells(piece) {
    return pieceCells(piece).map(function (c) {
      return { x: piece.pos.x + c[0], y: piece.pos.y + c[1], z: piece.pos.z + c[2], w: c[3], color: piece.color };
    });
  }
  function solidCount(localCells) {
    var n = 0;
    for (var i = 0; i < localCells.length; i++) if (localCells[i][3] === 0) n++;
    return n;
  }

  function isBlocked(pos, localCells) {
    for (var i = 0; i < localCells.length; i++) {
      var c = localCells[i];
      var wx = pos.x + c[0], wy = pos.y + c[1], wz = pos.z + c[2];
      if (wy < 0) return true;
      if (wx < 0 || wx >= GX || wz < 0 || wz >= GZ) return true;
      if (c[3] === 0 && wy < GY && grid[wx][wy][wz]) return true;
    }
    return false;
  }

  // ---- state ----
  var grid;
  var state;

  function resetGame() {
    grid = makeGrid();
    state = {
      screen: "title",
      piece: null,
      next: null,
      score: 0,
      level: 1,
      linesCleared: 0,
      towerHeight: 0,
      piecesPlaced: 0,
      alignmentSum: 0,
      combo: 0,
      dropInterval: computeDropInterval(1),
      fallAcc: 0,
      lockAcc: 0,
      softDrop: false,
      lastLock: null
    };
  }
  resetGame();

  function isGrounded() {
    var p = state.piece;
    var local = pieceCells(p);
    return isBlocked({ x: p.pos.x, y: p.pos.y - 1, z: p.pos.z }, local);
  }

  function tryMove(dx, dy, dz) {
    var p = state.piece;
    var local = pieceCells(p);
    var np = { x: p.pos.x + dx, y: p.pos.y + dy, z: p.pos.z + dz };
    if (isBlocked(np, local)) return false;
    p.pos = np;
    if (dy !== 0) state.lockAcc = 0;
    else if (isGrounded()) state.lockAcc = 0;
    return true;
  }

  var ROTATE_KICKS = [[0, 0, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0], [-1, 0, 1], [1, 0, -1]];
  function tryRotate(planeKey) {
    var p = state.piece;
    var newMatrix = matMul(ROT[planeKey], p.matrix);
    var newLocal = p.canonical.map(function (c) { return matVec(newMatrix, c); });
    for (var i = 0; i < ROTATE_KICKS.length; i++) {
      var k = ROTATE_KICKS[i];
      var np = { x: p.pos.x + k[0], y: p.pos.y + k[1], z: p.pos.z + k[2] };
      if (!isBlocked(np, newLocal)) {
        p.matrix = newMatrix; p.pos = np;
        if (isGrounded()) state.lockAcc = 0;
        return true;
      }
    }
    return false;
  }

  function currentHeight() {
    for (var y = GY - 1; y >= 0; y--)
      for (var x = 0; x < GX; x++)
        for (var z = 0; z < GZ; z++)
          if (grid[x][y][z]) return y + 1;
    return 0;
  }

  function stackCells() {
    var out = [];
    for (var x = 0; x < GX; x++)
      for (var y = 0; y < GY; y++)
        for (var z = 0; z < GZ; z++)
          if (grid[x][y][z]) out.push({ x: x, y: y, z: z, color: grid[x][y][z] });
    return out;
  }

  function spawnNext() {
    state.piece = state.next || newPiece();
    state.next = newPiece();
    state.fallAcc = 0;
    state.lockAcc = 0;
    var local = pieceCells(state.piece);
    if (isBlocked(state.piece.pos, local)) endGame();
  }

  function lockPiece() {
    var p = state.piece;
    var cells = worldCells(p);
    var solid = cells.filter(function (c) { return c.w === 0; });
    var toppedOut = false;
    solid.forEach(function (c) {
      if (c.y >= GY) { toppedOut = true; return; }
      if (c.y >= 0 && c.x >= 0 && c.x < GX && c.z >= 0 && c.z < GZ) grid[c.x][c.y][c.z] = c.color;
    });
    var perfect = solid.length === p.canonical.length;
    state.score += solid.length * 10 + (perfect ? 40 : 0);
    state.lastLock = { solid: solid.length, total: p.canonical.length, perfect: perfect };
    state.piecesPlaced++;
    state.alignmentSum += solid.length / p.canonical.length;

    var cleared = 0;
    for (var y = 0; y < GY; y++) {
      var full = true;
      for (var x = 0; x < GX && full; x++) for (var z = 0; z < GZ; z++) if (!grid[x][y][z]) { full = false; break; }
      if (full) {
        cleared++;
        for (var yy = y; yy < GY - 1; yy++)
          for (var xx = 0; xx < GX; xx++) for (var zz = 0; zz < GZ; zz++) grid[xx][yy][zz] = grid[xx][yy + 1][zz];
        for (var xx2 = 0; xx2 < GX; xx2++) for (var zz2 = 0; zz2 < GZ; zz2++) grid[xx2][GY - 1][zz2] = null;
        y--;
      }
    }
    if (cleared > 0) {
      var lineScores = [0, 100, 300, 500, 800];
      state.score += (lineScores[Math.min(cleared, 4)] || 800) * state.level;
      state.linesCleared += cleared;
      state.level = 1 + Math.floor(state.linesCleared / 8);
      state.dropInterval = computeDropInterval(state.level);
      state.combo = (state.combo || 0) + 1;
    } else {
      state.combo = 0;
    }
    state.towerHeight = currentHeight();
    flashLock();

    if (toppedOut) { endGame(); return; }
    spawnNext();
  }

  function hardDrop() {
    var dist = 0;
    while (tryMove(0, -1, 0)) dist++;
    state.score += dist * 2;
    lockPiece();
  }

  function endGame() {
    state.screen = "gameover";
    renderScreen();
  }

  // ============================= UI =============================
  var els = {
    title: document.getElementById("titleScreen"),
    play: document.getElementById("playScreen"),
    over: document.getElementById("gameOverScreen"),
    score: document.getElementById("hudScore"),
    level: document.getElementById("hudLevel"),
    lines: document.getElementById("hudLines"),
    height: document.getElementById("hudHeight"),
    align: document.getElementById("hudAlign"),
    combo: document.getElementById("hudCombo"),
    nextSwatch: document.getElementById("nextSwatch"),
    nextName: document.getElementById("nextName"),
    lockFlash: document.getElementById("lockFlash"),
    startBtn: document.getElementById("startBtn"),
    againBtn: document.getElementById("againBtn"),
    shareBtn: document.getElementById("shareBluesky"),
    downloadBtn: document.getElementById("downloadCard"),
    finalScore: document.getElementById("finalScore"),
    finalStats: document.getElementById("finalStats"),
    cardPreview: document.getElementById("cardPreview")
  };

  function setScreen(name) {
    state.screen = name;
    els.title.classList.toggle("hidden", name !== "title");
    els.play.classList.toggle("hidden", name !== "play");
    els.over.classList.toggle("hidden", name !== "gameover");
  }

  function renderScreen() {
    if (state.screen === "gameover") {
      var avgAlign = state.piecesPlaced ? Math.round((state.alignmentSum / state.piecesPlaced) * 100) : 0;
      els.finalScore.textContent = state.score;
      els.finalStats.textContent =
        "tower height " + state.towerHeight + " · " + state.linesCleared + " layers cleared · " +
        state.piecesPlaced + " pieces · " + avgAlign + "% average alignment";
      buildShareCard();
      els.shareBtn.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(shareText());
    }
    setScreen(state.screen);
  }

  function updateHud() {
    if (state.screen !== "play" || !state.piece) return;
    els.score.textContent = state.score;
    els.level.textContent = state.level;
    els.lines.textContent = state.linesCleared;
    els.height.textContent = state.towerHeight + " / " + GY;
    els.combo.textContent = state.combo > 1 ? ("x" + state.combo) : "—";

    var local = pieceCells(state.piece);
    var solid = solidCount(local);
    var total = local.length;
    els.align.textContent = solid + "/" + total + " IN PLANE";
    els.align.className = solid === total ? "hud-align full" : (solid === 0 ? "hud-align none" : "hud-align partial");

    els.nextName.textContent = state.next.key;
    drawSwatch(els.nextSwatch, SHAPES[state.next.key]);
  }

  function drawSwatch(canvas, shape) {
    var ctx = canvas.getContext("2d");
    var W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    var xs = shape.cells.map(function (c) { return c[0]; });
    var ys = shape.cells.map(function (c) { return c[1]; });
    var minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs);
    var minY = Math.min.apply(null, ys), maxY = Math.max.apply(null, ys);
    var cell = Math.min(W / (maxX - minX + 2), H / (maxY - minY + 2));
    var ox = (W - (maxX - minX + 1) * cell) / 2;
    var oy = (H - (maxY - minY + 1) * cell) / 2;
    var c = shape.color;
    ctx.fillStyle = "rgb(" + Math.round(c[0] * 255) + "," + Math.round(c[1] * 255) + "," + Math.round(c[2] * 255) + ")";
    shape.cells.forEach(function (cc) {
      var px = ox + (cc[0] - minX) * cell;
      var py = H - oy - (cc[1] - minY + 1) * cell;
      ctx.fillRect(px + 1, py + 1, cell - 2, cell - 2);
    });
  }

  function flashLock() {
    if (!state.lastLock) return;
    var l = state.lastLock;
    els.lockFlash.textContent = l.perfect
      ? "PERFECT ALIGN +" + (l.solid * 10 + 40)
      : (l.solid === 0 ? "MISALIGNED — NOTHING LOCKED" : l.solid + "/" + l.total + " LOCKED +" + (l.solid * 10));
    els.lockFlash.className = "lock-flash show " + (l.perfect ? "good" : (l.solid === 0 ? "bad" : "mid"));
    clearTimeout(flashLock._t);
    flashLock._t = setTimeout(function () { els.lockFlash.className = "lock-flash"; }, 900);
  }

  function syncScene() {
    if (!window.HyperTowerScene) return;
    window.HyperTowerScene.setStack(stackCells());
    if (state.piece) window.HyperTowerScene.setPiece(worldCells(state.piece));
  }

  // ---- share card ----
  var SITE_URL = "https://hypertower.bisks.net/";
  function shareText() {
    var t = "Built a " + state.towerHeight + "-block hypertower (" + state.linesCleared + " layers cleared, score " +
      state.score + ") rotating tesseract pieces into place. Play → " + SITE_URL;
    if (t.length > 295) t = t.slice(0, 292) + "...";
    return t;
  }

  function buildShareCard() {
    var c = document.getElementById("shareCanvas");
    var ctx = c.getContext("2d");
    var W = c.width, H = c.height;
    var bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, "#150836");
    bg.addColorStop(1, "#070212");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = "#7c5cf0";
    ctx.lineWidth = 5;
    ctx.strokeRect(22, 22, W - 44, H - 44);

    ctx.fillStyle = "#26f2ff";
    ctx.font = "800 40px 'JetBrains Mono', monospace";
    ctx.fillText("HYPERTOWER", 64, 110);

    ctx.fillStyle = "#c9baff";
    ctx.font = "700 22px 'JetBrains Mono', monospace";
    ctx.fillText("4D TETRIS", 64, 145);

    ctx.fillStyle = "#ffffff";
    ctx.font = "800 96px 'JetBrains Mono', monospace";
    ctx.fillText(String(state.score), 64, 280);
    ctx.fillStyle = "#a08fe0";
    ctx.font = "600 22px 'JetBrains Mono', monospace";
    ctx.fillText("SCORE", 64, 312);

    var avgAlign = state.piecesPlaced ? Math.round((state.alignmentSum / state.piecesPlaced) * 100) : 0;
    ctx.fillStyle = "#ff5fe0";
    ctx.font = "700 28px 'JetBrains Mono', monospace";
    ctx.fillText("tower height " + state.towerHeight + " / " + GY, 64, 400);
    ctx.fillText(state.linesCleared + " layers cleared", 64, 440);
    ctx.fillText(avgAlign + "% average 4D alignment", 64, 480);

    ctx.fillStyle = "#26f2ff";
    ctx.font = "700 24px 'JetBrains Mono', monospace";
    ctx.fillText("hypertower.bisks.net", 64, H - 56);

    els.cardPreview.src = c.toDataURL("image/png");
    return c;
  }

  function canShareFiles() {
    if (!navigator.share || !navigator.canShare) return false;
    try {
      var probe = new File([""], "probe.png", { type: "image/png" });
      return navigator.canShare({ files: [probe] });
    } catch (e) { return false; }
  }

  els.downloadBtn.addEventListener("click", function () {
    var c = document.getElementById("shareCanvas");
    c.toBlob(function (blob) {
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "hypertower-score.png";
      a.click();
    }, "image/png");
  });

  if (canShareFiles()) {
    var nativeShareBtn = document.createElement("button");
    nativeShareBtn.textContent = "SHARE IMAGE ▸";
    nativeShareBtn.className = "ghost";
    nativeShareBtn.addEventListener("click", function () {
      var c = document.getElementById("shareCanvas");
      c.toBlob(function (blob) {
        var file = new File([blob], "hypertower-score.png", { type: "image/png" });
        navigator.share({ files: [file], text: shareText(), title: "hypertower" }).catch(function () {});
      }, "image/png");
    });
    document.getElementById("shareRow").appendChild(nativeShareBtn);
  }

  // ---- input: keyboard ----
  function handleAction(action) {
    if (state.screen !== "play") return;
    switch (action) {
      case "left": tryMove(-1, 0, 0); break;
      case "right": tryMove(1, 0, 0); break;
      case "fwd": tryMove(0, 0, -1); break;
      case "back": tryMove(0, 0, 1); break;
      case "hard": hardDrop(); break;
      case "xy": tryRotate("xy"); break;
      case "xz": tryRotate("xz"); break;
      case "yz": tryRotate("yz"); break;
      case "xw": tryRotate("xw"); break;
      case "yw": tryRotate("yw"); break;
      case "zw": tryRotate("zw"); break;
      default: return;
    }
    syncScene();
    updateHud();
  }

  var KEY_MAP = {
    a: "left", ArrowLeft: "left",
    d: "right", ArrowRight: "right",
    w: "fwd", ArrowUp: "fwd",
    s: "back", ArrowDown: "back",
    "1": "xy", "2": "xz", "3": "yz",
    "4": "xw", "5": "yw", "6": "zw"
  };
  document.addEventListener("keydown", function (e) {
    if (state.screen !== "play") return;
    if (e.key === " ") { e.preventDefault(); handleAction("hard"); return; }
    if (e.key === "Shift") { state.softDrop = true; return; }
    var action = KEY_MAP[e.key];
    if (action) { e.preventDefault(); handleAction(action); }
  });
  document.addEventListener("keyup", function (e) {
    if (e.key === "Shift") state.softDrop = false;
  });

  // ---- input: touch/click buttons ----
  function bindTap(id, action) {
    var el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("click", function (e) { e.preventDefault(); handleAction(action); });
  }
  ["left", "right", "fwd", "back"].forEach(function (a) { bindRepeatBtn("btn-" + a, a, 160); });
  ["xy", "xz", "yz", "xw", "yw", "zw"].forEach(function (a) { bindTap("btn-" + a, a); });
  bindTap("btn-hard", "hard");

  function bindRepeatBtn(id, action, interval) {
    var el = document.getElementById(id);
    if (!el) return;
    var timer = null;
    function start(e) {
      e.preventDefault();
      handleAction(action);
      timer = setInterval(function () { handleAction(action); }, interval);
    }
    function stop() { if (timer) { clearInterval(timer); timer = null; } }
    el.addEventListener("pointerdown", start);
    el.addEventListener("pointerup", stop);
    el.addEventListener("pointerleave", stop);
    el.addEventListener("pointercancel", stop);
  }

  var softBtn = document.getElementById("btn-soft");
  if (softBtn) {
    softBtn.addEventListener("pointerdown", function (e) { e.preventDefault(); state.softDrop = true; });
    ["pointerup", "pointerleave", "pointercancel"].forEach(function (ev) {
      softBtn.addEventListener(ev, function () { state.softDrop = false; });
    });
  }

  // ---- game loop ----
  var lastT = null;
  function frame(t) {
    requestAnimationFrame(frame);
    if (state.screen !== "play") { lastT = t; return; }
    if (lastT === null) lastT = t;
    var dt = t - lastT;
    lastT = t;

    var interval = state.softDrop ? Math.max(30, state.dropInterval / 9) : state.dropInterval;
    if (isGrounded()) {
      state.lockAcc += dt;
      if (state.lockAcc >= LOCK_DELAY) {
        lockPiece();
      }
    } else {
      state.fallAcc += dt;
      if (state.fallAcc >= interval) {
        state.fallAcc = 0;
        tryMove(0, -1, 0);
      }
    }
    syncScene();
    updateHud();
  }
  requestAnimationFrame(frame);

  // ---- start / restart ----
  function startGame() {
    resetGame();
    state.next = newPiece();
    spawnNext();
    setScreen("play");
    syncScene();
    updateHud();
  }

  els.startBtn.addEventListener("click", startGame);
  els.againBtn.addEventListener("click", startGame);
})();
