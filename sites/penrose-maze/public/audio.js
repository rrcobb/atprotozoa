// audio.js — tiny procedural sound engine for penrose-maze. Everything is
// synthesized with the Web Audio API: a low drone bed, footstep taps timed
// to movement, and a win chime. No audio files, nothing to fetch.
(function (root) {
  "use strict";

  var ctx = null;
  var master = null;
  var muted = false;
  var lastStep = 0;

  function ensureCtx() {
    if (ctx) return ctx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.55;
    master.connect(ctx.destination);
    startDrone();
    return ctx;
  }

  function startDrone() {
    var osc1 = ctx.createOscillator();
    var osc2 = ctx.createOscillator();
    osc1.type = "sine"; osc1.frequency.value = 55;
    osc2.type = "sine"; osc2.frequency.value = 55 * 1.5;
    var droneGain = ctx.createGain();
    droneGain.gain.value = 0.05;
    var lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    var lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.025;
    lfo.connect(lfoGain);
    lfoGain.connect(droneGain.gain);
    osc1.connect(droneGain);
    osc2.connect(droneGain);
    droneGain.connect(master);
    osc1.start(); osc2.start(); lfo.start();
  }

  function noiseBurst(freq, dur, gainPeak, filterType) {
    if (!ctx) return;
    var bufferSize = Math.max(1, Math.floor(ctx.sampleRate * dur));
    var buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    var data = buffer.getChannelData(0);
    for (var i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    var src = ctx.createBufferSource();
    src.buffer = buffer;
    var filter = ctx.createBiquadFilter();
    filter.type = filterType || "bandpass";
    filter.frequency.value = freq;
    filter.Q.value = 1.1;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0, ctx.currentTime);
    g.gain.linearRampToValueAtTime(gainPeak, ctx.currentTime + 0.008);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    src.connect(filter); filter.connect(g); g.connect(master);
    src.start();
    src.stop(ctx.currentTime + dur);
  }

  function footstep() {
    if (!ctx) return;
    var now = ctx.currentTime;
    if (now - lastStep < 0.28) return;
    lastStep = now;
    noiseBurst(140 + Math.random() * 60, 0.09, 0.18, "lowpass");
  }

  function doorChime() {
    if (!ctx) return;
    noiseBurst(900 + Math.random() * 200, 0.05, 0.06, "highpass");
  }

  function win() {
    if (!ctx) return;
    var notes = [392, 494, 587, 784];
    notes.forEach(function (f, i) {
      var t = ctx.currentTime + i * 0.11;
      var osc = ctx.createOscillator();
      var g = ctx.createGain();
      osc.type = "triangle"; osc.frequency.value = f;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.22, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
      osc.connect(g); g.connect(master);
      osc.start(t);
      osc.stop(t + 0.55);
    });
  }

  function setMuted(m) {
    muted = m;
    if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : 0.55, ctx.currentTime, 0.05);
  }

  root.MazeAudio = { init: ensureCtx, footstep: footstep, doorChime: doorChime, win: win, setMuted: setMuted };
})(typeof window !== "undefined" ? window : globalThis);
