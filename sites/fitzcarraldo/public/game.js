/* fitzcarraldo — "HAUL THE SHIP", an 8-bit recreation of the climactic scene
 * of Herzog's Fitzcarraldo: a steamship dragged up one side of a jungle
 * mountain, over the top, and down into the next river, by rope, winch and
 * a few hundred exhausted volunteers. You supply the volunteers: mash
 * SPACE / tap HAUL to build tension on the rope; it decays fast, so the
 * ship only moves while you keep working the capstan. Morale (yours, or the
 * crew's — same thing) dips with every haul and the rope slips back when
 * it runs low, same as the actual six-week production this is spoofing.
 *
 * Everything is canvas rectangles at native 256x160 (NES-ish), scaled up
 * with image-rendering:pixelated — no sprite sheets, no image assets.
 * Audio is a small Web Audio engine in the same spirit as sites/moonbuggy:
 * a looped work-chant bassline plus synthesized SFX, nothing pre-recorded.
 */
(function () {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const BASE_Y = H - 32;
  const LEFT_BASE_X = 34, RIGHT_BASE_X = 222, PEAK_X = 128, PEAK_Y = 26;

  const el = (id) => document.getElementById(id);
  const els = {
    altitude: el('altitude'), stage: el('stage'), hauls: el('hauls'), time: el('time'),
    morale: el('moraleFill'), caption: el('caption'),
    start: el('startOverlay'), win: el('winOverlay'), startBtn: el('startBtn'),
    againBtn: el('againBtn'), finalHauls: el('finalHauls'), finalTime: el('finalTime'),
    shareBluesky: el('shareBluesky'), shareDownload: el('shareDownload'),
    music: el('musicToggle'), sfx: el('sfxToggle'), haulBtn: el('haulBtn')
  };

  // ---------------------------------------------------------------------
  // Audio — one AudioContext, synthesized only, lazily created on the
  // first user gesture (browsers block autoplay before that anyway).
  // ---------------------------------------------------------------------
  const Audio = (function () {
    let actx = null, master = null, musicBus = null, sfxBus = null;
    let musicOn = true, sfxOn = true;
    let timer = null, nextTime = 0, step = 0;
    const SCALE = [0, 3, 5, 7, 10]; // minor pentatonic — "work chant" feel
    const ROOT = 82.4; // low E

    function ensure() {
      if (actx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      actx = new AC();
      master = actx.createGain(); master.gain.value = 0.9; master.connect(actx.destination);
      musicBus = actx.createGain(); musicBus.gain.value = musicOn ? 0.3 : 0; musicBus.connect(master);
      sfxBus = actx.createGain(); sfxBus.gain.value = sfxOn ? 0.9 : 0; sfxBus.connect(master);
    }
    function resume() { if (actx && actx.state === 'suspended') actx.resume(); }

    function voice(bus, type, f0, f1, t0, dur, peak, curve) {
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t0);
      if (f1 && f1 !== f0) {
        if (curve === 'exp') o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
        else o.frequency.linearRampToValueAtTime(f1, t0 + dur);
      }
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(peak, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(bus);
      o.start(t0); o.stop(t0 + dur + 0.02);
    }
    function noise(bus, dur, peak, cutoff) {
      const n = Math.floor(actx.sampleRate * dur);
      const buf = actx.createBuffer(1, n, actx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const src = actx.createBufferSource(); src.buffer = buf;
      const lp = actx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = cutoff;
      const g = actx.createGain();
      const t0 = actx.currentTime;
      g.gain.setValueAtTime(peak, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(lp); lp.connect(g); g.connect(bus);
      src.start(t0); src.stop(t0 + dur);
    }
    const rnd = (a, b) => a + Math.random() * (b - a);

    const SFX = {
      haul() {
        const t = actx.currentTime;
        voice(sfxBus, 'square', rnd(90, 110), rnd(60, 70), t, 0.1, 0.22, 'exp');
        noise(sfxBus, 0.08, 0.14, 1400);
      },
      slip() {
        const t = actx.currentTime;
        voice(sfxBus, 'sawtooth', 220, 60, t, 0.4, 0.3, 'exp');
        noise(sfxBus, 0.35, 0.25, 900);
      },
      milestone() {
        const t = actx.currentTime;
        [0, 4, 7].forEach((semi, i) => {
          const f = ROOT * 4 * Math.pow(2, semi / 12);
          voice(sfxBus, 'triangle', f, f, t + i * 0.06, 0.16, 0.22, 'lin');
        });
      },
      peak() {
        const t = actx.currentTime;
        [0, 3, 7, 12, 15].forEach((semi, i) => {
          const f = ROOT * 3 * Math.pow(2, semi / 12);
          voice(sfxBus, 'square', f, f, t + i * 0.08, 0.3, 0.24, 'lin');
        });
      },
      win() {
        const t = actx.currentTime;
        [0, 4, 7, 12, 16, 19, 24].forEach((semi, i) => {
          const f = ROOT * 2 * Math.pow(2, semi / 12);
          voice(sfxBus, 'square', f, f, t + i * 0.09, 0.4, 0.26, 'lin');
        });
      }
    };
    function play(name) { if (sfxOn && actx && SFX[name]) SFX[name](); }

    function scheduleStep(time) {
      const beat = 60 / 92 / 2;
      if (step % 4 === 0) {
        const deg = SCALE[(step / 4 | 0) % SCALE.length];
        const f = ROOT * Math.pow(2, deg / 12);
        voice(musicBus, 'sawtooth', f, f, time, beat * 3.2, 0.5, 'lin');
      }
      if (step % 2 === 0) {
        const deg = SCALE[Math.floor(Math.random() * SCALE.length)];
        const f = ROOT * Math.pow(2, 2 + deg / 12);
        voice(musicBus, 'triangle', f, f, time, beat * 0.9, 0.18, 'lin');
      }
      step = (step + 1) % 16;
    }
    function tick() {
      if (!actx) return;
      const beat = 60 / 92 / 2;
      while (nextTime < actx.currentTime + 0.15) { scheduleStep(nextTime); nextTime += beat; }
      timer = setTimeout(tick, 40);
    }
    function startMusic() { ensure(); if (!timer) { step = 0; nextTime = actx.currentTime + 0.05; tick(); } }
    function stopMusic() { if (timer) { clearTimeout(timer); timer = null; } }

    return {
      init: ensure, resume, play, startMusic, stopMusic,
      setMusic(on) { musicOn = on; if (musicBus) musicBus.gain.setTargetAtTime(on ? 0.3 : 0, actx.currentTime, 0.05); },
      setSfx(on) { sfxOn = on; if (sfxBus) sfxBus.gain.setTargetAtTime(on ? 0.9 : 0, actx.currentTime, 0.02); },
      get musicOn() { return musicOn; }, get sfxOn() { return sfxOn; }
    };
  })();

  // ---------------------------------------------------------------------
  // Palette — jungle haze by day, banded ziggurat mountain, muddy rivers.
  // ---------------------------------------------------------------------
  const C = {
    skyTop: '#ffcf7a', skyBot: '#ff9e5e', haze: '#e8a45f',
    treeFar: '#3c6e4a', treeNear: '#25502f',
    river: '#3f7ea6', riverLight: '#6fb4d6',
    mtn: ['#7a5a3a', '#6a4f34', '#5c452d', '#4c3a27', '#8a8a78', '#c9c9bd', '#f2f2ea'],
    path: '#2c2115', rope: '#e8d9a8',
    hull: '#7a1f1f', hullDark: '#5a1414', deck: '#c99a52', trim: '#f2e3b8',
    smoke: '#d8d8d8', capstan: '#8a6a3a', crew: '#3a2a1e', crewShirt: '#dcd2b8',
    fitz: '#f4f0e2', fitzHat: '#e0d8c0', note: '#ffe9a8'
  };

  function lerp(a, b, t) { return a + (b - a) * t; }

  // ---------------------------------------------------------------------
  // Game state
  // ---------------------------------------------------------------------
  const state = {
    running: false, won: false,
    t: 0, startedAt: 0,
    progress: 0,      // 0 = left river, 0.5 = summit, 1 = right river
    lastProgress: 0,
    tension: 0,       // 0..100, decays; each haul adds
    morale: 100,      // 0..100
    hauls: 0,
    mutiny: 0,        // frames of "crew refuses" lockout
    shake: 0,
    caption: '', captionTimer: 0,
    passedMilestones: new Set(),
    particles: [],
    craterFlash: 0
  };

  function shipPos(p) {
    if (p <= 0.5) {
      const t = p / 0.5;
      return {
        x: lerp(LEFT_BASE_X + 8, PEAK_X, t),
        y: lerp(BASE_Y - 4, PEAK_Y + 8, t),
        angle: Math.atan2((PEAK_Y + 8) - (BASE_Y - 4), PEAK_X - (LEFT_BASE_X + 8))
      };
    }
    const t = (p - 0.5) / 0.5;
    return {
      x: lerp(PEAK_X, RIGHT_BASE_X - 8, t),
      y: lerp(PEAK_Y + 8, BASE_Y - 4, t),
      angle: Math.atan2((BASE_Y - 4) - (PEAK_Y + 8), (RIGHT_BASE_X - 8) - PEAK_X)
    };
  }

  function setCaption(msg, dur) {
    state.caption = msg;
    state.captionTimer = dur || 140;
  }

  function milestoneCheck() {
    const marks = [0.1, 0.25, 0.5, 0.75, 0.9];
    for (const m of marks) {
      if (state.progress >= m && !state.passedMilestones.has(m)) {
        state.passedMilestones.add(m);
        if (m === 0.5) {
          Audio.play('peak');
          state.craterFlash = 12;
          setCaption('THE SHIP CRESTS THE MOUNTAIN.', 200);
        } else if (m < 0.5) {
          Audio.play('milestone');
          setCaption(pickClimbLine(), 130);
        } else {
          Audio.play('milestone');
          setCaption(pickDescentLine(), 130);
        }
      }
    }
  }
  const CLIMB_LINES = [
    'THE CAPSTAN GROANS.',
    'KINSKI GLARES AT THE JUNGLE.',
    'THE HULL SCRAPES ROCK.',
    'FOUR HUNDRED HANDS ON THE ROPE.'
  ];
  const DESCENT_LINES = [
    'EASY NOW — DOWN THE FAR SLOPE.',
    'THE OTHER RIVER GLINTS BELOW.',
    'THE GRAMOPHONE PLAYS ON.',
    'ALMOST HOME.'
  ];
  const pickClimbLine = () => CLIMB_LINES[Math.floor(Math.random() * CLIMB_LINES.length)];
  const pickDescentLine = () => DESCENT_LINES[Math.floor(Math.random() * DESCENT_LINES.length)];

  function burst(x, y, color, n, spread) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = (spread || 1.6) * (0.4 + Math.random());
      state.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.6, life: 22 + Math.random() * 18, color, size: 1 + Math.random() * 2 });
    }
  }

  function haul() {
    if (!state.running || state.won) return;
    if (state.mutiny > 0) return;
    state.tension = Math.min(100, state.tension + 13);
    state.morale = Math.max(0, state.morale - 0.7);
    state.hauls++;
    state.shake = 3;
    Audio.play('haul');
    const p = shipPos(state.progress);
    burst(p.x, p.y - 6, C.smoke, 3, 1.2);
    if (state.morale <= 0 && state.mutiny <= 0) {
      state.mutiny = 130;
      setCaption('THE CREW REFUSES. THE ROPE HOLDS.', 130);
    }
  }

  function reset() {
    state.running = true; state.won = false;
    state.t = 0; state.startedAt = performance.now();
    state.progress = 0; state.lastProgress = 0;
    state.tension = 0; state.morale = 100; state.hauls = 0; state.mutiny = 0;
    state.shake = 0; state.passedMilestones = new Set(); state.particles = [];
    setCaption('THE RIVER FALLS BEHIND YOU.', 140);
    updateHud();
  }

  function updateHud() {
    els.altitude.textContent = Math.round(Math.min(1, state.progress) * 100) + '%';
    els.stage.textContent = state.progress < 0.5 ? 'CLIMBING' : (state.progress >= 1 ? 'ARRIVED' : 'DESCENDING');
    els.hauls.textContent = state.hauls;
    const secs = state.running ? (performance.now() - state.startedAt) / 1000 : 0;
    els.time.textContent = secs.toFixed(1) + 's';
    els.morale.style.width = Math.max(0, state.morale) + '%';
  }

  function gameWon() {
    state.running = false; state.won = true;
    const secs = (performance.now() - state.startedAt) / 1000;
    Audio.play('win');
    els.finalHauls.textContent = state.hauls;
    els.finalTime.textContent = secs.toFixed(1) + 's';
    const text = `I hauled Fitzcarraldo's ship over the mountain in ${state.hauls} hauls (${secs.toFixed(1)}s) at fitzcarraldo.bisks.net`;
    els.shareBluesky.href = 'https://bsky.app/intent/compose?text=' + encodeURIComponent(text);
    els.win.classList.remove('hidden');
    burst(shipPos(1).x, shipPos(1).y, C.note, 30, 3);
  }

  function update() {
    state.t++;
    if (state.mutiny > 0) {
      state.mutiny--;
      if (state.mutiny === 0) { state.morale = 45; setCaption('THE CREW RETURNS TO THE ROPE.', 100); }
    } else {
      state.morale = Math.min(100, state.morale + 0.06);
    }
    state.lastProgress = state.progress;
    if (!state.won) {
      state.progress += state.tension * 0.000028;
      state.tension *= 0.965;

      // the rope slips when morale runs low — a small, punishing-but-forgiving setback
      const slipChance = state.morale < 35 ? 0.01 : (state.morale < 60 ? 0.003 : 0.0006);
      if (state.progress > 0.02 && state.progress < 0.999 && Math.random() < slipChance) {
        const loss = 0.01 + Math.random() * 0.02;
        state.progress = Math.max(0, state.progress - loss);
        state.shake = 6;
        Audio.play('slip');
        setCaption('THE ROPE SLIPS.', 90);
        const p = shipPos(state.progress);
        burst(p.x, p.y, C.mtn[0], 10, 2);
      }
      state.progress = Math.min(1, state.progress);
      milestoneCheck();
      if (state.progress >= 1) gameWon();
    }
    if (state.shake > 0) state.shake--;
    if (state.craterFlash > 0) state.craterFlash--;
    if (state.captionTimer > 0) state.captionTimer--;

    for (const p of state.particles) { p.x += p.vx; p.y += p.vy; p.vy += 0.08; p.life--; }
    state.particles = state.particles.filter(p => p.life > 0);
  }

  // ---------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------
  function mountainStep(x) {
    // returns [yTop, bandIndex] for the stepped ziggurat at world-x
    const stepsUp = 8;
    if (x <= PEAK_X) {
      const t = Math.max(0, Math.min(1, (x - LEFT_BASE_X) / (PEAK_X - LEFT_BASE_X)));
      const step = Math.floor(t * stepsUp);
      return BASE_Y - (BASE_Y - PEAK_Y) * (step / stepsUp);
    }
    const t = Math.max(0, Math.min(1, (x - PEAK_X) / (RIGHT_BASE_X - PEAK_X)));
    const step = Math.floor(t * stepsUp);
    return PEAK_Y + (BASE_Y - PEAK_Y) * (step / stepsUp);
  }

  function drawMountain() {
    const bands = C.mtn;
    for (let x = LEFT_BASE_X; x <= RIGHT_BASE_X; x += 2) {
      const y = mountainStep(x);
      const heightFrac = 1 - (y - PEAK_Y) / (BASE_Y - PEAK_Y);
      let bi = Math.floor(heightFrac * (bands.length - 1));
      if (heightFrac > 0.94) bi = bands.length - 1; // snow cap
      ctx.fillStyle = bands[Math.max(0, Math.min(bands.length - 1, bi))];
      ctx.fillRect(x, y, 2, BASE_Y - y + 6);
    }
    // the cut path — a dark seam up the flank where the sled runs
    ctx.strokeStyle = C.path; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(LEFT_BASE_X + 8, BASE_Y - 4);
    ctx.lineTo(PEAK_X, PEAK_Y + 6);
    ctx.lineTo(RIGHT_BASE_X - 8, BASE_Y - 4);
    ctx.stroke();
  }

  function drawSky() {
    const g = ctx.createLinearGradient(0, 0, 0, BASE_Y);
    g.addColorStop(0, C.skyTop); g.addColorStop(1, C.skyBot);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, BASE_Y + 8);
    // sun
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath(); ctx.arc(210, 24, 10, 0, Math.PI * 2); ctx.fill();
  }

  function drawTrees(y0, y1, color, seedOffset, count) {
    for (let i = 0; i < count; i++) {
      const x = (i * 971 + seedOffset * 37) % W;
      const h = 6 + ((i * 53 + seedOffset) % 10);
      const yy = lerp(y0, y1, (i % 5) / 5);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(x, yy);
      ctx.lineTo(x - h * 0.6, yy + h);
      ctx.lineTo(x + h * 0.6, yy + h);
      ctx.closePath(); ctx.fill();
    }
  }

  function drawRivers() {
    ctx.fillStyle = C.river;
    ctx.fillRect(0, BASE_Y, LEFT_BASE_X + 10, H - BASE_Y);
    ctx.fillRect(RIGHT_BASE_X - 10, BASE_Y, W - (RIGHT_BASE_X - 10), H - BASE_Y);
    ctx.fillStyle = C.riverLight;
    for (let i = 0; i < 6; i++) {
      const off = (state.t * 0.6 + i * 14) % 40;
      ctx.fillRect(off - 6, BASE_Y + 5 + (i % 3) * 6, 6, 2);
      ctx.fillRect(W - off, BASE_Y + 6 + (i % 3) * 6, 6, 2);
    }
  }

  function drawCapstan() {
    const cx = PEAK_X, cy = PEAK_Y - 4;
    ctx.fillStyle = C.capstan;
    ctx.fillRect(cx - 6, cy - 2, 12, 6);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((state.progress - state.lastProgress) * 40 + state.t * 0.03);
    ctx.strokeStyle = C.trim; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-6, 0); ctx.lineTo(6, 0);
    ctx.moveTo(0, -6); ctx.lineTo(0, 6);
    ctx.stroke();
    ctx.restore();
  }

  function drawRope(p) {
    ctx.strokeStyle = C.rope; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PEAK_X, PEAK_Y - 2);
    ctx.lineTo(p.x, p.y - 6);
    ctx.stroke();
  }

  function drawCrew() {
    const baseX = LEFT_BASE_X - 6, baseY = BASE_Y + 2;
    const lean = Math.min(1, state.tension / 60);
    for (let i = 0; i < 5; i++) {
      const x = baseX - i * 6;
      const bob = Math.sin(state.t * 0.2 + i) * 1;
      const kick = state.shake > 0 ? -1 : 0;
      ctx.save();
      ctx.translate(x, baseY + bob + kick);
      ctx.rotate(-0.5 * lean - 0.08);
      ctx.fillStyle = C.crew;
      ctx.fillRect(-1, -8, 2, 8); // body
      ctx.fillStyle = C.crewShirt;
      ctx.fillRect(-2, -8, 4, 3); // shirt
      ctx.fillStyle = C.crew;
      ctx.fillRect(-1, -10, 2, 2); // head
      ctx.restore();
    }
  }

  function drawShip(p) {
    ctx.save();
    ctx.translate(p.x, p.y + (state.shake ? (Math.random() - 0.5) * 2 : 0));
    ctx.rotate(p.angle * 0.5);
    // hull
    ctx.fillStyle = C.hull;
    ctx.beginPath();
    ctx.moveTo(-22, 4); ctx.lineTo(-24, -2); ctx.lineTo(20, -2); ctx.lineTo(22, 4); ctx.lineTo(-22, 4);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = C.hullDark;
    ctx.fillRect(-22, 2, 44, 3);
    // deck + cabin
    ctx.fillStyle = C.deck;
    ctx.fillRect(-16, -8, 22, 6);
    ctx.fillStyle = C.trim;
    ctx.fillRect(-14, -7, 4, 2); ctx.fillRect(-6, -7, 4, 2);
    // smokestack
    ctx.fillStyle = C.hullDark;
    ctx.fillRect(2, -16, 4, 9);
    if (state.t % 5 < 2) {
      ctx.fillStyle = C.smoke;
      ctx.beginPath(); ctx.arc(4, -18 - (state.t % 20) * 0.4, 2.4, 0, Math.PI * 2); ctx.fill();
    }
    // Fitzcarraldo — white suit, small figure at the bow
    ctx.fillStyle = C.fitz;
    ctx.fillRect(-19, -12, 3, 5);
    ctx.fillStyle = C.fitzHat;
    ctx.fillRect(-20, -13, 5, 2);
    // gramophone horn on deck, piping opera notes
    ctx.fillStyle = C.trim;
    ctx.fillRect(9, -9, 3, 2);
    if (state.t % 40 < 3) burst(p.x + 11, p.y - 10, C.note, 1, 0.4);
    ctx.restore();
  }

  function drawParticles() {
    for (const pt of state.particles) {
      ctx.globalAlpha = Math.max(0, pt.life / 30);
      ctx.fillStyle = pt.color;
      ctx.fillRect(pt.x, pt.y, pt.size, pt.size);
    }
    ctx.globalAlpha = 1;
  }

  function draw() {
    ctx.save();
    if (state.shake > 0) ctx.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);
    drawSky();
    drawTrees(24, 60, C.treeFar, 1, 26);
    drawMountain();
    drawTrees(BASE_Y - 30, BASE_Y - 6, C.treeNear, 2, 14);
    drawRivers();
    drawCapstan();
    const p = shipPos(state.progress);
    drawRope(p);
    drawCrew();
    drawShip(p);
    drawParticles();
    if (state.craterFlash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${state.craterFlash / 24})`;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------------
  // Loop + input
  // ---------------------------------------------------------------------
  function frame() {
    if (state.running) { update(); updateHud(); }
    draw();
    if (els.caption) els.caption.style.opacity = state.captionTimer > 0 ? '1' : '0';
    if (els.caption && state.captionTimer > 0) els.caption.textContent = state.caption;
    requestAnimationFrame(frame);
  }

  function startGame() {
    Audio.init(); Audio.resume();
    if (Audio.musicOn) Audio.startMusic();
    els.start.classList.add('hidden');
    els.win.classList.add('hidden');
    reset();
  }

  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      if (!state.running && !state.won) startGame();
      else haul();
    }
  });
  canvas.addEventListener('pointerdown', () => {
    if (!state.running && !state.won) startGame(); else haul();
  });
  els.haulBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (!state.running && !state.won) startGame(); else haul();
  });
  els.startBtn.addEventListener('click', startGame);
  els.againBtn.addEventListener('click', startGame);

  els.shareDownload.addEventListener('click', () => {
    canvas.toBlob((blob) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'fitzcarraldo-haul.png';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    });
  });

  function setMusic(on) {
    Audio.setMusic(on);
    els.music.setAttribute('aria-pressed', String(on));
    if (on && state.running) Audio.startMusic(); else if (!on) Audio.stopMusic();
  }
  function setSfx(on) { Audio.setSfx(on); els.sfx.setAttribute('aria-pressed', String(on)); }
  els.music.addEventListener('click', () => setMusic(els.music.getAttribute('aria-pressed') !== 'true'));
  els.sfx.addEventListener('click', () => setSfx(els.sfx.getAttribute('aria-pressed') !== 'true'));

  reset();
  state.running = false;
  requestAnimationFrame(frame);
})();
