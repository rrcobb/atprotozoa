(() => {
  const cv = document.getElementById("c"), ctx = cv.getContext("2d"), W = cv.width, H = cv.height;
  const $ = id => document.getElementById(id);
  const LANES = ["d", "f", "j", "k"], LW = W / 4, HIT_Y = H - 70, FALL = 1.8; // seconds from top to hit line
  const SCALE = [0, 3, 5, 7, 10, 12, 15, 17]; // minor pentatonic-ish, semitones above A2
  const BPM = 104, BEAT = 60 / BPM, BEATS = 96;
  // ---- tweakbox: every mix parameter lives here; [key, label, min, max, step, default, group, unit]
  const DEFS = [
    ["master", "master", 0, 1, 0.01, 0.5, "levels", ""],
    ["padLevel", "pad", 0, 3, 0.01, 1, "levels", "×"],
    ["leadLevel", "plucks", 0, 3, 0.01, 1, "levels", "×"],
    ["missLevel", "miss plucks", 0, 1, 0.01, 0.12, "levels", ""],
    ["duckDepth", "pad duck depth", 0, 1, 0.01, 0.7, "duck", ""],
    ["duckTau", "duck release", 0.05, 1.5, 0.01, 0.3, "duck", "s"],
    ["padCut", "pad lowpass", 200, 8000, 10, 900, "tone", "Hz"],
    ["leadCut", "lead lowpass", 400, 12000, 10, 4200, "tone", "Hz"],
    ["drive", "fuzz drive", 1, 24, 0.1, 6, "tone", ""],
    ["postCut", "post-fuzz tone", 500, 12000, 10, 2200, "tone", "Hz"],
    ["echoTime", "echo time", 0.02, 0.9, 0.01, 0.23, "echo", "s"],
    ["echoFb", "echo feedback", 0, 0.92, 0.01, 0.5, "echo", ""],
    ["echoWet", "echo return", 0, 1.5, 0.01, 1, "echo", "×"],
    ["echoHp", "loop highpass", 20, 800, 5, 150, "echo", "Hz"],
    ["echoDark", "loop darkening", 400, 10000, 10, 2500, "echo", "Hz"],
    ["compThr", "comp threshold", -60, 0, 1, -24, "compressor", "dB"],
    ["compRatio", "comp ratio", 1, 20, 0.1, 1.5, "compressor", ":1"],
    ["compAtk", "comp attack", 0.001, 0.2, 0.001, 0.04, "compressor", "s"],
    ["compRel", "comp release", 0.02, 1, 0.01, 0.25, "compressor", "s"],
    ["pluckLen", "pluck length", 0.2, 3, 0.05, 0.3, "plucks", "s"],
    ["pluckT60", "string T60", 0.1, 6, 0.05, 0.8, "plucks", "s"],
    ["pluckAtk", "attack (raised cosine)", 0.5, 30, 0.5, 5, "plucks", "ms"],
    ["pluckRel", "release", 10, 600, 10, 150, "plucks", "ms"],
    ["exciteMs", "excitation burst (Hann)", 0.5, 10, 0.5, 3, "plucks", "ms"],
    ["exciteLP", "excitation 1-pole a", 0, 0.95, 0.01, 0.5, "plucks", ""],
    ["exciteComb", "pick position (comb)", 0, 0.5, 0.01, 0.2, "plucks", "×N"],
    ["sweepHi", "tone sweep start", 800, 12000, 50, 5000, "plucks", "Hz"],
    ["sweepLo", "tone sweep end", 300, 6000, 50, 1200, "plucks", "Hz"],
    ["sweepTau", "tone sweep tau", 0.02, 1, 0.01, 0.15, "plucks", "s"],
    ["pluckOct", "hit octave", -1, 2, 1, 1, "plucks", "oct"],
    ["melody", "melody: random(0) / beatty(1)", 0, 1, 1, 0, "plucks", ""],
    ["drumLevel", "drums", 0, 2, 0.01, 0.9, "drums", "×"],
    ["kickLevel", "kick", 0, 2, 0.01, 1, "drums", "×"],
    ["snareLevel", "snare", 0, 2, 0.01, 1, "drums", "×"],
    ["hatLevel", "hats + crash", 0, 2, 0.01, 1, "drums", "×"],
    ["snareSend", "snare → echo", 0, 1, 0.01, 0.2, "drums", ""],
    ["timeJitter", "timing jitter ±", 0, 30, 0.5, 5, "drums", "ms"],
    ["velJitter", "velocity jitter ±", 0, 0.5, 0.01, 0.1, "drums", ""],
    ["blurMax", "haze blur", 0, 16, 0.1, 7, "visual", "px"],
    ["blurClar", "clarity clears haze", 0, 40, 1, 15, "visual", ""],
    ["blurCombo", "combo clears haze", 0, 0.5, 0.01, 0.1, "visual", ""],
    ["bloom", "bloom", 0, 1, 0.01, 0, "visual", ""],
  ];
  const PRESETS = {
    default: {},
    "wall of fuzz": { drive: 16, padLevel: 1.8, padCut: 2400, echoFb: 0.75, echoWet: 1.3, blurMax: 11, postCut: 3200 },
    "dry & clear": { drive: 1.5, echoWet: 0.15, echoFb: 0.15, padLevel: 0.5, blurMax: 1.5, duckDepth: 0.9, leadCut: 9000 },
    "cathedral": { echoTime: 0.48, echoFb: 0.86, echoDark: 1400, echoHp: 220, padCut: 600, pluckLen: 2.2, pluckT60: 4, compRatio: 3 },
    "tape wobble": { pluckT60: 2.5, pluckLen: 1.2, drive: 3, echoTime: 0.11, echoFb: 0.6, echoDark: 1800, bloom: 0.5, melody: 1 },
  };
  const P = {}; for (const d of DEFS) P[d[0]] = d[5];
  const STORE = "shackgaze.mix.v2"; // v2: plucks/drums params replaced the v1 set
  function setParams(o) { for (const d of DEFS) if (o && typeof o[d[0]] === "number" && isFinite(o[d[0]])) P[d[0]] = Math.min(d[3], Math.max(d[2], o[d[0]])); }
  function save() { try { localStorage.setItem(STORE, JSON.stringify(P)); } catch {} }
  try { setParams(JSON.parse(localStorage.getItem(STORE) || "{}")); } catch {}
  try { if (location.hash.startsWith("#mix=")) setParams(JSON.parse(atob(decodeURIComponent(location.hash.slice(5))))); } catch {}

  let notes, ac, master, fuzz, t0, running, score, combo, hits, total, raf, flash = [0, 0, 0, 0], padNodes = [], padBus, padTrim, padLP, leadBus, leadLP, echoDly, echoFb, echoHP, echoLP, echoOut, postLP, comp, melodyN = 0, hitTimes = [], drumBus, noiseBuf, drumEvents = [], drumIdx = 0, leadBufs = null, leadKey = "";

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
  function curve() {
    const c = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) c[i] = Math.tanh((i / 512 - 1) * P.drive);
    fuzz.curve = c;
  }
  // push every param onto the live graph (no-op before the first start)
  function applyMix() {
    if (!ac) return;
    const t = ac.currentTime, ramp = (p, v) => p.setTargetAtTime(v, t, 0.02);
    ramp(master.gain, P.master); ramp(drumBus.gain, P.drumLevel); ramp(padTrim.gain, P.padLevel); ramp(leadBus.gain, P.leadLevel);
    ramp(padLP.frequency, P.padCut); ramp(leadLP.frequency, P.leadCut); ramp(postLP.frequency, P.postCut);
    ramp(echoDly.delayTime, P.echoTime); ramp(echoFb.gain, P.echoFb); ramp(echoOut.gain, P.echoWet);
    ramp(echoHP.frequency, P.echoHp); ramp(echoLP.frequency, P.echoDark);
    comp.threshold.value = P.compThr; comp.ratio.value = P.compRatio; comp.attack.value = P.compAtk; comp.release.value = P.compRel;
    curve();
  }
  function audio() {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    master = ac.createGain(); comp = ac.createDynamicsCompressor();
    fuzz = ac.createWaveShaper(); fuzz.oversample = "4x";
    postLP = ac.createBiquadFilter(); postLP.type = "lowpass";
    // echo bus: the highpass and darkening lowpass sit inside the feedback loop, so each repeat is thinner and duller
    echoDly = ac.createDelay(1); echoFb = ac.createGain(); echoOut = ac.createGain();
    echoHP = ac.createBiquadFilter(); echoHP.type = "highpass";
    echoLP = ac.createBiquadFilter(); echoLP.type = "lowpass";
    drumBus = ac.createGain(); drumBus.connect(master); // kit skips the fuzz so it stays punchy
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate); { const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    fuzz.connect(postLP); postLP.connect(master);
    postLP.connect(echoDly); echoDly.connect(echoHP); echoHP.connect(echoLP); echoLP.connect(echoFb); echoFb.connect(echoDly);
    echoLP.connect(echoOut); echoOut.connect(master);
    master.connect(comp); comp.connect(ac.destination);
    // pad: dark (lowpass) and ducked by the hit envelopes (see duck()); lead plucks: brighter, own bus
    padBus = ac.createGain(); padTrim = ac.createGain(); padLP = ac.createBiquadFilter(); padLP.type = "lowpass";
    padBus.connect(padTrim); padTrim.connect(padLP); padLP.connect(fuzz);
    leadBus = ac.createGain(); leadLP = ac.createBiquadFilter(); leadLP.type = "lowpass";
    leadBus.connect(leadLP); leadLP.connect(fuzz);
    for (const f of [110, 164.8, 220, 261.6]) for (const det of [-9, 9]) {
      const o = ac.createOscillator(); o.type = "sawtooth"; o.frequency.value = f; o.detune.value = det;
      const g = ac.createGain(); g.gain.value = 0.04; o.connect(g); g.connect(padBus); o.start(); padNodes.push(o);
    }
    applyMix();
  }
  // Karplus–Strong: y[n] = g·½(y[n−N] + y[n−N−1]), N = fs/f0. The averaging lowpass makes high harmonics die first;
  // the fuzz chain keeps the grit after. g is set from the T60 so the string rings for pluckT60 seconds (−60 dB).
  // Excitation: ~3 ms Hann-windowed noise, 1-pole lowpass, minus a copy delayed 0.2·N (pick-position comb).
  function ksBuffer(f0, dur) {
    const fs = ac.sampleRate, len = Math.floor(fs * dur), N = Math.max(2, Math.round(fs / f0 - 0.5)); // −½: the two-tap average adds half a sample of delay
    const buf = ac.createBuffer(1, len, fs), y = buf.getChannelData(0);
    const M = Math.min(N + 1, Math.max(2, Math.round(fs * P.exciteMs / 1000))), e = new Float32Array(N + 1);
    for (let i = 0; i < M; i++) e[i] = (Math.random() * 2 - 1) * 0.5 * (1 - Math.cos(2 * Math.PI * i / (M - 1)));
    for (let i = 1; i <= N; i++) e[i] = (1 - P.exciteLP) * e[i] + P.exciteLP * e[i - 1];
    const D = Math.round(P.exciteComb * N), c = new Float32Array(N + 1); let pk = 1e-9;
    for (let i = 0; i <= N; i++) { c[i] = e[i] - (i >= D ? e[i - D] : 0); pk = Math.max(pk, Math.abs(c[i])); }
    const g = Math.pow(10, -3 * N / (fs * P.pluckT60)), atk = Math.max(1, fs * P.pluckAtk / 1000), rel = Math.min(len, Math.max(1, fs * P.pluckRel / 1000));
    for (let n = 0; n < len; n++) {
      y[n] = n <= N ? c[n] / pk : g * 0.5 * (y[n - N] + y[n - N - 1]);
    }
    for (let n = 0; n < len; n++) { // envelope applied after the recurrence so it doesn't feed back into the string
      if (n < atk) y[n] *= 0.5 * (1 - Math.cos(Math.PI * n / atk));
      if (n > len - rel) y[n] *= 0.5 * (1 + Math.cos(Math.PI * (n - (len - rel)) / rel));
    }
    return buf;
  }
  // the 8 scale-degree buffers are rendered once per set of string params, not per hit
  function leadBuffers() {
    const key = [P.pluckLen, P.pluckT60, P.pluckAtk, P.pluckRel, P.exciteMs, P.exciteLP, P.exciteComb, P.pluckOct].join("|");
    if (key !== leadKey || !leadBufs) {
      leadKey = key; leadBufs = SCALE.map(s => ksBuffer(110 * Math.pow(2, (s + 12 * P.pluckOct) / 12), P.pluckLen));
    }
    return leadBufs;
  }
  function pluck(lane, good) {
    if (!ac) return;
    let deg = lane * 2 + Math.floor(Math.random() * 3);
    // melody from hits: Sturmian steps floor((n+1)a) - floor(n*a), a = 1/phi^2, accumulated into a scale walk
    if (good && P.melody >= 1) { const A = 1 / (((1 + Math.sqrt(5)) / 2) ** 2); deg = 0; for (let k = 0; k <= melodyN; k++) deg += 1 + Math.floor((k + 1) * A) - Math.floor(k * A); melodyN++; }
    const n = ac.currentTime, src = ac.createBufferSource(), g = ac.createGain(), lp = ac.createBiquadFilter();
    src.buffer = leadBuffers()[deg % SCALE.length];
    if (!good) src.playbackRate.value = Math.pow(2, -P.pluckOct); // misses sound an octave-shift lower, from the same buffers
    g.gain.value = good ? 0.5 : P.missLevel * 0.5;
    // tone sweep: lowpass opens at sweepHi and decays toward sweepLo with time constant sweepTau
    lp.type = "lowpass"; lp.frequency.setValueAtTime(P.sweepHi, n); lp.frequency.setTargetAtTime(P.sweepLo, n, P.sweepTau);
    src.connect(lp); lp.connect(g); g.connect(leadBus); src.start(n);
    if (good) hitTimes.push(n);
  }
  // ---- drums: 16 steps/bar at 104 BPM, scheduled a little ahead of the audio clock
  const BARS = BEATS / 4, STEP = BEAT / 4;
  function drumChart() {
    const ev = [], add = (bar, step, v, vel) => ev.push({ t: (bar * 16 + step) * STEP, v, vel });
    for (let bar = 0; bar < BARS; bar++) {
      if (bar >= 12 && bar <= 14) { for (const s of [0, 6, 10]) add(bar, s, "kick", 1); continue; } // breakdown: kick only
      if (bar === 15) { for (let s = 0; s < 16; s++) add(bar, s, "snare", 0.2 + 0.8 * s / 15); continue; } // 16th snare roll, vel .2 -> 1
      if (bar === 16) add(bar, 0, "crash", 1);
      for (const s of [0, 6, 10]) add(bar, s, "kick", 1);
      for (const s of [4, 12]) add(bar, s, "snare", 1);
      for (let s = 0; s < 16; s += 2) {
        if (s === 14 && bar % 2 === 1) add(bar, s, "open", 0.7); // open hat every other bar
        else add(bar, s, "hat", s % 4 === 2 ? 0.7 : 0.45);
      }
    }
    return ev;
  }
  function env(t, peak, dec, atk = 0.001) {
    const g = ac.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + atk); g.gain.exponentialRampToValueAtTime(0.0005, t + atk + dec); return g;
  }
  function noise(t, dur, hp) {
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(); s.buffer = noiseBuf; s.loop = true; f.type = "highpass"; f.frequency.value = hp;
    s.connect(f); s.start(t, Math.random() * 0.8); s.stop(t + dur); return f;
  }
  function drum(ev) {
    const j = () => Math.random() * 2 - 1, t = Math.max(ac.currentTime, t0 + ev.t + j() * P.timeJitter / 1000), vel = ev.vel * (1 + j() * P.velJitter);
    if (ev.v === "kick") { // sine 150 -> 48 Hz over 120 ms, 2 ms attack, 400 ms decay
      const o = ac.createOscillator(), g = env(t, vel * 0.9 * P.kickLevel, 0.4, 0.002);
      o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.12);
      o.connect(g); g.connect(drumBus); o.start(t); o.stop(t + 0.5);
    } else if (ev.v === "snare") { // noise through 1.2 kHz highpass + 185 Hz triangle, 20% to the echo bus
      const g = env(t, vel * 0.5 * P.snareLevel, 0.18), n = noise(t, 0.3, 1200), o = ac.createOscillator(), og = env(t, vel * 0.4 * P.snareLevel, 0.12), send = ac.createGain();
      o.type = "triangle"; o.frequency.value = 185; n.connect(g); o.connect(og); o.start(t); o.stop(t + 0.2);
      send.gain.value = P.snareSend; for (const x of [g, og]) { x.connect(drumBus); x.connect(send); } send.connect(echoDly);
    } else if (ev.v === "crash") {
      const g = env(t, vel * 0.35 * P.hatLevel, 1.4, 0.003); noise(t, 1.6, 4500).connect(g); g.connect(drumBus);
    } else { // hats: noise through a 7 kHz highpass, 40 ms (open: 250 ms)
      const g = env(t, vel * 0.3 * P.hatLevel, ev.v === "open" ? 0.25 : 0.04); noise(t, 0.35, 7000).connect(g); g.connect(drumBus);
    }
  }
  function runDrums() {
    while (drumIdx < drumEvents.length && t0 + drumEvents[drumIdx].t < ac.currentTime + 0.4) drum(drumEvents[drumIdx++]);
  }
  // pad gain = 1 − 0.7·Σ(hit envelopes); each hit's envelope is exp(−τ/0.3), clamped at 0
  function duck() {
    if (!ac || !padBus) return;
    const t = ac.currentTime; let sum = 0;
    hitTimes = hitTimes.filter(h => t - h < P.duckTau * 8);
    for (const h of hitTimes) sum += Math.exp(-(t - h) / P.duckTau);
    padBus.gain.setTargetAtTime(Math.max(0, 1 - P.duckDepth * sum), t, 0.01);
  }
  function now() { return ac.currentTime - t0; }
  function start() {
    if (ac) { padNodes.forEach(o => { try { o.stop(); } catch {} }); ac.close(); padNodes = []; }
    hitTimes = []; melodyN = 0; leadBufs = null; drumIdx = 0;
    audio(); notes = chart(); total = notes.length; score = 0; combo = 0; hits = 0; running = true; t0 = ac.currentTime + 0.5; drumEvents = drumChart(); leadBuffers();
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
  function haze(px) {
    cv.style.filter = `blur(${px.toFixed(1)}px)` + (P.bloom > 0 ? ` brightness(${(1 + P.bloom * 0.4).toFixed(2)}) saturate(${(1 + P.bloom).toFixed(2)})` : "");
  }
  function ui() {
    const clar = total ? Math.round(hits / Math.max(1, notes.filter(n => n.state !== 0 || n.t < now() - 0.16).length) * 100) : 0;
    $("score").textContent = score; $("combo").textContent = combo; $("clar").textContent = clar;
    haze(Math.max(0, P.blurMax - clar / Math.max(1, P.blurClar) * (P.blurMax / 7) * 1 - Math.min(combo, 20) * P.blurCombo));
  }
  function tick() {
    const tt = now();
    for (const n of notes) if (n.state === 0 && n.t < tt - 0.16) { n.state = 2; combo = 0; }
    runDrums(); duck(); ui(); draw(tt);
    const lastT = notes[notes.length - 1].t;
    if (tt > lastT + 3) return end();
    raf = requestAnimationFrame(tick);
  }
  function end() {
    running = false; haze(0);
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
  // ---- tweakbox UI
  const box = $("tweak"), rows = {};
  function fmt(d, v) { return (d[4] < 0.01 ? v.toFixed(3) : d[4] < 1 ? v.toFixed(2) : String(Math.round(v * 10) / 10)) + (d[7] ? " " + d[7] : ""); }
  function syncUI() { for (const d of DEFS) { rows[d[0]].r.value = P[d[0]]; rows[d[0]].o.textContent = fmt(d, P[d[0]]); } }
  function changed() { save(); applyMix(); if (!running) haze(0); }
  let grp = null;
  for (const d of DEFS) {
    if (d[6] !== grp) { grp = d[6]; const h = document.createElement("h3"); h.textContent = grp; $("tweak-body").appendChild(h); }
    const lab = document.createElement("label"), nm = document.createElement("span"), r = document.createElement("input"), o = document.createElement("output");
    nm.textContent = d[1]; r.type = "range"; r.min = d[2]; r.max = d[3]; r.step = d[4]; r.id = "tw-" + d[0];
    r.addEventListener("input", () => { P[d[0]] = +r.value; o.textContent = fmt(d, P[d[0]]); changed(); });
    r.addEventListener("dblclick", () => { P[d[0]] = d[5]; syncUI(); changed(); });
    lab.append(nm, r, o); $("tweak-body").appendChild(lab); rows[d[0]] = { r, o };
  }
  for (const name of Object.keys(PRESETS)) {
    const b = document.createElement("button"); b.type = "button"; b.textContent = name;
    b.addEventListener("click", () => { for (const d of DEFS) P[d[0]] = d[5]; setParams(PRESETS[name]); syncUI(); changed(); });
    $("tweak-presets").appendChild(b);
  }
  $("tw-rand").addEventListener("click", () => { for (const d of DEFS) { if (d[0] === "master") continue; const v = d[2] + Math.random() * (d[3] - d[2]); P[d[0]] = Math.round(v / d[4]) * d[4]; } setParams(P); syncUI(); changed(); });
  $("tw-link").addEventListener("click", () => {
    const url = location.origin + location.pathname + "#mix=" + encodeURIComponent(btoa(JSON.stringify(P)));
    history.replaceState(null, "", url);
    (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(() => { $("tw-note").textContent = "link copied"; }, () => { $("tw-note").textContent = "link is in the address bar"; });
  });
  syncUI();
  notes = []; draw(0);
})();
