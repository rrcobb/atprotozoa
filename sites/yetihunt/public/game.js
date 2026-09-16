(function () {
  "use strict";

  var canvas = document.getElementById("game");
  var ctx = canvas.getContext("2d");
  var W = canvas.width, H = canvas.height;
  var PLAYER_Y = H * 0.62;
  var PX_PER_METER = 8;

  var distEl = document.getElementById("dist");
  var scoreEl = document.getElementById("score");
  var bestEl = document.getElementById("best");
  var pursuitWrap = document.getElementById("pursuit");
  var pursuitFill = document.getElementById("pursuitFill");
  var startOverlay = document.getElementById("startOverlay");
  var overOverlay = document.getElementById("overOverlay");
  var overTitle = document.getElementById("overTitle");
  var overMsg = document.getElementById("overMsg");
  var finalDistEl = document.getElementById("finalDist");
  var finalScoreEl = document.getElementById("finalScore");
  var startBtn = document.getElementById("startBtn");
  var againBtn = document.getElementById("againBtn");
  var tTuck = document.getElementById("tTuck");
  var tFire = document.getElementById("tFire");

  var BEST_KEY = "yetihunt_best_m";
  var best = Number(localStorage.getItem(BEST_KEY) || 0);
  bestEl.textContent = Math.floor(best);

  var STATE_MENU = "menu", STATE_PLAY = "play", STATE_OVER = "over";
  var state = STATE_MENU;

  var keys = {};
  window.addEventListener("keydown", function (e) {
    keys[e.key] = true;
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " "].indexOf(e.key) !== -1) e.preventDefault();
    if (e.key === "Enter" && state !== STATE_PLAY) doStart();
    if (e.key === " " && state === STATE_PLAY) fireAt(aimX, aimY);
  }, { passive: false });
  window.addEventListener("keyup", function (e) { keys[e.key] = false; });

  // ---- aim + steer input ----
  // Mouse aims a crosshair (independent of steering) and clicks/space throw
  // a snowball at it. Touch has no persistent hover position, so a drag
  // steers like the rest of the run, and a quick tap both aims and throws.
  var aimX = W / 2, aimY = PLAYER_Y - 140;
  var dragging = false, dragX = null;
  var touchStartX = 0, touchStartY = 0, touchStartT = 0;

  function canvasPoint(clientX, clientY) {
    var r = canvas.getBoundingClientRect();
    return {
      x: (clientX - r.left) * (W / r.width),
      y: (clientY - r.top) * (H / r.height),
    };
  }

  canvas.addEventListener("pointermove", function (e) {
    var p = canvasPoint(e.clientX, e.clientY);
    aimX = Math.max(0, Math.min(W, p.x));
    aimY = Math.max(0, Math.min(H, p.y));
    if (e.pointerType === "touch" && dragging) dragX = p.x;
  });

  canvas.addEventListener("pointerdown", function (e) {
    var p = canvasPoint(e.clientX, e.clientY);
    if (e.pointerType === "touch") {
      dragging = true;
      dragX = p.x;
      touchStartX = p.x; touchStartY = p.y; touchStartT = performance.now();
      canvas.setPointerCapture(e.pointerId);
    } else {
      // mouse: never steers, always throws toward the click point
      if (state === STATE_PLAY) fireAt(p.x, p.y);
      else doStart();
    }
  });
  canvas.addEventListener("pointerup", function (e) {
    if (e.pointerType === "touch") {
      var p = canvasPoint(e.clientX, e.clientY);
      var dt = performance.now() - touchStartT;
      var moved = Math.hypot(p.x - touchStartX, p.y - touchStartY);
      if (dt < 260 && moved < 18) {
        if (state === STATE_PLAY) fireAt(p.x, p.y);
        else doStart();
      }
    }
    dragging = false; dragX = null;
  });
  canvas.addEventListener("pointercancel", function () { dragging = false; dragX = null; });

  var tuckHeld = false;
  function bindHold(el, on, off) {
    el.addEventListener("pointerdown", function (e) { e.preventDefault(); on(); });
    el.addEventListener("pointerup", function () { off(); });
    el.addEventListener("pointercancel", function () { off(); });
    el.addEventListener("pointerleave", function () { off(); });
  }
  bindHold(tTuck, function () { tuckHeld = true; }, function () { tuckHeld = false; });
  tFire.addEventListener("pointerdown", function (e) {
    e.preventDefault();
    if (state === STATE_PLAY) fireAt(yetiActive ? yetiScreenX() : aimX, yetiActive ? yetiScreenY() : aimY);
  });

  startBtn.addEventListener("click", doStart);
  againBtn.addEventListener("click", doStart);

  function doStart() {
    resetGame();
    state = STATE_PLAY;
    startOverlay.classList.add("hidden");
    overOverlay.classList.add("hidden");
  }

  // ---- game state ----
  var player = { x: W / 2, vx: 0 };
  var obstacles = [], particles = [], snow = [], snowballs = [];
  var distanceM = 0, speed = 150, crashFlashT = 0, stunT = 0;
  var yetiActive = false, yetiGapM = 0, yetiShakeT = 0, screenShakeT = 0, yetiHurtT = 0;
  var spawnTimer = 0.6, fireCooldown = 0;
  var score = 0;
  var YETI_START_GAP = 70;
  var YETI_START_M = 260;

  function spawnSnow(y) {
    return { x: Math.random() * W, y: y == null ? -10 : y, s: 1 + Math.random() * 2.2 };
  }
  for (var si = 0; si < 50; si++) snow.push(spawnSnow(Math.random() * H));

  function resetGame() {
    player = { x: W / 2, vx: 0 };
    obstacles = [];
    particles = [];
    snowballs = [];
    distanceM = 0;
    score = 0;
    speed = 150;
    stunT = 0;
    crashFlashT = 0;
    yetiActive = false;
    yetiGapM = 0;
    yetiShakeT = 0;
    screenShakeT = 0;
    yetiHurtT = 0;
    spawnTimer = 0.6;
    fireCooldown = 0;
    pursuitWrap.classList.remove("on");
    pursuitFill.style.width = "0%";
  }

  function spawnWave() {
    var gapW = 130 + Math.random() * 40;
    var gapX = 60 + Math.random() * (W - 120);
    var count = 1 + Math.floor(Math.random() * 2) + (distanceM > 400 ? 1 : 0);
    for (var i = 0; i < count; i++) {
      var x;
      var tries = 0;
      do {
        x = 30 + Math.random() * (W - 60);
        tries++;
      } while (Math.abs(x - gapX) < gapW / 2 && tries < 8);
      var type = Math.random() < 0.55 ? "tree" : "rock";
      obstacles.push({ x: x, y: -40, type: type, hit: false, r: type === "tree" ? 16 : 18 });
    }
  }

  function dist2(ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }

  function crash() {
    if (stunT > 0) return;
    stunT = 0.85;
    crashFlashT = 0.3;
    if (yetiActive) {
      yetiGapM = Math.max(0, yetiGapM - 16);
      yetiShakeT = 0.4;
    }
    for (var i = 0; i < 14; i++) {
      particles.push({
        x: player.x, y: PLAYER_Y,
        vx: (Math.random() - 0.5) * 220, vy: (Math.random() - 0.5) * 220 - 40,
        life: 0.5 + Math.random() * 0.3, c: "#d1373f", size: 4
      });
    }
  }

  function yetiScreenX() {
    return player.x;
  }
  function yetiScreenY(tNow) {
    var offsetPx = yetiGapM * 5.4;
    return PLAYER_Y - offsetPx;
  }

  function fireAt(tx, ty) {
    if (fireCooldown > 0 || stunT > 0) return;
    fireCooldown = 0.22;
    var fromX = player.x, fromY = PLAYER_Y - 14;
    var dx = tx - fromX, dy = ty - fromY;
    var len = Math.max(1, Math.hypot(dx, dy));
    var spd = 640;
    snowballs.push({ x: fromX, y: fromY, vx: (dx / len) * spd, vy: (dy / len) * spd });
  }

  function update(dt) {
    if (state !== STATE_PLAY) return;

    if (fireCooldown > 0) fireCooldown -= dt;
    if (yetiHurtT > 0) yetiHurtT -= dt;

    if (stunT > 0) {
      stunT -= dt;
      speed = Math.max(40, speed - 260 * dt);
    } else {
      var maxSpeed = 380 + Math.min(220, distanceM * 0.35);
      var tuck = tuckHeld || keys["ArrowDown"] || keys["s"] || keys["S"];
      var target = tuck ? maxSpeed * 1.35 : 150 + Math.min(maxSpeed - 150, distanceM * 0.6);
      speed += (target - speed) * Math.min(1, dt * 1.4);
    }

    // steering
    var steerInput = 0;
    if (keys["ArrowLeft"] || keys["a"] || keys["A"]) steerInput -= 1;
    if (keys["ArrowRight"] || keys["d"] || keys["D"]) steerInput += 1;
    if (stunT > 0) steerInput = 0;

    if (dragging && dragX != null && stunT <= 0) {
      var toward = dragX - player.x;
      player.vx += toward * 8 * dt;
      player.vx *= 0.85;
    } else {
      player.vx += steerInput * 900 * dt;
      player.vx *= 0.9;
    }
    var maxVx = 340;
    if (player.vx > maxVx) player.vx = maxVx;
    if (player.vx < -maxVx) player.vx = -maxVx;
    player.x += player.vx * dt;
    if (player.x < 16) { player.x = 16; player.vx = 0; }
    if (player.x > W - 16) { player.x = W - 16; player.vx = 0; }

    distanceM += (speed * dt) / PX_PER_METER;

    // ambient snowfall
    for (var m = 0; m < snow.length; m++) {
      var sk = snow[m];
      sk.y += speed * 0.5 * dt + sk.s * 24 * dt;
      sk.x += Math.sin((sk.y + sk.s * 40) * 0.01) * 6 * dt;
      if (sk.y > H + 10) { snow[m] = spawnSnow(-10); }
    }

    // spawn obstacles
    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      spawnWave();
      var interval = Math.max(0.42, 1.15 - distanceM * 0.0012);
      spawnTimer = interval;
    }

    // move + collide obstacles
    for (var i = obstacles.length - 1; i >= 0; i--) {
      var o = obstacles[i];
      o.y += speed * dt;
      if (o.y > H + 60) { obstacles.splice(i, 1); continue; }
      if (!o.hit && Math.abs(o.y - PLAYER_Y) < 26 && dist2(o.x, o.y, player.x, PLAYER_Y) < (o.r + 12) * (o.r + 12)) {
        o.hit = true;
        crash();
      }
    }

    // snowballs
    for (var b = snowballs.length - 1; b >= 0; b--) {
      var sb = snowballs[b];
      sb.x += sb.vx * dt; sb.y += sb.vy * dt;
      if (sb.x < -20 || sb.x > W + 20 || sb.y < -20 || sb.y > H + 20) {
        snowballs.splice(b, 1);
        continue;
      }
      if (yetiActive && yetiHurtT <= 0) {
        var yx = yetiScreenX(), yy = yetiScreenY();
        if (dist2(sb.x, sb.y, yx, yy) < 26 * 26) {
          snowballs.splice(b, 1);
          score += 1;
          scoreEl.textContent = score;
          yetiGapM = Math.min(YETI_START_GAP, yetiGapM + 14);
          yetiHurtT = 0.15;
          for (var k = 0; k < 10; k++) {
            particles.push({
              x: yx, y: yy,
              vx: (Math.random() - 0.5) * 180, vy: (Math.random() - 0.5) * 180 - 30,
              life: 0.4, c: "#f4f9ff", size: 3
            });
          }
        }
      }
    }

    // particles
    for (var p = particles.length - 1; p >= 0; p--) {
      var pt = particles[p];
      pt.life -= dt;
      if (pt.life <= 0) { particles.splice(p, 1); continue; }
      pt.x += pt.vx * dt; pt.y += pt.vy * dt;
      pt.vy += 300 * dt;
    }

    if (crashFlashT > 0) crashFlashT -= dt;
    if (yetiShakeT > 0) yetiShakeT -= dt;
    screenShakeT = Math.max(0, screenShakeT - dt);

    // yeti pursuit
    if (!yetiActive && distanceM > YETI_START_M) {
      yetiActive = true;
      yetiGapM = YETI_START_GAP;
      pursuitWrap.classList.add("on");
    }
    if (yetiActive) {
      var closingRate = 1.3 + distanceM * 0.0009 + (stunT > 0 ? 3.5 : 0);
      yetiGapM -= closingRate * dt;
      if (yetiGapM < 0) yetiGapM = 0;
      var pct = Math.max(0, Math.min(100, (1 - yetiGapM / YETI_START_GAP) * 100));
      pursuitFill.style.width = pct + "%";
      if (yetiGapM <= 0) {
        gameOver("yeti");
        return;
      }
    }

    distEl.textContent = Math.floor(distanceM);
  }

  function gameOver(reason) {
    state = STATE_OVER;
    if (distanceM > best) {
      best = distanceM;
      localStorage.setItem(BEST_KEY, String(Math.floor(best)));
    }
    bestEl.textContent = Math.floor(best);
    finalDistEl.textContent = Math.floor(distanceM);
    finalScoreEl.textContent = score;
    if (reason === "yeti") {
      overTitle.textContent = "CAUGHT";
      overMsg.textContent = "The yeti closed the gap. Should've thrown harder.";
    } else {
      overTitle.textContent = "WIPED OUT";
      overMsg.textContent = "The slope won this one.";
    }
    overOverlay.classList.remove("hidden");
  }

  // ---- drawing ----
  function drawMogulShading(offset) {
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = "#dbe9f5";
    var spacing = 90;
    var yOff = offset % spacing;
    for (var y = -spacing + yOff; y < H; y += spacing) {
      ctx.beginPath();
      ctx.ellipse(W * 0.25, y, 70, 14, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(W * 0.75, y + spacing / 2, 60, 12, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawTree(o) {
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.fillStyle = "#5a2f1f";
    ctx.fillRect(-3, 8, 6, 8);
    ctx.fillStyle = "#2f6b3f";
    ctx.strokeStyle = "#1c4527";
    ctx.lineWidth = 1.5;
    function tier(cy, w) {
      ctx.beginPath();
      ctx.moveTo(0, cy - 14);
      ctx.lineTo(w, cy + 6);
      ctx.lineTo(-w, cy + 6);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
    }
    tier(-2, 16);
    tier(-12, 13);
    tier(-20, 9);
    ctx.restore();
  }

  function drawRock(o) {
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.fillStyle = "#8a95a1";
    ctx.strokeStyle = "#5c6774";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-18, 10);
    ctx.lineTo(-10, -12);
    ctx.lineTo(10, -14);
    ctx.lineTo(18, 6);
    ctx.lineTo(6, 16);
    ctx.lineTo(-8, 16);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-6, -6);
    ctx.lineTo(4, -8);
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.stroke();
    ctx.restore();
  }

  function drawPlayer() {
    var x = player.x, y = PLAYER_Y;
    var fallen = stunT > 0;
    ctx.save();
    ctx.translate(x, y);
    var lean = Math.max(-0.5, Math.min(0.5, player.vx / 340));
    if (!fallen) ctx.rotate(lean * 0.3);
    else ctx.rotate(Math.PI / 2.4);

    // skis
    ctx.strokeStyle = "#1c2b3a";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-15, 15); ctx.lineTo(-2, 16);
    ctx.moveTo(2, 16); ctx.lineTo(15, 15);
    ctx.stroke();

    // legs
    ctx.strokeStyle = "#1c6fd1";
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(0, 4); ctx.lineTo(-8, 14);
    ctx.moveTo(0, 4); ctx.lineTo(8, 14);
    ctx.stroke();

    // torso (jacket)
    ctx.fillStyle = "#d1373f";
    ctx.strokeStyle = "#8a1f26";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-8, -8);
    ctx.lineTo(8, -8);
    ctx.lineTo(6, 6);
    ctx.lineTo(-6, 6);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    // arms + poles
    ctx.strokeStyle = "#d1373f";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-7, -4); ctx.lineTo(-16, 4);
    ctx.moveTo(7, -4); ctx.lineTo(16, 4);
    ctx.stroke();
    ctx.strokeStyle = "#5b7186";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-16, 4); ctx.lineTo(-20, 16);
    ctx.moveTo(16, 4); ctx.lineTo(20, 16);
    ctx.stroke();

    // head
    ctx.beginPath();
    ctx.arc(0, -14, 6, 0, Math.PI * 2);
    ctx.fillStyle = "#f4c89a";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, -17, 6, Math.PI, 0);
    ctx.fillStyle = "#1c2b3a";
    ctx.fill();

    ctx.restore();
  }

  function drawYeti() {
    if (!yetiActive) return;
    var yy = yetiScreenY();
    if (yy < -80) return;
    var cx = yetiScreenX();
    var stride = Math.sin(performance.now() / 1000 * 8);
    ctx.save();
    ctx.translate(cx, yy);
    var scale = 1 + Math.max(0, (YETI_START_GAP - yetiGapM) / YETI_START_GAP) * 0.55;
    if (yetiHurtT > 0) scale *= 1.08;
    ctx.scale(scale, scale);

    // legs
    ctx.strokeStyle = "#c7d0d8";
    ctx.lineWidth = 6;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-8, 14); ctx.lineTo(-8 - stride * 5, 28);
    ctx.moveTo(8, 14); ctx.lineTo(8 + stride * 5, 28);
    ctx.stroke();

    // body
    ctx.fillStyle = yetiHurtT > 0 ? "#ffe3e3" : "#eef3f6";
    ctx.strokeStyle = "#9aa7b2";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -28);
    ctx.quadraticCurveTo(22, -20, 20, 6);
    ctx.quadraticCurveTo(18, 20, 0, 22);
    ctx.quadraticCurveTo(-18, 20, -20, 6);
    ctx.quadraticCurveTo(-22, -20, 0, -28);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    // arms, reaching
    ctx.strokeStyle = ctx.fillStyle;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(-16, -6); ctx.lineTo(-30, 6 + stride * 3);
    ctx.moveTo(16, -6); ctx.lineTo(30, -6 - stride * 3);
    ctx.stroke();

    // face
    ctx.beginPath();
    ctx.arc(-7, -12, 3.4, 0, Math.PI * 2);
    ctx.arc(7, -12, 3.4, 0, Math.PI * 2);
    ctx.fillStyle = "#d1373f";
    ctx.shadowColor = "#d1373f";
    ctx.shadowBlur = 6;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#3a2f2f";
    ctx.beginPath();
    ctx.moveTo(-6, -1); ctx.lineTo(6, -1); ctx.lineTo(0, 6);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-3, 1); ctx.lineTo(-1, 5);
    ctx.moveTo(3, 1); ctx.lineTo(1, 5);
    ctx.stroke();

    ctx.restore();
  }

  function drawSnowball(sb) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(sb.x, sb.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "#9aa7b2";
    ctx.lineWidth = 1;
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  function drawCrosshair() {
    if (state !== STATE_PLAY) return;
    ctx.save();
    ctx.strokeStyle = "rgba(28,43,58,0.55)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(aimX - 9, aimY); ctx.lineTo(aimX - 3, aimY);
    ctx.moveTo(aimX + 3, aimY); ctx.lineTo(aimX + 9, aimY);
    ctx.moveTo(aimX, aimY - 9); ctx.lineTo(aimX, aimY - 3);
    ctx.moveTo(aimX, aimY + 3); ctx.lineTo(aimX, aimY + 9);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(aimX, aimY, 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  var lastT = null;
  function frame(ts) {
    if (lastT == null) lastT = ts;
    var dt = Math.min(0.05, (ts - lastT) / 1000);
    lastT = ts;

    update(dt);

    ctx.save();
    if (screenShakeT > 0 || yetiShakeT > 0) {
      ctx.translate((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6);
    }

    // background
    ctx.fillStyle = "#f4f9ff";
    ctx.fillRect(-10, -10, W + 20, H + 20);
    drawMogulShading((distanceM * PX_PER_METER * 0.2) % 1000);

    for (var i = 0; i < snow.length; i++) {
      var sk = snow[i];
      ctx.beginPath();
      ctx.fillStyle = "rgba(28,43,58,0.35)";
      ctx.globalAlpha = 0.5;
      ctx.arc(sk.x, sk.y, sk.s, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    if (state !== STATE_MENU) {
      for (var oi = 0; oi < obstacles.length; oi++) {
        var o = obstacles[oi];
        if (o.hit) continue;
        if (o.type === "tree") drawTree(o);
        else drawRock(o);
      }

      for (var b = 0; b < snowballs.length; b++) drawSnowball(snowballs[b]);

      for (var p = 0; p < particles.length; p++) {
        var pt = particles[p];
        ctx.globalAlpha = Math.max(0, pt.life / 0.5);
        ctx.fillStyle = pt.c;
        ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
        ctx.globalAlpha = 1;
      }

      drawPlayer();
      drawYeti();
      drawCrosshair();

      if (crashFlashT > 0) {
        ctx.fillStyle = "rgba(209,55,63," + (crashFlashT / 0.3 * 0.3) + ")";
        ctx.fillRect(0, 0, W, H);
      }
      if (yetiActive && yetiGapM < 20) {
        ctx.save();
        var vign = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.7);
        var a = (1 - yetiGapM / 20) * 0.45;
        vign.addColorStop(0, "rgba(209,55,63,0)");
        vign.addColorStop(1, "rgba(209,55,63," + a + ")");
        ctx.fillStyle = vign;
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
      }
    }

    ctx.restore();
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
})();
