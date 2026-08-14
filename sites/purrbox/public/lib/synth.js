// synth.js — a Web Audio purr model.
//
// Real cat purrs come from the laryngeal and diaphragmatic muscles twitching
// at roughly 20-30Hz on both the in- and out-breath, repeatedly snapping the
// glottis shut and open. That repetition rate is the whole sound: it's what
// turns an ordinary exhale into a buzzy "motor" texture, and it sits right at
// the edge of what reads as a pitch vs. a rhythm, which is why a purr feels
// felt as much as heard. This engine models that directly — a low sawtooth
// "rumble" carrier gets its amplitude re-triggered on a schedule at the purr
// rate, using a lookahead scheduler (not a single audio-rate LFO) so the
// rate, depth and jitter of every single pulse can react live to the three
// controls without audible scheduling glitches. A breath-noise layer adds
// air, an optional distorted "growl" layer adds irritation, and occasional
// pitch-rising "chirp" blips add the trilling chirrup a happy cat makes.

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (x) => Math.max(0, Math.min(1, x));

// ---- controls -> sound parameters --------------------------------------

// size, temp, mood each 0..1. temp's comfortable middle isn't 0.5 exactly —
// cats run warm and like it warmer than a human "room temperature" reads as
// comfortable, so the ideal sits a bit past center.
const IDEAL_TEMP = 0.58;

export function paramsFromControls(size, temp, mood) {
  size = clamp01(size);
  temp = clamp01(temp);
  mood = clamp01(mood);

  // comfort peaks at IDEAL_TEMP and falls off toward either extreme
  const comfort = clamp01(1 - Math.abs(temp - IDEAL_TEMP) / 0.5);
  // cold/hot only kick in well past the comfortable band, not at any deviation
  const cold = clamp01((IDEAL_TEMP - 0.32 - temp) / 0.3);
  const hot = clamp01((temp - IDEAL_TEMP - 0.28) / 0.34);

  // mood: grumpy below ~0.45, content in the middle, blissed above ~0.55
  const grump = clamp01(1 - mood / 0.45);
  const bliss = clamp01((mood - 0.55) / 0.45);
  const content = clamp01(1 - grump - bliss);

  return {
    size,
    temp,
    mood,
    comfort,
    cold,
    hot,
    grump,
    bliss,
    content,
    // bigger cats have a bigger larynx and purr a touch slower and deeper;
    // being cold or annoyed hurries and roughens the rate
    purrRateHz: lerp(30, 20, size) * (1 - cold * 0.1) * (1 + grump * 0.1),
    // fundamental of the tonal rumble underneath the buzz, and the chest
    // resonance it's filtered through — both drop with cat size
    rumbleHz: lerp(150, 42, size),
    formantHz: lerp(950, 220, size),
    // how deep the amplitude swings each pulse: a settled, comfortable,
    // content cat purrs with a pronounced, articulated buzz; distress or
    // extreme heat smooths it into a thinner, less textured hum
    depth: clamp01(0.55 + comfort * 0.3 + content * 0.25 - grump * 0.25 - hot * 0.3),
    // irregularity in the pulse timing: a relaxed cat's purr is metronomic,
    // an annoyed or shivering one drifts and stutters
    jitter: clamp01(grump * 0.55 + cold * 0.55 + hot * 0.15),
    volume: clamp01(0.42 + comfort * 0.16 + bliss * 0.35 - grump * 0.12 - hot * 0.12),
    // a rough, distorted low undertone that rides in on grumpiness
    growl: clamp01(grump * 0.95 - bliss * 0.6),
    // breath/air noise: prominent when panting from heat, present at low
    // level whenever comfort is low for any reason
    breath: clamp01(hot * 0.85 + (1 - comfort) * 0.12 + cold * 0.12),
    // probability weight for the happy trilling chirp
    chirpRate: bliss,
    // overall tone brightness: relaxed muscle reads as a warmer, rounder
    // tone; tension (cold, hot, grumpy) reads brighter/thinner
    warmthHz: lerp(420, 4200, comfort) * (1 - hot * 0.25) * (1 - grump * 0.15),
    shiver: cold,
  };
}

// ---- noise + distortion helpers ----------------------------------------

function brownNoiseBuffer(ctx, seconds) {
  const bufSize = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  const data = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < bufSize; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.018 * white) / 1.018;
    data[i] = last * 3.2;
  }
  return buf;
}

function distortionCurve(amount) {
  const n = 1024;
  const curve = new Float32Array(n);
  const k = amount * 55 + 1;
  const norm = Math.tanh(k);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(k * x) / norm;
  }
  return curve;
}

