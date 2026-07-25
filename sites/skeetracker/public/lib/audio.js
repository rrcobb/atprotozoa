// audio.js — the synth engine + step scheduler. One monophonic voice per
// channel (new note in a channel cuts whatever was ringing there), each voice
// built from an instrument's params: oscillator/noise source -> optional
// lowpass filter -> ADSR gain envelope -> master. Scheduling uses the classic
// "tale of two clocks" lookahead pattern (a setInterval ticker schedules
// AudioContext-timed events a little ahead of when they're heard) so tempo
// stays sample-accurate even though setInterval itself is sloppy.

export const NOTE_NAMES = [
  "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
];

export const NOTE_OFF = -1;

export function noteName(n) {
  if (n === NOTE_OFF || n == null) return "---";
  const oct = Math.floor(n / 12) - 1;
  return NOTE_NAMES[((n % 12) + 12) % 12] + oct;
}

export function noteFreq(n) {
  return 440 * Math.pow(2, (n - 69) / 12);
}

export class Engine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseBuffer = null;
    this.voices = new Map(); // channel index -> voice
    this.playing = false;
    this.timerId = null;
    this.song = null;
    this.lookaheadMs = 25;
    this.scheduleAhead = 0.12; // seconds
    this.nextRowTime = 0;
    this.rowIdx = 0;
    this.orderPos = 0;
    this.rowQueue = []; // {orderPos, patIdx, rowIdx, time} — drained by the UI for playhead sync
    this.onRow = null;
  }

  ensureCtx() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.8;
      this.master.connect(this.ctx.destination);
      this.noiseBuffer = this._makeNoiseBuffer();
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
  }

  _makeNoiseBuffer() {
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  // Play `ins` at `note`/`vol` (0-9) on channel `chan`, scheduled at
  // AudioContext time `t`.
  noteOn(chan, ins, note, vol, t) {
    this.releaseVoice(chan, t);
    if (!ins) return;
    let src;
    if (ins.wave === "noise") {
      src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      src.loop = true;
      src.playbackRate.value = Math.pow(2, (note - 69) / 12);
    } else {
      src = this.ctx.createOscillator();
      src.type = ins.wave;
      src.frequency.setValueAtTime(noteFreq(note), t);
    }

    let node = src;
    let filter = null;
    if (ins.cutoff && ins.cutoff > 0) {
      filter = this.ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = ins.cutoff;
      filter.Q.value = ins.q || 0.7;
      node.connect(filter);
      node = filter;
    }

    const gain = this.ctx.createGain();
    node.connect(gain);
    gain.connect(this.master);

    const peak = Math.max(0.0001, (vol / 9) * ins.gain);
    const a = Math.max(0.001, ins.a);
    const d = Math.max(0.001, ins.d);
    const sustainLevel = Math.max(0.0001, peak * ins.s);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(peak, t + a);
    gain.gain.linearRampToValueAtTime(sustainLevel, t + a + d);

    src.start(t);
    src.onended = () => {
      try {
        gain.disconnect();
        if (filter) filter.disconnect();
        src.disconnect();
      } catch {}
    };
    this.voices.set(chan, { src, gain, ins, releasing: false });
  }

  releaseVoice(chan, t) {
    const v = this.voices.get(chan);
    if (!v || v.releasing) return;
    v.releasing = true;
    const r = Math.max(0.01, v.ins.r);
    const g = v.gain.gain;
    if (typeof g.cancelAndHoldAtTime === "function") {
      g.cancelAndHoldAtTime(t);
    } else {
      g.cancelScheduledValues(t);
    }
    g.linearRampToValueAtTime(0.0001, t + r);
    try {
      v.src.stop(t + r + 0.02);
    } catch {}
    this.voices.delete(chan);
  }

  allNotesOff() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const [chan] of this.voices) this.releaseVoice(chan, t);
    this.voices.clear();
  }

  start(song, fromOrderPos = 0) {
    this.ensureCtx();
    this.song = song;
    this.orderPos = fromOrderPos;
    this.rowIdx = 0;
    this.nextRowTime = this.ctx.currentTime + 0.08;
    this.rowQueue.length = 0;
    this.playing = true;
    this.timerId = setInterval(() => this._tick(), this.lookaheadMs);
  }

  stop() {
    this.playing = false;
    if (this.timerId) clearInterval(this.timerId);
    this.timerId = null;
    this.rowQueue.length = 0;
    this.allNotesOff();
  }

  _tick() {
    if (!this.playing || !this.song) return;
    while (this.nextRowTime < this.ctx.currentTime + this.scheduleAhead) {
      this._scheduleRow(this.nextRowTime);
      const rowDur = 60 / this.song.bpm / this.song.spr;
      this.nextRowTime += rowDur;
      this._advanceRow();
    }
  }

  _scheduleRow(t) {
    const song = this.song;
    if (!song.order.length) return;
    const patIdx = song.order[this.orderPos % song.order.length];
    const pat = song.pats[patIdx];
    const row = pat[this.rowIdx];
    for (let c = 0; c < song.chans; c++) {
      const cell = row[c];
      if (!cell) continue;
      const [note, insIdx, vol] = cell;
      if (note === NOTE_OFF) {
        this.releaseVoice(c, t);
        continue;
      }
      const ins = song.ins[insIdx];
      this.noteOn(c, ins, note, vol, t);
    }
    this.rowQueue.push({
      orderPos: this.orderPos % song.order.length,
      patIdx,
      rowIdx: this.rowIdx,
      time: t,
    });
  }

  _advanceRow() {
    const song = this.song;
    const patIdx = song.order[this.orderPos % song.order.length];
    const pat = song.pats[patIdx];
    this.rowIdx++;
    if (this.rowIdx >= pat.length) {
      this.rowIdx = 0;
      this.orderPos++;
    }
  }
}
