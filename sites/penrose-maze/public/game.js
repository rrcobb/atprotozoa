// game.js — first-person raycaster for the Penrose maze.
//
// The rooms are ordinary 1x1 squares in a plain integer grid. What makes the
// underlying space non-Euclidean is that the grid is rebuilt from scratch,
// re-centered on the room you're standing in, every time you cross a
// threshold — walked entirely from the Penrose tiling's real dual graph, not
// from any global (x, y). Two rooms that are graph-neighbors always look
// like ordinary adjacent squares; two rooms that are NOT graph-neighbors
// simply never get placed at overlapping coordinates in the same build (see
// buildLocalView below), so you can never see the seam where the geometry
// folds. That's the whole trick — the renderer itself is a completely
// ordinary Wolfenstein-style raycaster.
(function () {
  "use strict";

  var DIRS = window.PenroseMaze.DIRS;
  var DIR_VEC = window.PenroseMaze.DIR_VEC;
  var VIEW_DEPTH = 20; // BFS radius (in rooms) rebuilt around the player
  var RENDER_DIST = 16;
  var MOVE_SPEED = 2.6; // cells/sec
  var TURN_SPEED = 2.2; // rad/sec (keyboard turning)
  var PLAYER_RADIUS = 0.22;
  var ROOM_COLORS = {
    0: { wall: [70, 110, 200], floor: [18, 22, 40] }, // thin rhombus
    1: { wall: [200, 90, 150], floor: [26, 16, 34] }, // fat rhombus
  };

  var canvas = document.getElementById("view");
  var ctx = canvas.getContext("2d");
  var minimapCanvas = document.getElementById("minimap");
  var mctx = minimapCanvas.getContext("2d");

  var params = new URLSearchParams(location.search);
  var seedParam = params.get("seed");
  var seed = seedParam ? parseInt(seedParam, 10) : Math.floor(Math.random() * 2 ** 31);
  if (!Number.isFinite(seed)) seed = Math.floor(Math.random() * 2 ** 31);

  var maze = window.PenroseMaze.generate({ seed: seed, generations: 6, radiusFrac: 0.55 });

  history.replaceState(null, "", location.pathname + "?seed=" + seed);

  var state = {
    currentNode: maze.start,
    px: 0.5,
    py: 0.5,
    angle: -Math.PI / 2,
    roomAt: null,
    invRoomAt: null,
    steps: 0,
    startTime: null,
    won: false,
    winTime: null,
    minimapOpen: false,
  };

  var keys = {};

  function buildLocalView(rootNode) {
    var roomAt = new Map(); // "i,j" -> nodeIdx
    var invRoomAt = new Map(); // nodeIdx -> [i,j]
    roomAt.set("0,0", rootNode);
    invRoomAt.set(rootNode, [0, 0]);
    var queue = [[rootNode, 0, 0, 0]];
    var qi = 0;
    while (qi < queue.length) {
      var entry = queue[qi++];
      var node = entry[0], i = entry[1], j = entry[2], depth = entry[3];
      if (depth >= VIEW_DEPTH) continue;
      var doors = maze.doors.get(node);
      for (var d = 0; d < DIRS.length; d++) {
        var dir = DIRS[d];
        var target = doors[dir];
        if (target == null) continue;
        var vec = DIR_VEC[dir];
        var ni = i + vec[0], nj = j + vec[1];
        var key = ni + "," + nj;
        if (roomAt.has(key)) continue; // slot claimed by another branch — stays a wall
        if (invRoomAt.has(target)) continue; // shouldn't happen (tree), defensive
        roomAt.set(key, target);
        invRoomAt.set(target, [ni, nj]);
        queue.push([target, ni, nj, depth + 1]);
      }
    }
    return { roomAt: roomAt, invRoomAt: invRoomAt };
  }

  function rebuildView(rootNode) {
    var view = buildLocalView(rootNode);
    state.roomAt = view.roomAt;
    state.invRoomAt = view.invRoomAt;
    state.currentNode = rootNode;
  }

  rebuildView(state.currentNode);

  function nodeAt(i, j) {
    var v = state.roomAt.get(i + "," + j);
    return v == null ? null : v;
  }

  // Is there a wall on the edge of room (i,j) facing `dir`?
  function isWallBetween(i, j, dir) {
    var node = nodeAt(i, j);
    if (node == null) return true;
    var target = maze.doors.get(node)[dir];
    if (target == null) return true;
    var vec = DIR_VEC[dir];
    var neighbor = nodeAt(i + vec[0], j + vec[1]);
    return neighbor !== target;
  }

  function roomColorAt(i, j) {
    var node = nodeAt(i, j);
    if (node == null) return null;
    return maze.rhombi[node].color;
  }

  // ---- Input -----------------------------------------------------------

  window.addEventListener("keydown", function (e) {
    keys[e.code] = true;
    if (e.code === "KeyM") toggleMinimap();
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].indexOf(e.code) !== -1) {
      e.preventDefault();
    }
  });
  window.addEventListener("keyup", function (e) { keys[e.code] = false; });

  canvas.addEventListener("click", function () {
    if (!state.won) canvas.requestPointerLock();
  });
  document.addEventListener("mousemove", function (e) {
    if (document.pointerLockElement === canvas) {
      state.angle += e.movementX * 0.0028;
    }
  });

  // Touch controls: drag on the right half looks around, a virtual stick on
  // the left half moves.
  var touchLook = null, touchMove = null;
  canvas.addEventListener("touchstart", function (e) {
    for (var t of e.changedTouches) {
      if (t.clientX < window.innerWidth / 2) {
        touchMove = { id: t.identifier, sx: t.clientX, sy: t.clientY, dx: 0, dy: 0 };
      } else {
        touchLook = { id: t.identifier, x: t.clientX };
      }
    }
    e.preventDefault();
  }, { passive: false });
  canvas.addEventListener("touchmove", function (e) {
    for (var t of e.changedTouches) {
      if (touchMove && t.identifier === touchMove.id) {
        touchMove.dx = t.clientX - touchMove.sx;
        touchMove.dy = t.clientY - touchMove.sy;
      }
      if (touchLook && t.identifier === touchLook.id) {
        state.angle += (t.clientX - touchLook.x) * 0.005;
        touchLook.x = t.clientX;
      }
    }
    e.preventDefault();
  }, { passive: false });
  canvas.addEventListener("touchend", function (e) {
    for (var t of e.changedTouches) {
      if (touchMove && t.identifier === touchMove.id) touchMove = null;
      if (touchLook && t.identifier === touchLook.id) touchLook = null;
    }
  });

  function toggleMinimap() {
    state.minimapOpen = !state.minimapOpen;
    minimapCanvas.classList.toggle("open", state.minimapOpen);
  }
  document.getElementById("minimapToggle").addEventListener("click", toggleMinimap);

  // ---- Movement ----------------------------------------------------------

  function tryMoveAxis(dx, dy) {
    if (dx !== 0) {
      var i = Math.floor(state.px), j = Math.floor(state.py);
      var nx = state.px + dx;
      var probeX = dx > 0 ? nx + PLAYER_RADIUS : nx - PLAYER_RADIUS;
      if (Math.floor(probeX) !== i) {
        var dir = dx > 0 ? "E" : "W";
        if (isWallBetween(i, j, dir)) {
          var edgeX = dx > 0 ? i + 1 : i;
          nx = dx > 0 ? edgeX - PLAYER_RADIUS - 1e-4 : edgeX + PLAYER_RADIUS + 1e-4;
        }
      }
      state.px = nx;
    }
    if (dy !== 0) {
      var i2 = Math.floor(state.px), j2 = Math.floor(state.py);
      var ny = state.py + dy;
      var probeY = dy > 0 ? ny + PLAYER_RADIUS : ny - PLAYER_RADIUS;
      if (Math.floor(probeY) !== j2) {
        var dirY = dy > 0 ? "N" : "S";
        if (isWallBetween(i2, j2, dirY)) {
          var edgeY = dy > 0 ? j2 + 1 : j2;
          ny = dy > 0 ? edgeY - PLAYER_RADIUS - 1e-4 : edgeY + PLAYER_RADIUS + 1e-4;
        }
      }
      state.py = ny;
    }
  }

  function reRootIfNeeded() {
    var moved = true;
    var guard = 0;
    while (moved && guard++ < 4) {
      moved = false;
      var i = Math.floor(state.px), j = Math.floor(state.py);
      if (i !== 0) {
        var dirX = i > 0 ? "E" : "W";
        var target = maze.doors.get(state.currentNode)[dirX];
        if (target != null) {
          state.px -= i;
          state.steps++;
          rebuildView(target);
          moved = true;
        }
      }
      i = Math.floor(state.px); j = Math.floor(state.py);
      if (j !== 0) {
        var dirY = j > 0 ? "N" : "S";
        var target2 = maze.doors.get(state.currentNode)[dirY];
        if (target2 != null) {
          state.py -= j;
          state.steps++;
          rebuildView(target2);
          moved = true;
        }
      }
    }
    if (state.currentNode === maze.goal && !state.won) {
      state.won = true;
      state.winTime = performance.now();
      onWin();
    }
  }

  function update(dt) {
    if (state.won) return;
    if (state.startTime == null && (keys.KeyW || keys.KeyA || keys.KeyS || keys.KeyD || touchMove)) {
      state.startTime = performance.now();
    }
    var turn = 0;
    if (keys.ArrowLeft) turn -= 1;
    if (keys.ArrowRight) turn += 1;
    if (turn !== 0) state.angle += turn * TURN_SPEED * dt;

    var fwd = 0, strafe = 0;
    if (keys.KeyW) fwd += 1;
    if (keys.KeyS) fwd -= 1;
    if (keys.KeyD) strafe += 1;
    if (keys.KeyA) strafe -= 1;

    if (touchMove) {
      var mag = Math.hypot(touchMove.dx, touchMove.dy);
      if (mag > 8) {
        fwd += -touchMove.dy / Math.max(mag, 40);
        strafe += touchMove.dx / Math.max(mag, 40);
      }
    }

    var mag2 = Math.hypot(fwd, strafe);
    if (mag2 > 1) { fwd /= mag2; strafe /= mag2; }

    var dirX = Math.cos(state.angle), dirY = Math.sin(state.angle);
    var perpX = -dirY, perpY = dirX;
    var vx = (dirX * fwd + perpX * strafe) * MOVE_SPEED * dt;
    var vy = (dirY * fwd + perpY * strafe) * MOVE_SPEED * dt;

    tryMoveAxis(vx, 0);
    tryMoveAxis(0, vy);
    reRootIfNeeded();
  }

  // ---- Raycasting ----------------------------------------------------------

  function resize() {
    var w = canvas.clientWidth, h = canvas.clientHeight;
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
  }
  window.addEventListener("resize", resize);
  resize();

  function render() {
    var w = canvas.width, h = canvas.height;
    // ceiling / floor gradient
    var ceilGrad = ctx.createLinearGradient(0, 0, 0, h / 2);
    ceilGrad.addColorStop(0, "#0b0d18");
    ceilGrad.addColorStop(1, "#1c2038");
    ctx.fillStyle = ceilGrad;
    ctx.fillRect(0, 0, w, h / 2);
    var floorGrad = ctx.createLinearGradient(0, h / 2, 0, h);
    floorGrad.addColorStop(0, "#141319");
    floorGrad.addColorStop(1, "#050508");
    ctx.fillStyle = floorGrad;
    ctx.fillRect(0, h / 2, w, h / 2);

    var FOV = Math.PI / 2.7;
    var dirX = Math.cos(state.angle), dirY = Math.sin(state.angle);
    var planeLen = Math.tan(FOV / 2);
    var planeX = -dirY * planeLen, planeY = dirX * planeLen;

    var columns = w;
    for (var col = 0; col < columns; col++) {
      var cameraX = (2 * col) / columns - 1;
      var rayDirX = dirX + planeX * cameraX;
      var rayDirY = dirY + planeY * cameraX;

      var mapX = Math.floor(state.px), mapY = Math.floor(state.py);
      var deltaDistX = rayDirX === 0 ? 1e30 : Math.abs(1 / rayDirX);
      var deltaDistY = rayDirY === 0 ? 1e30 : Math.abs(1 / rayDirY);
      var stepX, stepY, sideDistX, sideDistY;
      if (rayDirX < 0) { stepX = -1; sideDistX = (state.px - mapX) * deltaDistX; }
      else { stepX = 1; sideDistX = (mapX + 1 - state.px) * deltaDistX; }
      if (rayDirY < 0) { stepY = -1; sideDistY = (state.py - mapY) * deltaDistY; }
      else { stepY = 1; sideDistY = (mapY + 1 - state.py) * deltaDistY; }

      var hit = false, side = 0, dist = RENDER_DIST, hitI = mapX, hitJ = mapY;
      var travelled = 0;
      while (!hit && travelled < RENDER_DIST) {
        if (sideDistX < sideDistY) {
          var dirE = stepX > 0 ? "E" : "W";
          if (isWallBetween(mapX, mapY, dirE)) {
            hit = true; side = 0; dist = sideDistX; hitI = mapX; hitJ = mapY;
          } else {
            travelled = sideDistX;
            sideDistX += deltaDistX;
            mapX += stepX;
          }
        } else {
          var dirN = stepY > 0 ? "N" : "S";
          if (isWallBetween(mapX, mapY, dirN)) {
            hit = true; side = 1; dist = sideDistY; hitI = mapX; hitJ = mapY;
          } else {
            travelled = sideDistY;
            sideDistY += deltaDistY;
            mapY += stepY;
          }
        }
      }

      if (!hit) continue;
      var perpDist = Math.max(dist, 0.0001);
      var lineHeight = h / perpDist;
      var drawStart = Math.max(0, h / 2 - lineHeight / 2);
      var drawEnd = Math.min(h, h / 2 + lineHeight / 2);

      var colorSet = ROOM_COLORS[roomColorAt(hitI, hitJ)] || ROOM_COLORS[0];
      var shade = side === 1 ? 0.72 : 1;
      var fog = Math.max(0.12, 1 - perpDist / RENDER_DIST);
      var c = colorSet.wall;
      var r = c[0] * shade * fog, g = c[1] * shade * fog, b = c[2] * shade * fog;
      ctx.fillStyle = "rgb(" + (r | 0) + "," + (g | 0) + "," + (b | 0) + ")";
      ctx.fillRect(col, drawStart, 1, drawEnd - drawStart);
    }

    updateHud();
    if (state.minimapOpen) renderMinimap();
  }

  // ---- HUD / minimap -------------------------------------------------------

  var hudSteps = document.getElementById("hudSteps");
  var hudTime = document.getElementById("hudTime");

  function updateHud() {
    hudSteps.textContent = state.steps;
    var t = state.startTime == null ? 0 : ((state.won ? state.winTime : performance.now()) - state.startTime) / 1000;
    hudTime.textContent = t.toFixed(1) + "s";
  }

  function renderMinimap() {
    var w = minimapCanvas.width, h = minimapCanvas.height;
    mctx.clearRect(0, 0, w, h);
    mctx.fillStyle = "rgba(6,7,14,0.92)";
    mctx.fillRect(0, 0, w, h);

    var scale = Math.min(w, h) * 0.46;
    function toScreen(p) { return [w / 2 + p.x * scale, h / 2 - p.y * scale]; }

    maze.rhombi.forEach(function (r, idx) {
      if (!maze.nodeSet.has(idx)) return;
      var pts = [r.p1, r.p2, r.p3, r.p4].map(toScreen);
      mctx.beginPath();
      mctx.moveTo(pts[0][0], pts[0][1]);
      for (var k = 1; k < 4; k++) mctx.lineTo(pts[k][0], pts[k][1]);
      mctx.closePath();
      var col = r.color === 0 ? "rgba(70,110,200,0.35)" : "rgba(200,90,150,0.35)";
      mctx.fillStyle = col;
      mctx.fill();
      mctx.strokeStyle = "rgba(255,255,255,0.06)";
      mctx.stroke();
    });

    mctx.strokeStyle = "rgba(255,230,120,0.85)";
    mctx.lineWidth = 1.5;
    mctx.beginPath();
    maze.nodes.forEach(function (idx) {
      var d = maze.doors.get(idx);
      DIRS.forEach(function (dir) {
        var n = d[dir];
        if (n == null || n < idx) return;
        var a = toScreen(maze.rhombi[idx]);
        var b = toScreen(maze.rhombi[n]);
        mctx.moveTo(a[0], a[1]);
        mctx.lineTo(b[0], b[1]);
      });
    });
    mctx.stroke();

    var startP = toScreen(maze.rhombi[maze.start]);
    mctx.fillStyle = "#7fd4ff";
    mctx.beginPath(); mctx.arc(startP[0], startP[1], 4, 0, 7); mctx.fill();

    var goalP = toScreen(maze.rhombi[maze.goal]);
    mctx.fillStyle = "#3ddc84";
    mctx.beginPath(); mctx.arc(goalP[0], goalP[1], 5, 0, 7); mctx.fill();

    var meP = toScreen(maze.rhombi[state.currentNode]);
    mctx.fillStyle = "#ffe66d";
    mctx.beginPath(); mctx.arc(meP[0], meP[1], 5, 0, 7); mctx.fill();
    var ang = state.angle;
    mctx.strokeStyle = "#ffe66d";
    mctx.beginPath();
    mctx.moveTo(meP[0], meP[1]);
    mctx.lineTo(meP[0] + Math.cos(ang) * 10, meP[1] - Math.sin(ang) * 10);
    mctx.stroke();
  }

  // ---- Win state -----------------------------------------------------------

  function onWin() {
    document.exitPointerLock && document.exitPointerLock();
    var overlay = document.getElementById("winOverlay");
    var elapsed = ((state.winTime - state.startTime) / 1000).toFixed(1);
    document.getElementById("winStats").textContent =
      state.steps + " rooms, " + elapsed + "s";
    overlay.classList.add("show");
    window.buildShare && window.buildShare(seed, state.steps, elapsed);
  }

  document.getElementById("retryBtn").addEventListener("click", function () {
    location.href = location.pathname + "?seed=" + seed;
  });
  document.getElementById("newMazeBtn").addEventListener("click", function () {
    location.href = location.pathname;
  });

  // ---- Loop ------------------------------------------------------------

  var last = performance.now();
  function frame(now) {
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  window.__penroseMazeDebug = { maze: maze, state: state, reRootIfNeeded: reRootIfNeeded };
})();