// ---- the engine ----------------------------------------------------------

export function createPurrEngine(ctx) {
  // mix bus for all instrument layers -> user volume -> play/pause fade ->
  // warmth (comfort-driven tone) -> compressor -> analyser + destination
  const mixBus = ctx.createGain();
  mixBus.gain.value = 1;
  const volGain = ctx.createGain();
  volGain.gain.value = 0.85;
  const playGain = ctx.createGain();
  playGain.gain.value = 0.0001;
  const warmth = ctx.createBiquadFilter();
  warmth.type = "lowpass";
  warmth.Q.value = 0.5;
  warmth.frequency.value = 2000;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.knee.value = 20;
  comp.ratio.value = 4;
  comp.attack.value = 0.008;
  comp.release.value = 0.15;
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.55;

  mixBus.connect(volGain);
  volGain.connect(playGain);
  playGain.connect(warmth);
  warmth.connect(comp);
  comp.connect(analyser);
  comp.connect(ctx.destination);

  // rumble: the tonal carrier that gets pulsed at the purr rate
  const rumbleOsc = ctx.createOscillator();
  rumbleOsc.type = "sawtooth";
  const rumbleFilter = ctx.createBiquadFilter();
  rumbleFilter.type = "lowpass";
  rumbleFilter.Q.value = 1.1;
  const rumbleEnv = ctx.createGain();
  rumbleEnv.gain.value = 0.0001;
  rumbleOsc.connect(rumbleFilter);
  rumbleFilter.connect(rumbleEnv);
  rumbleEnv.connect(mixBus);
  rumbleOsc.start();

  // breath: filtered brown noise, pulsed alongside the rumble
  const noiseSrc = ctx.createBufferSource();
  noiseSrc.buffer = brownNoiseBuffer(ctx, 3);
  noiseSrc.loop = true;
  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = "bandpass";
  noiseFilter.Q.value = 0.7;
  noiseFilter.frequency.value = 1200;
  const noiseEnv = ctx.createGain();
  noiseEnv.gain.value = 0.0001;
  noiseSrc.connect(noiseFilter);
  noiseFilter.connect(noiseEnv);
  noiseEnv.connect(mixBus);
  noiseSrc.start();

  // growl: distorted low undertone, only really present when grumpy
  const growlOsc = ctx.createOscillator();
  growlOsc.type = "sawtooth";
  const growlShaper = ctx.createWaveShaper();
  growlShaper.curve = distortionCurve(0.7);
  const growlFilter = ctx.createBiquadFilter();
  growlFilter.type = "bandpass";
  growlFilter.Q.value = 1.5;
  growlFilter.frequency.value = 140;
  const growlEnv = ctx.createGain();
  growlEnv.gain.value = 0.0001;
  growlOsc.connect(growlShaper);
  growlShaper.connect(growlFilter);
  growlFilter.connect(growlEnv);
  growlEnv.connect(mixBus);
  growlOsc.start();

  let params = paramsFromControls(0.5, 0.5, 0.5);
  let running = false;
  let schedulerTimer = null;
  let nextPulseAt = 0;
  let nextGrowlAt = 0;
  let nextChirpAt = 0;

  function schedulePurrPulse(t, p) {
    const cyc = 1 / p.purrRateHz;
    const peak = 0.5 * p.volume;
    const trough = peak * (1 - p.depth);
    const attack = cyc * 0.4;
    rumbleEnv.gain.setValueAtTime(Math.max(0.0001, trough), t);
    rumbleEnv.gain.linearRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    rumbleEnv.gain.linearRampToValueAtTime(Math.max(0.0001, trough), t + cyc * 0.92);
    rumbleFilter.frequency.setValueAtTime(p.formantHz, t);
    rumbleOsc.frequency.setValueAtTime(p.rumbleHz, t);

    const noisePeak = (0.1 + p.breath * 0.55) * p.volume;
    noiseEnv.gain.setValueAtTime(noisePeak * 0.3, t);
    noiseEnv.gain.linearRampToValueAtTime(noisePeak, t + attack * 1.3);
    noiseEnv.gain.linearRampToValueAtTime(noisePeak * 0.3, t + cyc * 0.95);
    noiseFilter.frequency.setValueAtTime(600 + p.breath * 1500, t);
  }

  function scheduleGrowlPulse(t, p) {
    const dur = lerp(0.5, 0.14, p.growl) * 0.8;
    const peak = 0.32 * p.volume * p.growl;
    growlOsc.frequency.setValueAtTime(p.rumbleHz * 0.55 * (0.9 + Math.random() * 0.2), t);
    growlEnv.gain.cancelScheduledValues(t);
    growlEnv.gain.setValueAtTime(0.0001, t);
    growlEnv.gain.linearRampToValueAtTime(Math.max(0.0002, peak), t + dur * 0.3);
    growlEnv.gain.linearRampToValueAtTime(0.0001, t + dur);
  }

  function scheduleChirp(t, p) {
    const chirpOsc = ctx.createOscillator();
    chirpOsc.type = "triangle";
    const chirpGain = ctx.createGain();
    chirpGain.gain.value = 0.0001;
    chirpOsc.connect(chirpGain);
    chirpGain.connect(mixBus);
    const startHz = p.formantHz * 1.7;
    const endHz = startHz * 1.6;
    chirpOsc.frequency.setValueAtTime(startHz, t);
    chirpOsc.frequency.exponentialRampToValueAtTime(endHz, t + 0.14);
    chirpGain.gain.setValueAtTime(0.0001, t);
    chirpGain.gain.linearRampToValueAtTime(0.22 * p.volume, t + 0.02);
    chirpGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    chirpOsc.start(t);
    chirpOsc.stop(t + 0.26);
    chirpOsc.onended = () => {
      try {
        chirpOsc.disconnect();
        chirpGain.disconnect();
      } catch {}
    };
  }

  // lookahead scheduler: at 20-30Hz a purr pulse only lasts tens of
  // milliseconds, too fast to trust to a single setTimeout per pulse, so this
  // wakes up every 30ms and schedules any pulses due within the next 160ms
  // using precise AudioParam timestamps — the classic Web Audio scheduling
  // pattern, adapted here because a purr's pulse rate is much faster than any
  // musical tempo this codebase has scheduled before.
  function tick() {
    if (!running) return;
    const now = ctx.currentTime;
    const lookahead = 0.16;
    while (nextPulseAt < now + lookahead) {
      schedulePurrPulse(nextPulseAt, params);
      const jitterFrac = 1 + (Math.random() * 2 - 1) * params.jitter * 0.35;
      nextPulseAt += (1 / params.purrRateHz) * jitterFrac;
    }
    if (params.growl > 0.05 && nextGrowlAt < now + lookahead) {
      if (Math.random() < 0.4 + params.growl * 0.4) scheduleGrowlPulse(nextGrowlAt, params);
      nextGrowlAt = now + lerp(0.55, 0.14, params.growl) * (0.6 + Math.random() * 0.8);
    } else if (params.growl <= 0.05) {
      nextGrowlAt = now + 0.3;
    }
    if (params.chirpRate > 0.03 && nextChirpAt < now) {
      if (Math.random() < 0.3 + params.chirpRate * 0.4) scheduleChirp(now + 0.03, params);
      nextChirpAt = now + lerp(9, 2.2, params.chirpRate) * (0.6 + Math.random() * 0.8);
    } else if (params.chirpRate <= 0.03) {
      nextChirpAt = now + 1;
    }
    schedulerTimer = setTimeout(tick, 30);
  }

  return {
    analyser,
    // called every animation frame from app.js; cheap, no audio-graph work
    // beyond a couple of ramped params the scheduler reads on its next tick
    update(p) {
      params = p;
      const t = ctx.currentTime + 0.05;
      warmth.frequency.linearRampToValueAtTime(Math.max(150, p.warmthHz), t + 0.3);
    },
    start() {
      if (running) return;
      running = true;
      const now = ctx.currentTime;
      nextPulseAt = now + 0.05;
      nextGrowlAt = now + 1;
      nextChirpAt = now + 2;
      playGain.gain.cancelScheduledValues(now);
      playGain.gain.setValueAtTime(playGain.gain.value, now);
      playGain.gain.linearRampToValueAtTime(1, now + 1.3);
      tick();
    },
    stop() {
      running = false;
      if (schedulerTimer) clearTimeout(schedulerTimer);
      schedulerTimer = null;
      const t = ctx.currentTime;
      playGain.gain.cancelScheduledValues(t);
      playGain.gain.setValueAtTime(playGain.gain.value, t);
      playGain.gain.linearRampToValueAtTime(0.0001, t + 0.5);
    },
    setVolume(v) {
      volGain.gain.linearRampToValueAtTime(clamp01(v), ctx.currentTime + 0.05);
    },
  };
}
