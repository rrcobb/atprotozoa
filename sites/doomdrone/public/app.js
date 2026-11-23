import { makeSong, mulberry32, pdoomAt } from "./song.js";

const $ = id => document.getElementById(id);
const el = { play: $("play"), next: $("next"), share: $("share"), style: $("style"), length: $("length"), voice: $("voice"),
  title: $("title"), meta: $("meta"), lyric: $("lyric"), lyrics: $("lyrics"), pdoom: $("pdoom"), scope: $("scope"), status: $("status") };

let seed = parseInt(new URLSearchParams(location.search).get("seed") || "", 10);
if (!Number.isFinite(seed)) seed = Math.floor(Math.random() * 1e9);
let song = null, ctx = null, nodes = null, playing = false;
let timer = null, nextBarT = 0, barIdx = 0, startT = 0, barDur = 0, rng = null, speechTimers = [];

function build() {
  song = makeSong(seed, el.length.value, el.style.value / 100);
  el.title.textContent = song.title;
  el.meta.textContent = `seed ${seed} · ${song.bpm} bpm · ${Math.round(song.total * 4 * 60 / song.bpm)}s`;
  el.lyrics.textContent = song.lines.map(l => (l.section === "chorus" ? "  " : "") + l.text).join("\n");
  const u = new URL(location.href); u.searchParams.set("seed", seed); history.replaceState(null, "", u);
}

// ---------- audio graph ----------
function impulse(c, secs, decay) {
  const len = Math.floor(c.sampleRate * secs), buf = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}
function distCurve(k) {
  const n = 2048, c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = i * 2 / n - 1; c[i] = ((1 + k) * x) / (1 + k * Math.abs(x)); }
  return c;
}

function initAudio() {
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16; comp.ratio.value = 6;
  const out = ctx.createGain(); out.gain.value = 0.8;
  const analyser = ctx.createAnalyser(); analyser.fftSize = 2048;
  comp.connect(out); out.connect(analyser); analyser.connect(ctx.destination);
  const rev = ctx.createConvolver(); rev.buffer = impulse(ctx, 6, 2.5);
  const revGain = ctx.createGain(); revGain.gain.value = 0.55;
  rev.connect(revGain); revGain.connect(comp);
  const dry = ctx.createGain(); dry.connect(comp);
  const send = ctx.createGain(); send.gain.value = 0.5; send.connect(rev);
  // guitar bus: gain (drive) -> waveshaper -> lowpass (cabinet) -> out
  const gDrive = ctx.createGain();
  const shaper = ctx.createWaveShaper(); shaper.curve = distCurve(40); shaper.oversample = "4x";
  const cab = ctx.createBiquadFilter(); cab.type = "lowpass"; cab.frequency.value = 900; cab.Q.value = 1.2;
  gDrive.connect(shaper); shaper.connect(cab); cab.connect(dry); cab.connect(send);
  const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const nd = noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  nodes = { comp, out, analyser, dry, send, gDrive, cab, noise };
}

const bus = (dest, g = 1) => { const n = ctx.createGain(); n.gain.value = g; n.connect(dest); return n; };
function env(g, t, a, peak, dur, rel) {
  g.gain.cancelScheduledValues(t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.setValueAtTime(peak, t + Math.max(a, dur));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + rel);
}
function osc(type, f, t, end, detune = 0) {
  const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = detune;
  o.start(t); o.stop(end); return o;
}

