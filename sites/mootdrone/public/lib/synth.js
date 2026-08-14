// synth.js — the generative ambient engine. One `createVoice()` per account:
// a small Web Audio graph, no samples, everything synthesized live.
//
//   LFO rate/depth        <- hash(DID)         (a personal, private tempo)
//   loop cycle length     <- hash(DID, salt)    (how often the voice swells/hits)
//   base note             <- hash(DID, salt)    (picked off a shared pentatonic
//                                                 scale so voices stay consonant)
//   instrument / timbre   <- hash(bio text)     (pad / horn / vox / bell / drumkit)
//   brightness + shimmer  <- posting-activity   (0..1, from lib/cluster.js)
//
// Deterministic: the same DID + bio always produce the same voice, so reloading
// a handle's board sounds the same each time.

// ---- hashing --------------------------------------------------------------

function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function hash32(str, salt = "") {
  return fnv1a(`${salt}::${str}`);
}

const frac = (h) => (h % 100000) / 100000; // deterministic 0..1

// ---- instrument + note picking --------------------------------------------

export const INSTRUMENTS = [
  { key: "pad", label: "pad" },
  { key: "horn", label: "horn" },
  { key: "vox", label: "vox" },
  { key: "bell", label: "bell" },
  { key: "drumkit", label: "drumkit" },
];

export function pickInstrument(bio, fallbackSeed) {
  const seed = (bio && bio.trim()) || fallbackSeed || "quiet";
  const h = hash32(seed, "timbre");
  return INSTRUMENTS[h % INSTRUMENTS.length];
}

// C minor pentatonic across two octaves — whatever notes get hashed out, they
// stay consonant together.
const SCALE = [
  130.81, 155.56, 174.61, 196.0, 233.08, 261.63, 311.13, 349.23, 392.0, 466.16,
];

export function noteForDid(did) {
  return SCALE[hash32(did, "note") % SCALE.length];
}

export function lfoForDid(did) {
  const rateHz = 0.04 + frac(hash32(did, "lfo-rate")) * 0.46; // 0.04–0.5 Hz
  const depth = 0.3 + frac(hash32(did, "lfo-depth")) * 0.7; // 0.3–1.0
  return { rateHz, depth };
}

