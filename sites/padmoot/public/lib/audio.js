// audio.js — the synthesizer. Every voice is pure Web Audio (oscillators +
// filtered noise), no samples, so it works identically on a live AudioContext
// (finger drumming / playback) and an OfflineAudioContext (WAV export) —
// every `play*` function below only touches the `ctx`/`dest` it's handed.
//
// Voices: eight classic drum-machine sounds (kick/snare/hats/clap/toms/rim/
// cowbell/clave/crash) plus one tonal "stab" synth voice that takes a
// frequency, so a pad can also play a note, not just a hit — that's the
// "synthesizer" half of "social synthesizer/beat pad."

export const VOICES = [
  "kick", "snare", "hatClosed", "hatOpen", "clap",
  "tomLow", "tomHigh", "rim", "cowbell", "clave", "crash", "stab",
];

export const VOICE_LABELS = {
  kick: "Kick", snare: "Snare", hatClosed: "Hat (cl)", hatOpen: "Hat (op)",
  clap: "Clap", tomLow: "Tom (lo)", tomHigh: "Tom (hi)", rim: "Rim",
  cowbell: "Cowbell", clave: "Clave", crash: "Crash", stab: "Stab",
};

// A short scale so "stab" pads play something musical, cycling through these
// as different pads/tracks request different `tone` values (0..1 -> note).
const STAB_SCALE = [261.63, 293.66, 329.63, 349.23, 392.0, 440.0, 493.88, 523.25]; // C4 major

function noiseBuffer(ctx, seconds = 1) {
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

// `tone` is a normalized 0..1 knob repurposed per-voice (tune, decay length,
// or scale-degree for `stab`) — one shared control across every voice so the
// UI only needs a single knob per track.
export function playVoice(ctx, dest, voice, time, { volume = 1, tone = 0.5 } = {}) {
  const gain = ctx.createGain();
  gain.gain.value = volume;
  gain.connect(dest);

  switch (voice) {
    case "kick": {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      const startFreq = 120 + tone * 60;
      osc.frequency.setValueAtTime(startFreq, time);
      osc.frequency.exponentialRampToValueAtTime(35, time + 0.15);
      const g = ctx.createGain();
      g.gain.setValueAtTime(1, time);
      g.gain.exponentialRampToValueAtTime(0.001, time + 0.35);
      osc.connect(g).connect(gain);
      osc.start(time);
      osc.stop(time + 0.4);
      break;
    }
    case "snare": {
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuffer(ctx, 0.3);
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 1800 + tone * 1200;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(1, time);
      ng.gain.exponentialRampToValueAtTime(0.01, time + 0.18);
      noise.connect(bp).connect(ng).connect(gain);
      noise.start(time);
      noise.stop(time + 0.2);

      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = 180;
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.6, time);
      og.gain.exponentialRampToValueAtTime(0.001, time + 0.12);
      osc.connect(og).connect(gain);
      osc.start(time);
      osc.stop(time + 0.12);
      break;
    }
    case "hatClosed":
    case "hatOpen": {
      const decay = voice === "hatOpen" ? 0.3 + tone * 0.4 : 0.03 + tone * 0.05;
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuffer(ctx, decay + 0.05);
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 7000;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.8, time);
      ng.gain.exponentialRampToValueAtTime(0.001, time + decay);
      noise.connect(hp).connect(ng).connect(gain);
      noise.start(time);
      noise.stop(time + decay + 0.05);
      break;
    }
    case "clap": {
      for (let i = 0; i < 3; i++) {
        const t = time + i * 0.012;
        const noise = ctx.createBufferSource();
        noise.buffer = noiseBuffer(ctx, 0.15);
        const bp = ctx.createBiquadFilter();
        bp.type = "bandpass";
        bp.frequency.value = 1500 + tone * 800;
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(0.7, t);
        ng.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
        noise.connect(bp).connect(ng).connect(gain);
        noise.start(t);
        noise.stop(t + 0.12);
      }
      break;
    }
    case "tomLow":
    case "tomHigh": {
      const base = voice === "tomHigh" ? 220 : 110;
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(base + tone * 60, time);
      osc.frequency.exponentialRampToValueAtTime(base * 0.6, time + 0.25);
      const g = ctx.createGain();
      g.gain.setValueAtTime(1, time);
      g.gain.exponentialRampToValueAtTime(0.001, time + 0.35);
      osc.connect(g).connect(gain);
      osc.start(time);
      osc.stop(time + 0.4);
      break;
    }
    case "rim": {
      const osc = ctx.createOscillator();
      osc.type = "square";
      osc.frequency.value = 1800;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.4, time);
      g.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
      osc.connect(g).connect(gain);
      osc.start(time);
      osc.stop(time + 0.05);
      break;
    }
    case "cowbell": {
      for (const f of [540, 800]) {
        const osc = ctx.createOscillator();
        osc.type = "square";
        osc.frequency.value = f + tone * 40;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.35, time);
        g.gain.exponentialRampToValueAtTime(0.001, time + 0.3);
        osc.connect(g).connect(gain);
        osc.start(time);
        osc.stop(time + 0.32);
      }
      break;
    }
    case "clave": {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = 2500;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.5, time);
      g.gain.exponentialRampToValueAtTime(0.001, time + 0.06);
      osc.connect(g).connect(gain);
      osc.start(time);
      osc.stop(time + 0.07);
      break;
    }
    case "crash": {
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuffer(ctx, 1.2);
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 5000;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.5, time);
      ng.gain.exponentialRampToValueAtTime(0.001, time + 1.1);
      noise.connect(hp).connect(ng).connect(gain);
      noise.start(time);
      noise.stop(time + 1.2);
      break;
    }
    case "stab":
    default: {
      const idx = Math.min(STAB_SCALE.length - 1, Math.floor(tone * STAB_SCALE.length));
      const freq = STAB_SCALE[idx];
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = freq;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(3000, time);
      lp.frequency.exponentialRampToValueAtTime(400, time + 0.4);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.5, time);
      g.gain.exponentialRampToValueAtTime(0.001, time + 0.45);
      osc.connect(lp).connect(g).connect(gain);
      osc.start(time);
      osc.stop(time + 0.5);
      break;
    }
  }
}

// `tone` for the stab voice snapped to the nearest scale step, used by pad
// UIs that want a note name (e.g. MPC pad labels) rather than a raw 0..1 knob.
export function stabNoteIndex(tone) {
  return Math.min(STAB_SCALE.length - 1, Math.floor(tone * STAB_SCALE.length));
}
export const STAB_NOTE_NAMES = ["C", "D", "E", "F", "G", "A", "B", "C+"];
