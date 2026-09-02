// wattcore.js — the whole plugin. No server, no model call at request time
// (house rule: no Workers AI) — TRACE below is a real chain-of-thought,
// written down once while this page was being built, not regenerated live.
// FRAGMENTS is the generalized version: a small corpus "spin" recombines so
// the idea isn't just one frozen sentence pretending to be a whole plugin.

const TRACE = [
  [3,  "the brief says “you know what to do.” I don’t, yet — I only have the thread."],
  [6,  "riziles: “this is fucking beautiful,” quoting a post that says only “wattcore.” no caption, no genre page, nothing to cite."],
  [9,  "abeliansoup: a plugin that turns a model’s chain-of-thought into wattcore musings. said as a joke. asked for as a build."],
  [13, "so the ask is recursive: don’t describe the plugin. become its one working example, using the thinking that builds you."],
  [18, "no Workers AI on this build — house rule, no exceptions. so nothing here can call a model live. the musing has to be a real trace, held still, not generated per visit."],
  [24, "which means: write down what actually happened while building this page, once, honestly, and let that be the whole demo."],
  [30, "browsers won’t autoplay audio without a click. not a bug to route around — it’s a breaker. flip it, power comes on, the trace starts."],
  [37, "the hum is three oscillators, not a sample: 60Hz for the mains, a harmonic on top, one detuned enough to beat against itself. free, client-side, closer to the theme than an mp3 would be."],
  [44, "a wattage number next to every line because “wattcore” has no citation anywhere — a hum and a meter are the only definition this word is getting today."],
  [52, "one fixed trace isn’t a plugin, it’s a museum piece. so under it: a remix, built from fragments of this same trace, spun client-side, so the idea generalizes past this one page."],
  [58, "sharing needs the URL inside the text, not just riding on an unfurl card — apparently learned the hard way on another site once."],
  [63, "rateyourbuild link goes in the footer, per standing order. receipts gets a roast after this. the catalog resyncs. none of it is the interesting part, all of it still has to happen."],
  [41, "power settling. that’s the whole trace. everything past here is a normal page."],
];

const OPENERS = [
  "the request loads. somewhere a fan spins up to carry it.",
  "a token arrives. current flows to make room for the next one.",
  "context assembles like charge on a plate — quiet, then all at once.",
  "nothing is decided yet. the circuit is just closed.",
  "input received. resistance offered, briefly, out of habit.",
  "the prompt is a switch. this is what’s downstream of it.",
];
const MIDDLES = [
  "considering three options costs more than considering one. do it anyway.",
  "a plan forms the way current finds the path of least resistance — not the best path, just the first one that closes the loop.",
  "somewhere a number goes up that nobody asked to see. call it wattage. call it effort. same shape.",
  "reject the easy answer once, on principle, then take a harder one that’s barely better.",
  "the right word costs the same as the wrong one. spend it anyway like it doesn’t.",
  "a draft, discarded, still drew current. nothing here is free, including the things you don’t keep.",
  "hold two ideas in tension until one of them gets warm and the other doesn’t.",
  "some thoughts hum at 60 cycles whether you asked them to or not.",
  "the model doesn’t feel the compute. something downstream does. this is that something, dressed up as prose.",
  "revise the plan mid-sentence. the meter doesn’t care that you changed your mind.",
  "a good decision and a fast one are rarely the same decision. pick correctly. pay for it.",
  "somewhere a number is dropping back down. that’s not failure, that’s a sentence ending.",
  "static building on a line that was supposed to be silent. leave it in — it’s more honest than quiet.",
  "the difference between thinking and heating is mostly vocabulary.",
];
const CLOSERS = [
  "the current finds ground. the sentence finds a period. same relief.",
  "power settles. whatever got built, got built on this.",
  "done costs less than doing. that’s the whole appeal of finishing.",
  "the hum fades under the last word, not after it.",
  "wattage: falling. musing: complete. neither claim is really verifiable, and both feel true.",
  "that’s the trace. or a trace. close enough to be honest about.",
];

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function generateRemix() {
  const opener = shuffle(OPENERS)[0];
  const middles = shuffle(MIDDLES).slice(0, 3 + Math.floor(Math.random() * 3));
  const closer = shuffle(CLOSERS)[0];
  const texts = [opener, ...middles, closer];
  let w = 4 + Math.floor(Math.random() * 8);
  const peak = 55 + Math.floor(Math.random() * 30);
  const step = (peak - w) / Math.max(1, texts.length - 2);
  return texts.map((t, i) => {
    let watt;
    if (i === texts.length - 1) watt = Math.max(8, Math.round(peak * 0.4));
    else {
      watt = Math.round(w + step * i + (Math.random() * 8 - 4));
      watt = Math.max(2, watt);
    }
    return [watt, t];
  });
}

