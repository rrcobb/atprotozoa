if (window.attachHandleTypeahead) window.attachHandleTypeahead(document.getElementById("handle"));

const els = {
  form: document.getElementById("f"),
  input: document.getElementById("handle"),
  reroll: document.getElementById("reroll"),
  assemble: document.getElementById("assemble"),
  status: document.getElementById("status"),
  mech: document.getElementById("mech"),
  wave: document.getElementById("wave"),
  roster: document.getElementById("roster"),
  linkHead: document.getElementById("linkHead"),
  linkTorso: document.getElementById("linkTorso"),
  linkLegs: document.getElementById("linkLegs"),
  titleHead: document.getElementById("titleHead"),
  titleTorso: document.getElementById("titleTorso"),
  titleLegs: document.getElementById("titleLegs"),
  share: document.getElementById("share"),
  shareCanvas: document.getElementById("shareCanvas"),
  shareNative: document.getElementById("shareNative"),
  shareBluesky: document.getElementById("shareBluesky"),
  shareDownload: document.getElementById("shareDownload"),
};

const ROLES = [
  { key: "head", label: "COCKPIT", color: "#17e6d0", el: () => els.linkHead, title: () => els.titleHead },
  { key: "torso", label: "CORE", color: "#ff2e88", el: () => els.linkTorso, title: () => els.titleTorso },
  { key: "legs", label: "THRUSTERS", color: "#c6ff2e", el: () => els.linkLegs, title: () => els.titleLegs },
];

let PARTS = [];
let lastShareText = "";
let lastSeed = "";

function setStatus(msg, isErr) {
  els.status.textContent = msg || "";
  els.status.className = "status" + (isErr ? " err" : "");
}

// ---- deterministic pick: same seed -> same three parts, forever ----------
// FNV-1a for the seed, mulberry32 as the PRNG it feeds — small, dependency-
// free, and easy to port line-for-line into the Worker (src/index.ts) so a
// shared /z/<seed> link renders the identical trio server-side for its OG tags.
function hash32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function pickThree(seedStr, pool) {
  const rand = mulberry32(hash32(seedStr));
  const idx = pool.map((_, i) => i);
  const picked = [];
  for (let k = 0; k < 3 && idx.length; k++) {
    const i = Math.floor(rand() * idx.length);
    picked.push(pool[idx[i]]);
    idx.splice(i, 1);
  }
  return picked;
}

function randomSeed() {
  return Math.random().toString(36).slice(2, 10);
}

function cleanSeed(raw) {
  return (raw || "").trim().replace(/^@/, "").toLowerCase();
}

// ---- audio: a short power-up stinger, plus a live waveform on #wave ------
let ctx = null;
function audio() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function tone(dest, f, t, dur, { type = "square", gain = 0.2, attack = 0.01, release = 0.15 } = {}) {
  const c = audio();
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f, t);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.setValueAtTime(gain, t + Math.max(attack, dur - release));
  g.gain.linearRampToValueAtTime(0, t + dur);
  osc.connect(g).connect(dest);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

