// kidpix sound kit — every effect and the background loop are synthesized
// live with the Web Audio API (oscillators, filtered noise, envelopes).
// No sample files, no external audio, no AI generation — just oscillators.

const SoundKit = (() => {
  let ctx = null;
  let musicOn = false;
  let musicTimer = null;
  let musicStep = 0;

  function getCtx() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  // shared noise buffer, reused (sliced) for every noise-based effect
  let noiseBuf = null;
  function noiseBuffer() {
    const c = getCtx();
    if (!noiseBuf || noiseBuf.sampleRate !== c.sampleRate) {
      const len = c.sampleRate * 2;
      noiseBuf = c.createBuffer(1, len, c.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    return noiseBuf;
  }

  function envGain(c, t0, attack, hold, release, peak) {
    const g = c.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + attack);
    g.gain.setValueAtTime(peak, t0 + attack + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + hold + release);
    return g;
  }

  function tone({ freq = 440, to, type = "sine", dur = 0.15, vol = 0.2, delay = 0, attack = 0.005 }) {
    const c = getCtx();
    const t0 = c.currentTime + delay;
    const osc = c.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (to) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
    const g = envGain(c, t0, attack, Math.max(0, dur - attack - dur * 0.35), dur * 0.35, vol);
    osc.connect(g).connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
    return t0 + dur;
  }

  function noise({ dur = 0.2, vol = 0.25, filterFreq = 1200, filterType = "bandpass", q = 1, delay = 0, freqTo }) {
    const c = getCtx();
    const t0 = c.currentTime + delay;
    const src = c.createBufferSource();
    src.buffer = noiseBuffer();
    src.loop = false;
    const filt = c.createBiquadFilter();
    filt.type = filterType;
    filt.frequency.setValueAtTime(filterFreq, t0);
    if (freqTo) filt.frequency.exponentialRampToValueAtTime(Math.max(1, freqTo), t0 + dur);
    filt.Q.value = q;
    const g = envGain(c, t0, 0.01, dur * 0.2, dur * 0.79, vol);
    src.connect(filt).connect(g).connect(c.destination);
    const offset = Math.random() * 0.5;
    src.start(t0, offset, dur);
    return t0 + dur;
  }

  // ---- specific effects -----------------------------------------------

  const TOOL_PITCHES = [523, 587, 659, 698, 784, 880, 988, 1046, 660, 740, 831, 932];
  function toolSelect(index = 0) {
    const f = TOOL_PITCHES[index % TOOL_PITCHES.length];
    tone({ freq: f, type: "triangle", dur: 0.09, vol: 0.16 });
    tone({ freq: f * 1.5, type: "sine", dur: 0.06, vol: 0.08, delay: 0.02 });
  }

  function drawTick(kind = "pencil") {
    if (kind === "spray") {
      noise({ dur: 0.05, vol: 0.06, filterFreq: 4000, filterType: "highpass" });
    } else if (kind === "brush") {
      tone({ freq: 300 + Math.random() * 120, type: "sine", dur: 0.045, vol: 0.03 });
    } else {
      tone({ freq: 900 + Math.random() * 200, type: "square", dur: 0.02, vol: 0.02 });
    }
  }

  function stampPop() {
    tone({ freq: 220, to: 660, type: "sine", dur: 0.12, vol: 0.22 });
    noise({ dur: 0.06, vol: 0.12, filterFreq: 3000, filterType: "highpass" });
  }

  function bucketWhoosh() {
    noise({ dur: 0.4, vol: 0.2, filterFreq: 200, freqTo: 3000, filterType: "bandpass", q: 0.7 });
  }

  function eraserSqueak() {
    tone({ freq: 900, to: 300, type: "sawtooth", dur: 0.18, vol: 0.08 });
  }

  function oopsUndo() {
    const c = getCtx();
    const t0 = c.currentTime;
    [660, 550, 440, 330].forEach((f, i) => tone({ freq: f, type: "triangle", dur: 0.12, vol: 0.15, delay: i * 0.06 }));
  }

  function typewriterClick() {
    tone({ freq: 1800 + Math.random() * 400, type: "square", dur: 0.015, vol: 0.05 });
  }

  function saveChime() {
    [523, 659, 784, 1046].forEach((f, i) => tone({ freq: f, type: "sine", dur: 0.2, vol: 0.15, delay: i * 0.09 }));
  }

  function lineWhoosh() {
    noise({ dur: 0.15, vol: 0.1, filterFreq: 1000, freqTo: 2500, filterType: "bandpass" });
  }

  // the big one: fuse fizzle then KABOOM. Returns total duration in ms so the
  // caller can choreograph a screen-shake / flash animation against it.
  function dynamite(onBoom) {
    const c = getCtx();
    const fuseDur = 0.9;
    // sizzling fuse: short noise pops on a rising cadence
    for (let i = 0; i < 10; i++) {
      const t = (i / 10) * fuseDur;
      noise({ dur: 0.04, vol: 0.05, filterFreq: 5000, filterType: "highpass", delay: t });
    }
    setTimeout(() => {
      // low thump
      tone({ freq: 90, to: 30, type: "sine", dur: 0.5, vol: 0.5 });
      tone({ freq: 55, to: 20, type: "triangle", dur: 0.6, vol: 0.35, delay: 0.02 });
      // explosion noise burst
      noise({ dur: 0.7, vol: 0.4, filterFreq: 1800, freqTo: 100, filterType: "lowpass", q: 0.5 });
      noise({ dur: 0.9, vol: 0.22, filterFreq: 400, filterType: "lowpass", delay: 0.05 });
      if (onBoom) onBoom();
    }, fuseDur * 1000);
    return fuseDur * 1000 + 900;
  }

  // ---- background music loop -------------------------------------------
  // several looping chiptune moods, scheduled step by step with setTimeout
  // (short loop, so drift doesn't matter for a toy paint app). Each mood is
  // just a different scale/step-pattern/voice/tempo — same tone()/noise()
  // synth primitives as every other sound here, no samples.

  const MOODS = {
    cheerful: {
      label: "🎈 cheerful",
      scale: [261.6, 293.7, 329.6, 392.0, 440.0, 523.3, 587.3, 659.3], // C major-ish
      pattern: [0, 2, 4, 7, 4, 2, 0, 4, 1, 3, 5, 3, 1, 5, 3, 6],
      type: "square", stepMs: 180, vol: 0.06, bassEvery: 4,
    },
    spooky: {
      label: "👻 spooky",
      scale: [220.0, 233.1, 261.6, 277.2, 311.1, 349.2, 369.9, 415.3], // A harmonic-minor-ish
      pattern: [0, 3, 1, 4, 0, 5, 3, 2, 0, 4, 1, 3],
      type: "sawtooth", stepMs: 300, vol: 0.045, bassEvery: 3,
    },
    sleepy: {
      label: "😴 sleepy",
      scale: [220.0, 246.9, 277.2, 329.6, 369.9, 440.0], // gentle lullaby-ish
      pattern: [0, 2, 4, 2, 5, 4, 2, 0, 1, 3, 5, 3],
      type: "sine", stepMs: 420, vol: 0.05, bassEvery: 6,
    },
    circus: {
      label: "🎪 circus",
      scale: [349.2, 392.0, 440.0, 466.2, 523.3, 587.3, 659.3, 698.5], // F major, oom-pah range
      pattern: [0, 4, 2, 4, 1, 5, 3, 5, 0, 4, 2, 6, 1, 5, 3, 7],
      type: "square", stepMs: 120, vol: 0.055, bassEvery: 2,
    },
    space: {
      label: "🛸 space",
      scale: [174.6, 207.7, 220.0, 261.6, 293.7, 349.2], // wide, sparse, echoey
      pattern: [0, 4, 2, 5, 1, 3, 0, 5],
      type: "triangle", stepMs: 500, vol: 0.05, bassEvery: 8,
    },
  };
  let currentMood = "cheerful";

  function musicStepTone(i) {
    const m = MOODS[currentMood] || MOODS.cheerful;
    const note = m.scale[m.pattern[i % m.pattern.length] % m.scale.length];
    tone({ freq: note, type: m.type, dur: m.stepMs / 1000 * 0.9, vol: m.vol });
    if (currentMood === "space") {
      // a soft detuned echo voice instead of a bass note — feels wide/ambient
      tone({ freq: note * 1.003, type: "sine", dur: (m.stepMs / 1000) * 1.6, vol: m.vol * 0.5, delay: 0.09 });
    } else if (i % m.bassEvery === 0) {
      tone({ freq: note / 2, type: "triangle", dur: 0.3, vol: m.vol * 0.85 });
    }
  }

  function setMood(mood) {
    if (MOODS[mood]) currentMood = mood;
    return currentMood;
  }

  function startMusic(mood) {
    if (mood) setMood(mood);
    if (musicOn) return;
    musicOn = true;
    getCtx();
    const loop = () => {
      if (!musicOn) return;
      musicStepTone(musicStep++);
      const m = MOODS[currentMood] || MOODS.cheerful;
      musicTimer = setTimeout(loop, m.stepMs);
    };
    loop();
  }
  function stopMusic() {
    musicOn = false;
    if (musicTimer) clearTimeout(musicTimer);
    musicTimer = null;
  }
  function toggleMusic(mood) {
    if (musicOn) stopMusic();
    else startMusic(mood);
    return musicOn;
  }

  return {
    toolSelect, drawTick, stampPop, bucketWhoosh, eraserSqueak,
    oopsUndo, typewriterClick, saveChime, lineWhoosh, dynamite,
    startMusic, stopMusic, toggleMusic, setMood,
    MOOD_LIST: Object.keys(MOODS).map((k) => ({ key: k, label: MOODS[k].label })),
    get musicOn() { return musicOn; },
    get currentMood() { return currentMood; },
  };
})();