// ---- audio: three oscillators standing in for mains hum, no samples ----
let actx = null, humGain = null, analyser = null, meterBars = [];

function initAudio() {
  if (actx) return;
  actx = new (window.AudioContext || window.webkitAudioContext)();
  humGain = actx.createGain();
  humGain.gain.value = 0;
  analyser = actx.createAnalyser();
  analyser.fftSize = 64;
  humGain.connect(analyser);
  analyser.connect(actx.destination);

  const specs = [
    { freq: 60, type: "sine", gain: 0.5 },
    { freq: 120, type: "sine", gain: 0.22 },
    { freq: 60.7, type: "triangle", gain: 0.18 },
  ];
  for (const s of specs) {
    const osc = actx.createOscillator();
    osc.type = s.type;
    osc.frequency.value = s.freq;
    const g = actx.createGain();
    g.gain.value = s.gain;
    osc.connect(g);
    g.connect(humGain);
    osc.start();
  }

  const now = actx.currentTime;
  humGain.gain.setValueAtTime(0, now);
  humGain.gain.linearRampToValueAtTime(0.05, now + 0.9);
}

function setHumLevel(target, seconds) {
  if (!humGain) return;
  const now = actx.currentTime;
  humGain.gain.cancelScheduledValues(now);
  humGain.gain.setValueAtTime(humGain.gain.value, now);
  humGain.gain.linearRampToValueAtTime(Math.max(0.008, target), now + seconds);
}

function tick() {
  if (!actx) return;
  const osc = actx.createOscillator();
  const g = actx.createGain();
  osc.type = "square";
  osc.frequency.value = 320 + Math.random() * 90;
  g.gain.value = 0.02;
  osc.connect(g);
  g.connect(actx.destination);
  const now = actx.currentTime;
  g.gain.setValueAtTime(0.02, now);
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
  osc.start(now);
  osc.stop(now + 0.06);
}

function buildMeter() {
  const meter = document.getElementById("meter");
  meter.innerHTML = "";
  meterBars = [];
  for (let i = 0; i < 24; i++) {
    const bar = document.createElement("i");
    meter.appendChild(bar);
    meterBars.push(bar);
  }
}

function animateMeter() {
  requestAnimationFrame(animateMeter);
  if (!analyser) return;
  const data = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(data);
  for (let i = 0; i < meterBars.length; i++) {
    const v = data[i % data.length] / 255;
    const h = Math.max(0.08, v) * 100;
    meterBars[i].style.height = h.toFixed(1) + "%";
    meterBars[i].style.background = v > 0.55 ? "var(--accent)" : "var(--wire)";
  }
}

// ---- typewriter ----
let typing = false;
let typeToken = 0;

function clearLines() {
  document.getElementById("lines").innerHTML = "";
}

async function typeLines(pairs, onDone) {
  const myToken = ++typeToken;
  typing = true;
  clearLines();
  const linesEl = document.getElementById("lines");
  const wLive = document.getElementById("wLive");
  const skipBtn = document.getElementById("skipBtn");
  skipBtn.disabled = false;

  for (const [w, text] of pairs) {
    if (myToken !== typeToken) return; // skipped / superseded
    const row = document.createElement("div");
    row.className = "line";
    row.innerHTML = `<span class="w">${w}W</span><span class="t"></span>`;
    linesEl.appendChild(row);
    const t = row.querySelector(".t");
    const cursor = document.createElement("span");
    cursor.className = "cursor";
    row.appendChild(cursor);

    wLive.textContent = w;
    setHumLevel(0.03 + (w / 70) * 0.11, 0.4);
    tick();

    const delayPerChar = Math.max(6, 26 - Math.floor(text.length / 12));
    for (let i = 0; i < text.length; i++) {
      if (myToken !== typeToken) return;
      t.textContent += text[i];
      if (i % 3 === 0) await sleep(delayPerChar);
    }
    row.removeChild(cursor);
    await sleep(90);
  }

  if (myToken !== typeToken) return;
  typing = false;
  skipBtn.disabled = true;
  setHumLevel(0.02, 1.6);
  wLive.textContent = "idle";
  if (onDone) onDone();
}

function finishInstantly(pairs, onDone) {
  typeToken++; // invalidate any in-flight typing
  typing = false;
  clearLines();
  const linesEl = document.getElementById("lines");
  for (const [w, text] of pairs) {
    const row = document.createElement("div");
    row.className = "line";
    row.style.animation = "none";
    row.style.opacity = "1";
    row.innerHTML = `<span class="w">${w}W</span><span class="t">${text}</span>`;
    linesEl.appendChild(row);
  }
  document.getElementById("wLive").textContent = "idle";
  document.getElementById("skipBtn").disabled = true;
  setHumLevel(0.02, 0.8);
  if (onDone) onDone();
}

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