// filtered noise burst, swept downward — the "whoosh" under the slam
function whoosh(dest, t, dur) {
  const c = audio();
  const n = c.createBufferSource();
  const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  n.buffer = buf;
  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.setValueAtTime(3200, t);
  bp.frequency.exponentialRampToValueAtTime(300, t + dur);
  bp.Q.value = 0.8;
  const g = c.createGain();
  g.gain.setValueAtTime(0.3, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  n.connect(bp).connect(g).connect(dest);
  n.start(t);
  n.stop(t + dur);
}

function kick(dest, t) {
  const c = audio();
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.frequency.setValueAtTime(150, t);
  osc.frequency.exponentialRampToValueAtTime(42, t + 0.16);
  g.gain.setValueAtTime(0.7, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.26);
  osc.connect(g).connect(dest);
  osc.start(t);
  osc.stop(t + 0.28);
}

let waveRaf = null;
function drawWave(analyser) {
  const canvas = els.wave;
  const wctx = canvas.getContext("2d");
  const data = new Uint8Array(analyser.fftSize);
  const colors = ["#17e6d0", "#ff2e88", "#c6ff2e"];
  let frame = 0;
  function loop() {
    analyser.getByteTimeDomainData(data);
    wctx.clearRect(0, 0, canvas.width, canvas.height);
    wctx.lineWidth = 3;
    wctx.strokeStyle = colors[Math.floor(frame / 14) % colors.length];
    wctx.beginPath();
    const slice = canvas.width / data.length;
    for (let i = 0; i < data.length; i++) {
      const v = data[i] / 128.0;
      const y = (v * canvas.height) / 2;
      const x = i * slice;
      if (i === 0) wctx.moveTo(x, y);
      else wctx.lineTo(x, y);
    }
    wctx.stroke();
    frame++;
    waveRaf = requestAnimationFrame(loop);
  }
  loop();
}
function stopWave() {
  if (waveRaf) cancelAnimationFrame(waveRaf);
  waveRaf = null;
  els.wave.classList.remove("on");
  els.wave.getContext("2d").clearRect(0, 0, els.wave.width, els.wave.height);
}

function playStinger() {
  const c = audio();
  const master = c.createGain();
  master.gain.value = 0.55;
  const analyser = c.createAnalyser();
  analyser.fftSize = 512;
  master.connect(analyser);
  analyser.connect(c.destination);

  const t0 = c.currentTime + 0.05;
  // three rising blips, one per body part revealing
  tone(master, 392.0, t0, 0.12, { type: "square", gain: 0.16 });
  tone(master, 493.88, t0 + 0.13, 0.12, { type: "square", gain: 0.16 });
  tone(master, 587.33, t0 + 0.26, 0.14, { type: "square", gain: 0.18 });
  // the slam: kick + whoosh + a bright power chord
  kick(master, t0 + 0.42);
  whoosh(master, t0 + 0.4, 0.5);
  [392.0, 493.88, 587.33, 784.0].forEach((f) =>
    tone(master, f, t0 + 0.44, 1.1, { type: "sawtooth", gain: 0.1, attack: 0.02, release: 0.6 })
  );

  els.wave.classList.add("on");
  drawWave(analyser);
  setTimeout(stopWave, 1700);
}

function speak(parts) {
  if (!window.speechSynthesis) return;
  try {
    window.speechSynthesis.cancel();
    const line = `Select! ${parts[0].title}! ${parts[1].title}! ${parts[2].title}! Baja Blast megazord — online!`;
    const utter = new SpeechSynthesisUtterance(line);
    utter.rate = 0.98;
    utter.pitch = 0.75;
    setTimeout(() => window.speechSynthesis.speak(utter), 350);
  } catch (_) {}
}

// ---- render ----------------------------------------------------------
function shareUrlFor(seed) {
  return "https://bajazord.bisks.net/z/" + encodeURIComponent(seed);
}

function buildShareText(seed, parts) {
  const names = parts.map((p) => p.title).join(" + ");
  const url = shareUrlFor(seed);
  const pilot = seed ? `@${seed}'s` : "a random";
  let text = `${pilot} Baja Blast Megazord: ${names}. assemble your own → ${url}`;
  if (text.length > 295) {
    text = `Baja Blast Megazord: ${names}. assemble your own → ${url}`;
  }
  return text;
}

function wrapCanvasText(ctx2d, text, x, y, maxWidth, lineHeight) {
  const words = text.split(" ");
  let line = "";
  let cy = y;
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (line && ctx2d.measureText(test).width > maxWidth) {
      ctx2d.fillText(line, x, cy);
      line = w;
      cy += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx2d.fillText(line, x, cy);
  return cy;
}

function buildShareCard(seed, parts) {
  const canvas = els.shareCanvas;
  const c2 = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  const mono = "ui-monospace, monospace";

  c2.clearRect(0, 0, W, H);
  c2.fillStyle = "#050912";
  c2.fillRect(0, 0, W, H);
  const glow = c2.createRadialGradient(W * 0.1, -H * 0.1, 0, W * 0.1, -H * 0.1, W * 0.6);
  glow.addColorStop(0, "rgba(23,230,208,0.25)");
  glow.addColorStop(1, "rgba(5,9,18,0)");
  c2.fillStyle = glow;
  c2.fillRect(0, 0, W, H);

  c2.textAlign = "left";
  c2.font = `900 60px ${mono}`;
  const g = c2.createLinearGradient(60, 0, 520, 0);
  g.addColorStop(0, "#17e6d0");
  g.addColorStop(0.55, "#ff2e88");
  g.addColorStop(1, "#c6ff2e");
  c2.fillStyle = g;
  c2.fillText("bajazord", 60, 110);

  c2.fillStyle = "#85a0a8";
  c2.font = `700 22px ${mono}`;
  c2.fillText(seed ? "pilot: @" + seed : "pilot: random roll", 60, 150);

  const roles = ["COCKPIT", "CORE", "THRUSTERS"];
  const colors = ["#17e6d0", "#ff2e88", "#c6ff2e"];
  const cardY = 200, rowH = 130;
  parts.forEach((p, i) => {
    const y = cardY + i * rowH;
    c2.fillStyle = "#0c1622";
    c2.strokeStyle = "#1c3040";
    c2.lineWidth = 1.5;
    c2.beginPath();
    c2.roundRect(60, y, W - 120, rowH - 18, 14);
    c2.fill();
    c2.stroke();

    c2.fillStyle = colors[i];
    c2.fillRect(60, y, 10, rowH - 18);

    c2.fillStyle = colors[i];
    c2.font = `800 15px ${mono}`;
    c2.fillText(roles[i], 92, y + 30);

    c2.fillStyle = "#eafffb";
    c2.font = `800 26px ${mono}`;
    c2.fillText(p.title, 92, y + 62);

    c2.fillStyle = "#85a0a8";
    c2.font = `400 15px ${mono}`;
    wrapCanvasText(c2, p.blurb, 92, y + 86, W - 220, 20);
  });

  c2.textAlign = "left";
  c2.fillStyle = "#17e6d0";
  c2.font = `700 20px ${mono}`;
  c2.fillText("bajazord.bisks.net", 60, H - 40);
}

function renderRoster(parts) {
  els.roster.innerHTML = "";
  parts.forEach((p, i) => {
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML =
      `<span class="swatch" style="background:${ROLES[i].color}"></span>` +
      `<span class="role">${ROLES[i].label}</span>` +
      `<span><a href="${p.url}" target="_blank" rel="noopener">${p.title}</a>` +
      `<span class="blurb">${p.blurb}</span></span>`;
    els.roster.appendChild(row);
    requestAnimationFrame(() => setTimeout(() => row.classList.add("show"), i * 90));
  });
}

function assemble(rawSeed) {
  if (!PARTS.length) {
    setStatus("still loading the parts catalog, try again in a second.", true);
    return;
  }
  const seed = cleanSeed(rawSeed) || randomSeed();
  lastSeed = seed;
  const parts = pickThree(seed, PARTS);

  els.mech.classList.remove("pending");
  els.mech.classList.remove("assembling");
  void els.mech.offsetWidth; // restart animation
  els.mech.classList.add("assembling");

  ROLES.forEach((role, i) => {
    const p = parts[i];
    const a = role.el();
    a.setAttribute("href", p.url);
    a.setAttribute("target", "_blank");
    a.setAttribute("rel", "noopener");
    role.title().textContent = p.title + " — " + p.blurb;
  });
  els.mech.classList.add("assembled");

  renderRoster(parts);
  playStinger();
  speak(parts);

  lastShareText = buildShareText(seed, parts);
  els.shareBluesky.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(lastShareText);
  buildShareCard(seed, parts);
  els.share.classList.add("show");

  const url = new URL(location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("h", seed);
  history.replaceState(null, "", url.pathname === "/" ? "/?h=" + encodeURIComponent(seed) : url);

  setStatus("");
}

els.form.addEventListener("submit", (e) => {
  e.preventDefault();
  els.assemble.disabled = true;
  assemble(els.input.value);
  setTimeout(() => { els.assemble.disabled = false; }, 400);
});

els.reroll.addEventListener("click", () => {
  els.input.value = "";
  assemble("");
});

els.shareDownload.addEventListener("click", () => {
  els.shareCanvas.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "bajazord-" + (lastSeed || "roll") + ".png";
    a.click();
    URL.revokeObjectURL(a.href);
  }, "image/png");
});

function canShareFiles() {
  if (!navigator.share || !navigator.canShare) return false;
  try {
    const probe = new File([""], "probe.png", { type: "image/png" });
    return navigator.canShare({ files: [probe] });
  } catch (_) {
    return false;
  }
}
if (canShareFiles()) {
  els.shareNative.style.display = "";
  els.shareNative.addEventListener("click", () => {
    els.shareCanvas.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], "bajazord-" + (lastSeed || "roll") + ".png", { type: "image/png" });
      try {
        await navigator.share({ files: [file], text: lastShareText, title: "bajazord" });
      } catch (_) {}
    }, "image/png");
  });
}

// ---- boot: load the parts pool, then auto-assemble if a seed is in the URL
const pathSeed = (location.pathname.match(/^\/z\/([^/]+)\/?$/) || [])[1];
const initialSeed = new URLSearchParams(location.search).get("h") || (pathSeed && decodeURIComponent(pathSeed)) || "";

setStatus("loading the parts catalog...");
fetch("/data/parts.json")
  .then((r) => r.json())
  .then((data) => {
    PARTS = data;
    setStatus("");
    if (initialSeed) {
      els.input.value = initialSeed;
      assemble(initialSeed);
    }
  })
  .catch(() => setStatus("couldn't load the parts catalog — reload?", true));
