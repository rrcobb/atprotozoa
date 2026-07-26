/* fitzcarraldo — "HAUL THE SHIP", an 8-bit recreation of the climactic scene
 * of Herzog's Fitzcarraldo: a steamship dragged up one side of a jungle
 * mountain, over the top, and down into the next river, by rope, winch and
 * a few hundred exhausted volunteers. You supply the volunteers: mash
 * SPACE / tap HAUL to build tension on the rope; it decays fast, so the
 * ship only moves while you keep working the capstan. Morale (yours, or the
 * crew's — same thing) dips with every haul and the rope slips back when
 * it runs low, same as the actual six-week production this is spoofing.
 * Mash too hard for too long, though, and the rope itself can't take it:
 * sustained high tension strains it toward a snap, which sets you back hard
 * and crushes crew standing at the base of the line — the "Rope integrity"
 * readout in the sidebar is the only warning you get.
 *
 * Everything is canvas rectangles at native 256x160 (NES-ish), scaled up
 * with image-rendering:pixelated — no sprite sheets, no image assets.
 * Audio is a small Web Audio engine in the same spirit as sites/moonbuggy:
 * a looped work-chant bassline plus synthesized SFX, nothing pre-recorded.
 *
 * On the near bank, three more figures watch: Herzog (calm, dry
 * one-liners on a timer), Kinski (erratic — his tantrums spike a "chaos"
 * meter, blunt your hauls while active, and force a Herzog-called "cut"
 * mutiny-lockout if chaos maxes out), and Wenders' camera, silently
 * logging every beat of it to the sidebar as a live documentary feed —
 * the in-universe footage that becomes "Burden of Dreams."
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
    music: el('musicToggle'), sfx: el('sfxToggle'), haulBtn: el('haulBtn'),
    chaos: el('chaosFill'), chaosReadout: el('chaosReadout'), ropeReadout: el('ropeReadout'),
    directorCaption: el('directorCaption'), setcamLog: el('setcamLog'),
    preload: el('preloadOverlay'), preloadFill: el('preloadBarFill'),
    preloadPct: el('preloadPct'), skipIntroBtn: el('skipIntroBtn'),
    breakthroughToggle: el('breakthroughToggle'), breakthroughHint: el('breakthroughHint'),
    breakthroughBtn: el('breakthroughBtn'), winHeadline: el('winHeadline'), winBody: el('winBody')
  };

  // ---------------------------------------------------------------------
  // Breakthrough Mode — a harder replay, unlocked after the first crossing.
  // Persisted locally; nothing here talks to a server.
  // ---------------------------------------------------------------------
  const BT_KEY = 'fitzcarraldo.breakthroughUnlocked';
  const BreakthroughUI = (function () {
    let unlocked = false;
    let selected = false;
    try { unlocked = localStorage.getItem(BT_KEY) === '1'; } catch (e) {}

    function refresh() {
      const btn = els.breakthroughToggle;
      if (!btn) return;
      btn.disabled = !unlocked;
      btn.classList.toggle('unlocked', unlocked);
      btn.setAttribute('aria-pressed', String(selected && unlocked));
      if (els.breakthroughHint) {
        els.breakthroughHint.textContent = unlocked
          ? (selected ? 'ON — harder haul, angrier Kinski' : 'cross once already; toggle it on for the hard version')
          : 'cross once to unlock';
      }
      document.body.classList.toggle('breakthrough-mode', unlocked && selected);
    }
    function unlock() {
      if (unlocked) return;
      unlocked = true;
      try { localStorage.setItem(BT_KEY, '1'); } catch (e) {}
      refresh();
    }
    function toggle() {
      if (!unlocked) return;
      selected = !selected;
      refresh();
    }
    function forceOn() {
      if (!unlocked) return;
      selected = true;
      refresh();
    }
    refresh();
    return { unlock, toggle, forceOn, refresh, get unlocked() { return unlocked; }, get selected() { return selected; } };
  })();
  if (els.breakthroughToggle) els.breakthroughToggle.addEventListener('click', () => BreakthroughUI.toggle());

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
      kinski() {
        const t = actx.currentTime;
        voice(sfxBus, 'sawtooth', 500, 90, t, 0.5, 0.28, 'exp');
        voice(sfxBus, 'square', 620, 140, t + 0.03, 0.4, 0.2, 'exp');
        noise(sfxBus, 0.45, 0.3, 2200);
      },
      cut() {
        const t = actx.currentTime;
        [7, 4, 0].forEach((semi, i) => {
          const f = ROOT * 2 * Math.pow(2, semi / 12);
          voice(sfxBus, 'square', f, f, t + i * 0.1, 0.28, 0.22, 'lin');
        });
      },
      ropeBreak() {
        const t = actx.currentTime;
        voice(sfxBus, 'sawtooth', 900, 40, t, 0.22, 0.35, 'exp');
        noise(sfxBus, 0.5, 0.4, 2600);
        noise(sfxBus, 0.6, 0.32, 500);
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
    fitz: '#f4f0e2', fitzHat: '#e0d8c0', note: '#ffe9a8',
    filmcam: '#222222', herzogShirt: '#7a6a45', herzogSkin: '#d9a97a', herzogHat: '#c9b98a',
    kinskiShirt: '#33302a', kinskiSkin: '#d9a97a', kinskiHair: '#f2e14d'
  };

  function lerp(a, b, t) { return a + (b - a) * t; }

  // ---------------------------------------------------------------------
  // Game state
  // ---------------------------------------------------------------------
  const state = {
    running: false, won: false,
    breakthrough: false,
    diff: { moraleCostMul: 1, slipMul: 1, kinskiChanceMul: 1, chaosGainMul: 1, tensionDecay: 0.965, ropeBreakMul: 1 },
    t: 0, startedAt: 0,
    progress: 0,      // 0 = left river, 0.5 = summit, 1 = right river
    lastProgress: 0,
    tension: 0,       // 0..100, decays; each haul adds
    morale: 100,      // 0..100
    hauls: 0,
    mutiny: 0,        // frames of "crew refuses" lockout
    ropeStrain: 0,    // 0..100, builds under sustained high tension; can snap the rope
    ropeBreakLockout: 0, // frames the rope is severed and being re-rigged
    ropeBreaks: 0,    // count, for the win-screen recap
    crushFlash: 0,
    shake: 0,
    caption: '', captionTimer: 0,
    passedMilestones: new Set(),
    particles: [],
    craterFlash: 0,
    // Kinski chaos meter, Herzog's dry commentary, Wenders' documentary log
    chaos: 0,               // 0..100, Kinski's erratic threat to the shoot
    kinskiActive: 0,        // frames of an active tantrum
    herzogTimer: 300,       // frames until Herzog's next unprompted line
    directorCaption: '', directorSpeaker: '', directorCaptionTimer: 0,
    docLog: [],
    preload: 0, preloadDone: false
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
          pushLog('the ship crests the mountain.');
        } else if (m < 0.5) {
          Audio.play('milestone');
          setCaption(pickClimbLine(), 130);
          pushLog('crew hauls on, up the flank.');
        } else {
          Audio.play('milestone');
          setCaption(pickDescentLine(), 130);
          pushLog('descent begins on the far slope.');
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

  // ---------------------------------------------------------------------
  // Herzog directs, Kinski threatens to ruin the shoot, Wenders films it
  // all for "Burden of Dreams" — a running commentary layer on top of the
  // haul mechanic. Kinski's tantrums temporarily blunt your hauls and push
  // up a "chaos" meter; let it max out and Herzog calls cut, freezing the
  // crew same as a morale mutiny.
  // ---------------------------------------------------------------------
  const HERZOG_LINES = [
    'THE JUNGLE DOES NOT APPLAUD. IT ONLY WAITS.',
    'THIS IS NOT A METAPHOR. THE SHIP IS ACTUALLY ON THE MOUNTAIN.',
    'THE ROPE IS HONEST. LITTLE ELSE HERE IS.',
    'SOMEWHERE A PRODUCER ASKS ABOUT THE BUDGET. I DO NOT ANSWER.',
    'WE FILM WHAT IS REAL, EVEN WHEN REAL IS A BAD IDEA.',
    'THE CREW ASKS HOW MUCH FARTHER. I SAY NOTHING.',
    'A MOUNTAIN HAS NO OPINION OF US. IT IS A RELIEF.'
  ];
  const KINSKI_LINES = [
    'KINSKI SCREAMS THAT THE ROPE IS BENEATH HIM.',
    'KINSKI THREATENS TO SWIM HOME.',
    'KINSKI HURLS A BOOT AT THE SOUND CART.',
    'KINSKI DEMANDS A DIFFERENT MOUNTAIN, IMMEDIATELY.',
    'KINSKI ACCUSES THE CAPSTAN OF DISRESPECT.'
  ];
  const KINSKI_RESOLVE_LINES = [
    'HE HAS STOPPED SCREAMING. FOR NOW.',
    'THE SET QUIETS. THE RIVER DOES NOT CARE EITHER WAY.',
    'PRODUCTION RESUMES, SOMEHOW.'
  ];
  const pickHerzog = () => HERZOG_LINES[Math.floor(Math.random() * HERZOG_LINES.length)];
  const pickKinski = () => KINSKI_LINES[Math.floor(Math.random() * KINSKI_LINES.length)];
  const pickKinskiResolve = () => KINSKI_RESOLVE_LINES[Math.floor(Math.random() * KINSKI_RESOLVE_LINES.length)];

  function setDirectorCaption(msg, speaker, dur) {
    state.directorCaption = msg;
    state.directorSpeaker = speaker;
    state.directorCaptionTimer = dur || 140;
    if (els.directorCaption) {
      els.directorCaption.textContent = (speaker === 'kinski' ? 'KINSKI: ' : 'HERZOG: ') + msg;
      els.directorCaption.className = 'speaker-' + speaker;
    }
  }

  function timecode() {
    const secs = Math.floor(state.t / 60);
    const m = Math.floor(secs / 60), s = secs % 60;
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  function pushLog(text) {
    state.docLog.push({ t: timecode(), text });
    if (state.docLog.length > 6) state.docLog.shift();
    if (els.setcamLog) {
      els.setcamLog.innerHTML = state.docLog.slice().reverse()
        .map(e => '<li><span class="tc">' + e.t + '</span>' + e.text + '</li>').join('');
    }
  }

  function burst(x, y, color, n, spread) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = (spread || 1.6) * (0.4 + Math.random());
      state.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.6, life: 22 + Math.random() * 18, color, size: 1 + Math.random() * 2 });
    }
  }

  function haul() {
    if (!state.running || state.won) return;
    if (state.mutiny > 0 || state.ropeBreakLockout > 0) return;
    const disrupted = state.kinskiActive > 0;
    const d = state.diff;
    state.tension = Math.min(100, state.tension + (disrupted ? 6 : 13));
    state.morale = Math.max(0, state.morale - (disrupted ? 1.1 : 0.7) * d.moraleCostMul);
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

  // the rope gives out under too much sustained tension — a hard, costly
  // setback that also crushes crew standing at the base of the line
  function triggerRopeBreak() {
    const d = state.diff;
    state.ropeBreaks++;
    const loss = 0.05 + Math.random() * 0.06;
    state.progress = Math.max(0, state.progress - loss);
    state.tension = 0;
    state.ropeStrain = 15;
    state.morale = Math.max(0, state.morale - 18 * d.moraleCostMul);
    state.ropeBreakLockout = 150;
    state.shake = 14;
    state.crushFlash = 22;
    Audio.play('ropeBreak');
    setCaption('THE ROPE SNAPS. IT TAKES THE FRONT LINE WITH IT.', 170);
    setDirectorCaption('THE JUNGLE WANTED THE ROPE BACK. IT TOOK PEOPLE WITH IT.', 'herzog', 200);
    pushLog('the rope parts. men go down at the capstan.');
    burst(LEFT_BASE_X - 6, BASE_Y + 2, '#c81010', 20, 2.6);
    burst(LEFT_BASE_X - 6, BASE_Y + 2, C.rope, 10, 1.8);
    if (state.mutiny <= 0 && state.morale <= 0) {
      state.mutiny = 130;
      setCaption('THE CREW REFUSES. THE ROPE HOLDS.', 130);
    }
  }

  function reset(breakthrough) {
    state.running = true; state.won = false;
    state.breakthrough = !!breakthrough;
    state.diff = state.breakthrough
      ? { moraleCostMul: 1.5, slipMul: 1.7, kinskiChanceMul: 1.9, chaosGainMul: 1.3, tensionDecay: 0.95, ropeBreakMul: 1.6 }
      : { moraleCostMul: 1, slipMul: 1, kinskiChanceMul: 1, chaosGainMul: 1, tensionDecay: 0.965, ropeBreakMul: 1 };
    state.t = 0; state.startedAt = performance.now();
    state.progress = 0; state.lastProgress = 0;
    state.tension = 0; state.morale = 100; state.hauls = 0; state.mutiny = 0;
    state.ropeStrain = 0; state.ropeBreakLockout = 0; state.ropeBreaks = 0; state.crushFlash = 0;
    state.shake = 0; state.passedMilestones = new Set(); state.particles = [];
    state.chaos = 0; state.kinskiActive = 0; state.herzogTimer = 260 + Math.random() * 160;
    state.directorCaptionTimer = 0;
    state.docLog = [];
    pushLog(state.breakthrough ? 'camera rolling. Herzog looks unusually tense.' : 'camera rolling. Herzog says nothing yet.');
    setCaption(state.breakthrough ? 'BREAKTHROUGH MODE. NO ONE IS EASY ON YOU.' : 'THE RIVER FALLS BEHIND YOU.', 140);
    updateHud();
  }

  function updateHud() {
    els.altitude.textContent = Math.round(Math.min(1, state.progress) * 100) + '%';
    els.stage.textContent = state.progress < 0.5 ? 'CLIMBING' : (state.progress >= 1 ? 'ARRIVED' : 'DESCENDING');
    els.hauls.textContent = state.hauls;
    const secs = state.running ? (performance.now() - state.startedAt) / 1000 : 0;
    els.time.textContent = secs.toFixed(1) + 's';
    els.morale.style.width = Math.max(0, state.morale) + '%';
    if (els.chaos) els.chaos.style.width = Math.round(state.chaos) + '%';
    if (els.chaosReadout) els.chaosReadout.textContent = Math.round(state.chaos) + '%';
    if (els.ropeReadout) {
      const critical = state.ropeStrain > 60 || state.ropeBreakLockout > 0;
      els.ropeReadout.textContent = state.ropeBreakLockout > 0 ? 'SEVERED — re-rigging'
        : (state.ropeStrain > 60 ? 'CREAKING (' + Math.round(state.ropeStrain) + '%)'
        : (state.ropeStrain > 25 ? 'strained' : 'holding'));
      els.ropeReadout.classList.toggle('critical', critical);
    }
  }

  function gameWon() {
    state.running = false; state.won = true;
    const secs = (performance.now() - state.startedAt) / 1000;
    Audio.play('win');
    els.finalHauls.textContent = state.hauls;
    els.finalTime.textContent = secs.toFixed(1) + 's';

    const wasFirstUnlock = !BreakthroughUI.unlocked;
    BreakthroughUI.unlock();

    const ropeLine = state.ropeBreaks > 0
      ? `the rope snapped ${state.ropeBreaks} time${state.ropeBreaks === 1 ? '' : 's'} along the way. not everyone made it to the summit.`
      : '';
    if (state.breakthrough) {
      if (els.winHeadline) els.winHeadline.innerHTML = 'THE COMPLETION BOND<br>IS SATISFIED';
      if (els.winBody) els.winBody.innerHTML = `<b id="finalHauls">${state.hauls}</b> hauls · <b id="finalTime">${secs.toFixed(1)}s</b><br>breakthrough mode, cleared. the real production also finished, eventually.${ropeLine ? '<br>' + ropeLine : ''}`;
      if (els.breakthroughBtn) els.breakthroughBtn.style.display = 'none';
    } else {
      if (els.winHeadline) els.winHeadline.innerHTML = 'THE SHIP HAS CROSSED<br>THE MOUNTAIN';
      if (els.winBody) els.winBody.innerHTML = `<b id="finalHauls">${state.hauls}</b> hauls · <b id="finalTime">${secs.toFixed(1)}s</b><br>the gramophone plays Caruso to an empty jungle.${ropeLine ? '<br>' + ropeLine : ''}`;
      if (els.breakthroughBtn) els.breakthroughBtn.style.display = wasFirstUnlock ? 'inline-block' : (BreakthroughUI.unlocked ? 'inline-block' : 'none');
    }

    const modeTag = state.breakthrough ? ' on BREAKTHROUGH MODE' : '';
    const text = `I hauled Fitzcarraldo's ship over the mountain in ${state.hauls} hauls (${secs.toFixed(1)}s)${modeTag} at fitzcarraldo.bisks.net`;
    els.shareBluesky.href = 'https://bsky.app/intent/compose?text=' + encodeURIComponent(text);
    els.win.classList.remove('hidden');
    burst(shipPos(1).x, shipPos(1).y, C.note, 30, 3);
    setDirectorCaption('IT IS FINISHED. NOW WE WAIT FOR THE JUNGLE TO RECLAIM IT.', 'herzog', 220);
    pushLog('the shoot wraps. Wenders keeps rolling for the credits.');
  }

  function update() {
    state.t++;
    if (state.mutiny > 0) {
      state.mutiny--;
      if (state.mutiny === 0) { state.morale = 45; setCaption('THE CREW RETURNS TO THE ROPE.', 100); }
    } else {
      state.morale = Math.min(100, state.morale + 0.06);
    }
    if (state.ropeBreakLockout > 0) {
      state.ropeBreakLockout--;
      if (state.ropeBreakLockout === 0) {
        setCaption('A NEW ROPE IS RIGGED. THE CAPSTAN TURNS AGAIN.', 110);
        pushLog('a fresh rope goes up. the survivors take their places.');
      }
    }
    state.lastProgress = state.progress;
    if (!state.won) {
      const d = state.diff;
      state.progress += state.tension * 0.000028;
      state.tension *= d.tensionDecay;

      // the rope slips when morale runs low — a small, punishing-but-forgiving setback
      const slipChance = (state.morale < 35 ? 0.01 : (state.morale < 60 ? 0.003 : 0.0006)) * d.slipMul;
      if (state.progress > 0.02 && state.progress < 0.999 && Math.random() < slipChance) {
        const loss = 0.01 + Math.random() * 0.02;
        state.progress = Math.max(0, state.progress - loss);
        state.shake = 6;
        Audio.play('slip');
        setCaption('THE ROPE SLIPS.', 90);
        const p = shipPos(state.progress);
        burst(p.x, p.y, C.mtn[0], 10, 2);
      }

      // sustained heavy tension strains the rope; let it run hot too long and
      // it snaps, taking the crew at the front of the line down with it
      if (state.tension > 65) {
        state.ropeStrain = Math.min(100, state.ropeStrain + (state.tension - 65) * 0.05);
      } else {
        state.ropeStrain = Math.max(0, state.ropeStrain - 0.4);
      }
      if (state.ropeBreakLockout <= 0 && state.ropeStrain > 55 &&
          state.progress > 0.02 && state.progress < 0.999) {
        const breakChance = (state.ropeStrain - 55) * 0.00007 * d.ropeBreakMul;
        if (Math.random() < breakChance) triggerRopeBreak();
      }

      state.progress = Math.min(1, state.progress);
      milestoneCheck();
      updateFilmCrew();
      if (state.progress >= 1) gameWon();
    }
    if (state.shake > 0) state.shake--;
    if (state.craterFlash > 0) state.craterFlash--;
    if (state.crushFlash > 0) state.crushFlash--;
    if (state.captionTimer > 0) state.captionTimer--;
    if (state.directorCaptionTimer > 0) state.directorCaptionTimer--;

    for (const p of state.particles) { p.x += p.vx; p.y += p.vy; p.vy += 0.08; p.life--; }
    state.particles = state.particles.filter(p => p.life > 0);
  }

  // Kinski's tantrums, Herzog's dry commentary, and the chaos meter they
  // drive between them — separate from the haul/morale loop so it reads as
  // its own subplot happening alongside the climb.
  function updateFilmCrew() {
    if (state.kinskiActive > 0) {
      state.kinskiActive--;
      if (state.kinskiActive === 0) {
        state.chaos = Math.max(0, state.chaos - 20);
        setDirectorCaption(pickKinskiResolve(), 'herzog', 110);
        pushLog('the set quiets, briefly.');
      }
    } else {
      const d = state.diff;
      state.chaos = Math.max(0, state.chaos - 0.03);
      if (state.t > 90 && state.mutiny <= 0 && Math.random() < 0.0009 * d.kinskiChanceMul) {
        state.kinskiActive = 100;
        state.chaos = Math.min(100, state.chaos + 35 * d.chaosGainMul);
        state.shake = 8;
        Audio.play('kinski');
        setDirectorCaption(pickKinski(), 'kinski', 150);
        pushLog('Kinski erupts. Wenders zooms in.');
        const cam = { x: 250, y: BASE_Y };
        burst(cam.x, cam.y - 8, '#ff5a5a', 10, 2);
      } else if (state.herzogTimer > 0) {
        state.herzogTimer--;
        if (state.herzogTimer === 0) {
          setDirectorCaption(pickHerzog(), 'herzog', 170);
          state.herzogTimer = 340 + Math.random() * 260;
        }
      }
    }
    if (state.chaos >= 100 && state.mutiny <= 0) {
      state.mutiny = Math.max(state.mutiny, 160);
      state.chaos = 55;
      Audio.play('cut');
      setDirectorCaption('HERZOG CALLS CUT. THE SHOOT STOPS COLD.', 'herzog', 160);
      pushLog('"Cut!" Herzog calls a halt.');
    }
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
    const down = state.ropeBreakLockout > 0;
    for (let i = 0; i < 5; i++) {
      const x = baseX - i * 6;
      if (down && i < 2) {
        // the front of the line, laid out after the snap
        ctx.save();
        ctx.translate(x, baseY + 3);
        ctx.rotate(Math.PI / 2);
        ctx.fillStyle = '#7a1414';
        ctx.fillRect(-1, -8, 2, 8);
        ctx.fillStyle = '#4a0d0d';
        ctx.fillRect(-2, -8, 4, 3);
        ctx.restore();
        continue;
      }
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

  function drawFilmCrew() {
    // Wenders' camera, watching from the near bank; Herzog beside it, calm;
    // Kinski beside him, not calm — jitters harder mid-tantrum.
    const y = BASE_Y + 2;
    ctx.strokeStyle = C.filmcam; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(228, y + 2); ctx.lineTo(232, y - 6);
    ctx.moveTo(236, y + 2); ctx.lineTo(232, y - 6);
    ctx.moveTo(232, y + 2); ctx.lineTo(232, y - 6);
    ctx.stroke();
    ctx.fillStyle = C.filmcam;
    ctx.fillRect(228, y - 10, 8, 5);
    ctx.fillStyle = state.t % 20 < 10 ? '#ff2222' : '#661111';
    ctx.fillRect(235, y - 9, 2, 2);

    ctx.save();
    ctx.translate(242, y);
    ctx.fillStyle = C.herzogShirt; ctx.fillRect(-2, -8, 4, 8);
    ctx.fillStyle = C.herzogSkin; ctx.fillRect(-2, -10, 4, 2);
    ctx.fillStyle = C.herzogHat; ctx.fillRect(-3, -11, 6, 2);
    ctx.restore();

    const mad = state.kinskiActive > 0;
    const jitterX = mad ? (Math.random() - 0.5) * 3 : Math.sin(state.t * 0.15) * 0.6;
    const jitterY = mad ? (Math.random() - 0.5) * 2 : 0;
    ctx.save();
    ctx.translate(250 + jitterX, y + jitterY);
    ctx.fillStyle = C.kinskiShirt; ctx.fillRect(-2, -8, 4, 8);
    ctx.fillStyle = mad ? '#e05a3a' : C.kinskiSkin; ctx.fillRect(-2, -10, 4, 2);
    ctx.fillStyle = mad ? '#ffffff' : C.kinskiHair;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 2, -10);
      ctx.lineTo(i * 2 - 1, -13 - (mad ? Math.random() * 3 : 0));
      ctx.lineTo(i * 2 + 1, -10);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
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
    drawFilmCrew();
    drawShip(p);
    drawParticles();
    if (state.craterFlash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${state.craterFlash / 24})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (state.crushFlash > 0) {
      ctx.fillStyle = `rgba(180,10,10,${state.crushFlash / 44})`;
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
    if (els.directorCaption) els.directorCaption.style.opacity = state.directorCaptionTimer > 0 ? '1' : '0';
    if (!state.preloadDone) advancePreload();
    requestAnimationFrame(frame);
  }

  // a fake Flash Player preloader — pure period-authentic theater, the
  // "content" behind it (the start overlay) is already fully loaded.
  function advancePreload() {
    state.preload++;
    const pct = Math.min(100, Math.round((state.preload / 90) * 100));
    if (els.preloadFill) els.preloadFill.style.width = pct + '%';
    if (els.preloadPct) els.preloadPct.textContent = 'loading fitzcarraldo.swf — ' + pct + '%';
    if (pct >= 100) finishPreload();
  }
  function finishPreload() {
    if (state.preloadDone) return;
    state.preloadDone = true;
    if (els.preload) els.preload.classList.add('hidden');
  }
  if (els.skipIntroBtn) els.skipIntroBtn.addEventListener('click', finishPreload);

  function startGame(forceBreakthrough) {
    Audio.init(); Audio.resume();
    if (Audio.musicOn) Audio.startMusic();
    els.start.classList.add('hidden');
    els.win.classList.add('hidden');
    reset(forceBreakthrough || BreakthroughUI.selected);
  }

  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      if (!state.preloadDone) return;
      if (!state.running && !state.won) startGame();
      else haul();
    }
  });
  canvas.addEventListener('pointerdown', () => {
    if (!state.preloadDone) return;
    if (!state.running && !state.won) startGame(); else haul();
  });
  els.haulBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (!state.preloadDone) return;
    if (!state.running && !state.won) startGame(); else haul();
  });
  els.startBtn.addEventListener('click', () => startGame());
  els.againBtn.addEventListener('click', () => startGame());
  if (els.breakthroughBtn) {
    els.breakthroughBtn.addEventListener('click', () => {
      BreakthroughUI.forceOn();
      startGame(true);
    });
  }

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