// detuned saw power chord into the amp bus
function guitar(t, f, dur, vol, attack) {
  const g = ctx.createGain(); g.connect(nodes.gDrive);
  env(g, t, attack, vol, dur, 0.8);
  [-9, 0, 8].forEach(d => { osc("sawtooth", f, t, t + dur + 1, d).connect(g); osc("sawtooth", f * 1.5, t, t + dur + 1, d * 1.3).connect(g); });
  osc("square", f / 2, t, t + dur + 1).connect(g);
}
function sub(t, f, dur, vol) {
  const g = ctx.createGain(); g.connect(nodes.dry);
  env(g, t, 0.08, vol, dur, 0.6);
  osc("sine", f, t, t + dur + 1).connect(g);
  osc("triangle", f * 2, t, t + dur + 1).connect(bus(g, 0.25));
}
function tom(t, f, vel) {
  const o = ctx.createOscillator(); o.type = "sine";
  o.frequency.setValueAtTime(f * 2.6, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.12);
  const g = ctx.createGain(); g.gain.setValueAtTime(vel, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
  o.connect(g); g.connect(nodes.dry); g.connect(nodes.send); o.start(t); o.stop(t + 1.2);
  const n = ctx.createBufferSource(); n.buffer = nodes.noise;
  const nf = ctx.createBiquadFilter(); nf.type = "bandpass"; nf.frequency.value = 1800;
  const ng = ctx.createGain(); ng.gain.setValueAtTime(vel * 0.5, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  n.connect(nf); nf.connect(ng); ng.connect(nodes.dry); n.start(t); n.stop(t + 0.1);
}
// two-operator FM bell with inharmonic ratio
function bell(t, f, vel, decay = 7) {
  const car = ctx.createOscillator(), mod = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain();
  car.frequency.value = f; mod.frequency.value = f * 1.4142;
  mg.gain.setValueAtTime(f * 2.2, t); mg.gain.exponentialRampToValueAtTime(f * 0.05, t + decay * 0.6);
  mod.connect(mg); mg.connect(car.frequency); car.connect(g);
  g.gain.setValueAtTime(vel, t); g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  g.connect(nodes.dry); g.connect(nodes.send);
  car.start(t); mod.start(t); car.stop(t + decay + 0.1); mod.stop(t + decay + 0.1);
}
function gong(t, f, vel) {
  const g = ctx.createGain(); g.connect(nodes.dry); g.connect(nodes.send);
  env(g, t, 0.02, vel, 0.4, 11);
  [1, 1.47, 2.09, 2.56, 3.11, 4.2].forEach((r, i) => {
    const pg = bus(g, 1 / (i + 1.5));
    osc("sine", f * r, t, t + 12, (Math.random() - 0.5) * 12).connect(pg);
  });
}
function clank(t, vel) {
  const n = ctx.createBufferSource(); n.buffer = nodes.noise;
  const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 2400 + Math.random() * 1500; bp.Q.value = 14;
  const g = ctx.createGain(); g.gain.setValueAtTime(vel, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
  n.connect(bp); bp.connect(g); g.connect(nodes.dry); g.connect(nodes.send); n.start(t); n.stop(t + 0.8);
}
function swell(t, dur, vol, f0, f1) {
  const n = ctx.createBufferSource(); n.buffer = nodes.noise; n.loop = true;
  const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = 3;
  bp.frequency.setValueAtTime(f0, t); bp.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + dur); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 1.5);
  n.connect(bp); bp.connect(g); g.connect(nodes.dry); g.connect(nodes.send); n.start(t); n.stop(t + dur + 2);
}
// "ahh" choir: saw through two formant bandpasses
function choir(t, f, dur, vol) {
  const g = ctx.createGain(); g.connect(nodes.dry); g.connect(nodes.send);
  env(g, t, dur * 0.4, vol, dur, 1.5);
  [[650, 8], [1080, 6]].forEach(([fc, q]) => {
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = fc; bp.Q.value = q; bp.connect(g);
    [-12, 0, 11].forEach(d => osc("sawtooth", f, t, t + dur + 2, d).connect(bp));
  });
}

// ---------- sequencing ----------
const semi = n => Math.pow(2, n / 12);

function scheduleBar(b, t) {
  const bar = song.bars[b], s = el.style.value / 100, r = rng;
  const sec = bar.section;
  const boost = sec === "chorus" ? 0.2 : sec === "bridge" ? 0.1 + 0.3 * (bar.i / bar.n) : sec === "intro" || sec === "outro" ? -0.1 : 0;
  const I = Math.max(0.05, Math.min(1, 0.2 + 0.7 * bar.pos + boost));
  const beat = barDur / 4;
  const f = song.root * semi(song.prog[b % 4]);
  const T = nodes.cab.frequency;

  nodes.gDrive.gain.setTargetAtTime(1 + I * 7, t, 1);
  T.setTargetAtTime(500 + I * 1700, t, 1.5);

  if (bar.i === 0) {
    gong(t, f * 4, 0.25 + I * 0.3);
    if (sec === "bridge" || sec === "intro") swell(t, barDur * bar.n * 0.95, 0.12 + I * 0.15, 150, 4200);
  }
  // sustained earth-style drone: one note per bar, slow attack
  if (s < 0.8 || bar.i % 2 === 0) guitar(t, f * 2, barDur * 1.02, (0.05 + 0.06 * I) * (1.2 - s * 0.6), barDur * 0.35);
  if (sec !== "intro" || bar.i > 0) sub(t, f, barDur * 0.98, 0.35 + I * 0.2);

  // swans-style chug/hammer on the beats
  if (sec !== "intro") for (let k = 0; k < 4; k++) {
    if (r() < s * (0.25 + I * 0.75)) guitar(t + k * beat, f * 2, beat * 0.85, 0.08 + I * 0.06, 0.01);
    const tomHit = s > 0.3 ? (k % 2 === 0 || r() < I * s) : (k === 0 && b % 2 === 0);
    if (tomHit && I > 0.2) tom(t + k * beat, f * (k === 2 ? 1.5 : 1), 0.45 + 0.4 * I);
  }
  // end-of-section fill
  if (bar.i === bar.n - 1 && s > 0.3 && sec !== "outro") for (let k = 0; k < 6; k++) tom(t + barDur * 0.5 + k * barDur / 12, f * (1 + (k % 3) * 0.25), 0.4 + k * 0.06);
  // bells: a three-note ostinato whose density follows intensity and swans-ness
  if (I > 0.25 && sec !== "outro") for (let k = 0; k < 4; k++) {
    if (k % 2 === 0 || r() < I * s) bell(t + k * beat, f * 8 * semi(song.bellScale[(b * 4 + k) % 3]), 0.05 + 0.08 * I);
  }
  if (s > 0.5 && I > 0.5) { clank(t + beat, 0.12); clank(t + 3 * beat, 0.12); }
  if (sec === "chorus" || sec === "bridge") choir(t, f * 4, barDur * 1.5, 0.05 + 0.05 * I);
  if (sec === "outro" && bar.i === 0) gong(t, f * 2, 0.6);

  const line = song.lines.find(l => l.bar === b);
  if (line) speakAt(line, t);
}

function tick() {
  while (barIdx < song.total && nextBarT < ctx.currentTime + 1.5) {
    scheduleBar(barIdx, nextBarT); nextBarT += barDur; barIdx++;
  }
  if (barIdx >= song.total && ctx.currentTime > nextBarT + 6) stop(true);
}

// ---------- vocals ----------
let voice = null;
function pickVoice() {
  if (!("speechSynthesis" in window)) return;
  const vs = speechSynthesis.getVoices().filter(v => /^en/i.test(v.lang));
  voice = vs.find(v => /daniel|fred|alex|george|male|david|ralph/i.test(v.name)) || vs.find(v => /en-GB/i.test(v.lang)) || vs[0] || null;
}
if ("speechSynthesis" in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }

function speakAt(line, t) {
  if (!el.voice.checked || !("speechSynthesis" in window)) return;
  const id = setTimeout(() => {
    if (!playing) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(line.text);
    if (voice) u.voice = voice;
    u.pitch = 0; u.rate = line.section === "chorus" ? 0.55 : 0.4; u.volume = 1;
    speechSynthesis.speak(u);
  }, Math.max(0, (t - ctx.currentTime) * 1000));
  speechTimers.push(id);
}

// ---------- transport + drawing ----------
async function start() {
  if (!ctx) initAudio();
  await ctx.resume();
  build();
  rng = mulberry32(seed ^ 0x9e3779b9);
  barDur = 240 / song.bpm;
  barIdx = 0; startT = ctx.currentTime + 0.3; nextBarT = startT;
  playing = true; el.play.textContent = "■ stop";
  timer = setInterval(tick, 200); tick();
  requestAnimationFrame(draw);
}
function stop(ended) {
  playing = false; clearInterval(timer); speechTimers.forEach(clearTimeout); speechTimers = [];
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  // tear down the context so scheduled notes die with it
  if (ctx) { ctx.close(); ctx = null; nodes = null; }
  el.play.textContent = "▶ play";
  if (ended) { el.lyric.className = "dim"; el.lyric.textContent = `p(doom): ${pdoomAt(1).toFixed(1)}%. the song is over. the number is not.`; }
}

const g2 = el.scope.getContext("2d");
function draw() {
  const W = el.scope.width, H = el.scope.height;
  g2.fillStyle = "rgba(0,0,0,0.18)"; g2.fillRect(0, 0, W, H);
  if (!playing || !ctx) { g2.clearRect(0, 0, W, H); return; }
  const now = ctx.currentTime - startT;
  const bi = Math.max(0, Math.min(song.total - 1, Math.floor(now / barDur)));
  const pos = Math.max(0, Math.min(1, now / (barDur * song.total)));
  el.pdoom.textContent = pdoomAt(pos).toFixed(1) + "%";
  let cur = null;
  for (const l of song.lines) if (l.bar <= bi) cur = l;
  if (cur && bi - cur.bar < 2) { el.lyric.className = cur.section === "chorus" ? "chorus" : ""; el.lyric.textContent = cur.text; }
  else { el.lyric.className = "dim"; el.lyric.textContent = "· · ·"; }
  const a = nodes.analyser, d = new Uint8Array(a.fftSize); a.getByteTimeDomainData(d);
  g2.strokeStyle = `rgb(${150 + pos * 100},${54 - pos * 30},31)`; g2.lineWidth = 2; g2.beginPath();
  for (let i = 0; i < d.length; i++) { const x = i / d.length * W, y = d[i] / 255 * H; i ? g2.lineTo(x, y) : g2.moveTo(x, y); }
  g2.stroke();
  requestAnimationFrame(draw);
}

el.play.addEventListener("click", () => (playing ? stop(false) : start()));
el.next.addEventListener("click", () => {
  seed = Math.floor(Math.random() * 1e9);
  if (playing) { stop(false); start(); } else build();
});
el.length.addEventListener("change", () => { if (!playing) build(); });
el.style.addEventListener("change", () => { if (!playing) build(); });
el.share.addEventListener("click", () => {
  const url = `https://doomdrone.bisks.net/?seed=${seed}`;
  const text = `a machine wrote me a swans/earth song about upping my p(doom): "${song.title}"`;
  window.open(`https://bsky.app/intent/compose?text=${encodeURIComponent(text + "\n" + url)}`, "_blank", "noopener");
});

build();
