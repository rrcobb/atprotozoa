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
    ["pluckLen", "pluck length", 0.3, 3, 0.05, 1.4, "plucks", "s"],
    ["pluckLoss", "string loss", 0.9, 1, 0.001, 1, "plucks", ""],
    ["declick", "declick rate", 100, 4000, 50, 600, "plucks", "/s"],
    ["pluckOct", "hit octave", -1, 2, 1, 1, "plucks", "oct"],
    ["melody", "melody: random(0) / beatty(1)", 0, 1, 1, 0, "plucks", ""],
    ["blurMax", "haze blur", 0, 16, 0.1, 7, "visual", "px"],
    ["blurClar", "clarity clears haze", 0, 40, 1, 15, "visual", ""],
    ["blurCombo", "combo clears haze", 0, 0.5, 0.01, 0.1, "visual", ""],
    ["bloom", "bloom", 0, 1, 0.01, 0, "visual", ""],
  ];
  const PRESETS = {
    default: {},
    "wall of fuzz": { drive: 16, padLevel: 1.8, padCut: 2400, echoFb: 0.75, echoWet: 1.3, blurMax: 11, postCut: 3200 },
    "dry & clear": { drive: 1.5, echoWet: 0.15, echoFb: 0.15, padLevel: 0.5, blurMax: 1.5, duckDepth: 0.9, leadCut: 9000 },
    "cathedral": { echoTime: 0.48, echoFb: 0.86, echoDark: 1400, echoHp: 220, padCut: 600, pluckLen: 2.6, compRatio: 3 },
    "tape wobble": { pluckLoss: 0.992, drive: 3, echoTime: 0.11, echoFb: 0.6, echoDark: 1800, bloom: 0.5, melody: 1 },
  };
  const P = {}; for (const d of DEFS) P[d[0]] = d[5];
  const STORE = "shackgaze.mix.v1";
  function setParams(o) { for (const d of DEFS) if (o && typeof o[d[0]] === "number" && isFinite(o[d[0]])) P[d[0]] = Math.min(d[3], Math.max(d[2], o[d[0]])); }
  function save() { try { localStorage.setItem(STORE, JSON.stringify(P)); } catch {} }
  try { setParams(JSON.parse(localStorage.getItem(STORE) || "{}")); } catch {}
  try { if (location.hash.startsWith("#mix=")) setParams(JSON.parse(atob(decodeURIComponent(location.hash.slice(5))))); } catch {}

  let notes, ac, master, fuzz, t0, running, score, combo, hits, total, raf, flash = [0, 0, 0, 0], padNodes = [], padBus, padTrim, padLP, leadBus, leadLP, echoDly, echoFb, echoHP, echoLP, echoOut, postLP, comp, melodyN = 0, hitTimes = [];

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
    ramp(master.gain, P.master); ramp(padTrim.gain, P.padLevel); ramp(leadBus.gain, P.leadLevel);
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
  // Karplus–Strong: y[n] = ½(y[n−N] + y[n−N−1]), N = fs/f0, seeded with a noise burst.
  // The averaging lowpass makes high harmonics die first; the fuzz chain keeps the grit after.
  function ksBuffer(f0, amp, dur) {
    const fs = ac.sampleRate, len = Math.floor(fs * dur), N = Math.max(2, Math.round(fs / f0 - 0.5)); // −½: the two-tap average adds half a sample of delay
    const buf = ac.createBuffer(1, len, fs), y = buf.getChannelData(0);
    for (let n = 0; n < len; n++) {
      if (n <= N) y[n] = Math.random() * 2 - 1;
      else y[n] = P.pluckLoss * 0.5 * (y[n - N] + y[n - N - 1]);
      const tau = n / fs;
      y[n] *= amp * Math.min(tau * P.declick, 1); // declick: ~1.7ms linear ramp-in
      if (tau > dur - 0.05) y[n] *= (dur - tau) / 0.05; // and out, so the buffer end can't click
    }
    return buf;
  }
  function pluck(lane, good) {
    if (!ac) return;
    let deg = lane * 2 + Math.floor(Math.random() * 3);
    // melody from hits: Sturmian steps floor((n+1)a) - floor(n*a), a = 1/phi^2, accumulated into a scale walk
    if (good && P.melody >= 1) { const A = 1 / (((1 + Math.sqrt(5)) / 2) ** 2); deg = 0; for (let k = 0; k <= melodyN; k++) deg += 1 + Math.floor((k + 1) * A) - Math.floor(k * A); melodyN++; }
    const semis = SCALE[deg % SCALE.length] + (good ? 12 * P.pluckOct : 0);
    const f = 110 * Math.pow(2, semis / 12), n = ac.currentTime;
    const src = ac.createBufferSource(); src.buffer = ksBuffer(f, good ? 0.5 : P.missLevel, P.pluckLen);
    src.connect(leadBus); src.start(n);
    if (good) hitTimes.push(n);
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
    hitTimes = []; melodyN = 0;
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
    duck(); ui(); draw(tt);
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
