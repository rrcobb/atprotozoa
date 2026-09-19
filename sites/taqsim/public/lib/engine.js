// The taqsim generative engine — overlapping drone voices in a chosen maqam,
// an optional synthesized dumbek backing, and a rolling capture buffer so the
// last N seconds of whatever just played can be clipped out as a WAV.
//
// Everything here is Web Audio; it only runs in a browser. Pure scale/rhythm
// math lives in theory.js and the WAV bytes live in wav.js so both can be
// unit-tested under node without a real AudioContext.
import { MAQAMAT, IQAAT, IQA_KEYS, degreeFreq, pickDegree } from "./theory.js";
import { encodeWav, readRingTail } from "./wav.js";

// The clip control is capped at 60s because the ring buffer backing it is a
// fixed-size Float32Array (sized to the cap * sample rate up front) — a
// browser-memory bound on a live capture feature, not a limit on how much
// data is read from anywhere. 60s * 48kHz * 4 bytes is ~11MB, comfortably
// small, and matches the max the "clip last N seconds" slider offers.
export const MAX_CLIP_SECONDS = 60;

// A voice's full attack+sustain+release is clamped to at least this long, so
// every drone tone genuinely overlaps the next one rather than popping in
// and out — "overlapping drones" was the ask, not just long notes.
const MIN_VOICE_SECONDS = 20;

export class TaqsimEngine {
  constructor() {
    this.ctx = null;
    this.running = false;
    this.maqamKey = "rast";
    this.tonicHz = 196; // G3 — a comfortable, low-ish center for overlapping drones
    this.dumbekOn = true;
    this.dumbekBpm = 84;
    this.chosenIqaKey = null;
    this._timers = [];
    this._voiceGenId = 0;
  }

  get maqam() {
    return MAQAMAT[this.maqamKey];
  }

  setMaqam(key) {
    if (MAQAMAT[key]) this.maqamKey = key;
  }

  setDumbekEnabled(on) {
    this.dumbekOn = on;
    if (this._percGain) {
      const t = this.ctx.currentTime;
      this._percGain.gain.cancelScheduledValues(t);
      this._percGain.gain.linearRampToValueAtTime(on ? 1 : 0, t + 0.4);
    }
  }

  setMasterVolume(v) {
    if (this._masterOut) {
      this._masterOut.gain.linearRampToValueAtTime(v, this.ctx.currentTime + 0.1);
    }
  }

  async start(opts = {}) {
    if (this.running) return;
    if (opts.maqamKey) this.maqamKey = opts.maqamKey;
    if (typeof opts.dumbekOn === "boolean") this.dumbekOn = opts.dumbekOn;
    if (opts.tonicHz) this.tonicHz = opts.tonicHz;

    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === "suspended") await this.ctx.resume();
    this.running = true;

    this._buildGraph();
    this._buildCapture();
    this._startDrones();
    // The dumbek sequencer always runs once chosen; setDumbekEnabled only
    // rides the percussion bus gain, so toggling it on later doesn't need to
    // spin up a second sequencer instance.
    this.chosenIqaKey = pickIqaKey();
    this._startDumbek(this.chosenIqaKey);

