// synth.js — a small ensemble of Web Audio drones, in the vein of Eno's
// "Music for Airports": each voice loops on its own irrational cycle length
// so they drift in and out of phase forever. Adapted from
// sites/code-for-airports/public/lib/synth.js, but instead of a seeded
// static ensemble, every voice's pitch, tempo, brightness and register track
// a continuous Valence/Arousal/Dominance position in real time — dragging
// the triangle bends the drone while it plays, it doesn't just pick a preset.

// ---- master bus: a little algorithmic reverb + a limiter ------------------

function impulseResponse(ctx, seconds, decay) {
  const rate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(rate * seconds));
  const impulse = ctx.createBuffer(2, length, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  return impulse;
}

export function createMaster(ctx) {
  const input = ctx.createGain();
  input.gain.value = 0.85;

  const dry = ctx.createGain();
  const wetGain = ctx.createGain();

  const convolver = ctx.createConvolver();
  convolver.buffer = impulseResponse(ctx, 4.4, 2.2);

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -20;
  comp.knee.value = 24;
  comp.ratio.value = 3;
  comp.attack.value = 0.02;
  comp.release.value = 0.3;

  input.connect(dry);
  input.connect(convolver);
  convolver.connect(wetGain);
  dry.connect(comp);
  wetGain.connect(comp);
  comp.connect(ctx.destination);

  return {
    input,
    setVolume(v) {
      input.gain.linearRampToValueAtTime(v, ctx.currentTime + 0.05);
    },
    // dominance drives this: a confident/dominant mood sits drier and more
    // forward, a submissive one washes out into a bigger, wetter room.
    setWet(wet) {
      const t = ctx.currentTime + 0.4;
      dry.gain.linearRampToValueAtTime(1 - wet * 0.55, t);
      wetGain.gain.linearRampToValueAtTime(wet, t);
    },
    tapForRecording() {
      const dest = ctx.createMediaStreamDestination();
      comp.connect(dest);
      return {
        stream: dest.stream,
        stop() {
          try {
            comp.disconnect(dest);
          } catch {}
        },
      };
    },
  };
}

// ---- VAD -> sound parameters -------------------------------------------

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (x) => Math.max(0, Math.min(1, x));

// Semitone offsets from the root. Consonant = major pentatonic (the same
// "no wrong notes" set Eno leaned on); dissonant = a tense cluster (minor
// 2nd, tritone, minor 6th) that each voice's note glides toward as valence
// drops. The glide passes through microtonal in-between pitches on the way
// — an unhappy drag doesn't jump-cut to a new chord, it bends there.
const CONSONANT_DEGREES = [0, 4, 7, 11, 14]; // root, 3rd, 5th, maj7, 9th
const DISSONANT_DEGREES = [0, 1, 6, 8, 13]; // root, m2, tritone, m6, b9-up-an-octave

// Computes the live parameter set from a barycentric VAD position. Called
// every animation frame from app.js with the latest drag position; cheap
// pure math, no audio-graph work.
export function paramsFromVAD(v, a, d) {
  v = clamp01(v);
  a = clamp01(a);
  d = clamp01(d);
  return {
    // low dominance = airy/high register, high dominance = a heavy, low root
    rootFreq: lerp(220, 55, d),
    // base swell length in seconds; voices multiply this by their own
    // irrational ratio so they don't lock into a shared pulse
    baseCycleSec: lerp(22, 3.5, a),
    // how far each voice's note has glided from its consonant pentatonic
    // degree toward its dissonant one
    tension: 1 - v,
    // lowpass cutoff: bright/present when happy and assertive, muffled and
    // dark when unhappy and submissive
    brightHz: 260 + v * 2600 + d * 700,
    // struck-note density on the bell/chime voices
    hitDensity: a,
    // hum register: deep rumble when dominant, thin whistle when not
    humHz: lerp(1100, 90, d),
    humLevel: 0.1 + d * 0.16,
    wet: lerp(0.46, 0.22, d),
  };
}

export function degreeFreq(rootFreq, degreeIdx, tension) {
  const semis = lerp(CONSONANT_DEGREES[degreeIdx], DISSONANT_DEGREES[degreeIdx], tension);
  return rootFreq * Math.pow(2, semis / 12);
}

// ---- one voice --------------------------------------------------------

