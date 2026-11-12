// Sound, all synthesised (no samples): kept subtle, under the music.
//  - engine: two detuned low oscillators and a filtered roar, pitched by
//    throttle and speed; afterburner adds rumble
//  - wind: filtered noise that rises with speed and turning (with a slow,
//    random wobble so no two turns sound alike), muffled inside clouds
//  - one-shots: lock-on chirps, missile launch, missile hiss, jets passing
//    by (panned, pitch falling as they go), the burst (a soft boom and a bell
//    in the music's key: the post opening), flares, card close
// Only plays in fly mode; behind the feed the sky is silent.

import { Music } from './music.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export class Audio {
  constructor() {
    this.ctx = null;
    this.on = true;
    this.vol = 0.6;
    this.musicVol = 0.5;
    this.active = false;   // fly mode
    this.passed = new WeakMap();
  }

  // Browsers only start audio after a user gesture: call from one.
  start() {
    if (this.ctx) { if (this.ctx.state !== 'running' && this.on) this.ctx.resume(); return; }
    if (!this.on) return;
    const ctx = this.ctx = new AudioContext();
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.25;
    this.master.connect(comp).connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.gain.value = 0.9;
    this.sfx.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this.musicVol;
    this.musicBus.connect(this.master);
    // A shared noise buffer (2 s, looped where needed).
    const n = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    this.buildEngine();
    this.buildWind();
    this.music = new Music(ctx, this.musicBus, this.noise);
    this.music.setLoop(this.loop);
    this.apply();
  }

  set({ on, vol, music }) {
    if (on !== undefined) this.on = on;
    if (vol !== undefined) this.vol = vol;
    if (music !== undefined) this.musicVol = music;
    this.apply();
  }

  // Your own MIDI loop (parsed), or null for the built-in music.
  setLoop(loop) {
    this.loop = loop || null;
    this.music?.setLoop(this.loop);
  }

  setActive(on) { this.active = on; if (on) this.start(); this.apply(); }

  apply() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, live = this.on && this.active;
    this.master.gain.setTargetAtTime(live ? this.vol * 2.2 : 0, t, live ? 0.6 : 0.3);
    this.musicBus.gain.setTargetAtTime(this.musicVol, t, 0.3);
    this.music.playing = live && this.musicVol > 0.001;
    if (live && this.ctx.state !== 'running') this.ctx.resume();
    if (!live && this.ctx.state === 'running') {
      clearTimeout(this.suspendTimer);
      this.suspendTimer = setTimeout(() => { if (!(this.on && this.active)) this.ctx.suspend(); }, 1500);
    }
  }

  noiseSrc(loop = true) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    s.loop = loop;
    s.loopStart = Math.random();
    return s;
  }

  // ---------------------------------------------------------------- loops
  buildEngine() {
    const ctx = this.ctx;
    this.eng = ctx.createGain();
    this.eng.gain.value = 0;
    const lp = this.engLp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 400; lp.Q.value = 0.7;
    lp.connect(this.eng).connect(this.sfx);
    this.engOsc = [0.996, 1.004].map(k => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = 55 * k;
      const g = ctx.createGain(); g.gain.value = 0.12;
      o.connect(g).connect(lp);
      o.start();
      return o;
    });
    const roar = this.noiseSrc();
    const bp = this.roarBp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 500; bp.Q.value = 0.6;
    this.roarG = ctx.createGain(); this.roarG.gain.value = 0.15;
    roar.connect(bp).connect(this.roarG).connect(this.eng);
    roar.start();
  }

  buildWind() {
    const ctx = this.ctx;
    const src = this.noiseSrc();
    this.windBp = ctx.createBiquadFilter();
    this.windBp.type = 'bandpass'; this.windBp.Q.value = 1.4; this.windBp.frequency.value = 700;
    this.windLp = ctx.createBiquadFilter();
    this.windLp.type = 'lowpass'; this.windLp.frequency.value = 6000;
    this.windG = ctx.createGain(); this.windG.gain.value = 0;
    this.windPan = ctx.createStereoPanner();
    src.connect(this.windBp).connect(this.windLp).connect(this.windG).connect(this.windPan).connect(this.sfx);
    src.start();
    this.wobble = 0; this.wobbleTo = 0; this.wobbleAt = 0;
  }

  // Every frame: your jet's engine and the wind on it.
  update(dt, { throttle, speed, turn, bank, inside, camera, jets }) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    const k = clamp((speed - 130) / 260, 0, 1);
    for (const [i, o] of this.engOsc.entries()) o.frequency.setTargetAtTime((48 + throttle * 40 + k * 12) * (i ? 1.004 : 0.996), t, 0.3);
    this.engLp.frequency.setTargetAtTime(260 + throttle * 700, t, 0.3);
    this.roarBp.frequency.setTargetAtTime(380 + throttle * 900, t, 0.3);
    this.roarG.gain.setTargetAtTime(0.1 + Math.max(0, throttle - 0.75) * 1.2, t, 0.25);
    this.eng.gain.setTargetAtTime(0.1 + throttle * 0.1, t, 0.3);
    // Wind: speed, plus turning, with a wandering wobble.
    if (t > this.wobbleAt) { this.wobbleTo = Math.random() * 2 - 1; this.wobbleAt = t + 0.6 + Math.random() * 1.6; }
    this.wobble += (this.wobbleTo - this.wobble) * Math.min(1, dt * 1.5);
    const tw = clamp(Math.abs(turn) * 3 + Math.abs(bank) * 0.15, 0, 1);
    this.windBp.frequency.setTargetAtTime(500 + k * 600 + tw * 900 + this.wobble * 180, t, 0.15);
    this.windBp.Q.setTargetAtTime(1.2 + tw * 1.5, t, 0.2);
    this.windG.gain.setTargetAtTime(0.05 + k * 0.08 + tw * 0.14 + inside * 0.08, t, 0.15);
    this.windLp.frequency.setTargetAtTime(inside > 0.1 ? 1400 : 7000, t, 0.3);
    this.windPan.pan.setTargetAtTime(clamp(-bank * 0.25 + this.wobble * 0.1, -0.5, 0.5), t, 0.3);
    // The music hushes a touch inside a cloud.
    this.musicBus.gain.setTargetAtTime(this.musicVol * (1 - inside * 0.35), t, 0.4);
    this.flybys(camera, jets);
  }

  // A jet passing close: a whoosh, panned to its side, falling in pitch.
  flybys(camera, jets) {
    const right = this._r || (this._r = camera.position.clone());
    const rel = this._v || (this._v = camera.position.clone());
    camera.getWorldDirection(right);
    right.set(-right.z, 0, right.x).normalize();
    const now = this.ctx.currentTime;
    for (const j of jets) {
      rel.copy(j.craft.pos).sub(camera.position);
      const d = rel.length();
      const last = this.passed.get(j) || 0;
      if (d < 380 && now - last > 6) {
        this.passed.set(j, now);
        const closing = -rel.dot(j.craft.vel) / Math.max(d, 1);
        this.whoosh(clamp(rel.dot(right) / d, -1, 1), clamp(1 - d / 380, 0.15, 1), closing);
      }
    }
  }

  whoosh(pan, near, closing) {
    const ctx = this.ctx, t = ctx.currentTime, s = this.noiseSrc();
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 2.2;
    const hi = 1400 + clamp(closing, 0, 400) * 3;
    bp.frequency.setValueAtTime(hi, t);
    bp.frequency.exponentialRampToValueAtTime(260, t + 1.4);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35 * near, t + 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    const p = ctx.createStereoPanner();
    p.pan.setValueAtTime(clamp(pan * 0.8, -1, 1), t);
    p.pan.linearRampToValueAtTime(clamp(-pan * 0.5, -1, 1), t + 1.4);
    s.connect(bp).connect(g).connect(p).connect(this.sfx);
    s.start(t); s.stop(t + 1.7);
  }

  // ---------------------------------------------------------------- one-shots
  ready() { return this.ctx && this.ctx.state === 'running' && this.on && this.active; }

  tone(freq, dur, { type = 'sine', vol = 0.1, at = 0, to = null, pan = 0 } = {}) {
    const ctx = this.ctx, t = ctx.currentTime + at;
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const p = ctx.createStereoPanner(); p.pan.value = pan;
    o.connect(g).connect(p).connect(this.sfx);
    o.start(t); o.stop(t + dur + 0.02);
  }

  // Locking: a soft tick each time the candidate changes; locked: two notes up.
  lockTick() { if (this.ready()) this.tone(1320, 0.05, { type: 'triangle', vol: 0.04 }); }
  locked() {
    if (!this.ready()) return;
    this.tone(880, 0.09, { type: 'triangle', vol: 0.06 });
    this.tone(1318.5, 0.16, { type: 'triangle', vol: 0.06, at: 0.08 });
  }
  lost() { if (this.ready()) this.tone(660, 0.12, { type: 'triangle', vol: 0.035, to: 440 }); }

  launch(side) {
    if (!this.ready()) return;
    const ctx = this.ctx, t = ctx.currentTime;
    // Thump of release, then the motor's rushing hiss pulling away.
    this.tone(120, 0.18, { vol: 0.18, to: 50, pan: side * 0.3 });
    const s = this.noiseSrc();
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.9;
    bp.frequency.setValueAtTime(900, t);
    bp.frequency.exponentialRampToValueAtTime(2600, t + 0.25);
    bp.frequency.exponentialRampToValueAtTime(700, t + 2.2);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.06);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
    const p = ctx.createStereoPanner();
    p.pan.setValueAtTime(side * 0.4, t);
    p.pan.linearRampToValueAtTime(0, t + 0.8);
    s.connect(bp).connect(g).connect(p).connect(this.sfx);
    s.start(t); s.stop(t + 2.5);
  }

  // The burst, `d` metres away: a soft low boom, then a bell chord from the
  // music's key as the post opens.
  impact(d, pan = 0) {
    if (!this.ready()) return;
    const ctx = this.ctx, t = ctx.currentTime, far = clamp(1 / (1 + d / 2500), 0.5, 1);
    const delay = Math.min(1.2, d / 1500);   // a little sound lag, not real time
    const s = this.noiseSrc();
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(900, t + delay);
    lp.frequency.exponentialRampToValueAtTime(90, t + delay + 1.6);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t + delay);
    g.gain.exponentialRampToValueAtTime(0.45 * far, t + delay + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + delay + 2);
    const p = ctx.createStereoPanner(); p.pan.value = pan * 0.6;
    s.connect(lp).connect(g).connect(p).connect(this.sfx);
    s.start(t + delay); s.stop(t + delay + 2.1);
    this.tone(70, 0.9, { vol: 0.3 * far, to: 32, at: delay });
    // The card: F minor bell notes rising (F5 Ab5 C6), FM-ish via two partials.
    [698.46, 830.61, 1046.5].forEach((f, i) => {
      this.tone(f, 1.4, { vol: 0.07, at: 0.12 + i * 0.07, pan: (i - 1) * 0.3 });
      this.tone(f * 2.76, 0.5, { vol: 0.012, at: 0.12 + i * 0.07 });
    });
  }

  fizzle() { if (this.ready()) this.tone(300, 0.4, { type: 'triangle', vol: 0.03, to: 120 }); }

  flare(pan = 0) {
    if (!this.ready()) return;
    const ctx = this.ctx, t = ctx.currentTime, s = this.noiseSrc(false);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.06, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    const p = ctx.createStereoPanner(); p.pan.value = pan;
    s.connect(hp).connect(g).connect(p).connect(this.sfx);
    s.start(t); s.stop(t + 0.08);
  }

  closeCard() { if (this.ready()) this.tone(523.25, 0.12, { type: 'triangle', vol: 0.04, to: 392 }); }
}
