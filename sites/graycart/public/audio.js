// graycart — tiny WebAudio chiptune synth. Each cartridge rolls its own
// waveform/pitch-base per cue (move, action, hit, pickup, win, lose) so no
// two cartridges sound alike, but cues stay internally consistent so the
// player can learn "that sound = that thing happened."
(function (global) {
  "use strict";

  function makeAudio(rng) {
    let ctx = null;
    function ensureCtx() {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        ctx = new AC();
      }
      if (ctx.state === "suspended") ctx.resume();
      return ctx;
    }

    const waves = ["square", "triangle", "sawtooth"];
    function rollCue(baseFreq) {
      return {
        wave: rng.pick(waves),
        freq: baseFreq * rng.range(0.85, 1.15),
        dur: rng.range(0.05, 0.14),
        slide: rng.range(-1, 1),
      };
    }

    const cues = {
      move: rollCue(rng.range(180, 260)),
      action: rollCue(rng.range(320, 460)),
      hit: rollCue(rng.range(80, 140)),
      pickup: rollCue(rng.range(500, 720)),
      win: rollCue(rng.range(500, 700)),
      lose: rollCue(rng.range(90, 160)),
    };

    let lastMoveAt = 0;

    function play(name) {
      const cue = cues[name];
      if (!cue) return;
      if (name === "move") {
        const now = performance.now();
        if (now - lastMoveAt < 90) return;
        lastMoveAt = now;
      }
      const c = ensureCtx();
      const t0 = c.currentTime;
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = cue.wave;
      osc.frequency.setValueAtTime(cue.freq, t0);
      osc.frequency.linearRampToValueAtTime(
        Math.max(40, cue.freq * (1 + cue.slide * 0.6)),
        t0 + cue.dur
      );
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.16, t0 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + cue.dur);
      osc.connect(gain).connect(c.destination);
      osc.start(t0);
      osc.stop(t0 + cue.dur + 0.02);
    }

    function playSequence(name, times) {
      for (let i = 0; i < times; i++) {
        setTimeout(() => play(name), i * 90);
      }
    }

    return { play, playSequence, resume: ensureCtx };
  }

  global.GC = global.GC || {};
  global.GC.makeAudio = makeAudio;
})(window);
