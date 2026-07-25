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

  var BEST_KEY = "blackice_best_m";
  var best = Number(localStorage.getItem(BEST_KEY) || 0);
  bestEl.textContent = Math.floor(best);

  var STATE_MENU = "menu", STATE_PLAY = "play", STATE_OVER = "over";
  var state = STATE_MENU;

  var keys = {};
  window.addEventListener("keydown", function (e) {
    keys[e.key] = true;
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " "].indexOf(e.key) !== -1) e.preventDefault();
    if (e.key === "Enter" && state !== STATE_PLAY) doStart();
  }, { passive: false });
  window.addEventListener("keyup", function (e) { keys[e.key] = false; });

  var dragging = false, dragX = null;
  function canvasX(clientX) {
    var r = canvas.getBoundingClientRect();
    return (clientX - r.left) * (W / r.width);
  }
  canvas.addEventListener("pointerdown", function (e) {
    dragging = true; dragX = canvasX(e.clientX);
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", function (e) {
    if (dragging) dragX = canvasX(e.clientX);
  });
  canvas.addEventListener("pointerup", function () { dragging = false; dragX = null; });
  canvas.addEventListener("pointercancel", function () { dragging = false; dragX = null; });

  var tuckHeld = false;
  function bindHold(el, on, off) {
    el.addEventListener("pointerdown", function (e) { e.preventDefault(); on(); });
    el.addEventListener("pointerup", function () { off(); });
    el.addEventListener("pointercancel", function () { off(); });
    el.addEventListener("pointerleave", function () { off(); });
  }
  bindHold(tTuck, function () { tuckHeld = true; }, function () { tuckHeld = false; });

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
  var obstacles = [], particles = [];
  var motes = [];
  var distanceM = 0, speed = 150, crashFlashT = 0, stunT = 0;
  var crowActive = false, crowGapM = 0, crowShakeT = 0, screenShakeT = 0;
  var spawnTimer = 0.6;

  function spawnMote(y) {
    return { x: Math.random() * W, y: y == null ? -10 : y, s: 1 + Math.random() * 2, c: Math.random() < 0.5 ? "#26f7ff" : "#ff2fd0" };
  }
  for (var mi = 0; mi < 40; mi++) motes.push(spawnMote(Math.random() * H));

  function resetGame() {
    player = { x: W / 2, vx: 0 };
    obstacles = [];
    motes = [];
    for (var i = 0; i < 40; i++) motes.push(spawnMote(Math.random() * H));
    particles = [];
    distanceM = 0;
    score = 0;
    speed = 150;
    stunT = 0;
    crashFlashT = 0;
    crowActive = false;
    crowGapM = 0;
    crowShakeT = 0;
    screenShakeT = 0;
    spawnTimer = 0.6;
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
      var r = Math.random();
      var type = r < 0.46 ? "tree" : r < 0.82 ? "rock" : "chip";
      obstacles.push({ x: x, y: -40, type: type, hit: false, r: type === "chip" ? 12 : 18 });
    }
    if (Math.random() < 0.5) {
      obstacles.push({ x: gapX + (Math.random() - 0.5) * (gapW * 0.4), y: -80 - Math.random() * 60, type: "chip", hit: false, r: 12 });
    }
  }

  function dist2(ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }

  function crash() {
    if (stunT > 0) return;
    stunT = 0.85;
    crashFlashT = 0.3;
    if (crowActive) {
      crowGapM = Math.max(0, crowGapM - 16);
      crowShakeT = 0.4;
    }
    for (var i = 0; i < 14; i++) {
      particles.push({
        x: player.x, y: PLAYER_Y,
        vx: (Math.random() - 0.5) * 220, vy: (Math.random() - 0.5) * 220 - 40,
        life: 0.5 + Math.random() * 0.3, c: Math.random() < 0.5 ? "#ff2b4e" : "#ff2fd0"
      });
    }
  }

  var CROW_START_M = 260;
  var score = 0;

  function update(dt) {
    if (state !== STATE_PLAY) return;

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

    // motes drift down as ambient "digital snow"
    for (var m = 0; m < motes.length; m++) {
      var mo = motes[m];
      mo.y += speed * 0.5 * dt + mo.s * 20 * dt;
      if (mo.y > H + 10) { motes[m] = spawnMote(-10); }
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
        if (o.type === "chip") {
          score += 50;
          for (var k = 0; k < 8; k++) {
            particles.push({
              x: o.x, y: o.y,
              vx: (Math.random() - 0.5) * 140, vy: -Math.random() * 140,
              life: 0.4, c: "#26f7ff"
            });
          }
        } else {
          crash();
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
    if (crowShakeT > 0) crowShakeT -= dt;
    screenShakeT = Math.max(0, screenShakeT - dt);

    // crow pursuit
    if (!crowActive && distanceM > CROW_START_M) {
      crowActive = true;
      crowGapM = 70;
      pursuitWrap.classList.add("on");
    }
    if (crowActive) {
      var closingRate = 1.3 + distanceM * 0.0009 + (stunT > 0 ? 3.5 : 0);
      crowGapM -= closingRate * dt;
      if (crowGapM < 0) crowGapM = 0;
      var pct = Math.max(0, Math.min(100, (1 - crowGapM / 70) * 100));
      pursuitFill.style.width = pct + "%";
      if (crowGapM <= 0) {
        gameOver("crow");
        return;
      }
    }

    distEl.textContent = Math.floor(distanceM);
    scoreEl.textContent = score;
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
    if (reason === "crow") {
      overTitle.textContent = "CAUGHT";
      overMsg.textContent = "The crow's talons closed the loop. Ejected from the run.";
    } else {
      overTitle.textContent = "FLATLINED";
      overMsg.textContent = "The slope-code ate you.";
    }
    overOverlay.classList.remove("hidden");
  }

  // ---- drawing ----
  function drawGrid(offset) {
    ctx.save();
    ctx.strokeStyle = "rgba(255,47,208,0.18)";
    ctx.lineWidth = 1;
    var spacing = 40;
    var yOff = offset % spacing;
    for (var y = -spacing + yOff; y < H; y += spacing) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    ctx.strokeStyle = "rgba(38,247,255,0.10)";
    for (var x = 0; x <= W; x += spacing) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    ctx.restore();
  }

  function drawTree(o) {
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.shadowColor = "#ff2fd0";
    ctx.shadowBlur = 12;
    ctx.strokeStyle = "#ff2fd0";
    ctx.fillStyle = "rgba(255,47,208,0.12)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -26);
    ctx.lineTo(16, -2);
    ctx.lineTo(8, -2);
    ctx.lineTo(20, 16);
    ctx.lineTo(-20, 16);
    ctx.lineTo(-8, -2);
    ctx.lineTo(-16, -2);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  function drawRock(o) {
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.shadowColor = "#26f7ff";
    ctx.shadowBlur = 12;
    ctx.strokeStyle = "#26f7ff";
    ctx.fillStyle = "rgba(38,247,255,0.12)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-18, 10);
    ctx.lineTo(-10, -12);
    ctx.lineTo(10, -14);
    ctx.lineTo(18, 6);
    ctx.lineTo(6, 16);
    ctx.lineTo(-8, 16);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  function drawChip(o, t) {
    ctx.save();
    ctx.translate(o.x, o.y);
    var pulse = 1 + 0.15 * Math.sin(t * 6 + o.x);
    ctx.scale(pulse, pulse);
    ctx.shadowColor = "#fff";
    ctx.shadowBlur = 14;
    ctx.strokeStyle = "#eafcff";
    ctx.fillStyle = "rgba(234,252,255,0.35)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -10); ctx.lineTo(10, 0); ctx.lineTo(0, 10); ctx.lineTo(-10, 0);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  function drawPlayer(t) {
    var x = player.x, y = PLAYER_Y;
    var fallen = stunT > 0;
    ctx.save();
    ctx.translate(x, y);
    var lean = Math.max(-0.5, Math.min(0.5, player.vx / 340));
    if (!fallen) ctx.rotate(lean * 0.35);
    else ctx.rotate(Math.PI / 2.4);

    // board / hover trail
    ctx.shadowColor = "#26f7ff";
    ctx.shadowBlur = 10;
    ctx.strokeStyle = "#26f7ff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-14, 14); ctx.lineTo(14, 14);
    ctx.stroke();

    // body
    ctx.shadowColor = "#eafcff";
    ctx.shadowBlur = 8;
    ctx.strokeStyle = "#eafcff";
    ctx.fillStyle = "rgba(234,252,255,0.25)";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(0, -22); ctx.lineTo(0, 6);
    ctx.moveTo(0, -14); ctx.lineTo(-12, -4);
    ctx.moveTo(0, -14); ctx.lineTo(12, -4);
    ctx.moveTo(0, 6); ctx.lineTo(-10, 14);
    ctx.moveTo(0, 6); ctx.lineTo(10, 14);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, -20, 6, 0, Math.PI * 2);
    ctx.fillStyle = "#ff2fd0";
    ctx.shadowColor = "#ff2fd0";
    ctx.fill();
    ctx.restore();
  }

  function drawCrow(t) {
    if (!crowActive) return;
    var offsetPx = crowGapM * 5.4;
    if (offsetPx > H + 60) return;
    var cx = player.x + Math.sin(t * 3) * 26;
    var cy = PLAYER_Y - offsetPx;
    var flap = Math.sin(t * 14);
    ctx.save();
    ctx.translate(cx, cy);
    var scale = 1 + Math.max(0, (60 - crowGapM) / 60) * 0.6;
    ctx.scale(scale, scale);
    ctx.shadowColor = "#ff2b4e";
    ctx.shadowBlur = 18;
    ctx.strokeStyle = "#c9d3e6";
    ctx.fillStyle = "rgba(30,10,20,0.85)";
    ctx.lineWidth = 2;
    // body
    ctx.beginPath();
    ctx.moveTo(0, -6); ctx.lineTo(6, 4); ctx.lineTo(0, 14); ctx.lineTo(-6, 4);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // wings, flapping
    var wingY = flap * 10;
    ctx.beginPath();
    ctx.moveTo(-4, -2);
    ctx.lineTo(-28, -14 - wingY);
    ctx.lineTo(-22, 2 - wingY * 0.3);
    ctx.lineTo(-6, 6);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(4, -2);
    ctx.lineTo(28, -14 + wingY);
    ctx.lineTo(22, 2 + wingY * 0.3);
    ctx.lineTo(6, 6);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // head + beak
    ctx.beginPath();
    ctx.arc(0, -10, 5, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -10); ctx.lineTo(9, -8); ctx.lineTo(0, -6);
    ctx.closePath();
    ctx.fillStyle = "#888";
    ctx.fill(); ctx.stroke();
    // glowing red eye
    ctx.beginPath();
    ctx.arc(-1, -11, 2, 0, Math.PI * 2);
    ctx.fillStyle = "#ff2b4e";
    ctx.shadowBlur = 10;
    ctx.fill();
    // trailing wires
    ctx.strokeStyle = "#ff2b4e";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-2, 12); ctx.quadraticCurveTo(-10, 20, -4, 28);
    ctx.moveTo(2, 12); ctx.quadraticCurveTo(10, 22, 3, 30);
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
    if (screenShakeT > 0 || crowShakeT > 0) {
      ctx.translate((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6);
    }

    // background
    var grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "#05030a");
    grad.addColorStop(1, "#0a0620");
    ctx.fillStyle = grad;
    ctx.fillRect(-10, -10, W + 20, H + 20);

    drawGrid((distanceM * PX_PER_METER * 0.2) % 1000);

    for (var i = 0; i < motes.length; i++) {
      var mo = motes[i];
      ctx.beginPath();
      ctx.fillStyle = mo.c;
      ctx.globalAlpha = 0.5;
      ctx.fillRect(mo.x, mo.y, mo.s, mo.s);
      ctx.globalAlpha = 1;
    }

    if (state !== STATE_MENU) {
      var t = ts / 1000;
      for (var oi = 0; oi < obstacles.length; oi++) {
        var o = obstacles[oi];
        if (o.hit && o.type !== "chip") continue;
        if (o.type === "tree") drawTree(o);
        else if (o.type === "rock") drawRock(o);
        else if (!o.hit) drawChip(o, t);
      }

      for (var p = 0; p < particles.length; p++) {
        var pt = particles[p];
        ctx.globalAlpha = Math.max(0, pt.life / 0.5);
        ctx.fillStyle = pt.c;
        ctx.fillRect(pt.x - 2, pt.y - 2, 4, 4);
        ctx.globalAlpha = 1;
      }

      drawPlayer(t);
      drawCrow(t);

      if (crashFlashT > 0) {
        ctx.fillStyle = "rgba(255,43,78," + (crashFlashT / 0.3 * 0.35) + ")";
        ctx.fillRect(0, 0, W, H);
      }
      if (crowActive && crowGapM < 20) {
        ctx.save();
        var vign = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.7);
        var a = (1 - crowGapM / 20) * 0.5;
        vign.addColorStop(0, "rgba(255,43,78,0)");
        vign.addColorStop(1, "rgba(255,43,78," + a + ")");
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
