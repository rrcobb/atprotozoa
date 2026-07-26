// synth.js — the generative ambient engine, in the vein of Eno's "Music for
// Airports": independent voices, each on its own long loop cycle, drift in
// and out of phase against each other forever (the cycles are irrational
// relative to one another, so the piece never repeats the same way twice).
//
// No samples — everything is synthesized live with Web Audio. Adapted from
// sites/mootdrone/public/lib/synth.js: same voice/master graph, but voices
// are generated from a seeded random ensemble (see tracks.js) instead of a
// hashed Bluesky DID/bio.

// ---- seeded RNG -------------------------------------------------------

// mulberry32 — small, fast, deterministic: same seed always produces the
// same ensemble, so a track "sounds like itself" across reloads, but a
// reseed gives a genuinely new arrangement.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
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

export function createMaster(ctx, { wet = 0.34, tail = 4.2 } = {}) {
  const input = ctx.createGain();
  input.gain.value = 0.8;

  const dry = ctx.createGain();
  dry.gain.value = 0.82;
  const wetGain = ctx.createGain();
  wetGain.gain.value = wet;

  const convolver = ctx.createConvolver();
  convolver.buffer = impulseResponse(ctx, tail, 2.2);

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
    // Fan the mixed bus out to a MediaStreamAudioDestination for recording a
    // clip, without touching the speaker path.
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
    // Tears down this bus's connection to the speakers — call when swapping
    // in a fresh master (e.g. a track with different reverb settings) so the
    // old convolver/compressor chain doesn't linger connected forever.
    dispose() {
      try {
        comp.disconnect();
      } catch {}
    },
  };
}

// ---- one voice --------------------------------------------------------

