/* desert bus (abridged) — a Desert Bus homage crammed into 30 real seconds.
 *
 * The joke Desert Bus is famous for an 8-hour dead-straight drive that
 * barely does anything. This compresses that into a 30-second fuel tank:
 * speed is tied directly to fuel left (less fuel = less car velocity,
 * literally), and once fuel drops below half, a dashboard warning "from
 * Grace" starts appearing every 5 seconds. None of them auto-dismiss — they
 * stack up across the whole viewport until you click them away, so the
 * longer you ignore them the more of the screen they eat. Built from
 * @norvid-studies.bsky.social's brief, quoting a gracekind.net exchange.
 */
(function () {
  'use strict';

  const DURATION = 30;          // seconds — the whole run, fuel to empty
  const MAX_MPH = 58;           // speedometer ceiling at full tank
  const POPUP_THRESHOLD = 0.5;  // fuel fraction at which Grace starts in
  const POPUP_INTERVAL_MS = 5000;
  const OFFROAD_MULT = 0.5;     // speed penalty while off the road

  const GRACE_LINES = [
    "We've detected that your vehicle's fuel level is low. Exactly.",
    "Less fuel = less car velocity. Exactly.",
    "Your fuel level is still low. Still exactly.",
    "This message will keep appearing until the tank is empty. Exactly.",
    "There is no snooze button on this one. Exactly.",
    "Fuel level: low. Vibes: also low. Exactly.",
    "Please pull over and reflect on your choices. Exactly.",
    "🫩 (this is also a warning)",
    "Have you tried having more fuel. Exactly.",
    "We will keep detecting this. Exactly.",
  ];

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const HORIZON = H * 0.34;

  const el = (id) => document.getElementById(id);
  const els = {
    dash: el('dash'),
    mph: el('mph'),
    dist: el('dist'),
    fuelFill: el('fuelFill'),
    start: el('startOverlay'), startBtn: el('startBtn'),
    over: el('overOverlay'),
    finalDist: el('finalDist'), finalWarnings: el('finalWarnings'),
    finalDismissed: el('finalDismissed'), flavorText: el('flavorText'),
    againBtn: el('againBtn'), shareBtn: el('shareBtn'),
    shoo: el('shoo'), shooCount: el('shooCount'),
    popups: el('popups'),
    bestLine: el('bestLine'), bestDist: el('bestDist'), bestFlavor: el('bestFlavor'),
  };

  // ---------------------------------------------------------------------
  // personal best — just bragging rights, stored locally per browser
  // ---------------------------------------------------------------------
  const BEST_KEY = 'desertbus-best-ft';
  function loadBest() {
    try { return Number(localStorage.getItem(BEST_KEY)) || 0; } catch (e) { return 0; }
  }
  function saveBest(ft) {
    try { localStorage.setItem(BEST_KEY, String(ft)); } catch (e) {}
  }

  // ---------------------------------------------------------------------
  // tiny audio: an engine drone that pitches with speed, a notification
  // chime when Grace shows up, and a rumble when you drift off the road.
  // ---------------------------------------------------------------------
  const Audio = (function () {
    let ctx2 = null, master = null, engineOsc = null, engineGain = null;
    function ensure() {
      if (ctx2) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx2 = new AC();
      master = ctx2.createGain(); master.gain.value = 0.5; master.connect(ctx2.destination);
      engineOsc = ctx2.createOscillator();
      engineOsc.type = 'sawtooth';
      engineGain = ctx2.createGain(); engineGain.gain.value = 0;
      const lp = ctx2.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 340;
      engineOsc.connect(lp); lp.connect(engineGain); engineGain.connect(master);
      engineOsc.frequency.value = 40;
      engineOsc.start();
    }
    function setEngine(speedFrac) {
      if (!ctx2) return;
      const t = ctx2.currentTime;
      engineOsc.frequency.setTargetAtTime(40 + speedFrac * 70, t, 0.08);
      engineGain.gain.setTargetAtTime(speedFrac > 0.01 ? 0.10 : 0, t, 0.15);
    }
    function chime() {
      if (!ctx2) return;
      const t = ctx2.currentTime;
      [660, 880].forEach((f, i) => {
        const o = ctx2.createOscillator(), g = ctx2.createGain();
        o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t + i * 0.09);
        g.gain.exponentialRampToValueAtTime(0.18, t + i * 0.09 + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.09 + 0.22);
        o.connect(g); g.connect(master);
        o.start(t + i * 0.09); o.stop(t + i * 0.09 + 0.24);
      });
    }
    function rumble() {
      if (!ctx2) return;
      const n = Math.floor(ctx2.sampleRate * 0.12);
      const buf = ctx2.createBuffer(1, n, ctx2.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) * 0.6;
      const src = ctx2.createBufferSource(); src.buffer = buf;
      const g = ctx2.createGain(); g.gain.value = 0.35;
      src.connect(g); g.connect(master);
      src.start();
    }
    return { init: ensure, setEngine, chime, rumble };
  })();

  // ---------------------------------------------------------------------
  // world state
  // ---------------------------------------------------------------------
  const ROAD_L = W * 0.31, ROAD_R = W * 0.69; // road bounds at car's depth
  const CAR_MIN_X = W * 0.10, CAR_MAX_X = W * 0.90;

  const state = {
    running: false, over: false,
    startTime: 0,
    elapsed: 0,          // seconds
    carX: W * 0.5,
    scroll: 0,            // px, for stripe/dune animation
    distanceFt: 0,
    mph: 0,
    offRoad: false,
    shake: 0,
    dust: [],
    warningsShown: 0,
    warningsDismissed: 0,
    nextPopupAt: null,    // seconds, or null before threshold crossed
    popupCascade: 0,
    lastLine: -1,
  };
  const keys = { left: false, right: false };

  function fuelFraction() {
    return Math.max(0, 1 - state.elapsed / DURATION);
  }

  function reset() {
    state.running = true; state.over = false;
    state.startTime = performance.now();
    state.elapsed = 0;
    state.carX = W * 0.5; state.scroll = 0;
    state.distanceFt = 0; state.mph = 0; state.offRoad = false; state.shake = 0;
    state.dust = [];
    state.warningsShown = 0; state.warningsDismissed = 0;
    state.nextPopupAt = null; state.popupCascade = 0;
    clearPopups();
    els.dash.classList.remove('low');
    updateHud();
  }

  function updateHud() {
    els.mph.innerHTML = Math.round(state.mph) + '<small> mph</small>';
    els.dist.innerHTML = Math.round(state.distanceFt).toLocaleString() + '<small> ft</small>';
    els.fuelFill.style.width = (fuelFraction() * 100).toFixed(1) + '%';
    els.dash.classList.toggle('low', fuelFraction() <= POPUP_THRESHOLD && fuelFraction() > 0);
  }

  // ---------------------------------------------------------------------
  // Grace popups — fixed to the viewport, cascade diagonally, only close
  // when the player clicks them. A new one arrives every 5s once fuel is
  // low, whether or not the previous ones were dismissed.
  // ---------------------------------------------------------------------
  function pickLine() {
    let i;
    do { i = Math.floor(Math.random() * GRACE_LINES.length); } while (i === state.lastLine && GRACE_LINES.length > 1);
    state.lastLine = i;
    return GRACE_LINES[i];
  }

  function spawnPopup() {
    state.warningsShown++;
    Audio.chime();
    const margin = 24;
    const maxLeft = Math.max(margin, window.innerWidth - 300 - margin);
    const maxTop = Math.max(margin, window.innerHeight - 150 - margin);
    const step = 30;
    const baseLeft = margin + ((state.popupCascade * step) % Math.max(step, maxLeft - margin));
    const baseTop = margin + ((state.popupCascade * step * 0.8) % Math.max(step, maxTop - margin));
    state.popupCascade++;

    const box = document.createElement('div');
    box.className = 'grace-popup';
    box.style.left = baseLeft + 'px';
    box.style.top = baseTop + 'px';
    box.innerHTML =
      '<div class="titlebar"><div class="avatar">G</div><span>Grace — fuel system</span>' +
      '<div class="close" title="close">✕</div></div>' +
      '<div class="body"></div>' +
      '<div class="foot"><button class="ok">OK</button></div>';
    box.querySelector('.body').textContent = pickLine();

    function dismiss() {
      if (!box.isConnected) return;
      box.remove();
      state.warningsDismissed++;
      refreshShoo();
    }
    box.querySelector('.close').addEventListener('click', dismiss);
    box.querySelector('.ok').addEventListener('click', dismiss);

    els.popups.appendChild(box);
    refreshShoo();
  }

  function clearPopups() {
    els.popups.innerHTML = '';
    refreshShoo();
  }

  function refreshShoo() {
    const n = els.popups.children.length;
    els.shooCount.textContent = String(n);
    els.shoo.classList.toggle('show', n > 0);
  }

  els.shoo.addEventListener('click', () => {
    state.warningsDismissed += els.popups.children.length;
    clearPopups();
  });

  // ---------------------------------------------------------------------
  // update / physics
  // ---------------------------------------------------------------------
  let lastT = null;
  function update(dtSec) {
    state.elapsed = Math.min(DURATION, state.elapsed + dtSec);
    const fuel = fuelFraction();

    state.offRoad = state.carX < ROAD_L || state.carX > ROAD_R;
    const speedFrac = fuel * (state.offRoad ? OFFROAD_MULT : 1);
    state.mph = MAX_MPH * speedFrac;
    Audio.setEngine(speedFrac);

    // steering vs. a constant rightward drift (the Desert Bus joke)
    const steerSpeed = 210 * dtSec;
    const driftAccel = (state.offRoad ? 55 : 30) * dtSec;
    if (keys.left) state.carX -= steerSpeed;
    if (keys.right) state.carX += steerSpeed;
    state.carX += driftAccel;
    state.carX = Math.max(CAR_MIN_X, Math.min(CAR_MAX_X, state.carX));

    if (state.offRoad && Math.random() < dtSec * 3) {
      state.shake = 5;
      if (Math.random() < 0.4) Audio.rumble();
      for (let i = 0; i < 2; i++) {
        state.dust.push({ x: state.carX + (Math.random() - 0.5) * 30, y: H * 0.86, life: 1 });
      }
    }
    state.shake = Math.max(0, state.shake - dtSec * 18);

    state.scroll += speedFrac * 900 * dtSec;
    state.distanceFt += state.mph * (5280 / 3600) * dtSec;

    for (const p of state.dust) { p.y -= 18 * dtSec; p.life -= dtSec * 1.2; }
    state.dust = state.dust.filter((p) => p.life > 0);

    // Grace popup scheduling
    if (fuel <= POPUP_THRESHOLD && fuel > 0) {
      if (state.nextPopupAt === null) {
        state.nextPopupAt = state.elapsed; // fire immediately at threshold
      }
      if (state.elapsed >= state.nextPopupAt) {
        spawnPopup();
        state.nextPopupAt += POPUP_INTERVAL_MS / 1000;
      }
    }

    updateHud();

    if (state.elapsed >= DURATION) {
      endRun();
    }
  }

  function endRun() {
    state.running = false; state.over = true;
    const distFt = Math.round(state.distanceFt);
    els.finalDist.textContent = distFt.toLocaleString() + ' ft';
    els.finalWarnings.textContent = String(state.warningsShown);
    els.finalDismissed.textContent = String(state.warningsDismissed);
    const pct = (state.distanceFt / 5280 / 360 * 100);
    const pctStr = pct < 0.01 ? '<0.01' : pct.toFixed(2);
    els.flavorText.textContent =
      `the real Desert Bus route is about 360 miles. you covered roughly ${pctStr}% of it.`;

    const prevBest = loadBest();
    const isNewBest = distFt > prevBest;
    if (isNewBest) saveBest(distFt);
    const best = isNewBest ? distFt : prevBest;
    if (best > 0) {
      els.bestFlavor.style.display = '';
      els.bestFlavor.textContent = isNewBest
        ? `new personal best.`
        : `personal best: ${best.toLocaleString()} ft.`;
    }

    const shareText =
      `Drove ${distFt.toLocaleString()} ft before the tank hit empty ` +
      `and Grace sent ${state.warningsShown} fuel warning${state.warningsShown === 1 ? '' : 's'}. ` +
      `Desert Bus, abridged: https://bisks.net/games/desertbus`;
    els.shareBtn.href = 'https://bsky.app/intent/compose?text=' + encodeURIComponent(shareText);
    els.over.classList.remove('hidden');
  }

  // ---------------------------------------------------------------------
  // render
  // ---------------------------------------------------------------------
  function draw() {
    const shakeX = (Math.random() - 0.5) * state.shake;

    ctx.save();
    ctx.translate(shakeX, 0);

    // sky
    const g = ctx.createLinearGradient(0, 0, 0, HORIZON);
    g.addColorStop(0, '#ffb37a'); g.addColorStop(1, '#ffdca8');
    ctx.fillStyle = g;
    ctx.fillRect(-20, 0, W + 40, HORIZON);

    // sun
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath(); ctx.arc(W * 0.78, HORIZON * 0.45, 34, 0, Math.PI * 2); ctx.fill();

    // far dunes (slow parallax)
    ctx.fillStyle = '#e0a868';
    drawDuneLayer(HORIZON, 26, 0.06, 1);
    // near dunes
    ctx.fillStyle = '#c98a4f';
    drawDuneLayer(HORIZON + 10, 40, 0.16, 2);

    // ground
    ctx.fillStyle = '#c98a4f';
    ctx.fillRect(-20, HORIZON, W + 40, H - HORIZON);

    // road (simple trapezoid widening toward camera)
    const roadTopL = W * 0.44, roadTopR = W * 0.56;
    ctx.fillStyle = '#4a4238';
    ctx.beginPath();
    ctx.moveTo(roadTopL, HORIZON);
    ctx.lineTo(roadTopR, HORIZON);
    ctx.lineTo(ROAD_R + 40, H);
    ctx.lineTo(ROAD_L - 40, H);
    ctx.closePath();
    ctx.fill();

    // road edge lines
    ctx.strokeStyle = '#f4e6c9';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(roadTopL, HORIZON); ctx.lineTo(ROAD_L - 40, H);
    ctx.moveTo(roadTopR, HORIZON); ctx.lineTo(ROAD_R + 40, H);
    ctx.stroke();

    // center dashes, scrolling
    ctx.strokeStyle = '#f4e6c9';
    ctx.lineWidth = 5;
    ctx.setLineDash([26, 22]);
    ctx.lineDashOffset = -state.scroll % 48;
    ctx.beginPath();
    ctx.moveTo(W * 0.5, HORIZON);
    ctx.lineTo(W * 0.5, H);
    ctx.stroke();
    ctx.setLineDash([]);

    // dust particles
    for (const p of state.dust) {
      ctx.globalAlpha = Math.max(0, p.life) * 0.5;
      ctx.fillStyle = '#e8c98f';
      ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    drawCar();

    ctx.restore();
  }

  function drawDuneLayer(baseY, amp, speedMult, seedMult) {
    const offset = (state.scroll * speedMult) % (W / 3);
    ctx.beginPath();
    ctx.moveTo(-20, baseY);
    for (let x = -60; x <= W + 60; x += 20) {
      const y = baseY - Math.abs(Math.sin((x + offset) * 0.012 * seedMult)) * amp;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W + 20, baseY);
    ctx.closePath();
    ctx.fill();
  }

  function drawCar() {
    const x = state.carX, y = H * 0.86;
    const wobble = state.offRoad ? Math.sin(performance.now() * 0.03) * 2 : 0;
    ctx.save();
    ctx.translate(x + wobble, y);

    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(0, 30, 34, 8, 0, 0, Math.PI * 2); ctx.fill();

    // body
    ctx.fillStyle = '#2d5b6b';
    ctx.beginPath();
    ctx.moveTo(-30, 24);
    ctx.lineTo(-34, 6);
    ctx.lineTo(-20, -14);
    ctx.lineTo(20, -14);
    ctx.lineTo(34, 6);
    ctx.lineTo(30, 24);
    ctx.closePath();
    ctx.fill();

    // cabin
    ctx.fillStyle = '#dfeff2';
    ctx.beginPath();
    ctx.moveTo(-14, -12);
    ctx.lineTo(-10, -26);
    ctx.lineTo(10, -26);
    ctx.lineTo(14, -12);
    ctx.closePath();
    ctx.fill();

    // taillights
    ctx.fillStyle = state.offRoad ? '#ff5d5d' : '#ffb454';
    ctx.fillRect(-30, 14, 6, 8);
    ctx.fillRect(24, 14, 6, 8);

    // wheels
    ctx.fillStyle = '#1a1512';
    ctx.fillRect(-36, 0, 8, 16);
    ctx.fillRect(28, 0, 8, 16);

    ctx.restore();
  }

  // ---------------------------------------------------------------------
  // main loop
  // ---------------------------------------------------------------------
  function frame(t) {
    if (lastT === null) lastT = t;
    const dt = Math.min(0.05, (t - lastT) / 1000);
    lastT = t;
    if (state.running) update(dt);
    draw();
    requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------------
  // controls
  // ---------------------------------------------------------------------
  function startGame() {
    // Audio is a nice-to-have; some browsers (in-app webviews especially)
    // throw or lack AudioContext entirely, and that must never block the
    // key from turning.
    try { Audio.init(); } catch (e) {}
    els.start.classList.add('hidden');
    els.over.classList.add('hidden');
    reset();
  }

  document.addEventListener('keydown', (e) => {
    switch (e.code) {
      case 'ArrowLeft': case 'KeyA': keys.left = true; break;
      case 'ArrowRight': case 'KeyD': keys.right = true; break;
      case 'Enter': case 'Space':
        if (!state.running && !state.over) startGame();
        else if (state.over) startGame();
        break;
    }
  });
  document.addEventListener('keyup', (e) => {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = false;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = false;
  });

  // Touch / mouse steering: hold either half of the canvas, same as holding
  // an arrow key. One active steer pointer at a time is enough — this is a
  // joke driving game, not a fighting game combo input.
  let steerPointerId = null;
  canvas.style.touchAction = 'none';
  canvas.addEventListener('pointerdown', (e) => {
    if (!state.running && !state.over) { startGame(); return; }
    if (state.over) { startGame(); return; }
    steerPointerId = e.pointerId;
    const rect = canvas.getBoundingClientRect();
    const side = (e.clientX - rect.left) / rect.width < 0.5 ? 'left' : 'right';
    keys.left = side === 'left';
    keys.right = side === 'right';
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerId !== steerPointerId) return;
    const rect = canvas.getBoundingClientRect();
    const side = (e.clientX - rect.left) / rect.width < 0.5 ? 'left' : 'right';
    keys.left = side === 'left';
    keys.right = side === 'right';
  });
  function releaseSteer(e) {
    if (e.pointerId !== steerPointerId) return;
    steerPointerId = null;
    keys.left = false; keys.right = false;
  }
  canvas.addEventListener('pointerup', releaseSteer);
  canvas.addEventListener('pointercancel', releaseSteer);

  els.startBtn.addEventListener('click', startGame);
  els.againBtn.addEventListener('click', startGame);

  const initialBest = loadBest();
  if (initialBest > 0) {
    els.bestLine.style.display = '';
    els.bestDist.textContent = initialBest.toLocaleString() + ' ft';
  }

  reset();
  state.running = false;
  els.start.classList.remove('hidden');
  requestAnimationFrame(frame);
})();
