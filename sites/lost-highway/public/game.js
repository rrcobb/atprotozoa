/* LOST HIGHWAY — the flash game.
 *
 * A Night Driver-style pseudo-3D drive: a straight black highway rushing at
 * you out of a single vanishing point, after the title sequence of David
 * Lynch's Lost Highway. Steer to dodge oncoming headlights and the Mystery
 * Man standing dead in the road; grab the stray VHS tapes. Every so often
 * the whole thing glitches — static, a line of dialogue, your name swaps
 * between Fred and Pete, your controls might not mean what they meant a
 * second ago.
 *
 * No curves, no other scenery — just blacktop, a dashed line, and the dark.
 * Everything, including all audio, is generated in the browser. No files
 * ship. Unaffiliated fan homage, not the movie.
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Audio. One AudioContext; a drone pad (music), a continuous engine hum, and
  // one-shot SFX, each gated by its own bus so the two toggles work independently.
  // ---------------------------------------------------------------------------
  const Audio = (function () {
    let ctx = null, master = null, musicBus = null, sfxBus = null;
    let musicOn = true, sfxOn = true;
    let droneTimer = null, droneStep = 0;
    let engineOsc = null, engineGain = null, engineFilter = null, engineDist = null;
    let griteCurve = null, stabCurve = null;

    function distortionCurve(amount) {
      const n = 4096, curve = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const x = (i * 2) / n - 1;
        curve[i] = ((3 + amount) * x * 20 * Math.PI / 180) / (Math.PI + amount * Math.abs(x));
      }
      return curve;
    }

    function ensure() {
      if (ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = 0.85; master.connect(ctx.destination);
      musicBus = ctx.createGain(); musicBus.gain.value = musicOn ? 0.5 : 0; musicBus.connect(master);
      sfxBus = ctx.createGain(); sfxBus.gain.value = sfxOn ? 0.9 : 0; sfxBus.connect(master);

      griteCurve = distortionCurve(22);
      stabCurve = distortionCurve(46);

      // engine hum, routed through a mild waveshaper for an industrial, gritty
      // edge under the drive — a nod to the soundtrack's Nine Inch Nails side.
      engineOsc = ctx.createOscillator(); engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 44;
      engineFilter = ctx.createBiquadFilter(); engineFilter.type = 'lowpass'; engineFilter.frequency.value = 220;
      engineDist = ctx.createWaveShaper(); engineDist.curve = griteCurve; engineDist.oversample = '2x';
      engineGain = ctx.createGain(); engineGain.gain.value = 0;
      engineOsc.connect(engineFilter); engineFilter.connect(engineDist); engineDist.connect(engineGain); engineGain.connect(sfxBus);
      engineOsc.start();
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
      g.gain.exponentialRampToValueAtTime(peak, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(bus);
      o.start(t0); o.stop(t0 + dur + 0.03);
      return o;
    }

    function noise(bus, dur, peak, cutoff, hp) {
      const n = Math.floor(ctx.sampleRate * dur);
      const buf = ctx.createBuffer(1, n, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const src = ctx.createBufferSource(); src.buffer = buf;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = cutoff;
      let node = lp;
      if (hp) { const hpF = ctx.createBiquadFilter(); hpF.type = 'highpass'; hpF.frequency.value = hp; lp.connect(hpF); node = hpF; }
      const g = ctx.createGain();
      const t0 = ctx.currentTime;
      g.gain.setValueAtTime(peak, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(lp); node.connect(g); g.connect(bus);
      src.start(t0); src.stop(t0 + dur);
    }

    const rnd = (a, b) => a + Math.random() * (b - a);

    // a distorted low pulse + metallic hiss — the industrial layer under
    // every glitch and mystery-man scare, more NIN than Badalamenti.
    function industrialHit(bus, t0, peak) {
      const o = ctx.createOscillator(); o.type = 'square';
      o.frequency.setValueAtTime(rnd(55, 90), t0);
      o.frequency.exponentialRampToValueAtTime(26, t0 + 0.4);
      const dist = ctx.createWaveShaper(); dist.curve = stabCurve; dist.oversample = '4x';
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(peak, t0 + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.42);
      o.connect(dist); dist.connect(g); g.connect(bus);
      o.start(t0); o.stop(t0 + 0.45);
      noise(bus, 0.16, peak * 0.6, 6200, 2600);
    }

    const SFX = {
      pickup() { // VHS tape — a cold two-tone phone-ring blip
        const t = ctx.currentTime;
        voice(sfxBus, 'sine', 920, 920, t, 0.11, 0.22, 'lin');
        voice(sfxBus, 'sine', 1380, 1380, t + 0.1, 0.16, 0.18, 'lin');
      },
      closeCall() {
        const t = ctx.currentTime, base = rnd(500, 620);
        voice(sfxBus, 'triangle', base, base * 1.6, t, 0.12, 0.14, 'exp');
      },
      milestone() {
        const t = ctx.currentTime;
        [0, 3, 7].forEach((semi, i) => {
          const f = 220 * Math.pow(2, semi / 12);
          voice(sfxBus, 'sine', f, f, t + i * 0.05, 0.2, 0.14, 'lin');
        });
      },
      glitch() { // onset of an identity glitch — static, a discordant stab, industrial grit
        const t = ctx.currentTime;
        noise(sfxBus, 0.35, 0.4, 4200, 800);
        voice(sfxBus, 'sawtooth', rnd(90, 140), rnd(40, 70), t, 0.5, 0.22, 'exp');
        voice(sfxBus, 'sawtooth', rnd(90, 140) * 1.5, rnd(40, 70) * 1.4, t + 0.02, 0.45, 0.16, 'exp');
        industrialHit(sfxBus, t + 0.01, 0.32);
      },
      mysteryScare() { // the close-up face flash — a cold stab, no warmth
        const t = ctx.currentTime;
        industrialHit(sfxBus, t, 0.4);
        voice(sfxBus, 'square', rnd(700, 900), rnd(160, 220), t + 0.02, 0.35, 0.14, 'exp');
      },
      crash() {
        const t = ctx.currentTime;
        voice(sfxBus, 'sawtooth', rnd(180, 240), 32, t, 0.6, 0.42, 'exp');
        voice(sfxBus, 'square', rnd(80, 120), 24, t, 0.55, 0.24, 'exp');
        noise(sfxBus, 0.6, 0.55, 1400, 0);
      }
    };

    function play(name) {
      if (!sfxOn || !ctx) return;
      const fn = SFX[name];
      if (fn) fn();
    }

    // slow drone pad — a handful of low, close, slightly-detuned tones that
    // wander through a short chord cycle. Not a melody; a room tone.
    const CHORDS = [
      [55, 65.4, 82.4],      // A, C, E — Am
      [49, 58.3, 73.4],      // G, Bb, D — Gm
      [55, 69.3, 82.4],      // A, C#, E — A
      [58.3, 69.3, 87.3]     // Bb, C#, D# — Bb dim-ish
    ];
    function scheduleDrone(time) {
      const chord = CHORDS[droneStep % CHORDS.length];
      chord.forEach((f, i) => {
        const detune = 1 + (Math.random() - 0.5) * 0.01;
        voice(musicBus, i === 0 ? 'sine' : 'triangle', f * detune, f * detune, time, 4.6, 0.16 - i * 0.02, 'lin');
      });
      droneStep++;
    }

    // a smoky jazz sax lead, wandering a minor-blues scale over the drone —
    // late-night lounge noir drifting in and out through the static.
    const SAX_SCALE = [0, 3, 5, 6, 7, 10, 12];
    function saxNote(bus, freq, t0, dur, peak) {
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(freq * 0.94, t0);
      o.frequency.exponentialRampToValueAtTime(freq, t0 + 0.07);
      const vib = ctx.createOscillator(); vib.type = 'sine'; vib.frequency.value = 5.2 + Math.random();
      const vibGain = ctx.createGain(); vibGain.gain.value = freq * 0.013;
      vib.connect(vibGain); vibGain.connect(o.frequency);
      vib.start(t0); vib.stop(t0 + dur + 0.15);

      const filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.Q.value = 4;
      filt.frequency.setValueAtTime(freq * 2.4, t0);
      filt.frequency.exponentialRampToValueAtTime(freq * 1.3, t0 + dur);

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(peak, t0 + 0.06);
      g.gain.exponentialRampToValueAtTime(peak * 0.55, t0 + dur * 0.65);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

      o.connect(filt); filt.connect(g); g.connect(bus);
      o.start(t0); o.stop(t0 + dur + 0.18);
    }
    function scheduleSaxPhrase(time) {
      if (Math.random() < 0.35) return; // sparse — smoky, not wall-to-wall
      const root = 220; // A3, a fifth above the drone root
      const notes = 2 + Math.floor(Math.random() * 3);
      let t = time + rnd(0.4, 1.3);
      for (let i = 0; i < notes; i++) {
        const semi = SAX_SCALE[Math.floor(Math.random() * SAX_SCALE.length)];
        const freq = root * Math.pow(2, semi / 12);
        const dur = rnd(0.4, 0.95);
        saxNote(musicBus, freq, t, dur, 0.11 + Math.random() * 0.05);
        t += dur * rnd(0.75, 1.2);
      }
    }
    function droneTick() {
      if (!ctx) return;
      const t = ctx.currentTime + 0.05;
      scheduleDrone(t);
      scheduleSaxPhrase(t);
      droneTimer = setTimeout(droneTick, 3600);
    }
    function startMusic() { ensure(); if (droneTimer) return; droneStep = 0; droneTick(); }
    function stopMusic() { if (droneTimer) { clearTimeout(droneTimer); droneTimer = null; } }

    function setEngine(speedRatio, on) {
      if (!engineGain) return;
      const target = on ? 0.05 + speedRatio * 0.09 : 0;
      engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.15);
      engineOsc.frequency.setTargetAtTime(40 + speedRatio * 70, ctx.currentTime, 0.2);
      engineFilter.frequency.setTargetAtTime(180 + speedRatio * 260, ctx.currentTime, 0.2);
    }

    return {
      init: ensure,
      resume,
      play,
      startMusic,
      stopMusic,
      setEngine,
      setMusic(on) {
        musicOn = on;
        if (musicBus) musicBus.gain.setTargetAtTime(on ? 0.5 : 0, ctx.currentTime, 0.08);
      },
      setSfx(on) {
        sfxOn = on;
        if (sfxBus) sfxBus.gain.setTargetAtTime(on ? 0.9 : 0, ctx.currentTime, 0.05);
      },
      get musicOn() { return musicOn; },
      get sfxOn() { return sfxOn; }
    };
  })();

  // ---------------------------------------------------------------------------
  // Pseudo-3D projection. A straight road, no curves: a fixed camera height
  // and focal length, steering just translates the camera sideways. At great
  // distance the x-offset scales toward zero, so everything really does
  // converge on one point at the horizon — the title-sequence shot.
  // ---------------------------------------------------------------------------
  const canvas = document.getElementById('game');
  const ctx2d = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const CENTER_X = W / 2;
  const HORIZON_Y = H * 0.5;
  const FOCAL = 300;
  const CAM_HEIGHT = 300;
  const ROAD_HALF = 900;       // world units, pavement extends this far each side of center
  const NEAR_Z = 334;          // z at which a point projects to the very bottom of the canvas
  const COLLIDE_Z = 60;        // z at which an obstacle is "at the windshield"
  const SPAWN_Z = 2400;

  function project(worldX, z, worldY) {
    const zz = Math.max(z, 1);
    const scale = FOCAL / zz;
    return {
      x: CENTER_X + worldX * scale,
      y: HORIZON_Y + (CAM_HEIGHT - (worldY || 0)) * scale,
      scale
    };
  }
  function projectRel(worldX, z, worldY) {
    return project(worldX - state.cameraX, z, worldY);
  }

  // ---------------------------------------------------------------------------
  // World state
  // ---------------------------------------------------------------------------
  const el = (id) => document.getElementById(id);
  const els = {
    dist: el('dist'), best: el('best'), identity: el('identity'),
    finalIdentity: el('finalIdentity'), finalDist: el('finalDist'), finalQuote: el('finalQuote'),
    start: el('startOverlay'), pause: el('pauseOverlay'), over: el('overOverlay'),
    startBtn: el('startBtn'), againBtn: el('againBtn'), shareBtn: el('shareBtn'),
    music: el('musicToggle'), sfx: el('sfxToggle'),
    flash: el('flash'), quoteBanner: el('quoteBanner'),
    tLeft: el('tLeft'), tRight: el('tRight')
  };

  const GLITCH_QUOTES = [
    'DICK LAURENT IS DEAD',
    "IN THE EAST THEY'D CALL THIS A BAD COINCIDENCE",
    'YOU INVITED ME. IT IS NOT MY HABIT TO GO WHERE I AM NOT WANTED',
    'I LIKE TO REMEMBER THINGS MY OWN WAY',
    'WHOEVER YOU SAY I AM, THAT’S WHO I AM',
    'WE’VE MET BEFORE, HAVEN’T WE?',
    "THERE'S NO SUCH THING AS A BAD COINCIDENCE",
    'CALL ME',
    'RIGHT NOW I AM AT YOUR HOUSE',
    'TIME DOES STRANGE THINGS ON THE LOST HIGHWAY'
  ];
  const CRASH_QUOTES = [
    '— a voice on the intercom',
    '— the man at the party, from across the room',
    '— someone who was never actually there',
    '— static, then a dial tone'
  ];

  const state = {
    running: false, paused: false, over: false,
    t: 0,
    cameraX: 0, speed: 14, dist: 0, score: 0, best: 0,
    identity: 'FRED',
    obstacles: [],       // {type, x, z, prevZ, resolved}
    particles: [],        // screen-space, for the crash
    spawnTimer: 60,
    milestone: 400,
    glitching: false, glitchT: 0,
    reversed: false, reverseUntil: 0,
    nextGlitchDist: 700,
    mysteryFlash: 0,
    noiseCanvas: document.createElement('canvas'),
    noiseCtx: null
  };
  state.noiseCanvas.width = 96; state.noiseCanvas.height = 54;
  state.noiseCtx = state.noiseCanvas.getContext('2d');

  const keys = { left: false, right: false, brake: false };

  function loadBest() {
    try { state.best = parseInt(localStorage.getItem('lost-highway.best') || '0', 10) || 0; } catch (e) {}
    els.best.textContent = state.best;
  }
  function saveBest() {
    if (Math.floor(state.dist) > state.best) {
      state.best = Math.floor(state.dist);
      try { localStorage.setItem('lost-highway.best', String(state.best)); } catch (e) {}
    }
  }

  function reset() {
    state.running = true; state.paused = false; state.over = false;
    state.t = 0; state.cameraX = 0; state.speed = 14;
    state.dist = 0; state.score = 0;
    state.identity = Math.random() < 0.5 ? 'FRED' : 'PETE';
    els.identity.textContent = state.identity;
    state.obstacles = [];
    state.particles = [];
    state.spawnTimer = 50;
    state.milestone = 400;
    state.glitching = false; state.glitchT = 0;
    state.reversed = false; state.reverseUntil = 0;
    state.nextGlitchDist = 380 + Math.random() * 260;
    state.mysteryFlash = 0;
    updateHud();
  }

  function updateHud() {
    els.dist.textContent = Math.floor(state.dist);
    els.best.textContent = Math.max(state.best, Math.floor(state.dist));
    els.identity.textContent = state.identity;
  }

  // --- spawning ---
  function spawnObstacle() {
    const roll = Math.random();
    const laneX = (Math.random() * 2 - 1) * (ROAD_HALF - 130);
    let type;
    if (roll < 0.30) type = 'headlight';
    else if (roll < 0.62) type = 'mystery';   // more mystery man
    else type = 'tape';                        // more vhs tapes
    state.obstacles.push({ type, x: laneX, z: SPAWN_Z + Math.random() * 300, prevZ: SPAWN_Z + 400, resolved: false, spin: Math.random() * Math.PI * 2 });
  }

  function radiusFor(type) {
    if (type === 'headlight') return 150;
    if (type === 'mystery') return 100;
    return 140; // tape
  }

  function burst(color, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 1.5 + Math.random() * 6;
      state.particles.push({
        x: CENTER_X, y: H * 0.62, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 26 + Math.random() * 26, color
      });
    }
  }

  function triggerGlitch() {
    state.glitching = true; state.glitchT = 46;
    state.identity = state.identity === 'FRED' ? 'PETE' : 'FRED';
    state.reversed = true; state.reverseUntil = state.t + 170;
    els.quoteBanner.textContent = GLITCH_QUOTES[Math.floor(Math.random() * GLITCH_QUOTES.length)];
    els.quoteBanner.style.transition = 'none';
    els.quoteBanner.style.opacity = '1';
    requestAnimationFrame(() => {
      els.quoteBanner.style.transition = 'opacity 1.6s ease';
      els.quoteBanner.style.opacity = '0';
    });
    Audio.play('glitch');
    // more mystery man: about a third of glitches, his face fills the screen
    if (Math.random() < 0.38) {
      state.mysteryFlash = 20;
      Audio.play('mysteryScare');
    }
    updateHud();
  }

  function loseGame(collidedType) {
    state.running = false; state.over = true;
    saveBest();
    Audio.play('crash');
    Audio.setEngine(0, false);
    burst('#f2f0e6', 18);
    burst('#b3122a', 14);
    flashScreen(1, 90);
    els.finalIdentity.textContent = state.identity;
    els.finalDist.textContent = Math.floor(state.dist);
    els.finalQuote.textContent = CRASH_QUOTES[Math.floor(Math.random() * CRASH_QUOTES.length)];
    const shareText = `${state.identity} made it ${Math.floor(state.dist)}m down the lost highway before ${collidedType === 'mystery' ? 'someone standing in the road' : 'the oncoming lights'} caught up. \u{1F3AE} lost-highway.bisks.net`;
    els.shareBtn.href = 'https://bsky.app/intent/compose?text=' + encodeURIComponent(shareText);
    els.over.classList.remove('hidden');
    updateHud();
  }

  function flashScreen(peak, ms) {
    els.flash.style.transition = 'none';
    els.flash.style.opacity = String(peak);
    requestAnimationFrame(() => {
      els.flash.style.transition = `opacity ${ms}ms ease`;
      els.flash.style.opacity = '0';
    });
  }

  // --- update ---
  function update() {
    state.t++;

    state.speed = 14 + Math.min(20, state.dist / 140);
    const speedRatio = Math.min(1, (state.speed - 14) / 20);
    Audio.setEngine(speedRatio, true);

    state.dist += state.speed * 0.045;

    if (state.dist >= state.milestone) {
      state.milestone += 400;
      state.score += 20;
      Audio.play('milestone');
    }

    if (state.dist >= state.nextGlitchDist) {
      triggerGlitch();
      state.nextGlitchDist = state.dist + 420 + Math.random() * 380;
    }
    if (state.glitchT > 0) state.glitchT--; else state.glitching = false;
    if (state.reversed && state.t > state.reverseUntil) state.reversed = false;
    if (state.mysteryFlash > 0) state.mysteryFlash--;

    // steering
    const dir = state.reversed ? -1 : 1;
    const STEER = 11.5;
    if (keys.left) state.cameraX -= STEER * dir;
    if (keys.right) state.cameraX += STEER * dir;
    const limit = ROAD_HALF - 60;
    state.cameraX = Math.max(-limit, Math.min(limit, state.cameraX));

    const effSpeed = state.speed * (keys.brake ? 0.45 : 1);

    // spawn
    state.spawnTimer--;
    if (state.spawnTimer <= 0) {
      spawnObstacle();
      state.spawnTimer = Math.max(30, 62 - state.dist / 60);
    }

    // advance obstacles, check collide-plane crossing
    for (const o of state.obstacles) {
      if (o.resolved) continue;
      o.prevZ = o.z;
      o.z -= effSpeed * 2.6;
      o.spin += 0.05;
      if (o.prevZ > COLLIDE_Z && o.z <= COLLIDE_Z) {
        const dx = Math.abs(o.x - state.cameraX);
        const r = radiusFor(o.type);
        if (dx < r) {
          if (o.type === 'tape') {
            o.resolved = true;
            state.score += 40;
            Audio.play('pickup');
          } else {
            o.resolved = true;
            loseGame(o.type);
            return;
          }
        } else {
          o.resolved = true;
          if (o.type !== 'tape') { state.score += 10; Audio.play('closeCall'); }
        }
      }
    }
    state.obstacles = state.obstacles.filter((o) => !o.resolved && o.z > -100);

    for (const p of state.particles) { p.x += p.vx; p.y += p.vy; p.vy += 0.15; p.life--; }
    state.particles = state.particles.filter((p) => p.life > 0);
  }

  // --- render ---
  function drawNoise(alpha) {
    const nc = state.noiseCtx;
    const img = nc.createImageData(state.noiseCanvas.width, state.noiseCanvas.height);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255;
      img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = 255;
    }
    nc.putImageData(img, 0, 0);
    ctx2d.save();
    ctx2d.globalAlpha = alpha;
    ctx2d.imageSmoothingEnabled = false;
    ctx2d.drawImage(state.noiseCanvas, 0, 0, W, H);
    ctx2d.restore();
  }

  function draw() {
    // void
    ctx2d.fillStyle = '#000';
    ctx2d.fillRect(0, 0, W, H);

    // road trapezoid: apex is the fixed vanishing point at the horizon
    const nearL = projectRel(-ROAD_HALF, NEAR_Z, 0);
    const nearR = projectRel(ROAD_HALF, NEAR_Z, 0);
    ctx2d.fillStyle = '#0a0a0a';
    ctx2d.beginPath();
    ctx2d.moveTo(CENTER_X, HORIZON_Y);
    ctx2d.lineTo(nearR.x, H);
    ctx2d.lineTo(nearL.x, H);
    ctx2d.closePath();
    ctx2d.fill();

    // shoulder edge lines
    ctx2d.strokeStyle = 'rgba(242,240,230,0.35)';
    ctx2d.lineWidth = 2;
    ctx2d.beginPath();
    ctx2d.moveTo(CENTER_X, HORIZON_Y); ctx2d.lineTo(nearL.x, H);
    ctx2d.moveTo(CENTER_X, HORIZON_Y); ctx2d.lineTo(nearR.x, H);
    ctx2d.stroke();

    // dashed center line, scrolling toward camera
    const dashLen = 90, gapLen = 90, period = dashLen + gapLen;
    const scrollZ = (state.dist * 45) % period;
    ctx2d.fillStyle = '#f2f0e6';
    for (let n = 0; n < 16; n++) {
      let z1 = NEAR_Z + n * period - scrollZ;
      let z2 = z1 + dashLen;
      if (z2 < NEAR_Z * 0.4) continue;
      z1 = Math.max(z1, 8); z2 = Math.max(z2, 9);
      if (z1 > SPAWN_Z + 400) break;
      const a1 = projectRel(-14, z1), a2 = projectRel(14, z1);
      const b1 = projectRel(14, z2), b2 = projectRel(-14, z2);
      ctx2d.beginPath();
      ctx2d.moveTo(a1.x, a1.y); ctx2d.lineTo(a2.x, a2.y);
      ctx2d.lineTo(b1.x, b1.y); ctx2d.lineTo(b2.x, b2.y);
      ctx2d.closePath();
      ctx2d.fill();
    }

    // obstacles, far to near so near ones draw on top
    const ordered = state.obstacles.slice().sort((a, b) => b.z - a.z);
    for (const o of ordered) {
      if (o.z <= 0 || o.z > SPAWN_Z + 400) continue;
      drawObstacle(o);
    }

    // particles (crash debris), screen-space
    for (const p of state.particles) {
      ctx2d.globalAlpha = Math.max(0, p.life / 40);
      ctx2d.fillStyle = p.color;
      ctx2d.fillRect(p.x, p.y, 4, 4);
    }
    ctx2d.globalAlpha = 1;

    // dashboard hood, fixed to the viewer
    ctx2d.fillStyle = '#050505';
    ctx2d.beginPath();
    ctx2d.moveTo(0, H); ctx2d.lineTo(W, H);
    ctx2d.lineTo(W * 0.86, H * 0.94); ctx2d.lineTo(W * 0.14, H * 0.94);
    ctx2d.closePath(); ctx2d.fill();
    ctx2d.strokeStyle = 'rgba(179,18,42,0.55)';
    ctx2d.lineWidth = 1.5;
    ctx2d.beginPath(); ctx2d.moveTo(W * 0.14, H * 0.94); ctx2d.lineTo(W * 0.86, H * 0.94); ctx2d.stroke();

    // vignette
    const vg = ctx2d.createRadialGradient(CENTER_X, H * 0.55, H * 0.25, CENTER_X, H * 0.55, H * 0.85);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx2d.fillStyle = vg;
    ctx2d.fillRect(0, 0, W, H);

    if (state.glitching) {
      drawWarpStreaks();
      drawNoise(0.14 + Math.random() * 0.1);
      if (state.t % 5 < 2) {
        ctx2d.fillStyle = 'rgba(255,255,255,0.05)';
        ctx2d.fillRect(0, 0, W, H);
      }
    }
    if (state.reversed) {
      ctx2d.fillStyle = 'rgba(179,18,42,0.75)';
      ctx2d.font = '11px ui-monospace, monospace';
      ctx2d.textAlign = 'center';
      ctx2d.fillText('— REVERSED —', CENTER_X, HORIZON_Y - 14);
    }
    if (state.mysteryFlash > 0) drawMysteryFlash(state.mysteryFlash);
  }

  // time-warp streaks radiating from the vanishing point — the road tearing loose
  function drawWarpStreaks() {
    ctx2d.save();
    ctx2d.strokeStyle = 'rgba(242,240,230,0.16)';
    for (let i = 0; i < 16; i++) {
      const ang = Math.random() * Math.PI * 2;
      const len = 60 + Math.random() * 300;
      const x1 = CENTER_X + Math.cos(ang) * 24, y1 = HORIZON_Y + Math.sin(ang) * 24;
      const x2 = CENTER_X + Math.cos(ang) * len, y2 = HORIZON_Y + Math.sin(ang) * len;
      ctx2d.lineWidth = 1 + Math.random() * 1.8;
      ctx2d.beginPath(); ctx2d.moveTo(x1, y1); ctx2d.lineTo(x2, y2); ctx2d.stroke();
    }
    ctx2d.restore();
  }

  // the mystery man's face, close and pale, filling the screen for a beat
  function drawMysteryFlash(t) {
    const D = 20, elapsed = D - t;
    const a = Math.min(1, elapsed / 5, (D - elapsed) / 9 + 0.05);
    ctx2d.save();
    ctx2d.globalAlpha = Math.max(0, Math.min(0.92, a));
    ctx2d.fillStyle = '#050505';
    ctx2d.fillRect(0, 0, W, H);
    ctx2d.fillStyle = 'rgba(224,218,204,0.9)';
    ctx2d.beginPath();
    ctx2d.arc(CENTER_X, H * 0.5, H * 0.26, 0, Math.PI * 2);
    ctx2d.fill();
    ctx2d.fillStyle = '#050505';
    ctx2d.beginPath(); ctx2d.arc(CENTER_X - H * 0.09, H * 0.46, H * 0.032, 0, Math.PI * 2); ctx2d.fill();
    ctx2d.beginPath(); ctx2d.arc(CENTER_X + H * 0.09, H * 0.46, H * 0.032, 0, Math.PI * 2); ctx2d.fill();
    ctx2d.font = `bold ${Math.round(H * 0.024)}px ui-monospace, monospace`;
    ctx2d.textAlign = 'center';
    ctx2d.fillStyle = 'rgba(179,18,42,0.85)';
    ctx2d.fillText('WE’VE MET BEFORE, HAVEN’T WE?', CENTER_X, H * 0.72);
    ctx2d.restore();
  }

  function drawObstacle(o) {
    const p = projectRel(o.x, o.z, 0);
    if (p.x < -400 || p.x > W + 400) return;
    const s = p.scale;
    if (o.type === 'headlight') {
      const gap = 26 * s;
      const r = Math.max(1.4, 7 * s);
      const glow = Math.min(26, 10 * s);
      ctx2d.save();
      ctx2d.shadowColor = '#e8b23a'; ctx2d.shadowBlur = glow;
      ctx2d.fillStyle = '#fff3c4';
      ctx2d.beginPath(); ctx2d.arc(p.x - gap, p.y - 30 * s, r, 0, Math.PI * 2); ctx2d.fill();
      ctx2d.beginPath(); ctx2d.arc(p.x + gap, p.y - 30 * s, r, 0, Math.PI * 2); ctx2d.fill();
      ctx2d.restore();
      // dim body beneath the lights, close range only
      if (s > 0.5) {
        ctx2d.fillStyle = `rgba(10,10,10,${Math.min(0.9, (s - 0.5))})`;
        const w = 70 * s;
        ctx2d.fillRect(p.x - w / 2, p.y - 30 * s, w, 26 * s);
      }
    } else if (o.type === 'mystery') {
      // a still, dark figure — barely visible until it's close
      const h = 210 * s, w = 46 * s;
      const brightness = Math.min(0.55, Math.max(0.05, (SPAWN_Z - o.z) / SPAWN_Z * 0.55 + (s > 0.6 ? (s - 0.6) * 0.9 : 0)));
      ctx2d.fillStyle = `rgb(${18 + brightness * 60},${16 + brightness * 55},${16 + brightness * 55})`;
      ctx2d.beginPath();
      ctx2d.moveTo(p.x - w / 2, p.y);
      ctx2d.lineTo(p.x - w / 2.6, p.y - h);
      ctx2d.lineTo(p.x + w / 2.6, p.y - h);
      ctx2d.lineTo(p.x + w / 2, p.y);
      ctx2d.closePath(); ctx2d.fill();
      if (s > 0.55) {
        // a pale, featureless face catches the light at close range
        const faceB = Math.min(1, (s - 0.55) * 2.2);
        ctx2d.fillStyle = `rgba(230,224,210,${faceB})`;
        ctx2d.beginPath();
        ctx2d.arc(p.x, p.y - h + w * 0.55, w * 0.32, 0, Math.PI * 2);
        ctx2d.fill();
      }
    } else {
      // VHS tape, tumbling — squash by |cos(spin)| for a cheap 3D flip
      const w = 46 * s, hgt = 30 * s;
      const squash = Math.abs(Math.cos(o.spin));
      ctx2d.save();
      ctx2d.translate(p.x, p.y - hgt * 0.6);
      ctx2d.scale(Math.max(0.12, squash), 1);
      ctx2d.shadowColor = '#e8b23a'; ctx2d.shadowBlur = Math.min(18, 8 * s);
      ctx2d.fillStyle = '#1c1a16';
      ctx2d.fillRect(-w / 2, -hgt / 2, w, hgt);
      ctx2d.fillStyle = '#e8b23a';
      ctx2d.fillRect(-w / 2 + w * 0.12, -hgt / 2 + hgt * 0.18, w * 0.76, hgt * 0.22);
      ctx2d.restore();
    }
  }

  // --- main loop ---
  function frame() {
    if (state.running && !state.paused) update();
    if (state.running || state.over || !els.start.classList.contains('hidden')) draw();
    updateHud();
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
    if (state.paused) { Audio.stopMusic(); Audio.setEngine(0, false); }
    else if (Audio.musicOn) Audio.startMusic();
  }

  document.addEventListener('keydown', (e) => {
    switch (e.code) {
      case 'ArrowLeft': case 'KeyA': keys.left = true; break;
      case 'ArrowRight': case 'KeyD': keys.right = true; break;
      case 'ArrowDown': case 'KeyS': keys.brake = true; break;
      case 'Enter':
        e.preventDefault();
        if (state.over) restart(); else if (!state.running) startGame();
        break;
      case 'Space':
        e.preventDefault();
        if (!state.running && !state.over) startGame();
        break;
      case 'KeyP': togglePause(); break;
      case 'KeyM': setMusic(!Audio.musicOn); break;
    }
  });
  document.addEventListener('keyup', (e) => {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = false;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = false;
    if (e.code === 'ArrowDown' || e.code === 'KeyS') keys.brake = false;
  });

  els.startBtn.addEventListener('click', startGame);
  els.againBtn.addEventListener('click', restart);

  function bindHold(node, on, off) {
    node.addEventListener('touchstart', (e) => { e.preventDefault(); if (!state.running && !state.over) startGame(); on(); }, { passive: false });
    node.addEventListener('touchend', (e) => { e.preventDefault(); off(); }, { passive: false });
    node.addEventListener('mousedown', (e) => { e.preventDefault(); on(); });
    node.addEventListener('mouseup', (e) => { e.preventDefault(); off(); });
    node.addEventListener('mouseleave', () => off());
  }
  bindHold(els.tLeft, () => (keys.left = true), () => (keys.left = false));
  bindHold(els.tRight, () => (keys.right = true), () => (keys.right = false));

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

  // boot
  loadBest();
  reset();
  state.running = false; // wait for start
  els.start.classList.remove('hidden');
  requestAnimationFrame(frame);
})();