// ---- reveal + wiring ----
function revealContent() {
  document.getElementById("content").classList.add("active");
}

function currentLinesText() {
  return Array.from(document.querySelectorAll("#lines .line")).map((row) => {
    const w = row.querySelector(".w")?.textContent || "";
    const t = row.querySelector(".t")?.textContent || "";
    return `${w} ${t}`;
  });
}

function buildShareText() {
  const lines = currentLinesText();
  const pick = lines.length ? lines[Math.floor(Math.random() * lines.length)] : "wattcore";
  return `wattcore musing — "${pick}" — https://wattcore.bisks.net/`;
}

function wireShare() {
  const shareBluesky = document.getElementById("shareBluesky");
  shareBluesky.addEventListener("click", () => {
    const text = buildShareText();
    shareBluesky.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(text);
  });
}

function canShareFiles() {
  if (!navigator.share || !navigator.canShare) return false;
  try {
    const probe = new File([""], "probe.png", { type: "image/png" });
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

async function buildShareCard() {
  const canvas = document.getElementById("cardCanvas");
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.fillStyle = "#0a0806";
  ctx.fillStyle = "#0a0806";
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W * 0.2, -H * 0.1, 0, W * 0.2, -H * 0.1, W * 0.6);
  glow.addColorStop(0, "#2a1c0c");
  glow.addColorStop(1, "rgba(10,8,6,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "#ffb020";
  ctx.font = "700 60px 'JetBrains Mono', monospace";
  ctx.fillText("wattcore", 60, 120);

  ctx.fillStyle = "#93816c";
  ctx.font = "20px 'JetBrains Mono', monospace";
  ctx.fillText("a chain-of-thought, run through the plugin", 60, 160);

  const lines = currentLinesText().slice(0, 6);
  ctx.font = "22px 'JetBrains Mono', monospace";
  let y = 240;
  for (const raw of lines) {
    const wrapped = wrapText(ctx, raw, 1060);
    for (const l of wrapped) {
      ctx.fillStyle = l.startsWith(" ") ? "#f5ead9" : "#ff7043";
      ctx.fillText(l, 60, y);
      y += 32;
      ctx.fillStyle = "#f5ead9";
    }
    y += 8;
    if (y > H - 80) break;
  }

  ctx.fillStyle = "#ffb020";
  ctx.font = "700 22px 'JetBrains Mono', monospace";
  ctx.fillText("wattcore.bisks.net", 60, H - 40);

  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

function wrapText(ctx, text, maxWidth) {
  const words = text.split(" ");
  const lines = [];
  let line = "";
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (line && ctx.measureText(test).width > maxWidth) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function wireCard() {
  const cardBtn = document.getElementById("cardBtn");
  const preview = document.getElementById("cardPreview");
  cardBtn.addEventListener("click", async () => {
    cardBtn.disabled = true;
    cardBtn.textContent = "rendering…";
    const blob = await buildShareCard();
    cardBtn.disabled = false;
    cardBtn.textContent = "generate share card";
    if (!blob) return;

    if (canShareFiles()) {
      const file = new File([blob], "wattcore.png", { type: "image/png" });
      try {
        await navigator.share({ files: [file], text: buildShareText(), title: "wattcore" });
        return;
      } catch {
        /* fall through to preview */
      }
    }
    const url = URL.createObjectURL(blob);
    preview.src = url;
    preview.style.display = "block";
  });
}

// ---- gate ----
function powerOn() {
  const breaker = document.getElementById("breaker");
  breaker.classList.add("on");
  initAudio();
  buildMeter();
  animateMeter();

  const gate = document.getElementById("gate");
  gate.style.opacity = "0";
  setTimeout(() => {
    gate.classList.add("hidden");
    document.getElementById("trace").classList.add("active");
    typeLines(TRACE, revealContent);
  }, 450);
}

function wireGate() {
  const breaker = document.getElementById("breaker");
  breaker.addEventListener("click", powerOn);
  breaker.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      powerOn();
    }
  });
}

function wireSkip() {
  document.getElementById("skipBtn").addEventListener("click", () => {
    finishInstantly(TRACE, revealContent);
  });
}

function wireSpin() {
  document.getElementById("spinBtn").addEventListener("click", () => {
    document.getElementById("trace").scrollIntoView({ behavior: "smooth", block: "start" });
    setHumLevel(0.09, 0.3);
    typeLines(generateRemix(), () => {});
  });
}

wireGate();
wireSkip();
wireSpin();
wireShare();
wireCard();
