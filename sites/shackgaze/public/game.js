(() => {
  const cv = document.getElementById("c"), ctx = cv.getContext("2d"), W = cv.width, H = cv.height;
  const $ = id => document.getElementById(id);
  const LANES = ["d", "f", "j", "k"], LW = W / 4, HIT_Y = H - 70, FALL = 1.8; // seconds from top to hit line
  const SCALE = [0, 3, 5, 7, 10, 12, 15, 17]; // minor pentatonic-ish, semitones above A2
  const BPM = 104, BEAT = 60 / BPM, BEATS = 96;
  let notes, ac, master, fuzz, t0, running, score, combo, hits, total, raf, flash = [0, 0, 0, 0], padNodes = [], padBus, hitTimes = [];

  // deterministic chart so everyone plays the same song
  function chart() {
    let s = 7; const r = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
    const out = []; let lane = 1;
    for (let b = 4; b < BEATS; b += 0.5) {
      const dense = b > 24 && b < 48 || b > 64;
      if (r() < (dense ? 0.62 : 0.4)) { lane = r() < 0.5 ? Math.floor(r() * 4) : (lane + (r() < 0.5 ? 1 : 3)) % 4; out.push({ t: b * BEAT, lane, state: 0 }); }
    }
    return out;
  }
  function audio() {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    master = ac.createGain(); master.gain.value = 0.5;
    const comp = ac.createDynamicsCompressor();
    // fuzz: waveshaper + a feedback delay as cheap reverb haze
    fuzz = ac.createWaveShaper(); const c = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; c[i] = Math.tanh(x * 6); }
    fuzz.curve = c; fuzz.oversample = "4x";
    const dl = ac.createDelay(1); dl.delayTime.value = 0.23; const fb = ac.createGain(); fb.gain.value = 0.5;
    const lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2200;
    fuzz.connect(lp); lp.connect(master); lp.connect(dl); dl.connect(fb); fb.connect(dl); dl.connect(master);
    master.connect(comp); comp.connect(ac.destination);
    // pad bus: ducked by the hit envelopes (see duck())
    padBus = ac.createGain(); padBus.connect(fuzz);
    // drone pad: detuned saws on A2 / E3 / A3 / C4
    for (const f of [110, 164.8, 220, 261.6]) for (const det of [-9, 9]) {
      const o = ac.createOscillator(); o.type = "sawtooth"; o.frequency.value = f; o.detune.value = det;
      const g = ac.createGain(); g.gain.value = 0.04; o.connect(g); g.connect(padBus); o.start(); padNodes.push(o);
    }
  }
  // Karplus–Strong: y[n] = ½(y[n−N] + y[n−N−1]), N = fs/f0, seeded with a noise burst.
  // The averaging lowpass makes high harmonics die first; the fuzz chain keeps the grit after.
  function ksBuffer(f0, amp, dur) {
    const fs = ac.sampleRate, len = Math.floor(fs * dur), N = Math.max(2, Math.round(fs / f0 - 0.5)); // −½: the two-tap average adds half a sample of delay
    const buf = ac.createBuffer(1, len, fs), y = buf.getChannelData(0);
    for (let n = 0; n < len; n++) {
      if (n <= N) y[n] = Math.random() * 2 - 1;
      else y[n] = 0.5 * (y[n - N] + y[n - N - 1]);
      const tau = n / fs;
      y[n] *= amp * Math.min(tau * 600, 1); // declick: ~1.7ms linear ramp-in
      if (tau > dur - 0.05) y[n] *= (dur - tau) / 0.05; // and out, so the buffer end can't click
    }
    return buf;
  }
  function pluck(lane, good) {
    if (!ac) return;
    const semis = SCALE[(lane * 2 + Math.floor(Math.random() * 3)) % SCALE.length] + (good ? 12 : 0);
    const f = 110 * Math.pow(2, semis / 12), n = ac.currentTime;
    const src = ac.createBufferSource(); src.buffer = ksBuffer(f, good ? 0.5 : 0.12, 1.4);
    src.connect(fuzz); src.start(n);
    if (good) hitTimes.push(n);
  }
  // pad gain = 1 − 0.7·Σ(hit envelopes); each hit's envelope is exp(−τ/0.3), clamped at 0
  function duck() {
    if (!ac || !padBus) return;
    const t = ac.currentTime; let sum = 0;
    hitTimes = hitTimes.filter(h => t - h < 2);
    for (const h of hitTimes) sum += Math.exp(-(t - h) / 0.3);
    padBus.gain.setTargetAtTime(Math.max(0, 1 - 0.7 * sum), t, 0.01);
  }
  function now() { return ac.currentTime - t0; }
  function start() {
    if (ac) { padNodes.forEach(o => { try { o.stop(); } catch {} }); ac.close(); padNodes = []; }
    hitTimes = [];
    audio(); notes = chart(); total = notes.length; score = 0; combo = 0; hits = 0; running = true; t0 = ac.currentTime + 0.5;
    $("go").textContent = "restart"; $("msg").textContent = "lanes: D F J K (or tap the lanes).";
    cancelAnimationFrame(raf); raf = requestAnimationFrame(tick);
  }
  function judge(lane) {
    if (!running) return;
    flash[lane] = 1;
    const tt = now(); let best = null;
    for (const n of notes) if (n.state === 0 && n.lane === lane && Math.abs(n.t - tt) < 0.16 && (!best || Math.abs(n.t - tt) < Math.abs(best.t - tt))) best = n;
    if (best) { best.state = 1; hits++; combo++; score += 100 + Math.min(combo, 30) * 10 + (Math.abs(best.t - tt) < 0.06 ? 50 : 0); pluck(lane, true); }
    else { combo = 0; pluck(lane, false); }
  }
  function ui() {
    const clar = total ? Math.round(hits / Math.max(1, notes.filter(n => n.state !== 0 || n.t < now() - 0.16).length) * 100) : 0;
    $("score").textContent = score; $("combo").textContent = combo; $("clar").textContent = clar;
    cv.style.filter = `blur(${Math.max(0, 7 - clar / 15 - Math.min(combo, 20) * 0.1).toFixed(1)}px)`;
  }
  function tick() {
    const tt = now();
    for (const n of notes) if (n.state === 0 && n.t < tt - 0.16) { n.state = 2; combo = 0; }
    duck(); ui(); draw(tt);
    const lastT = notes[notes.length - 1].t;
    if (tt > lastT + 3) return end();
    raf = requestAnimationFrame(tick);
  }
  function end() {
    running = false; cv.style.filter = "blur(0px)";
    const pct = Math.round(hits / total * 100);
    $("msg").textContent = `${hits}/${total} notes (${pct}% clarity), score ${score}. the haze lifts.`;
    setShare(`I got ${pct}% clarity (${score} pts) through the haze in shackgaze 🍔`);
    padNodes.forEach(o => { try { o.stop(ac.currentTime + 2); } catch {} });
  }
  function draw(tt) {
    ctx.clearRect(0, 0, W, H);
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = `rgba(192,92,176,${0.08 + flash[i] * 0.35})`; ctx.fillRect(i * LW, 0, LW, H); flash[i] = Math.max(0, flash[i] - 0.06);
      ctx.strokeStyle = "rgba(255,255,255,.12)"; ctx.strokeRect(i * LW, 0, LW, H);
    }
    ctx.fillStyle = "#fff"; ctx.fillRect(0, HIT_Y, W, 3);
    ctx.font = "bold 20px monospace"; ctx.textAlign = "center"; ctx.fillStyle = "rgba(255,255,255,.7)";
    LANES.forEach((l, i) => ctx.fillText(l.toUpperCase(), i * LW + LW / 2, HIT_Y + 38));
    ctx.font = "34px sans-serif"; ctx.textBaseline = "middle";
    for (const n of notes) {
      if (n.state === 1) continue;
      const y = HIT_Y - (n.t - tt) / FALL * HIT_Y;
      if (y < -30 || y > H + 30) continue;
      ctx.globalAlpha = n.state === 2 ? 0.3 : 1; ctx.fillText("🍔", n.lane * LW + LW / 2, y); ctx.globalAlpha = 1;
    }
    ctx.textBaseline = "alphabetic";
  }
  addEventListener("keydown", e => { const i = LANES.indexOf(e.key.toLowerCase()); if (i >= 0 && !e.repeat) judge(i); });
  cv.addEventListener("pointerdown", e => { const r = cv.getBoundingClientRect(); judge(Math.min(3, Math.floor((e.clientX - r.left) / r.width * 4))); });
  $("go").addEventListener("click", start);
  notes = []; draw(0);
})();