    return { iqaKey: this.chosenIqaKey };
  }

  async stop() {
    if (!this.running) return;
    this.running = false;
    this._timers.forEach((id) => clearTimeout(id));
    this._timers = [];
    if (this._dumbekInterval) clearInterval(this._dumbekInterval);
    const ctx = this.ctx;
    const t = ctx.currentTime;
    if (this._masterOut) this._masterOut.gain.linearRampToValueAtTime(0, t + 1.2);
    await new Promise((r) => setTimeout(r, 1300));
    await ctx.close();
    this.ctx = null;
  }

  // ── signal graph ────────────────────────────────────────────────────
  _buildGraph() {
    const ctx = this.ctx;

    const droneBus = ctx.createGain();
    droneBus.gain.value = 1;

    const masterFilter = ctx.createBiquadFilter();
    masterFilter.type = "lowpass";
    masterFilter.frequency.value = 2200;
    droneBus.connect(masterFilter);

    // Slow-drifting cutoff so the drone bed never sits perfectly still.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.03 + Math.random() * 0.03;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 900;
    lfo.connect(lfoGain);
    lfoGain.connect(masterFilter.frequency);
    lfo.start();

    const convolver = ctx.createConvolver();
    convolver.buffer = makeReverbImpulse(ctx, 3.2, 2.4);
    const wet = ctx.createGain();
    wet.gain.value = 0.32;
    const dry = ctx.createGain();
    dry.gain.value = 0.85;
    masterFilter.connect(dry);
    masterFilter.connect(convolver);
    convolver.connect(wet);

    const percGain = ctx.createGain();
    percGain.gain.value = this.dumbekOn ? 1 : 0;
    const percReverbSend = ctx.createGain();
    percReverbSend.gain.value = 0.15;
    percGain.connect(percReverbSend);
    percReverbSend.connect(convolver);

    const masterOut = ctx.createGain();
    masterOut.gain.value = 0;
    dry.connect(masterOut);
    wet.connect(masterOut);
    percGain.connect(masterOut);
    masterOut.connect(ctx.destination);
    masterOut.gain.linearRampToValueAtTime(0.7, ctx.currentTime + 2.5);

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    masterOut.connect(analyser);

    this._droneBus = droneBus;
    this._percGain = percGain;
    this._masterOut = masterOut;
    this._lfo = lfo;
    this.analyser = analyser;
    this._noiseBuffer = makeNoiseBuffer(ctx, 1.5);
  }

  _buildCapture() {
    const ctx = this.ctx;
    const ringLen = MAX_CLIP_SECONDS * ctx.sampleRate;
    this._ring = new Float32Array(ringLen);
    this._ringWrite = 0;
    this._ringWritten = 0;

    // ScriptProcessorNode is deprecated but remains the simplest way to tap
    // raw samples for the clip buffer across every evergreen browser; an
    // AudioWorklet would need a second module file and a message-passing
    // round trip for no benefit at this buffer size.
    const tap = ctx.createScriptProcessor(4096, 1, 1);
    tap.onaudioprocess = (e) => {
      const input = e.inputBuffer.getChannelData(0);
      const ring = this._ring;
      let w = this._ringWrite;
      for (let i = 0; i < input.length; i++) {
        ring[w] = input[i];
        w = (w + 1) % ring.length;
      }
      this._ringWrite = w;
      this._ringWritten += input.length;
    };
    this._masterOut.connect(tap);
    const mute = ctx.createGain();
    mute.gain.value = 0; // tap must connect somewhere to keep pulling audio, but stays silent
    tap.connect(mute);
    mute.connect(ctx.destination);
    this._tap = tap;
  }

  // captured seconds may be less than requested if playback hasn't run long
  // enough yet; the caller (UI) reports back whatever actually came out.
  captureClip(seconds) {
    if (!this.ctx) return null;
    const count = Math.round(Math.min(seconds, MAX_CLIP_SECONDS) * this.ctx.sampleRate);
    const samples = readRingTail(this._ring, this._ringWrite, this._ringWritten, count);
    const wav = encodeWav(samples, this.ctx.sampleRate, 1);
    return {
      blob: new Blob([wav], { type: "audio/wav" }),
      seconds: samples.length / this.ctx.sampleRate,
    };
  }

  // ── drones ───────────────────────────────────────────────────────────
  _startDrones() {
    this._runPedal();
    // Two independently wandering voices, one quieter than the other so
    // they read as foreground/background rather than a unison doubling.
    // Each schedules its own next note at a randomized fraction of its own
    // duration, so they drift apart in phase on their own without needing
    // an explicit start-time offset.
    this._runVoice(1);
    this._runVoice(0.55);
  }

  _runPedal() {
    if (!this.running) return;
    const ctx = this.ctx;
    const freq = degreeFreq(this.tonicHz, this.maqam, 0, -1); // tonic, one octave down
    const shape = randomVoiceShape(0.7); // pedal tones lean long and slow
    scheduleVoice(ctx, this._droneBus, freq, shape, this._noiseBuffer);
    const nextIn = shape.total * (0.55 + Math.random() * 0.15); // overlap the next pedal note
    this._timers.push(setTimeout(() => this._runPedal(), nextIn * 1000));
  }

  _runVoice(volumeScale) {
    if (!this.running) return;
    const ctx = this.ctx;
    let lastDegree = Math.floor(Math.random() * (this.maqam.degrees.length - 1));
    const step = () => {
      if (!this.running) return;
      lastDegree = pickDegree(this.maqam, lastDegree);
      const octave = Math.random() < 0.25 ? 1 : 0;
      const freq = degreeFreq(this.tonicHz, this.maqam, lastDegree, octave);
      const shape = randomVoiceShape(volumeScale);
      scheduleVoice(ctx, this._droneBus, freq, shape, this._noiseBuffer);
      const nextIn = shape.total * (0.4 + Math.random() * 0.3);
      this._timers.push(setTimeout(step, nextIn * 1000));
    };
    step();
  }

  // ── dumbek ───────────────────────────────────────────────────────────
  _startDumbek(iqaKey) {
    const ctx = this.ctx;
    const pattern = IQAAT[iqaKey].pattern;
    let step = 0;
    let nextStepTime = ctx.currentTime + 0.1;
    const lookahead = 0.1;

    const tick = () => {
      if (!this.running) return;
      // Read the tempo live each tick so the tempo slider takes effect on
      // the very next step instead of only at the moment playback started.
      const stepSeconds = 60 / this.dumbekBpm / 2; // 8th notes
      while (nextStepTime < ctx.currentTime + lookahead) {
        const c = pattern[step % pattern.length];
        if (c === "D") synthDum(ctx, this._percGain, nextStepTime);
        else if (c === "T") synthTek(ctx, this._percGain, nextStepTime, this._noiseBuffer, 1);
        else if (c === "k") synthTek(ctx, this._percGain, nextStepTime, this._noiseBuffer, 0.35);
        nextStepTime += stepSeconds;
        step++;
      }
    };
    this._dumbekInterval = setInterval(tick, 25);
    tick();
  }
}