// A persistent audio graph. `opts.role` picks the instrument body; `opts`
// carries per-voice constants (which pentatonic degree, how its cycle
// length relates to the shared base, an octave offset). Everything that
// should react to VAD is pushed in continuously via update(params).
export function createVoice(ctx, master, opts) {
  const { role, degreeIdx = 0, cycleMul = 1, octave = 0 } = opts;

  const envGain = ctx.createGain();
  envGain.gain.value = 0.0001;

  const brightFilter = ctx.createBiquadFilter();
  brightFilter.type = "lowpass";
  brightFilter.Q.value = 0.6;
  brightFilter.frequency.value = 800;

  const fader = ctx.createGain();
  fader.gain.value = role === "hum" ? 1 : 0.8;

  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.7;

  envGain.connect(brightFilter);
  brightFilter.connect(fader);
  fader.connect(master.input);
  fader.connect(analyser);

  let latestFreq = 220;
  let cycleSec = 8;
  let hitDensity = 0.3;
  let humLevel = 0.16;

  const sources = [];
  let setTargetFreq = () => {};

  if (role === "pad") {
    const osc1 = ctx.createOscillator();
    osc1.type = "sine";
    osc1.detune.value = -6;
    const osc2 = ctx.createOscillator();
    osc2.type = "triangle";
    osc2.detune.value = 6;
    osc1.connect(envGain);
    osc2.connect(envGain);
    osc1.start();
    osc2.start();
    sources.push(osc1, osc2);
    setTargetFreq = (f, t) => {
      osc1.frequency.linearRampToValueAtTime(f, t);
      osc2.frequency.linearRampToValueAtTime(f * 1.004, t);
    };
  } else if (role === "bell") {
    const carrier = ctx.createOscillator();
    carrier.type = "sine";
    const modulator = ctx.createOscillator();
    modulator.type = "sine";
    const modGain = ctx.createGain();
    modulator.connect(modGain);
    modGain.connect(carrier.frequency);
    carrier.connect(envGain);
    carrier.start();
    modulator.start();
    sources.push(carrier, modulator);
    setTargetFreq = (f, t) => {
      // bells restrike each cycle, so retune instantly at the strike instead
      // of gliding mid-ring
      modulator.frequency.setValueAtTime(f * 2.76, t);
      modGain.gain.setValueAtTime(f * 1.3, t);
      latestFreq = f;
    };
  } else if (role === "hum") {
    const bufSize = Math.floor(ctx.sampleRate * 4);
    const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < bufSize; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    noise.loop = true;
    const humFilter = ctx.createBiquadFilter();
    humFilter.type = "bandpass";
    humFilter.Q.value = 0.9;
    noise.connect(humFilter);
    humFilter.connect(envGain);
    noise.start();
    sources.push(noise);
    envGain.gain.value = 0.16;
    setTargetFreq = (f, t) => {
      humFilter.frequency.linearRampToValueAtTime(Math.max(40, f), t);
    };
  }

  let timer = null;
  let looping = true;

  function runCycle() {
    const t = ctx.currentTime + 0.05;
    const cyc = cycleSec;
    if (role === "pad") {
      const atk = cyc * 0.35,
        rel = cyc * 0.45,
        peak = 0.42;
      envGain.gain.cancelScheduledValues(t);
      envGain.gain.setValueAtTime(envGain.gain.value, t);
      envGain.gain.linearRampToValueAtTime(peak, t + atk);
      envGain.gain.setValueAtTime(peak, t + cyc - rel);
      envGain.gain.linearRampToValueAtTime(0.0001, t + cyc - 0.02);
    } else if (role === "bell") {
      setTargetFreq(latestFreq, t);
      const hits = 1 + Math.floor(hitDensity * 3);
      for (let i = 0; i < hits; i++) {
        const ht = t + cyc * (i / hits);
        envGain.gain.setValueAtTime(0.0001, ht);
        envGain.gain.exponentialRampToValueAtTime(0.4, ht + 0.006);
        envGain.gain.exponentialRampToValueAtTime(0.0001, ht + Math.min(1.6, (cyc / hits) * 0.9));
      }
    } else if (role === "hum") {
      envGain.gain.cancelScheduledValues(t);
      envGain.gain.setValueAtTime(envGain.gain.value, t);
      envGain.gain.linearRampToValueAtTime(humLevel * 1.3, t + cyc / 2);
      envGain.gain.linearRampToValueAtTime(humLevel * 0.85, t + cyc);
    }
    timer = setTimeout(
      () => {
        timer = null;
        if (looping) runCycle();
      },
      cyc * 1000,
    );
  }

  return {
    role,
    analyser,
    // Called ~every animation frame with the live global params; ramps
    // everything continuously except a bell's pitch, which is intentionally
    // only retuned right as it strikes (see setTargetFreq above).
    update(params) {
      const t = ctx.currentTime + 0.08;
      const f = degreeFreq(params.rootFreq * Math.pow(2, octave), degreeIdx, params.tension);
      if (role === "hum") {
        setTargetFreq(params.humHz, t);
        humLevel = params.humLevel;
      } else if (role !== "bell") {
        setTargetFreq(f, t);
      } else {
        latestFreq = f;
      }
      brightFilter.frequency.linearRampToValueAtTime(
        Math.max(120, params.brightHz * (role === "hum" ? 0.5 : 1)),
        t,
      );
      cycleSec = Math.max(1.2, params.baseCycleSec * cycleMul);
      hitDensity = params.hitDensity;
    },
    setVolume(v) {
      fader.gain.linearRampToValueAtTime(v, ctx.currentTime + 0.05);
    },
    start() {
      if (timer === null && looping) runCycle();
    },
    stop() {
      if (timer) clearTimeout(timer);
      timer = null;
      looping = false;
      for (const s of sources) {
        try {
          s.stop();
        } catch {}
      }
    },
  };
}

// The fixed little ensemble: a low pad on the root, a higher pad on the
// third, a bell on the fifth, a chime up on the ninth, and a hum underneath
// tying the register together. cycleMul values are irrational-ish relative
// to each other (not clean small-integer ratios) so the voices, all driven
// by the same arousal-derived base tempo, still drift in and out of phase.
export const ENSEMBLE = [
  { role: "pad", label: "low pad", degreeIdx: 0, cycleMul: 1, octave: -1 },
  { role: "pad", label: "high pad", degreeIdx: 1, cycleMul: 1.37, octave: 0 },
  { role: "bell", label: "bell", degreeIdx: 2, cycleMul: 0.71, octave: 1 },
  { role: "bell", label: "chime", degreeIdx: 3, cycleMul: 1.93, octave: 1 },
  { role: "hum", label: "hum", degreeIdx: 0, cycleMul: 2.6, octave: -2 },
];