export function cycleSecondsForDid(did) {
  return 7 + frac(hash32(did, "cycle")) * 13; // 7–20s per loop
}

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
  input.gain.value = 0.8;

  const dry = ctx.createGain();
  dry.gain.value = 0.85;
  const wet = ctx.createGain();
  wet.gain.value = 0.3;

  const convolver = ctx.createConvolver();
  convolver.buffer = impulseResponse(ctx, 3.2, 2.4);

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -20;
  comp.knee.value = 24;
  comp.ratio.value = 3;
  comp.attack.value = 0.02;
  comp.release.value = 0.3;

  input.connect(dry);
  input.connect(convolver);
  convolver.connect(wet);
  dry.connect(comp);
  wet.connect(comp);
  comp.connect(ctx.destination);

  return {
    input,
    setVolume(v) {
      input.gain.linearRampToValueAtTime(v, ctx.currentTime + 0.05);
    },
    // Fan the mixed bus out to a MediaStreamAudioDestination for recording a
    // clip, without touching the speaker path. Call stop() when done to tear
    // down the tap (the node it's connected to keeps working either way).
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

// ---- one voice per account --------------------------------------------------

// Builds the persistent audio graph for one account and returns a controller.
// Nothing makes sound until start() is called (kicks off the loop scheduler)
// *and* the shared AudioContext is running.
export function createVoice(ctx, master, { did, handle, bio, activity = 0.15 }) {
  const instrument = pickInstrument(bio, handle || did);
  const note = noteForDid(did);
  const lfo = lfoForDid(did);
  const cycleSec = cycleSecondsForDid(did);

  // source(s) -> envGain (the per-cycle envelope) -> brightFilter (activity)
  //   -> fader (this track's volume) -> muteGain (mute/solo) -> master
  const envGain = ctx.createGain();
  envGain.gain.value = 0.0001;

  const brightFilter = ctx.createBiquadFilter();
  brightFilter.type = "lowpass";
  brightFilter.Q.value = 0.6;

  const fader = ctx.createGain();
  fader.gain.value = 0.8;

  const muteGain = ctx.createGain();
  muteGain.gain.value = 1;

  // Tapped post-mute so a muted/soloed-out voice reads as silent to anything
  // watching this analyser (the visualizer) without extra bookkeeping.
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.7;

  envGain.connect(brightFilter);
  brightFilter.connect(fader);
  fader.connect(muteGain);
  muteGain.connect(master.input);
  muteGain.connect(analyser);

  // A quiet upper-octave shimmer, always present a little, scaled by posting
  // activity — the "high/mid frequencies from posting activity" bit.
  const shimmer = ctx.createOscillator();
  shimmer.type = "sine";
  shimmer.frequency.value = note * 3;
  const shimmerGain = ctx.createGain();
  shimmerGain.gain.value = 0;
  shimmer.connect(shimmerGain);
  shimmerGain.connect(brightFilter);
  shimmer.start();

  // The DID-hashed LFO. What it modulates depends on the instrument below.
  const lfoOsc = ctx.createOscillator();
  lfoOsc.type = "sine";
  lfoOsc.frequency.value = lfo.rateHz;
  const lfoGain = ctx.createGain();
  lfoOsc.connect(lfoGain);
  lfoOsc.start();

  const sources = [];
  let triggerCycle = () => {};

  if (instrument.key === "pad") {
    const osc1 = ctx.createOscillator();
    osc1.type = "sine";
    osc1.frequency.value = note;
    osc1.detune.value = -6;
    const osc2 = ctx.createOscillator();
    osc2.type = "triangle";
    osc2.frequency.value = note * 1.004;
    osc2.detune.value = 6;
    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.value = 700;
    filt.Q.value = 0.5;
    osc1.connect(filt);
    osc2.connect(filt);
    filt.connect(envGain);
    lfoGain.gain.value = 220 * lfo.depth;
    lfoGain.connect(filt.frequency);
    osc1.start();
    osc2.start();
    sources.push(osc1, osc2);
    triggerCycle = (t, cyc) => {
      const atk = cyc * 0.35,
        rel = cyc * 0.45,
        peak = 0.5;
      envGain.gain.cancelScheduledValues(t);
      envGain.gain.setValueAtTime(envGain.gain.value, t);
      envGain.gain.linearRampToValueAtTime(peak, t + atk);
      envGain.gain.setValueAtTime(peak, t + cyc - rel);
      envGain.gain.linearRampToValueAtTime(0.0001, t + cyc - 0.02);
    };
  } else if (instrument.key === "horn") {
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = note;
    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.value = note * 3;
    filt.Q.value = 3;
    osc.connect(filt);
    filt.connect(envGain);
    lfoGain.gain.value = 9 * lfo.depth; // slow vibrato, in cents
    lfoGain.connect(osc.detune);
    osc.start();
    sources.push(osc);
    triggerCycle = (t, cyc) => {
      const atk = cyc * 0.5,
        rel = cyc * 0.35,
        peak = 0.4;
      envGain.gain.cancelScheduledValues(t);
      envGain.gain.setValueAtTime(envGain.gain.value, t);
      envGain.gain.linearRampToValueAtTime(peak, t + atk);
      envGain.gain.setValueAtTime(peak, t + cyc - rel);
      envGain.gain.linearRampToValueAtTime(0.0001, t + cyc - 0.02);
    };
  } else if (instrument.key === "vox") {
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = note;
    const f1 = ctx.createBiquadFilter();
    f1.type = "bandpass";
    f1.frequency.value = 700;
    f1.Q.value = 6;
    const f2 = ctx.createBiquadFilter();
    f2.type = "bandpass";
    f2.frequency.value = 1200;
    f2.Q.value = 8;
    osc.connect(f1);
    osc.connect(f2);
    f1.connect(envGain);
    f2.connect(envGain);
    lfoGain.gain.value = 260 * lfo.depth; // morphs the first formant, vowel-ish
    lfoGain.connect(f1.frequency);
    osc.start();
    sources.push(osc);
    triggerCycle = (t, cyc) => {
      const atk = cyc * 0.25,
        rel = cyc * 0.35,
        peak = 0.4;
      envGain.gain.cancelScheduledValues(t);
      envGain.gain.setValueAtTime(envGain.gain.value, t);
      envGain.gain.linearRampToValueAtTime(peak, t + atk);
      envGain.gain.setValueAtTime(peak, t + cyc - rel);
      envGain.gain.linearRampToValueAtTime(0.0001, t + cyc - 0.02);
    };
  } else if (instrument.key === "bell") {
    const carrier = ctx.createOscillator();
    carrier.type = "sine";
    carrier.frequency.value = note * 2;
    const modulator = ctx.createOscillator();
    modulator.type = "sine";
    modulator.frequency.value = note * 2.76;
    const modGain = ctx.createGain();
    modGain.gain.value = note * 1.4;
    modulator.connect(modGain);
    modGain.connect(carrier.frequency);
    carrier.connect(envGain);
    carrier.start();
    modulator.start();
    sources.push(carrier, modulator);
    lfoGain.gain.value = 0; // LFO shows up as loop-timing spread instead, below
    triggerCycle = (t, cyc) => {
      envGain.gain.cancelScheduledValues(t);
      envGain.gain.setValueAtTime(0.0001, t);
      const hits = 1 + Math.floor(lfo.depth * 3); // 1–3 hits/cycle
      for (let i = 0; i < hits; i++) {
        const ht = t + cyc * (i / hits);
        envGain.gain.setValueAtTime(0.0001, ht);
        envGain.gain.exponentialRampToValueAtTime(0.5, ht + 0.006);
        envGain.gain.exponentialRampToValueAtTime(
          0.0001,
          ht + Math.min(1.4, (cyc / hits) * 0.9),
        );
      }
    };
  } else {
    // drumkit: filtered noise bursts
    const bufSize = Math.floor(ctx.sampleRate * 2);
    const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    noise.loop = true;
    const filt = ctx.createBiquadFilter();
    filt.type = "bandpass";
    filt.frequency.value = 140 + (Math.round(note) % 220);
    filt.Q.value = 1.2;
    noise.connect(filt);
    filt.connect(envGain);
    noise.start();
    sources.push(noise);
    lfoGain.gain.value = 0;
    triggerCycle = (t, cyc) => {
      envGain.gain.cancelScheduledValues(t);
      envGain.gain.setValueAtTime(0.0001, t);
      const hits = 3 + Math.floor(lfo.depth * 5); // 3–8 hits/cycle
      for (let i = 0; i < hits; i++) {
        const ht = t + cyc * (i / hits);
        envGain.gain.setValueAtTime(0.0001, ht);
        envGain.gain.exponentialRampToValueAtTime(0.35, ht + 0.003);
        envGain.gain.exponentialRampToValueAtTime(0.0001, ht + 0.12);
      }
    };
  }

  function applyActivity(a) {
    const now = ctx.currentTime;
    const cutoff = 350 + a * 4200; // 350–4550 Hz: quiet accounts stay muffled
    brightFilter.frequency.cancelScheduledValues(now);
    brightFilter.frequency.linearRampToValueAtTime(cutoff, now + 1.5);
    shimmerGain.gain.cancelScheduledValues(now);
    shimmerGain.gain.linearRampToValueAtTime(a * 0.05, now + 1.5);
  }
  applyActivity(activity);
  brightFilter.frequency.value = 350 + activity * 4200;

  let timer = null;
  let looping = true;

  function runCycle() {
    const t = ctx.currentTime + 0.05;
    triggerCycle(t, cycleSec);
    timer = setTimeout(() => {
      timer = null;
      if (looping) runCycle();
    }, cycleSec * 1000);
  }

  return {
    instrument: instrument.key,
    note,
    lfo,
    cycleSec,
    analyser,
    setVolume(v) {
      fader.gain.linearRampToValueAtTime(v, ctx.currentTime + 0.05);
    },
    setAudible(v) {
      muteGain.gain.linearRampToValueAtTime(v ? 1 : 0, ctx.currentTime + 0.05);
    },
    setActivity: applyActivity,
    setLoop(v) {
      looping = v;
      if (v && timer === null) runCycle();
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
      try {
        shimmer.stop();
      } catch {}
      try {
        lfoOsc.stop();
      } catch {}
    },
  };
}

// ---- binaural base tone -------------------------------------------------
// An optional layer, independent of the account voices: two pure sine tones,
// one per ear, offset by a brainwave-band frequency so the two ears'
// difference is perceived as a slow pulsing "beat" (needs headphones/stereo
// speakers). Ported from sites/vadrone/public/lib/synth.js, at
// @antiali.as's request ("add vadrone options to mootdrone") — same board,
// same ctx.suspend()/resume() transport, so the radio picks the band and the
// board's own play/pause silences it along with everything else. Kept on its
// own bus straight to ctx.destination rather than through the board's
// convolution reverb, since the reverb would smear the strict left/right
// separation the illusion depends on.
export const TONE_BANDS = {
  none: 0,
  alpha: 10,
  beta: 20,
  delta: 2,
  theta: 6,
};
const BINAURAL_CARRIER_HZ = 180;

export function createBinaural(ctx) {
  const merger = ctx.createChannelMerger(2);
  const outGain = ctx.createGain();
  outGain.gain.value = 0;

  const leftOsc = ctx.createOscillator();
  leftOsc.type = "sine";
  leftOsc.frequency.value = BINAURAL_CARRIER_HZ;
  const rightOsc = ctx.createOscillator();
  rightOsc.type = "sine";
  rightOsc.frequency.value = BINAURAL_CARRIER_HZ;

  leftOsc.connect(merger, 0, 0);
  rightOsc.connect(merger, 0, 1);
  merger.connect(outGain);
  outGain.connect(ctx.destination);
  leftOsc.start();
  rightOsc.start();

  let band = "none";
  let volScale = 0.8;

  function apply() {
    const t = ctx.currentTime + 0.15;
    const beat = TONE_BANDS[band] || 0;
    if (!beat) {
      outGain.gain.linearRampToValueAtTime(0, t);
      return;
    }
    rightOsc.frequency.linearRampToValueAtTime(BINAURAL_CARRIER_HZ + beat, t);
    outGain.gain.linearRampToValueAtTime(0.16 * volScale, t);
  }

  return {
    setBand(b) {
      band = b;
      apply();
    },
    setVolume(v) {
      volScale = v;
      apply();
    },
    stop() {
      try {
        leftOsc.stop();
        rightOsc.stop();
      } catch {}
    },
  };
}