function pickIqaKey(rng = Math.random) {
  return IQA_KEYS[Math.floor(rng() * IQA_KEYS.length)];
}

// Random but clamped ADSR shape: attack and release stay slow (this is what
// keeps the piece "floaty" rather than percussive), and the total is
// stretched up to MIN_VOICE_SECONDS if the random draw came in short.
function randomVoiceShape(volumeScale = 1) {
  const attack = 3 + Math.random() * 6; // 3-9s
  let sustain = 4 + Math.random() * 8; // 4-12s
  const release = 6 + Math.random() * 10; // 6-16s
  const total = attack + sustain + release;
  if (total < MIN_VOICE_SECONDS) sustain += MIN_VOICE_SECONDS - total;
  const peak = (0.08 + Math.random() * 0.05) * volumeScale;
  return { attack, sustain, release, total: attack + sustain + release, peak };
}

function scheduleVoice(ctx, dest, freq, shape, noiseBuffer) {
  const t0 = ctx.currentTime;
  const voiceGain = ctx.createGain();
  voiceGain.gain.setValueAtTime(0.0001, t0);
  voiceGain.gain.exponentialRampToValueAtTime(shape.peak, t0 + shape.attack);
  voiceGain.gain.setValueAtTime(shape.peak, t0 + shape.attack + shape.sustain);
  voiceGain.gain.exponentialRampToValueAtTime(0.0001, t0 + shape.attack + shape.sustain + shape.release);

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = Math.min(4200, Math.max(700, freq * 5));
  voiceGain.connect(filter);
  filter.connect(dest);

  // A soft partial structure: the fundamental plus a gently detuned twin
  // (chorus) and, sometimes, a quiet fifth above for a little open shimmer.
  const partials = [
    { ratio: 1, detuneCents: 0, gain: 1, type: "sine" },
    { ratio: 1, detuneCents: 5 + Math.random() * 6, gain: 0.55, type: "triangle" },
  ];
  if (Math.random() < 0.5) {
    partials.push({ ratio: Math.pow(2, 7 / 12), detuneCents: 0, gain: 0.2, type: "sine" });
  }
  const oscs = partials.map((p) => {
    const osc = ctx.createOscillator();
    osc.type = p.type;
    osc.frequency.value = freq * p.ratio;
    osc.detune.value = p.detuneCents;
    const g = ctx.createGain();
    g.gain.value = p.gain;
    osc.connect(g);
    g.connect(voiceGain);
    osc.start(t0);
    return osc;
  });

  const stopAt = t0 + shape.attack + shape.sustain + shape.release + 0.2;
  oscs.forEach((o) => o.stop(stopAt));
  setTimeout(() => {
    oscs.forEach((o) => o.disconnect());
    voiceGain.disconnect();
    filter.disconnect();
  }, (shape.total + 0.5) * 1000);
}

function synthDum(ctx, dest, time) {
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(150, time);
  osc.frequency.exponentialRampToValueAtTime(55, time + 0.15);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(0.9, time + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.32);
  osc.connect(gain);
  gain.connect(dest);
  osc.start(time);
  osc.stop(time + 0.34);
}

function synthTek(ctx, dest, time, noiseBuffer, velocity) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 3200;
  bp.Q.value = 2.5;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(0.7 * velocity, time + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.09);
  src.connect(bp);
  bp.connect(gain);
  gain.connect(dest);
  src.start(time);
  src.stop(time + 0.12);
}

function makeNoiseBuffer(ctx, seconds) {
  const buf = ctx.createBuffer(1, Math.round(seconds * ctx.sampleRate), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

function makeReverbImpulse(ctx, seconds, decay) {
  const len = Math.round(seconds * ctx.sampleRate);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return buf;
}