// Builds the persistent audio graph for one voice and returns a controller.
// Nothing makes sound until start() is called *and* the shared AudioContext
// is running. `spec` comes from tracks.js: { instrument, note, cycleSec,
// lfoRateHz, lfoDepth, brightness }.
export function createVoice(ctx, master, spec) {
  const { instrument, note, cycleSec } = spec;
  const lfo = { rateHz: spec.lfoRateHz, depth: spec.lfoDepth };
  const brightness = spec.brightness ?? 0.5;

  const envGain = ctx.createGain();
  envGain.gain.value = 0.0001;

  const brightFilter = ctx.createBiquadFilter();
  brightFilter.type = "lowpass";
  brightFilter.Q.value = 0.6;
  brightFilter.frequency.value = 350 + brightness * 4200;

  const fader = ctx.createGain();
  fader.gain.value = 0.8;

  const muteGain = ctx.createGain();
  muteGain.gain.value = 1;

  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.7;

  envGain.connect(brightFilter);
  brightFilter.connect(fader);
  fader.connect(muteGain);
  muteGain.connect(master.input);
  muteGain.connect(analyser);

  const lfoOsc = ctx.createOscillator();
  lfoOsc.type = "sine";
  lfoOsc.frequency.value = lfo.rateHz;
  const lfoGain = ctx.createGain();
  lfoOsc.connect(lfoGain);
  lfoOsc.start();

  const sources = [];
  let triggerCycle = () => {};
  let alwaysOn = false; // "hum" doesn't cycle — it just sits under everything

  if (instrument === "pad") {
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
  } else if (instrument === "horn") {
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = note;
    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.value = note * 3;
    filt.Q.value = 3;
    osc.connect(filt);
    filt.connect(envGain);
    lfoGain.gain.value = 9 * lfo.depth;
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
  } else if (instrument === "vox") {
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
    lfoGain.gain.value = 260 * lfo.depth;
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
  } else if (instrument === "bell") {
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
    lfoGain.gain.value = 0;
    triggerCycle = (t, cyc) => {
      envGain.gain.cancelScheduledValues(t);
      envGain.gain.setValueAtTime(0.0001, t);
      const hits = 1 + Math.floor(lfo.depth * 3);
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
  } else if (instrument === "chime") {
    // A two-note gate-chime motif (descending fourth, like the classic
    // airport/elevator "ding-dong") instead of a single struck pitch —
    // rare, one hit per cycle, so it reads as an announcement cue drifting
    // through the piece rather than a percussion part.
    const lowNote = note * (2 / 3);
    const carrier = ctx.createOscillator();
    carrier.type = "sine";
    carrier.frequency.value = note * 2;
    const modulator = ctx.createOscillator();
    modulator.type = "sine";
    modulator.frequency.value = note * 3.2;
    const modGain = ctx.createGain();
    modGain.gain.value = note * 0.8;
    modulator.connect(modGain);
    modGain.connect(carrier.frequency);
    carrier.connect(envGain);
    carrier.start();
    modulator.start();
    sources.push(carrier, modulator);
    lfoGain.gain.value = 0;
    triggerCycle = (t, cyc) => {
      envGain.gain.cancelScheduledValues(t);
      carrier.frequency.cancelScheduledValues(t);
      envGain.gain.setValueAtTime(0.0001, t);
      carrier.frequency.setValueAtTime(note * 2, t);
      envGain.gain.exponentialRampToValueAtTime(0.42, t + 0.008);
      envGain.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
      const t2 = t + 0.75;
      carrier.frequency.setValueAtTime(lowNote * 2, t2);
      envGain.gain.setValueAtTime(0.0001, t2);
      envGain.gain.exponentialRampToValueAtTime(0.34, t2 + 0.008);
      envGain.gain.exponentialRampToValueAtTime(0.0001, t2 + 1.6);
    };
  } else if (instrument === "hum") {
    // Distant terminal hum — filtered noise, always on, never cycles. The
    // "cycleSec" instead sets a very slow swell so it breathes rather than
    // sitting perfectly static.
    alwaysOn = true;
    const bufSize = Math.floor(ctx.sampleRate * 4);
    const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < bufSize; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02; // brown-ish noise, softer than white
      data[i] = last * 3.5;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    noise.loop = true;
    const filt = ctx.createBiquadFilter();
    filt.type = "bandpass";
    filt.frequency.value = Math.max(60, note / 2);
    filt.Q.value = 0.9;
    noise.connect(filt);
    filt.connect(envGain);
    noise.start();
    sources.push(noise);
    lfoGain.gain.value = 60 * lfo.depth;
    lfoGain.connect(filt.frequency);
    envGain.gain.value = 0.16;
    triggerCycle = (t, cyc) => {
      envGain.gain.cancelScheduledValues(t);
      envGain.gain.setValueAtTime(envGain.gain.value, t);
      envGain.gain.linearRampToValueAtTime(0.22, t + cyc / 2);
      envGain.gain.linearRampToValueAtTime(0.12, t + cyc);
    };
  } else {
    // drumkit-ish filtered noise bursts, kept for variety on busier tracks
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
      const hits = 3 + Math.floor(lfo.depth * 5);
      for (let i = 0; i < hits; i++) {
        const ht = t + cyc * (i / hits);
        envGain.gain.setValueAtTime(0.0001, ht);
        envGain.gain.exponentialRampToValueAtTime(0.35, ht + 0.003);
        envGain.gain.exponentialRampToValueAtTime(0.0001, ht + 0.12);
      }
    };
  }

  let timer = null;
  let looping = true;

  function runCycle() {
    const t = ctx.currentTime + 0.05;
    triggerCycle(t, cycleSec);
    timer = setTimeout(
      () => {
        timer = null;
        if (looping) runCycle();
      },
      cycleSec * 1000,
    );
  }

  return {
    instrument,
    note,
    cycleSec,
    alwaysOn,
    analyser,
    setVolume(v) {
      fader.gain.linearRampToValueAtTime(v, ctx.currentTime + 0.05);
    },
    setAudible(v) {
      muteGain.gain.linearRampToValueAtTime(v ? 1 : 0, ctx.currentTime + 0.05);
    },
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
        lfoOsc.stop();
      } catch {}
    },
  };
}
