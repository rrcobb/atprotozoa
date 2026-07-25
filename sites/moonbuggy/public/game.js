/* moonbuggy — a Moon Patrol / Moon Buggy-style lunar side-scroller.
 *
 * Everything runs in the browser, no build step. The audio is the point of the
 * request: every beep/boop/crash is synthesized on demand with the Web Audio
 * API (with a dab of randomness per event), and the background music is a
 * real-time synthesized bassline + arpeggio — no audio files ship. There's a
 * theme switcher with sensible palettes, soft pastels, and a couple of
 * deliberately eye-destroying neon horrors.
 *
 * "wasm" was aspirational in the brief; plain JS + Web Audio delivers the whole
 * thing cleanly in one page, so that's the call. See the note in wrangler.toml.
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Themes. Each theme is a palette + a `music` block that steers the synth
  // (scale, tempo, waveform, whether the whole thing glows). Categories:
  //   normal — readable, classic
  //   pastel — soft, low-contrast, gentle
  //   neon   — deliberately loud, glowing, hard to look at
  // ---------------------------------------------------------------------------
  const THEMES = {
    // --- normal ---
    'lunar-noir': {
      label: 'Lunar Noir (normal)',
      c: {
        skyTop: '#05060f', skyBot: '#0a0e24', ground: '#241f36',
        groundLine: '#6a5acd', star: '#ffffff', buggy: '#d8d8ff',
        buggy2: '#8fa2ff', wheel: '#3a3a4a', bullet: '#ffd166',
        rock: '#8a7f9c', mine: '#ff5d73', crater: '#04050d', hud: '#cfd4ff',
        accent: '#7c6cff', panel: 'rgba(10,12,28,0.82)', glow: 0
      },
      music: { root: 55, scale: [0, 3, 5, 7, 10], tempo: 108, wave: 'triangle', bassWave: 'sawtooth' }
    },
    'daybreak': {
      label: 'Daybreak (normal)',
      c: {
        skyTop: '#16324f', skyBot: '#3a6ea5', ground: '#d9b382',
        groundLine: '#8a5a2b', star: '#fff7d6', buggy: '#f2f2f2',
        buggy2: '#c94b4b', wheel: '#2c2c2c', bullet: '#ffcf33',
        rock: '#9c7a4d', mine: '#c0392b', crater: '#5a3d1f', hud: '#0e2233',
        accent: '#c94b4b', panel: 'rgba(240,235,225,0.85)', glow: 0
      },
      music: { root: 65.4, scale: [0, 2, 4, 7, 9], tempo: 120, wave: 'square', bassWave: 'triangle' }
    },
    // --- pastel ---
    'cotton-moon': {
      label: 'Cotton Moon (pastel)',
      c: {
        skyTop: '#fde2ff', skyBot: '#d6e8ff', ground: '#ffe9f3',
        groundLine: '#f7b7d3', star: '#fff0fb', buggy: '#b8a7ff',
        buggy2: '#8ec7ff', wheel: '#b3a0c9', bullet: '#ffd59e',
        rock: '#c9b8e0', mine: '#ff9ec0', crater: '#e7c8e6', hud: '#6a5b8a',
        accent: '#c39cff', panel: 'rgba(255,245,252,0.86)', glow: 0
      },
      music: { root: 65.4, scale: [0, 2, 4, 7, 9, 11], tempo: 96, wave: 'sine', bassWave: 'sine' }
    },
    'mint-sorbet': {
      label: 'Mint Sorbet (pastel)',
      c: {
        skyTop: '#e6fff4', skyBot: '#cdeafd', ground: '#dff7e6',
        groundLine: '#a6e3c1', star: '#f0fff8', buggy: '#8fd6c0',
        buggy2: '#ffb3c6', wheel: '#9fc7b8', bullet: '#ffe08a',
        rock: '#b8e0c8', mine: '#ff9db0', crater: '#c6ead6', hud: '#3f6b5a',
        accent: '#7fd1b0', panel: 'rgba(240,255,248,0.86)', glow: 0
      },
      music: { root: 73.4, scale: [0, 2, 3, 5, 7, 10], tempo: 88, wave: 'sine', bassWave: 'triangle' }
    },
    // --- neon horrors ---
    'retina-burn': {
      label: '⚠ Retina Burn (neon)',
      c: {
        skyTop: '#ff00e6', skyBot: '#00ffe1', ground: '#00ff2a',
        groundLine: '#ff003c', star: '#ffff00', buggy: '#ffff00',
        buggy2: '#ff00e6', wheel: '#00ffe1', bullet: '#00ff2a',
        rock: '#ff00e6', mine: '#ffff00', crater: '#ff003c', hud: '#00ff2a',
        accent: '#ff00e6', panel: 'rgba(20,0,20,0.7)', glow: 26
      },
      music: { root: 82.4, scale: [0, 1, 4, 6, 7, 10], tempo: 150, wave: 'sawtooth', bassWave: 'square' }
    },
    'acid-vhs': {
      label: '⚠ Acid VHS (neon)',
      c: {
        skyTop: '#1a0033', skyBot: '#ff006e', ground: '#3a015c',
        groundLine: '#00f0ff', star: '#fbff00', buggy: '#00f0ff',
        buggy2: '#fbff00', wheel: '#ff006e', bullet: '#fbff00',
        rock: '#b100ff', mine: '#00ff85', crater: '#0a0018', hud: '#00f0ff',
        accent: '#ff006e', panel: 'rgba(10,0,25,0.72)', glow: 20
      },
      music: { root: 61.7, scale: [0, 2, 3, 6, 7, 9], tempo: 138, wave: 'square', bassWave: 'sawtooth' }
    }
  };
  const THEME_ORDER = ['lunar-noir', 'daybreak', 'cotton-moon', 'mint-sorbet', 'retina-burn', 'acid-vhs'];

  // ---------------------------------------------------------------------------
  // Audio engine. One AudioContext, a master gain, and two sub-buses (music,
  // sfx) so the two toggles work independently. SFX are built per-call from
  // oscillators + envelopes; music is a scheduled loop clocked off ctx.time.
  // ---------------------------------------------------------------------------
  const Audio = (function () {
    let ctx = null, master = null, musicBus = null, sfxBus = null;
    let musicOn = true, sfxOn = true;
    let musicTimer = null, nextNoteTime = 0, step = 0;
    let melodyState = { root: 55, scale: [0, 3, 5, 7, 10], tempo: 108, wave: 'triangle', bassWave: 'sawtooth' };

    function ensure() {
      if (ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
      musicBus = ctx.createGain(); musicBus.gain.value = musicOn ? 0.32 : 0; musicBus.connect(master);
      sfxBus = ctx.createGain(); sfxBus.gain.value = sfxOn ? 0.9 : 0; sfxBus.connect(master);
    }
    function resume() { if (ctx && ctx.state === 'suspended') ctx.resume(); }

    // one-shot voice: osc -> gain(env) -> bus
    function voice(bus, type, f0, f1, t0, dur, peak, curve) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t0);
      if (f1 && f1 !== f0) {
        if (curve === 'exp') o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
        else o.frequency.linearRampToValueAtTime(f1, t0 + dur);
      }
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(peak, t0 + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(bus);
      o.start(t0); o.stop(t0 + dur + 0.02);
      return o;
    }

    // short burst of filtered noise, for crashes / explosions
    function noise(bus, dur, peak, cutoff) {
      const n = Math.floor(ctx.sampleRate * dur);
      const buf = ctx.createBuffer(1, n, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const src = ctx.createBufferSource(); src.buffer = buf;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = cutoff;
      const g = ctx.createGain();
      const t0 = ctx.currentTime;
      g.gain.setValueAtTime(peak, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(lp); lp.connect(g); g.connect(bus);
      src.start(t0); src.stop(t0 + dur);
    }

    const rnd = (a, b) => a + Math.random() * (b - a);

    // --- the SFX. A little randomness per call so it never feels canned. ---
    const SFX = {
      jump() {
        const t = ctx.currentTime, base = rnd(300, 360);
        voice(sfxBus, 'square', base, base * rnd(2.4, 3.2), t, 0.16, 0.28, 'exp');
      },
      land() {
        const t = ctx.currentTime;
        voice(sfxBus, 'sine', rnd(160, 200), rnd(70, 90), t, 0.12, 0.3, 'exp');
        noise(sfxBus, 0.06, 0.12, 1200);
      },
      shoot() {
        const t = ctx.currentTime, base = rnd(680, 900);
        voice(sfxBus, 'square', base, base * rnd(0.28, 0.4), t, 0.1, 0.22, 'exp');
        voice(sfxBus, 'triangle', base * 2, base, t, 0.06, 0.12, 'exp');
      },
      hit() { // bullet destroys a rock/mine
        const t = ctx.currentTime, base = rnd(420, 560);
        voice(sfxBus, 'sawtooth', base, base * rnd(0.2, 0.35), t, 0.14, 0.26, 'exp');
        noise(sfxBus, 0.1, 0.16, 2600);
      },
      crash() {
        const t = ctx.currentTime;
        voice(sfxBus, 'sawtooth', rnd(200, 260), 40, t, 0.5, 0.4, 'exp');
        noise(sfxBus, 0.5, 0.5, 900);
        voice(sfxBus, 'square', rnd(90, 130), 30, t, 0.45, 0.22, 'exp');
      },
      score() { // passing a checkpoint / distance milestone
        const t = ctx.currentTime, r = melodyState.root;
        [0, 4, 7].forEach((semi, i) => {
          const f = r * 4 * Math.pow(2, semi / 12);
          voice(sfxBus, 'triangle', f, f, t + i * 0.06, 0.18, 0.2, 'lin');
        });
      },
      extra() { // extra buggy earned — a happy little arpeggio up
        const t = ctx.currentTime, r = melodyState.root * 2;
        [0, 5, 7, 12].forEach((semi, i) => {
          const f = r * Math.pow(2, semi / 12);
          voice(sfxBus, 'square', f, f, t + i * 0.07, 0.2, 0.22, 'lin');
        });
      }
    };

    function play(name) {
      if (!sfxOn || !ctx) return;
      const fn = SFX[name];
      if (fn) fn();
    }

    // --- the music loop. 16-step pattern; each step schedules a bass note and,
    //     on some steps, an arpeggio blip drawn from the theme's scale. Randomly
    //     varies octave/velocity so it wanders instead of looping mechanically. ---
    function scheduleStep(time) {
      const m = melodyState;
      const beat = 60 / m.tempo / 2; // eighth notes
      const sc = m.scale;
      // bass on the downbeats
      if (step % 4 === 0) {
        const deg = sc[(step / 4 | 0) % sc.length];
        const f = m.root * Math.pow(2, deg / 12);
        voice(musicBus, m.bassWave, f, f, time, beat * 3.2, 0.5, 'lin');
      }
      // arpeggio — most steps, skipping a few for groove
      if (step % 2 === 0 || Math.random() < 0.5) {
        const deg = sc[Math.floor(Math.random() * sc.length)];
        const oct = 2 + (Math.random() < 0.35 ? 1 : 0);
        const f = m.root * Math.pow(2, oct + deg / 12);
        const v = 0.16 + Math.random() * 0.12;
        voice(musicBus, m.wave, f, f, time, beat * 0.9, v, 'lin');
      }
      step = (step + 1) % 16;
    }
    function tick() {
      if (!ctx) return;
      const beat = 60 / melodyState.tempo / 2;
      while (nextNoteTime < ctx.currentTime + 0.15) {
        scheduleStep(nextNoteTime);
        nextNoteTime += beat;
      }
      musicTimer = setTimeout(tick, 40);
    }
    function startMusic() {
      ensure();
      if (musicTimer) return;
      step = 0; nextNoteTime = ctx.currentTime + 0.05;
      tick();
    }
    function stopMusic() { if (musicTimer) { clearTimeout(musicTimer); musicTimer = null; } }

    return {
      init: ensure,
      resume,
      play,
      startMusic,
      stopMusic,
      setTheme(mus) { melodyState = Object.assign({}, mus); },
      setMusic(on) {
        musicOn = on;
        if (musicBus) musicBus.gain.setTargetAtTime(on ? 0.32 : 0, ctx.currentTime, 0.05);
      },
      setSfx(on) {
        sfxOn = on;
        if (sfxBus) sfxBus.gain.setTargetAtTime(on ? 0.9 : 0, ctx.currentTime, 0.02);
      },
      get musicOn() { return musicOn; },
      get sfxOn() { return sfxOn; }
    };
  })();

  // ---------------------------------------------------------------------------
  // Game.
  // ---------------------------------------------------------------------------
  const canvas = document.getElementById('game');
  const ctx2d = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const GROUND_Y = H * 0.72;

  const el = (id) => document.getElementById(id);
  const els = {
    score: el('score'), dist: el('dist'), lives: el('lives'), best: el('best'),
    finalScore: el('finalScore'), finalDist: el('finalDist'),
    start: el('startOverlay'), pause: el('pauseOverlay'), over: el('overOverlay'),
    startBtn: el('startBtn'), againBtn: el('againBtn'),
    theme: el('theme'), music: el('musicToggle'), sfx: el('sfxToggle'),
    tJump: el('tJump'), tShoot: el('tShoot')
  };

  let theme = THEMES['lunar-noir'];

  function applyTheme(key) {
    theme = THEMES[key];
    const c = theme.c, r = document.documentElement.style;
    r.setProperty('--sky-top', c.skyTop); r.setProperty('--sky-bot', c.skyBot);
    r.setProperty('--ground', c.ground); r.setProperty('--ground-line', c.groundLine);
    r.setProperty('--star', c.star); r.setProperty('--buggy', c.buggy);
    r.setProperty('--buggy-2', c.buggy2); r.setProperty('--wheel', c.wheel);
    r.setProperty('--bullet', c.bullet); r.setProperty('--rock', c.rock);
    r.setProperty('--mine', c.mine); r.setProperty('--crater', c.crater);
    r.setProperty('--hud', c.hud); r.setProperty('--accent', c.accent);
    r.setProperty('--panel', c.panel); r.setProperty('--glow', c.glow + 'px');
    Audio.setTheme(theme.music);
    try { localStorage.setItem('moonbuggy.theme', key); } catch (e) {}
  }

  // world state
  const state = {
    running: false, paused: false, over: false,
    t: 0,               // frame counter
    scrollX: 0,         // world scroll in px
    speed: 3.2,         // px/frame, ramps up
    score: 0, dist: 0, lives: 3,
    best: 0,
    starLayer: [],      // parallax stars
    hills: [],          // background hills (parallax)
    craters: [],        // {x (world), w}
    obstacles: [],      // {x, y, type:'rock'|'mine', r, alive, vy}
    bullets: [],        // {x, y}
    particles: [],      // {x,y,vx,vy,life,color}
    spawnTimer: 0,
    craterTimer: 0,
    milestone: 500,     // next distance milestone (score/beep)
    nextExtra: 3000,    // next extra-buggy score
    buggy: {
      x: W * 0.22, y: GROUND_Y, vy: 0, onGround: true,
      wheelSpin: 0, hitFlash: 0
    }
  };

  const keys = { left: false, right: false };
  const GRAV = 0.62, JUMP_V = -12.4, SHOOT_COOLDOWN = 14;
  let shootCd = 0;

  function loadBest() {
    try { state.best = parseInt(localStorage.getItem('moonbuggy.best') || '0', 10) || 0; } catch (e) {}
    els.best.textContent = state.best;
  }
  function saveBest() {
    if (state.score > state.best) {
      state.best = state.score;
      try { localStorage.setItem('moonbuggy.best', String(state.best)); } catch (e) {}
    }
  }

  function initWorld() {
    state.starLayer = [];
    for (let i = 0; i < 70; i++) {
      state.starLayer.push({
        x: Math.random() * W, y: Math.random() * GROUND_Y * 0.9,
        r: Math.random() * 1.6 + 0.4, tw: Math.random() * Math.PI * 2,
        depth: 0.2 + Math.random() * 0.5
      });
    }
    state.hills = [];
    for (let i = 0; i < 8; i++) {
      state.hills.push({ x: i * 180, h: 40 + Math.random() * 70, w: 120 + Math.random() * 120 });
    }
    state.craters = [];
    state.obstacles = [];
    state.bullets = [];
    state.particles = [];
  }

  function reset() {
    state.running = true; state.paused = false; state.over = false;
    state.t = 0; state.scrollX = 0; state.speed = 3.2;
    state.score = 0; state.dist = 0; state.lives = 3;
    state.spawnTimer = 60; state.craterTimer = 220;
    state.milestone = 500; state.nextExtra = 3000;
    state.buggy.x = W * 0.22; state.buggy.y = GROUND_Y;
    state.buggy.vy = 0; state.buggy.onGround = true; state.buggy.hitFlash = 0;
    initWorld();
    updateHud();
  }

  function updateHud() {
    els.score.textContent = state.score;
    els.dist.textContent = Math.floor(state.dist);
    els.lives.textContent = state.lives > 0 ? '◈'.repeat(state.lives) : '—';
    els.best.textContent = Math.max(state.best, state.score);
  }

  // world x -> screen x
  const sx = (worldX) => worldX - state.scrollX;

  function spawnObstacle() {
    const type = Math.random() < 0.5 ? 'rock' : 'mine';
    const worldX = state.scrollX + W + 40;
    if (type === 'rock') {
      state.obstacles.push({ x: worldX, y: GROUND_Y, type, r: 14 + Math.random() * 10, alive: true, vy: 0 });
    } else {
      // mine drops from above, then sits
      state.obstacles.push({ x: worldX, y: 40 + Math.random() * 60, type, r: 11, alive: true, vy: 1.1 + Math.random() });
    }
  }

  function spawnCrater() {
    const worldX = state.scrollX + W + 30;
    const w = 60 + Math.random() * 70;
    state.craters.push({ x: worldX, w });
  }

  function burst(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 4;
      state.particles.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1,
        life: 20 + Math.random() * 20, color
      });
    }
  }

  function craterUnder(worldX) {
    for (const cr of state.craters) {
      if (worldX > cr.x && worldX < cr.x + cr.w) return cr;
    }
    return null;
  }

  function jump() {
    const b = state.buggy;
    if (b.onGround && state.running && !state.paused) {
      b.vy = JUMP_V; b.onGround = false;
      Audio.play('jump');
    }
  }
  function shoot() {
    if (shootCd > 0 || !state.running || state.paused) return;
    shootCd = SHOOT_COOLDOWN;
    const b = state.buggy;
    state.bullets.push({ x: b.x + 34, y: b.y - 20 });
    Audio.play('shoot');
  }

  function loseLife() {
    const b = state.buggy;
    b.hitFlash = 30;
    burst(b.x, b.y - 18, theme.c.mine, 26);
    burst(b.x, b.y - 18, theme.c.bullet, 14);
    Audio.play('crash');
    state.lives--;
    updateHud();
    if (state.lives <= 0) {
      gameOver();
    } else {
      // brief mercy: clear hazards around the buggy so you don't instantly die
      // again, drop it back onto solid ground, and give it its jump back
      const bx = state.scrollX + b.x;
      state.obstacles = state.obstacles.filter(o => Math.abs(o.x - bx) > 240);
      state.craters = state.craters.filter(cr => cr.x + cr.w < bx - 120 || cr.x > bx + 260);
      b.y = GROUND_Y; b.vy = 0; b.onGround = true;
    }
  }

  function gameOver() {
    state.running = false; state.over = true;
    saveBest();
    els.finalScore.textContent = state.score;
    els.finalDist.textContent = Math.floor(state.dist);
    els.over.classList.remove('hidden');
    updateHud();
  }

  // --- update ---
  function update() {
    const b = state.buggy;
    state.t++;

    // speed ramps slowly with distance
    state.speed = 3.2 + Math.min(3.4, state.dist / 900);
    state.scrollX += state.speed;
    state.dist += state.speed / 12;

    // distance milestone -> score + beep
    if (state.dist >= state.milestone) {
      state.score += 50;
      state.milestone += 500;
      Audio.play('score');
      updateHud();
    }
    // extra buggy
    if (state.score >= state.nextExtra) {
      state.lives = Math.min(6, state.lives + 1);
      state.nextExtra += 3000;
      Audio.play('extra');
      updateHud();
    }

    // horizontal position within a small window (throttle nudges it)
    const targetMin = W * 0.16, targetMax = W * 0.38;
    if (keys.right) b.x += 1.4;
    if (keys.left) b.x -= 1.4;
    b.x = Math.max(targetMin, Math.min(targetMax, b.x));

    // vertical physics. A crater is solid ground only when it's absent under
    // BOTH the front and back of the buggy — otherwise the buggy drops in.
    b.vy += GRAV;
    b.y += b.vy;
    const worldFront = state.scrollX + b.x + 16;
    const worldBack = state.scrollX + b.x - 16;
    const overGap = craterUnder(worldFront) || craterUnder(worldBack);
    if (b.y >= GROUND_Y) {
      if (overGap) {
        // descended to surface level over a crater — fall in and wreck
        b.y = GROUND_Y;
        loseLife();
      } else {
        if (!b.onGround && b.vy > 2) Audio.play('land');
        b.y = GROUND_Y; b.vy = 0; b.onGround = true;
      }
    } else {
      b.onGround = false;
    }
    b.wheelSpin += state.speed * 0.16;
    if (b.hitFlash > 0) b.hitFlash--;

    // spawn hazards
    if (shootCd > 0) shootCd--;
    state.spawnTimer -= 1;
    if (state.spawnTimer <= 0) {
      spawnObstacle();
      state.spawnTimer = Math.max(42, 96 - state.dist / 30);
    }
    state.craterTimer -= 1;
    if (state.craterTimer <= 0) {
      spawnCrater();
      state.craterTimer = 200 + Math.random() * 200;
    }

    // obstacles: move mines down, cull off-screen, collide with buggy
    for (const o of state.obstacles) {
      if (o.type === 'mine' && o.y < GROUND_Y - 6) {
        o.y += o.vy;
        if (o.y > GROUND_Y - 6) o.y = GROUND_Y - 6;
      }
    }
    state.obstacles = state.obstacles.filter(o => o.x - state.scrollX > -60);
    state.craters = state.craters.filter(cr => cr.x + cr.w - state.scrollX > -60);

    // bullets travel in screen space (they visually fly right regardless of
    // scroll); cull once they leave the right edge
    for (const bl of state.bullets) bl.x += 9;
    state.bullets = state.bullets.filter(bl => bl.x < W + 20);

    collideBulletsObstacles();
    collideBuggyObstacles();

    // particles
    for (const p of state.particles) {
      p.x += p.vx; p.y += p.vy; p.vy += 0.18; p.life--;
    }
    state.particles = state.particles.filter(p => p.life > 0);
  }

  // Bullets live in screen space; obstacles live in world space. Collisions
  // convert each obstacle's world x -> screen x (via sx) and test against the
  // bullet's screen position. Particles also live in screen space.
  function collideBulletsObstacles() {
    for (const bl of state.bullets) {
      for (const o of state.obstacles) {
        if (!o.alive) continue;
        const oScreen = sx(o.x);
        const oy = o.type === 'rock' ? (o.y - o.r) : o.y;
        const dx = bl.x - oScreen, dy = bl.y - oy;
        if (dx * dx + dy * dy < (o.r + 6) * (o.r + 6)) {
          o.alive = false;
          bl.dead = true;
          state.score += o.type === 'mine' ? 30 : 20;
          burstScreen(oScreen, oy, o.type === 'mine' ? theme.c.mine : theme.c.rock, 16);
          burstScreen(oScreen, oy, theme.c.bullet, 10);
          Audio.play('hit');
          updateHud();
        }
      }
    }
    state.obstacles = state.obstacles.filter(o => o.alive);
    state.bullets = state.bullets.filter(bl => !bl.dead);
  }

  // particles live in screen space, so provide a screen-space burst
  function burstScreen(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 4;
      state.particles.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1,
        life: 18 + Math.random() * 18, color
      });
    }
  }

  function collideBuggyObstacles() {
    const b = state.buggy;
    if (b.hitFlash > 12) return; // brief invulnerability window after a hit
    const bScreenX = b.x;
    const bTop = b.y - 34, bBot = b.y - 4;
    for (const o of state.obstacles) {
      if (!o.alive) continue;
      const oScreen = sx(o.x);
      const oy = o.type === 'rock' ? (o.y - o.r) : o.y;
      // rough AABB/circle
      const dx = Math.abs(oScreen - bScreenX);
      const dyTop = oy - bBot, dyBot = bTop - oy;
      if (dx < o.r + 20 && oy > bTop - o.r && oy < bBot + o.r) {
        o.alive = false;
        loseLife();
        break;
      }
    }
    state.obstacles = state.obstacles.filter(o => o.alive);
  }

  // --- render ---
  function draw() {
    const c = theme.c;
    // sky gradient
    const g = ctx2d.createLinearGradient(0, 0, 0, GROUND_Y);
    g.addColorStop(0, c.skyTop); g.addColorStop(1, c.skyBot);
    ctx2d.fillStyle = g;
    ctx2d.fillRect(0, 0, W, GROUND_Y);

    // stars (parallax + twinkle)
    for (const s of state.starLayer) {
      const tw = 0.5 + 0.5 * Math.sin(state.t * 0.05 + s.tw);
      ctx2d.globalAlpha = 0.4 + 0.6 * tw;
      ctx2d.fillStyle = c.star;
      let x = (s.x - state.scrollX * s.depth * 0.15) % W;
      if (x < 0) x += W;
      ctx2d.beginPath(); ctx2d.arc(x, s.y, s.r, 0, Math.PI * 2); ctx2d.fill();
    }
    ctx2d.globalAlpha = 1;

    // distant hills (parallax)
    ctx2d.fillStyle = c.ground;
    ctx2d.globalAlpha = 0.5;
    for (const h of state.hills) {
      let x = (h.x - state.scrollX * 0.3) % (W + 260);
      if (x < -130) x += W + 260;
      ctx2d.beginPath();
      ctx2d.moveTo(x - h.w / 2, GROUND_Y);
      ctx2d.quadraticCurveTo(x, GROUND_Y - h.h, x + h.w / 2, GROUND_Y);
      ctx2d.fill();
    }
    ctx2d.globalAlpha = 1;

    // ground band
    ctx2d.fillStyle = c.ground;
    ctx2d.fillRect(0, GROUND_Y, W, H - GROUND_Y);

    // craters — cut dark notches into the ground band + surface line breaks
    for (const cr of state.craters) {
      const x = sx(cr.x);
      if (x + cr.w < 0 || x > W) continue;
      ctx2d.fillStyle = c.crater;
      ctx2d.beginPath();
      ctx2d.moveTo(x, GROUND_Y);
      ctx2d.lineTo(x + cr.w * 0.15, H);
      ctx2d.lineTo(x + cr.w * 0.85, H);
      ctx2d.lineTo(x + cr.w, GROUND_Y);
      ctx2d.closePath();
      ctx2d.fill();
    }

    // surface line (skipping craters), scrolling dashes for motion
    ctx2d.strokeStyle = c.groundLine;
    ctx2d.lineWidth = 3;
    if (c.glow) { ctx2d.shadowColor = c.groundLine; ctx2d.shadowBlur = c.glow * 0.7; }
    ctx2d.beginPath();
    let drawing = false;
    for (let x = 0; x <= W; x += 8) {
      const worldX = x + state.scrollX;
      const inCrater = craterUnder(worldX);
      if (inCrater) { drawing = false; continue; }
      if (!drawing) { ctx2d.moveTo(x, GROUND_Y); drawing = true; }
      else ctx2d.lineTo(x, GROUND_Y);
    }
    ctx2d.stroke();
    // little surface pebbles moving by
    ctx2d.fillStyle = c.groundLine;
    ctx2d.globalAlpha = 0.5;
    for (let i = 0; i < 24; i++) {
      const px = (i * 90 - state.scrollX * 1.0) % (W + 60);
      const x = px < 0 ? px + W + 60 : px;
      if (craterUnder(x + state.scrollX)) continue;
      ctx2d.fillRect(x, GROUND_Y + 14 + (i % 3) * 10, 4, 2);
    }
    ctx2d.globalAlpha = 1;
    ctx2d.shadowBlur = 0;

    // obstacles
    for (const o of state.obstacles) {
      const x = sx(o.x);
      if (x < -40 || x > W + 40) continue;
      if (c.glow) { ctx2d.shadowColor = o.type === 'mine' ? c.mine : c.rock; ctx2d.shadowBlur = c.glow; }
      if (o.type === 'rock') {
        ctx2d.fillStyle = c.rock;
        ctx2d.beginPath();
        ctx2d.moveTo(x - o.r, GROUND_Y);
        ctx2d.lineTo(x - o.r * 0.5, GROUND_Y - o.r);
        ctx2d.lineTo(x + o.r * 0.3, GROUND_Y - o.r * 0.8);
        ctx2d.lineTo(x + o.r, GROUND_Y);
        ctx2d.closePath();
        ctx2d.fill();
      } else {
        // mine: spiky ball
        ctx2d.fillStyle = c.mine;
        ctx2d.beginPath();
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2;
          const rr = k % 2 === 0 ? o.r : o.r * 0.6;
          const mx = x + Math.cos(a) * rr, my = o.y + Math.sin(a) * rr;
          if (k === 0) ctx2d.moveTo(mx, my); else ctx2d.lineTo(mx, my);
        }
        ctx2d.closePath(); ctx2d.fill();
        ctx2d.fillStyle = c.bullet;
        ctx2d.beginPath(); ctx2d.arc(x, o.y, o.r * 0.28, 0, Math.PI * 2); ctx2d.fill();
      }
      ctx2d.shadowBlur = 0;
    }

    // bullets
    ctx2d.fillStyle = c.bullet;
    if (c.glow) { ctx2d.shadowColor = c.bullet; ctx2d.shadowBlur = c.glow; }
    for (const bl of state.bullets) {
      ctx2d.fillRect(bl.x, bl.y - 2, 9, 4);
    }
    ctx2d.shadowBlur = 0;

    // buggy
    drawBuggy();

    // particles
    for (const p of state.particles) {
      ctx2d.globalAlpha = Math.max(0, p.life / 30);
      ctx2d.fillStyle = p.color;
      ctx2d.fillRect(p.x, p.y, 3, 3);
    }
    ctx2d.globalAlpha = 1;
  }

  function drawBuggy() {
    const b = state.buggy, c = theme.c;
    const x = b.x, y = b.y;
    const flash = b.hitFlash > 0 && (state.t % 6 < 3);
    ctx2d.save();
    ctx2d.translate(x, y);
    if (c.glow) { ctx2d.shadowColor = c.buggy; ctx2d.shadowBlur = c.glow; }

    // body
    ctx2d.fillStyle = flash ? c.mine : c.buggy;
    // chassis
    ctx2d.beginPath();
    ctx2d.moveTo(-26, -8);
    ctx2d.lineTo(-30, -18);
    ctx2d.lineTo(-6, -22);
    ctx2d.lineTo(2, -34);   // cockpit peak
    ctx2d.lineTo(16, -34);
    ctx2d.lineTo(22, -20);
    ctx2d.lineTo(30, -18);
    ctx2d.lineTo(30, -8);
    ctx2d.closePath();
    ctx2d.fill();
    // cockpit window
    ctx2d.fillStyle = c.buggy2;
    ctx2d.beginPath();
    ctx2d.moveTo(4, -30); ctx2d.lineTo(15, -30); ctx2d.lineTo(18, -22); ctx2d.lineTo(2, -22);
    ctx2d.closePath(); ctx2d.fill();
    // little antenna
    ctx2d.strokeStyle = c.buggy2; ctx2d.lineWidth = 2;
    ctx2d.beginPath(); ctx2d.moveTo(-24, -18); ctx2d.lineTo(-30, -30); ctx2d.stroke();
    ctx2d.fillStyle = c.bullet;
    ctx2d.beginPath(); ctx2d.arc(-30, -31, 2.5, 0, Math.PI * 2); ctx2d.fill();

    // wheels (3, spinning)
    ctx2d.fillStyle = c.wheel;
    const wheels = [-20, 2, 24];
    for (const wx of wheels) {
      ctx2d.save();
      ctx2d.translate(wx, -6);
      ctx2d.beginPath(); ctx2d.arc(0, 0, 8, 0, Math.PI * 2); ctx2d.fill();
      ctx2d.strokeStyle = c.buggy; ctx2d.lineWidth = 2;
      ctx2d.rotate(b.wheelSpin);
      ctx2d.beginPath();
      ctx2d.moveTo(-6, 0); ctx2d.lineTo(6, 0);
      ctx2d.moveTo(0, -6); ctx2d.lineTo(0, 6);
      ctx2d.stroke();
      ctx2d.restore();
    }
    // thruster puff when jumping
    if (!b.onGround) {
      ctx2d.fillStyle = c.bullet;
      ctx2d.globalAlpha = 0.6 + 0.3 * Math.sin(state.t);
      ctx2d.beginPath();
      ctx2d.moveTo(-30, -4); ctx2d.lineTo(-42, -8 + Math.random() * 6); ctx2d.lineTo(-30, -12);
      ctx2d.closePath(); ctx2d.fill();
      ctx2d.globalAlpha = 1;
    }
    ctx2d.restore();
    ctx2d.shadowBlur = 0;
  }

  // --- main loop ---
  function frame() {
    if (state.running && !state.paused) {
      update();
      updateHud();
    }
    draw();
    requestAnimationFrame(frame);
  }

  // --- controls ---
  function startGame() {
    Audio.init(); Audio.resume();
    if (Audio.musicOn) Audio.startMusic();
    els.start.classList.add('hidden');
    els.over.classList.add('hidden');
    reset();
  }
  function restart() { startGame(); }
  function togglePause() {
    if (!state.running) return;
    state.paused = !state.paused;
    els.pause.classList.toggle('hidden', !state.paused);
    if (state.paused) Audio.stopMusic();
    else if (Audio.musicOn) Audio.startMusic();
  }

  document.addEventListener('keydown', (e) => {
    switch (e.code) {
      case 'ArrowLeft': keys.left = true; break;
      case 'ArrowRight': keys.right = true; break;
      case 'Space': case 'ArrowUp': case 'KeyW':
        e.preventDefault();
        if (!state.running && !state.over) startGame(); else jump();
        break;
      case 'KeyZ': case 'ArrowDown': case 'KeyX': shoot(); break;
      case 'KeyP': togglePause(); break;
      case 'KeyM': setMusic(!Audio.musicOn); break;
      case 'Enter':
        if (state.over) restart();
        else if (!state.running) startGame();
        break;
    }
  });
  document.addEventListener('keyup', (e) => {
    if (e.code === 'ArrowLeft') keys.left = false;
    if (e.code === 'ArrowRight') keys.right = false;
  });

  els.startBtn.addEventListener('click', startGame);
  els.againBtn.addEventListener('click', restart);

  // touch buttons
  function bindTouch(node, fn) {
    node.addEventListener('touchstart', (e) => { e.preventDefault(); if (!state.running && !state.over) startGame(); fn(); }, { passive: false });
    node.addEventListener('mousedown', (e) => { e.preventDefault(); fn(); });
  }
  bindTouch(els.tJump, jump);
  bindTouch(els.tShoot, shoot);
  // tapping the canvas jumps (and starts)
  canvas.addEventListener('pointerdown', () => {
    if (!state.running && !state.over) startGame(); else jump();
  });

  // toggles
  function setMusic(on) {
    Audio.setMusic(on);
    els.music.setAttribute('aria-pressed', String(on));
    if (on && state.running && !state.paused) Audio.startMusic();
    if (!on) Audio.stopMusic();
  }
  function setSfx(on) {
    Audio.setSfx(on);
    els.sfx.setAttribute('aria-pressed', String(on));
  }
  els.music.addEventListener('click', () => setMusic(els.music.getAttribute('aria-pressed') !== 'true'));
  els.sfx.addEventListener('click', () => setSfx(els.sfx.getAttribute('aria-pressed') !== 'true'));

  // theme selector
  THEME_ORDER.forEach((key) => {
    const opt = document.createElement('option');
    opt.value = key; opt.textContent = THEMES[key].label;
    els.theme.appendChild(opt);
  });
  els.theme.addEventListener('change', () => applyTheme(els.theme.value));

  // boot
  let saved = 'lunar-noir';
  try { const s = localStorage.getItem('moonbuggy.theme'); if (s && THEMES[s]) saved = s; } catch (e) {}
  els.theme.value = saved;
  applyTheme(saved);
  loadBest();
  reset();
  state.running = false; // wait for start
  els.start.classList.remove('hidden');
  requestAnimationFrame(frame);
})();
