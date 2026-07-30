/* sisyphus — a side-scrolling myth simulator.
 *
 * You push a boulder up an endless mountain. Hold the push key to build
 * momentum, jump the chasms and scree, duck the crows. The mountain always
 * drags the boulder back a little when you're not pushing it — that's the
 * curse, not a bug. Getting hit doesn't cost a life: it rolls the boulder
 * back down the slope and undoes a chunk of your climb. Reach the summit and
 * the gods just laugh — it rolls away down the far side and you start again,
 * a little steeper than before. Forever.
 *
 * No build step, no audio files: every sound is synthesized live with the
 * Web Audio API (structure borrowed from sites/moonbuggy's audio engine).
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Themes. Each theme is a palette + a `music` block (root freq, scale,
  // tempo, waveform) that steers the ambient drone. Categories:
  //   normal — readable, mythic-daylight
  //   moody  — dusk / underworld / night
  //   neon   — deliberately eye-destroying (Eris' contribution)
  // ---------------------------------------------------------------------------
  const THEMES = {
    'marble-agora': {
      label: 'Marble Agora (normal)',
      c: {
        skyTop: '#bfe3ff', skyBot: '#f4ecd2', far: '#9fb3c9', mid: '#7f97ad',
        slope: '#d8c7a2', slopeLine: '#8a6f4d', boulder: '#6d6862', boulder2: '#a39a8e',
        figure: '#2c2a28', figure2: '#b8452e', chasm: '#231c15', scree: '#a4906b',
        crow: '#241f1a', hud: '#2c2a28', accent: '#b8452e',
        panel: 'rgba(250,244,228,0.88)', glow: 0
      },
      music: { root: 98, scale: [0, 2, 3, 7, 8], tempo: 78, wave: 'sine', bassWave: 'triangle' }
    },
    'aegean-dusk': {
      label: 'Aegean Dusk (normal)',
      c: {
        skyTop: '#2c3a66', skyBot: '#e08a5b', far: '#5c4a6e', mid: '#7a5a6a',
        slope: '#8a5a4a', slopeLine: '#3d2620', boulder: '#4a4340', boulder2: '#7a6f66',
        figure: '#1c1614', figure2: '#ffcf6b', chasm: '#150d0a', scree: '#6b4c3e',
        crow: '#150d0a', hud: '#ffe6c9', accent: '#ffcf6b',
        panel: 'rgba(35,22,30,0.82)', glow: 0
      },
      music: { root: 87.3, scale: [0, 1, 4, 6, 8], tempo: 72, wave: 'triangle', bassWave: 'sawtooth' }
    },
    'tartarus': {
      label: 'Tartarus (underworld)',
      c: {
        skyTop: '#1a0505', skyBot: '#3a0d0d', far: '#3a1414', mid: '#552020',
        slope: '#241010', slopeLine: '#7a2c1c', boulder: '#2a2422', boulder2: '#5a2c22',
        figure: '#0c0908', figure2: '#ff6a3d', chasm: '#000000', scree: '#4a2418',
        crow: '#0a0605', hud: '#ffb38a', accent: '#ff6a3d',
        panel: 'rgba(15,4,4,0.85)', glow: 10
      },
      music: { root: 55, scale: [0, 1, 4, 6, 7, 10], tempo: 64, wave: 'sawtooth', bassWave: 'square' }
    },
    'golden-age': {
      label: 'Golden Age (pastel)',
      c: {
        skyTop: '#ffe9c2', skyBot: '#fff6e0', far: '#e3c99a', mid: '#d9b97f',
        slope: '#f0dcb0', slopeLine: '#c9a464', boulder: '#c7ab7d', boulder2: '#e6d3a8',
        figure: '#5a4630', figure2: '#c9784a', chasm: '#a3854f', scree: '#e0c68e',
        crow: '#7a6448', hud: '#5a4630', accent: '#c9784a',
        panel: 'rgba(255,248,232,0.88)', glow: 0
      },
      music: { root: 110, scale: [0, 2, 4, 7, 9], tempo: 84, wave: 'sine', bassWave: 'sine' }
    },
    'midnight-olympus': {
      label: 'Midnight Olympus (night)',
      c: {
        skyTop: '#070a1c', skyBot: '#1b2350', far: '#2a3468', mid: '#3d477e',
        slope: '#dfe4f2', slopeLine: '#8b95c2', boulder: '#5a5f7a', boulder2: '#8a90b0',
        figure: '#0a0c16', figure2: '#8fd4ff', chasm: '#040510', scree: '#aab0d0',
        crow: '#050612', hud: '#c6cdf0', accent: '#8fd4ff',
        panel: 'rgba(8,10,26,0.85)', glow: 8
      },
      music: { root: 73.4, scale: [0, 2, 3, 5, 7, 10], tempo: 66, wave: 'triangle', bassWave: 'sine' }
    },
    'eris-discord': {
      label: '⚠ Eris’ Discord (neon)',
      c: {
        skyTop: '#ff00e6', skyBot: '#00ffe1', far: '#00ff2a', mid: '#ff003c',
        slope: '#ffff00', slopeLine: '#ff003c', boulder: '#00ffe1', boulder2: '#ff00e6',
        figure: '#14001a', figure2: '#ffff00', chasm: '#1a0022', scree: '#ff00e6',
        crow: '#14001a', hud: '#00ff2a', accent: '#ff00e6',
        panel: 'rgba(20,0,20,0.72)', glow: 24
      },
      music: { root: 82.4, scale: [0, 1, 4, 6, 7, 10], tempo: 150, wave: 'sawtooth', bassWave: 'square' }
    }
  };
  const THEME_ORDER = ['marble-agora', 'aegean-dusk', 'tartarus', 'golden-age', 'midnight-olympus', 'eris-discord'];

  // ---------------------------------------------------------------------------
  // Audio engine. One AudioContext, a master gain, two sub-buses (music/sfx).
  // ---------------------------------------------------------------------------
  const Audio = (function () {
    let ctx = null, master = null, musicBus = null, sfxBus = null;
    let musicOn = true, sfxOn = true;
    let musicTimer = null, nextNoteTime = 0, step = 0;
    let melodyState = { root: 98, scale: [0, 2, 3, 7, 8], tempo: 78, wave: 'sine', bassWave: 'triangle' };

    function ensure() {
      if (ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
      musicBus = ctx.createGain(); musicBus.gain.value = musicOn ? 0.28 : 0; musicBus.connect(master);
      sfxBus = ctx.createGain(); sfxBus.gain.value = sfxOn ? 0.9 : 0; sfxBus.connect(master);
    }
    function resume() { if (ctx && ctx.state === 'suspended') ctx.resume(); }

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

    const SFX = {
      push() { // effort grunt while pushing the boulder
        const t = ctx.currentTime, base = rnd(80, 110);
        voice(sfxBus, 'sawtooth', base, base * 0.7, t, 0.1, 0.14, 'exp');
        noise(sfxBus, 0.05, 0.08, 700);
      },
      jump() {
        const t = ctx.currentTime, base = rnd(260, 320);
        voice(sfxBus, 'square', base, base * rnd(1.8, 2.4), t, 0.14, 0.22, 'exp');
      },
      land() {
        const t = ctx.currentTime;
        voice(sfxBus, 'sine', rnd(140, 170), rnd(60, 80), t, 0.12, 0.24, 'exp');
        noise(sfxBus, 0.06, 0.1, 1000);
      },
      duck() {
        const t = ctx.currentTime;
        voice(sfxBus, 'sine', rnd(180, 210), rnd(120, 140), t, 0.08, 0.1, 'exp');
      },
      caw() {
        const t = ctx.currentTime, base = rnd(900, 1200);
        voice(sfxBus, 'sawtooth', base, base * 0.5, t, 0.14, 0.18, 'exp');
        voice(sfxBus, 'square', base * 1.6, base * 0.8, t + 0.05, 0.12, 0.12, 'exp');
      },
      hitChasm() {
        const t = ctx.currentTime;
        voice(sfxBus, 'sawtooth', rnd(140, 180), 30, t, 0.6, 0.32, 'exp');
        noise(sfxBus, 0.5, 0.4, 500);
      },
      hitScree() {
        const t = ctx.currentTime;
        voice(sfxBus, 'square', rnd(180, 220), 50, t, 0.3, 0.24, 'exp');
        noise(sfxBus, 0.35, 0.3, 1400);
      },
      hitCrow() {
        const t = ctx.currentTime;
        voice(sfxBus, 'triangle', rnd(500, 620), rnd(200, 260), t, 0.2, 0.2, 'exp');
        noise(sfxBus, 0.16, 0.16, 2200);
      },
      rumble() {
        const t = ctx.currentTime;
        voice(sfxBus, 'sawtooth', rnd(60, 80), rnd(30, 40), t, 0.4, 0.2, 'exp');
        noise(sfxBus, 0.35, 0.22, 400);
      },
      summit() { // triumphant — then it will roll away
        const t = ctx.currentTime, r = melodyState.root;
        [0, 4, 7, 12].forEach((semi, i) => {
          const f = r * 2 * Math.pow(2, semi / 12);
          voice(sfxBus, 'triangle', f, f, t + i * 0.09, 0.24, 0.22, 'lin');
        });
      },
      rollaway() { // the mocking descent
        const t = ctx.currentTime, r = melodyState.root;
        [12, 7, 3, 0, -5].forEach((semi, i) => {
          const f = r * Math.pow(2, semi / 12);
          voice(sfxBus, 'sawtooth', f, f * 0.9, t + i * 0.13, 0.3, 0.18, 'lin');
        });
      }
    };

    function play(name) {
      if (!sfxOn || !ctx) return;
      const fn = SFX[name];
      if (fn) fn();
    }

    // ambient drone loop: sparse bass + occasional high note, slow tempo, minor/phrygian-leaning
    function scheduleStep(time) {
      const m = melodyState;
      const beat = 60 / m.tempo / 2;
      const sc = m.scale;
      if (step % 8 === 0) {
        const deg = sc[0];
        const f = m.root * Math.pow(2, deg / 12);
        voice(musicBus, m.bassWave, f, f, time, beat * 7, 0.4, 'lin');
      }
      if (step % 3 === 0 && Math.random() < 0.7) {
        const deg = sc[Math.floor(Math.random() * sc.length)];
        const oct = 2 + (Math.random() < 0.3 ? 1 : 0);
        const f = m.root * Math.pow(2, oct + deg / 12);
        const v = 0.1 + Math.random() * 0.08;
        voice(musicBus, m.wave, f, f, time, beat * 1.6, v, 'lin');
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
        if (musicBus) musicBus.gain.setTargetAtTime(on ? 0.28 : 0, ctx.currentTime, 0.05);
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
  const GROUND_Y = H * 0.74;
  const HERO_X = W * 0.28;
  const SUMMIT = 2400; // meters to the top of one climb

  const el = (id) => document.getElementById(id);
  const els = {
    dist: el('dist'), loops: el('loops'), best: el('best'), rollNote: el('rollNote'),
    progressFill: el('progressFill'),
    start: el('startOverlay'), pause: el('pauseOverlay'),
    startBtn: el('startBtn'),
    theme: el('theme'), music: el('musicToggle'), sfx: el('sfxToggle'),
    share: el('shareBtn'),
    tJump: el('tJump'), tPush: el('tPush'), tDuck: el('tDuck')
  };

  let theme = THEMES['marble-agora'];

  function applyTheme(key) {
    theme = THEMES[key];
    const c = theme.c, r = document.documentElement.style;
    r.setProperty('--sky-top', c.skyTop); r.setProperty('--sky-bot', c.skyBot);
    r.setProperty('--far', c.far); r.setProperty('--mid', c.mid);
    r.setProperty('--slope', c.slope); r.setProperty('--slope-line', c.slopeLine);
    r.setProperty('--boulder', c.boulder); r.setProperty('--boulder-2', c.boulder2);
    r.setProperty('--figure', c.figure); r.setProperty('--figure-2', c.figure2);
    r.setProperty('--chasm', c.chasm); r.setProperty('--scree', c.scree);
    r.setProperty('--crow', c.crow); r.setProperty('--hud', c.hud);
    r.setProperty('--accent', c.accent); r.setProperty('--panel', c.panel);
    r.setProperty('--glow', c.glow + 'px');
    Audio.setTheme(theme.music);
    try { localStorage.setItem('sisyphus.theme', key); } catch (e) {}
  }

  const state = {
    running: false, paused: false,
    t: 0,
    scrollX: 0, dist: 0,
    pushPower: 0,
    loops: 0, best: 0,
    drag: 0.55,
    far: [], mid: [], scree: [], hazards: [], particles: [],
    spawnTimer: 90,
    stunned: 0, stunTarget: 0, stunFrom: 0, rollLabel: '',
    summiting: 0,
    hero: { y: 0, vy: 0, onGround: true, ducking: false, hitFlash: 0, wheelless: 0 }
  };

  const keys = { push: false, jump: false, duck: false };
  const GRAV = 0.62, JUMP_V = -11.0, PUSH_MAX = 5.0;

  function loadBest() {
    try { state.best = parseInt(localStorage.getItem('sisyphus.best') || '0', 10) || 0; } catch (e) {}
    els.best.textContent = state.best;
  }
  function saveBest() {
    try { localStorage.setItem('sisyphus.best', String(state.best)); } catch (e) {}
  }
  function loadLoops() {
    try { state.loops = parseInt(localStorage.getItem('sisyphus.loops') || '0', 10) || 0; } catch (e) {}
  }
  function saveLoops() {
    try { localStorage.setItem('sisyphus.loops', String(state.loops)); } catch (e) {}
  }

  function initWorld() {
    state.far = [];
    for (let i = 0; i < 7; i++) {
      state.far.push({ x: i * 220, h: 60 + Math.random() * 90, w: 160 + Math.random() * 140 });
    }
    state.mid = [];
    for (let i = 0; i < 9; i++) {
      state.mid.push({ x: i * 150, h: 30 + Math.random() * 60, w: 100 + Math.random() * 90 });
    }
    state.hazards = [];
    state.particles = [];
  }

  function reset() {
    state.running = true; state.paused = false;
    state.t = 0; state.scrollX = 0; state.dist = 0; state.pushPower = 0;
    state.drag = 0.55;
    state.spawnTimer = 90;
    state.stunned = 0; state.summiting = 0; state.rollLabel = '';
    state.hero.y = 0; state.hero.vy = 0; state.hero.onGround = true;
    state.hero.ducking = false; state.hero.hitFlash = 0;
    initWorld();
    updateHud();
  }

  function updateHud() {
    els.dist.textContent = Math.floor(state.dist);
    els.loops.textContent = state.loops;
    els.best.textContent = Math.max(state.best, Math.floor(state.dist));
    els.progressFill.style.width = Math.min(100, (state.dist / SUMMIT) * 100) + '%';
    els.rollNote.textContent = state.rollLabel;
  }

  const sx = (worldX) => worldX - state.scrollX;

  function spawnHazard() {
    const roll = Math.random();
    const worldX = state.scrollX + W + 60;
    if (roll < 0.36) {
      state.hazards.push({ type: 'chasm', x: worldX, w: 46 + Math.random() * 44 });
    } else if (roll < 0.7) {
      state.hazards.push({ type: 'scree', x: worldX, w: 30 + Math.random() * 14, alive: true });
    } else {
      // hovers right around a standing figure's head height (see drawHero /
      // the collision check below) so ducking under it is a real dodge, not
      // a coin-flip against a bird drawn a hundred px overhead.
      state.hazards.push({ type: 'crow', x: worldX, baseY: GROUND_Y - (52 + Math.random() * 10), bob: Math.random() * Math.PI * 2, alive: true });
    }
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

  function chasmUnder(worldX) {
    for (const h of state.hazards) {
      if (h.type === 'chasm' && worldX > h.x && worldX < h.x + h.w) return h;
    }
    return null;
  }

  function jump() {
    const h = state.hero;
    if (h.onGround && state.running && !state.paused && !state.stunned && !state.summiting) {
      h.vy = JUMP_V; h.onGround = false; h.ducking = false;
      Audio.play('jump');
    }
  }

  function beginRollback(amount, label, sfxName) {
    if (state.stunned || state.summiting) return;
    state.hero.hitFlash = 40;
    burst(HERO_X, GROUND_Y - 30, theme.c.figure2, 22);
    Audio.play(sfxName);
    setTimeout(() => Audio.play('rumble'), 120);
    state.stunned = 55;
    state.stunFrom = state.dist;
    state.stunTarget = Math.max(0, state.dist - amount);
    state.rollLabel = 'the boulder slips back...';
  }

  function hazardHit(h) {
    if (h.type === 'chasm') beginRollback(SUMMIT * 0.2, 'the chasm swallows your progress', 'hitChasm');
    else if (h.type === 'scree') beginRollback(SUMMIT * 0.1, 'scree underfoot — sliding', 'hitScree');
    else if (h.type === 'crow') beginRollback(SUMMIT * 0.06, 'pecked! grip lost', 'hitCrow');
  }

  function beginSummit() {
    state.summiting = 130;
    state.rollLabel = 'the summit! ...and the gods just laugh';
    Audio.play('summit');
    setTimeout(() => Audio.play('rollaway'), 700);
    if (state.dist > state.best) { state.best = Math.floor(state.dist); saveBest(); }
    state.loops++;
    saveLoops();
    state.drag = Math.min(1.4, state.drag + 0.035);
  }

  // --- update ---
  function update() {
    const h = state.hero;
    state.t++;

    if (state.dist > state.best) { state.best = Math.floor(state.dist); }

    if (state.summiting > 0) {
      state.summiting--;
      const p = 1 - state.summiting / 130;
      state.scrollX = Math.max(0, (1 - p) * (SUMMIT * 12));
      state.dist = state.scrollX / 12;
      if (state.summiting === 0) { state.rollLabel = ''; }
    } else if (state.stunned > 0) {
      state.stunned--;
      const p = 1 - state.stunned / 55;
      state.dist = state.stunFrom + (state.stunTarget - state.stunFrom) * p;
      state.scrollX = state.dist * 12;
      if (state.stunned === 0) { state.rollLabel = ''; }
    } else {
      // push power ramps while held, decays fast when released
      const duckPenalty = h.ducking ? 0.4 : 1;
      const airPenalty = h.onGround ? 1 : 0.8;
      if (keys.push) state.pushPower = Math.min(1, state.pushPower + 0.07);
      else state.pushPower = Math.max(0, state.pushPower - 0.14);

      if (keys.push && h.onGround && state.t % 17 === 0) Audio.play('push');

      const speed = state.pushPower * PUSH_MAX * duckPenalty * airPenalty - state.drag;
      state.scrollX = Math.max(0, state.scrollX + speed);
      state.dist = state.scrollX / 12;

      if (state.dist >= SUMMIT && state.summiting === 0) beginSummit();
    }

    // duck (only while grounded, not stunned/summiting)
    h.ducking = keys.duck && h.onGround && state.stunned === 0 && state.summiting === 0;

    // fall-through: if we're standing (not mid-jump) and a chasm is now
    // under our feet, that's a fall regardless of whether we ever left the
    // ground — jumping is what avoids this, not landing timing.
    if (h.onGround && h.hitFlash <= 20 && state.stunned === 0 && state.summiting === 0) {
      const worldFront = state.scrollX + HERO_X + 20;
      const overGap = chasmUnder(worldFront);
      if (overGap) hazardHit(overGap);
    }

    // vertical physics (jump arcs only — landing always just lands; the
    // chasm check above is what actually punishes an un-jumped gap)
    if (!h.onGround) {
      h.vy += GRAV;
      h.y += h.vy;
      if (h.y >= 0) {
        if (h.vy > 2) Audio.play('land');
        h.y = 0; h.vy = 0; h.onGround = true;
      }
    }
    if (h.hitFlash > 0) h.hitFlash--;

    // spawn hazards (rate scales up with loops)
    state.spawnTimer -= 1;
    if (state.spawnTimer <= 0 && state.stunned === 0 && state.summiting === 0) {
      spawnHazard();
      state.spawnTimer = Math.max(46, 100 - state.loops * 4 - state.dist / 60);
    }

    // hazards: cull, collide
    state.hazards = state.hazards.filter(hz => hz.x + (hz.w || 40) - state.scrollX > -80);
    if (state.stunned === 0 && state.summiting === 0 && h.hitFlash <= 20) {
      for (const hz of state.hazards) {
        if (hz.alive === false) continue;
        const hxScreen = sx(hz.x);
        if (hz.type === 'scree') {
          if (Math.abs(hxScreen - HERO_X) < hz.w * 0.5 + 16 && h.onGround) {
            hz.alive = false;
            hazardHit(hz);
          }
        } else if (hz.type === 'crow') {
          const crowY = hz.baseY + Math.sin(state.t * 0.12 + hz.bob) * 8;
          const headY = GROUND_Y + h.y - 50; // standing head height, see drawHero
          if (Math.abs(hxScreen - HERO_X) < 26 && Math.abs(crowY - headY) < 22 &&
              !h.ducking && h.onGround) {
            hz.alive = false;
            Audio.play('caw');
            hazardHit(hz);
          }
        }
      }
      state.hazards = state.hazards.filter(hz => hz.alive !== false);
    }

    for (const p of state.particles) {
      p.x += p.vx; p.y += p.vy; p.vy += 0.18; p.life--;
    }
    state.particles = state.particles.filter(p => p.life > 0);
  }

  // --- render ---
  function draw() {
    const c = theme.c;
    const g = ctx2d.createLinearGradient(0, 0, 0, GROUND_Y);
    g.addColorStop(0, c.skyTop); g.addColorStop(1, c.skyBot);
    ctx2d.fillStyle = g;
    ctx2d.fillRect(0, 0, W, GROUND_Y);

    // far mountains
    ctx2d.fillStyle = c.far;
    ctx2d.globalAlpha = 0.55;
    for (const m of state.far) {
      let x = (m.x - state.scrollX * 0.12) % (W + 260);
      if (x < -130) x += W + 260;
      ctx2d.beginPath();
      ctx2d.moveTo(x - m.w / 2, GROUND_Y);
      ctx2d.lineTo(x, GROUND_Y - m.h);
      ctx2d.lineTo(x + m.w / 2, GROUND_Y);
      ctx2d.closePath(); ctx2d.fill();
    }
    ctx2d.globalAlpha = 1;

    // mid cliffs
    ctx2d.fillStyle = c.mid;
    ctx2d.globalAlpha = 0.6;
    for (const m of state.mid) {
      let x = (m.x - state.scrollX * 0.32) % (W + 200);
      if (x < -100) x += W + 200;
      ctx2d.beginPath();
      ctx2d.moveTo(x - m.w / 2, GROUND_Y);
      ctx2d.lineTo(x, GROUND_Y - m.h);
      ctx2d.lineTo(x + m.w / 2, GROUND_Y);
      ctx2d.closePath(); ctx2d.fill();
    }
    ctx2d.globalAlpha = 1;

    // slope band
    ctx2d.fillStyle = c.slope;
    ctx2d.fillRect(0, GROUND_Y, W, H - GROUND_Y);

    // chasms cut into the slope band
    for (const hz of state.hazards) {
      if (hz.type !== 'chasm') continue;
      const x = sx(hz.x);
      if (x + hz.w < 0 || x > W) continue;
      ctx2d.fillStyle = c.chasm;
      ctx2d.beginPath();
      ctx2d.moveTo(x, GROUND_Y);
      ctx2d.lineTo(x + hz.w * 0.15, H);
      ctx2d.lineTo(x + hz.w * 0.85, H);
      ctx2d.lineTo(x + hz.w, GROUND_Y);
      ctx2d.closePath();
      ctx2d.fill();
    }

    // surface line, skipping chasms
    ctx2d.strokeStyle = c.slopeLine;
    ctx2d.lineWidth = 3;
    if (c.glow) { ctx2d.shadowColor = c.slopeLine; ctx2d.shadowBlur = c.glow * 0.7; }
    ctx2d.beginPath();
    let drawing = false;
    for (let x = 0; x <= W; x += 8) {
      const worldX = x + state.scrollX;
      if (chasmUnder(worldX)) { drawing = false; continue; }
      if (!drawing) { ctx2d.moveTo(x, GROUND_Y); drawing = true; }
      else ctx2d.lineTo(x, GROUND_Y);
    }
    ctx2d.stroke();
    ctx2d.shadowBlur = 0;

    // scree gravel texture drifting by
    ctx2d.fillStyle = c.slopeLine;
    ctx2d.globalAlpha = 0.45;
    for (let i = 0; i < 26; i++) {
      const px = (i * 84 - state.scrollX * 1.0) % (W + 60);
      const x = px < 0 ? px + W + 60 : px;
      if (chasmUnder(x + state.scrollX)) continue;
      ctx2d.fillRect(x, GROUND_Y + 12 + (i % 3) * 9, 4, 2);
    }
    ctx2d.globalAlpha = 1;

    // scree piles + crows
    for (const hz of state.hazards) {
      const x = sx(hz.x);
      if (x < -60 || x > W + 60) continue;
      if (hz.type === 'scree') {
        ctx2d.fillStyle = c.scree;
        if (c.glow) { ctx2d.shadowColor = c.scree; ctx2d.shadowBlur = c.glow; }
        ctx2d.beginPath();
        ctx2d.moveTo(x - hz.w / 2, GROUND_Y);
        ctx2d.lineTo(x - hz.w * 0.2, GROUND_Y - hz.w * 0.7);
        ctx2d.lineTo(x + hz.w * 0.15, GROUND_Y - hz.w * 0.5);
        ctx2d.lineTo(x + hz.w / 2, GROUND_Y);
        ctx2d.closePath(); ctx2d.fill();
        ctx2d.shadowBlur = 0;
      } else if (hz.type === 'crow') {
        const bob = Math.sin(state.t * 0.12 + hz.bob) * 8;
        const y = hz.baseY + bob;
        drawCrow(x, y, c);
      }
    }

    drawHero();

    for (const p of state.particles) {
      ctx2d.globalAlpha = Math.max(0, p.life / 30);
      ctx2d.fillStyle = p.color;
      ctx2d.fillRect(p.x, p.y, 3, 3);
    }
    ctx2d.globalAlpha = 1;
  }

  function drawCrow(x, y, c) {
    const flap = Math.sin(state.t * 0.4) * 6;
    ctx2d.save();
    ctx2d.translate(x, y);
    ctx2d.fillStyle = c.crow;
    if (c.glow) { ctx2d.shadowColor = c.crow; ctx2d.shadowBlur = c.glow * 0.4; }
    ctx2d.beginPath();
    ctx2d.moveTo(0, 0);
    ctx2d.lineTo(-14, -flap);
    ctx2d.lineTo(-4, 1);
    ctx2d.lineTo(4, 1);
    ctx2d.lineTo(14, -flap);
    ctx2d.closePath();
    ctx2d.fill();
    ctx2d.beginPath();
    ctx2d.arc(0, -2, 3.4, 0, Math.PI * 2);
    ctx2d.fill();
    ctx2d.restore();
    ctx2d.shadowBlur = 0;
  }

  function drawHero() {
    const h = state.hero, c = theme.c;
    const flash = h.hitFlash > 0 && (state.t % 6 < 3);
    const y = GROUND_Y + h.y;
    const duckOffset = h.ducking ? 10 : 0;

    ctx2d.save();
    ctx2d.translate(HERO_X, y);
    if (c.glow) { ctx2d.shadowColor = c.boulder; ctx2d.shadowBlur = c.glow; }

    // boulder, just ahead of the figure
    const rollSpin = state.scrollX * 0.08;
    ctx2d.save();
    ctx2d.translate(30, -22);
    ctx2d.rotate(rollSpin % (Math.PI * 2));
    ctx2d.fillStyle = flash ? c.figure2 : c.boulder;
    ctx2d.beginPath(); ctx2d.arc(0, 0, 20, 0, Math.PI * 2); ctx2d.fill();
    ctx2d.strokeStyle = c.boulder2; ctx2d.lineWidth = 2;
    ctx2d.beginPath(); ctx2d.arc(-6, -6, 5, 0, Math.PI * 2); ctx2d.stroke();
    ctx2d.beginPath(); ctx2d.arc(7, 5, 4, 0, Math.PI * 2); ctx2d.stroke();
    ctx2d.restore();

    // figure — pushing pose, crouched if ducking
    ctx2d.fillStyle = flash ? c.figure2 : c.figure;
    ctx2d.save();
    ctx2d.translate(0, duckOffset);
    // legs
    ctx2d.strokeStyle = ctx2d.fillStyle; ctx2d.lineWidth = 4;
    const stride = h.onGround ? Math.sin(state.t * 0.3) * 6 : 0;
    ctx2d.beginPath();
    ctx2d.moveTo(-4, -20 + duckOffset * -0.3); ctx2d.lineTo(-8 + stride, 0);
    ctx2d.moveTo(-4, -20 + duckOffset * -0.3); ctx2d.lineTo(0 - stride, 0);
    ctx2d.stroke();
    // torso, leaning into the push
    ctx2d.beginPath();
    ctx2d.moveTo(-4, -20 + duckOffset * -0.3);
    ctx2d.lineTo(16, -20 - (h.ducking ? 4 : 14));
    ctx2d.lineWidth = 6;
    ctx2d.stroke();
    // arms reaching to the boulder
    ctx2d.lineWidth = 3.5;
    ctx2d.beginPath();
    ctx2d.moveTo(10, -30 - (h.ducking ? 4 : 14));
    ctx2d.lineTo(24, -30);
    ctx2d.stroke();
    // head
    ctx2d.beginPath();
    ctx2d.arc(16, -30 - (h.ducking ? 8 : 20), 6, 0, Math.PI * 2);
    ctx2d.fill();
    ctx2d.restore();

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
    reset();
  }
  function togglePause() {
    if (!state.running) return;
    state.paused = !state.paused;
    els.pause.classList.toggle('hidden', !state.paused);
    if (state.paused) Audio.stopMusic();
    else if (Audio.musicOn) Audio.startMusic();
  }

  document.addEventListener('keydown', (e) => {
    switch (e.code) {
      case 'ArrowRight': case 'KeyD': case 'Space':
        e.preventDefault();
        if (!state.running) { startGame(); return; }
        keys.push = true;
        break;
      case 'ArrowUp': case 'KeyW':
        e.preventDefault();
        if (!state.running) startGame(); else jump();
        break;
      case 'ArrowDown': case 'KeyS':
        keys.duck = true;
        break;
      case 'KeyP': togglePause(); break;
      case 'KeyM': setMusic(!Audio.musicOn); break;
      case 'Enter':
        if (!state.running) startGame();
        break;
    }
  });
  document.addEventListener('keyup', (e) => {
    if (e.code === 'ArrowRight' || e.code === 'KeyD' || e.code === 'Space') keys.push = false;
    if (e.code === 'ArrowDown' || e.code === 'KeyS') keys.duck = false;
  });

  els.startBtn.addEventListener('click', startGame);

  function bindHold(node, onDown, onUp) {
    node.addEventListener('touchstart', (e) => { e.preventDefault(); if (!state.running) startGame(); onDown(); }, { passive: false });
    node.addEventListener('touchend', (e) => { e.preventDefault(); onUp(); }, { passive: false });
    node.addEventListener('mousedown', (e) => { e.preventDefault(); if (!state.running) startGame(); onDown(); });
    node.addEventListener('mouseup', (e) => { e.preventDefault(); onUp(); });
    node.addEventListener('mouseleave', () => onUp());
  }
  bindHold(els.tPush, () => { keys.push = true; }, () => { keys.push = false; });
  bindHold(els.tDuck, () => { keys.duck = true; }, () => { keys.duck = false; });
  els.tJump.addEventListener('touchstart', (e) => { e.preventDefault(); if (!state.running) startGame(); else jump(); }, { passive: false });
  els.tJump.addEventListener('mousedown', (e) => { e.preventDefault(); if (!state.running) startGame(); else jump(); });

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

  // share — bake the actual result + URL into the composed text
  els.share.addEventListener('click', (e) => {
    e.preventDefault();
    const dist = Math.floor(state.dist);
    const best = Math.max(state.best, dist);
    const loops = state.loops;
    const loopBit = loops > 0 ? ` (${loops} summit${loops === 1 ? '' : 's'} reached)` : '';
    const text = `I pushed the boulder ${best}m up the mountain${loopBit} before the gods knocked it back down. Try the labor yourself: https://bisks.net/games/sisyphus`;
    window.open('https://bsky.app/intent/compose?text=' + encodeURIComponent(text), '_blank', 'noopener');
  });

  // boot
  let saved = 'marble-agora';
  try { const s = localStorage.getItem('sisyphus.theme'); if (s && THEMES[s]) saved = s; } catch (e) {}
  els.theme.value = saved;
  applyTheme(saved);
  loadBest();
  loadLoops();
  reset();
  state.running = false; // wait for start
  els.start.classList.remove('hidden');
  requestAnimationFrame(frame);
})();
