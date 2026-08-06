// stillpoint's background music, generated entirely in the browser with the
// Web Audio API — no audio files to fetch, license, or host. A slow pad chord
// (detuned sines through a drifting lowpass filter, the same trick as
// sites/breathingwalls' drone but tuned soft and consonant) plus a heavily
// filtered noise bed for a faint room-tone "hush", and a soft bell for
// session start/end. Never autoplays — only starts from a user gesture.
export class AmbientAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.padNodes = null;
    this.noiseNode = null;
    this.running = false;
  }

  ensureCtx() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
    return this.ctx;
  }

  start(volume = 0.5) {
    const ctx = this.ensureCtx();
    if (this.running) return;
    this.running = true;

    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    master.gain.linearRampToValueAtTime(clamp01(volume) * 0.5, ctx.currentTime + 2.5);
    this.master = master;

    // A soft A-minor-add9 pad: A2, E3, A3, C4, E4 — consonant, no leading
    // tone, so it never resolves anywhere and can sit under speech forever.
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 900;
    filter.connect(master);

    const freqs = [110, 164.81, 220, 261.63, 329.63];
    const oscs = freqs.map((f, i) => {
      const o = ctx.createOscillator();
      o.type = i % 2 === 0 ? "sine" : "triangle";
      o.frequency.value = f * (1 + (Math.random() - 0.5) * 0.003); // tiny detune, avoids a static beat
      const g = ctx.createGain();
      g.gain.value = 0.5 / freqs.length;
      o.connect(g);
      g.connect(filter);
      o.start();
      return o;
    });

    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.045; // one slow swell roughly every 22s
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 450;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();

    this.padNodes = { filter, oscs, lfo, lfoGain };

    // Filtered noise bed — a faint constant hush, like a quiet room, not rain
    // or ocean specifically (kept abstract so it doesn't fight the voice).
    const bufferSize = 2 * ctx.sampleRate;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02; // leaky integrator -> brown-ish noise
      data[i] = last * 3.5;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = "lowpass";
    noiseFilter.frequency.value = 500;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.18;
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(master);
    noise.start();
    this.noiseNode = noise;
  }

  setVolume(volume) {
    if (!this.master || !this.ctx) return;
    this.master.gain.linearRampToValueAtTime(clamp01(volume) * 0.5, this.ctx.currentTime + 0.4);
  }

  stop() {
    if (!this.running || !this.ctx) return;
    const ctx = this.ctx;
    const { master, padNodes, noiseNode } = this;
    if (master) master.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.2);
    setTimeout(() => {
      try {
        padNodes?.oscs.forEach((o) => o.stop());
        padNodes?.lfo.stop();
        noiseNode?.stop();
      } catch {
        // already stopped — fine
      }
    }, 1300);
    this.running = false;
    this.padNodes = null;
    this.noiseNode = null;
    this.master = null;
  }

  // A single soft struck bell — two sines, a fundamental and a quiet fifth
  // overtone, with a slow exponential decay. Used at the start/end of a
  // session as a gentle marker, independent of the pad's own volume.
  chime(volume = 0.35) {
    const ctx = this.ensureCtx();
    const now = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(clamp01(volume), now + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0008, now + 3.2);
    g.connect(ctx.destination);

    [261.63, 392.0].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = f;
      const og = ctx.createGain();
      og.gain.value = i === 0 ? 1 : 0.35;
      o.connect(og);
      og.connect(g);
      o.start(now);
      o.stop(now + 3.3);
    });
  }
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}
