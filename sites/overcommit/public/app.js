// overcommit — every real post on Jetstream v2 becomes a skate trick; chain
// them into a combo, and when the firehose's post rate genuinely spikes
// (same rolling mean/std trick sites/kolpelor uses for its World Pelor), the
// run lands the one combo that doesn't really exist: an indy nosebone,
// 50-50, fs rail grind — named after whichever real account's post rode the
// spike. Pure client-side WebSocket, no server state; nothing persists
// beyond this tab's localStorage.

const WS_URL = "wss://jetstream2.us-east.bsky.network/subscribe?wantedCollections=app.bsky.feed.post";
const PUB = "https://api.bsky.app/xrpc";

// Jetstream's post-create stream rarely goes quiet for long — it's several
// events/sec most of the time — so landings are driven on a fixed cadence,
// not by waiting for silence. STALL_GAP_MS is just a safety net for a real
// lull (a reconnect, a dead network).
const LAND_INTERVAL_MS = 4000; // bank whatever's in the chain on this cadence
const STALL_GAP_MS = 6000; // land early if the firehose genuinely goes quiet
const MAX_CHAIN = 60; // land early if a chain gets this long (rate spike)
const BASE_PTS = 15; // per-trick base, multiplied by chain position

const TICK_MS = 2000;
const RATE_WINDOW_MS = 8000;
const HISTORY_LEN = 90;
const SPIKE_COOLDOWN_MS = 60_000;
const GUARANTEE_MS = 3 * 60_000; // force one Impossible Combo if the firehose hasn't organically spiked by then
const AUTHOR_BUFFER = 50;
const MAX_PROFILE_ATTEMPTS = 5;
const IMPOSSIBLE_BONUS = 25_000;

// --- trick lexicon: real skate vocabulary mashed into coding-agent jargon ---
const STANCES = ["Switch", "Fakie", "Nollie", "Half-Cab", "Full-Cab", ""];
const FLIPS = ["Kickflip", "Heelflip", "Tre Flip", "Varial Flip", "Hardflip", "Impossible"];
const GRABS = ["Indy", "Method", "Mute", "Stalefish", "Benihana", "Judo", "Seatbelt", "Rocket Air"];
const GRAB_SUFFIX = ["Nosebone", "Bonestone", "Truckdriver", "Sadplant", "", "", ""];
const GRINDS = ["50-50", "5-0", "Boardslide", "Noseslide", "Tailslide", "Smith Grind", "Feeble Grind", "Crooked Grind", "Disaster", "Nosegrind", "Bluntslide", "Overcrook"];
const SIDES = ["FS", "BS"];
const RAILS = ["Rail", "Ledge", "Hubba", "Handrail", "Curb", "Manual Pad"];
const AGENT_BITS = [
  "Rebase", "Refactor", "Merge Conflict", "Force Push", "Hot Reload", "Cold Start",
  "Context Compact", "Tool Call", "Token Budget", "Prompt Injection Dodge",
  "Flaky Test Retry", "Greedy Commit", "YOLO Merge", "Vibe Check", "Rate-Limit Dodge",
  "Cache Bust", "Squash Commit", "Git Blame", "Lint Pass", "CI Green",
];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function generateTrick() {
  const stance = pick(STANCES);
  const family = Math.random();
  let core;
  if (family < 0.45) {
    core = `${pick(GRINDS)} ${pick(SIDES)} ${pick(RAILS)}`;
  } else if (family < 0.75) {
    const suffix = pick(GRAB_SUFFIX);
    core = suffix ? `${pick(GRABS)} ${suffix}` : pick(GRABS);
  } else {
    core = pick(FLIPS);
  }
  const agent = pick(AGENT_BITS);
  return `${stance ? stance + " " : ""}${core} ${agent}`.replace(/\s+/g, " ").trim();
}

// --- DOM ---
const els = {
  dot: document.getElementById("dot"),
  connLabel: document.getElementById("connLabel"),
  score: document.getElementById("score"),
  combo: document.getElementById("combo"),
  best: document.getElementById("best"),
  chips: document.getElementById("chips"),
  emptyRail: document.getElementById("emptyRail"),
  landBanner: document.getElementById("landBanner"),
  impossible: document.getElementById("impossible"),
  impHeadline: document.getElementById("impHeadline"),
  impBody: document.getElementById("impBody"),
  logList: document.getElementById("logList"),
  shareCard: document.getElementById("shareCard"),
  shareBsky: document.getElementById("shareBsky"),
  downloadCard: document.getElementById("downloadCard"),
  card: document.getElementById("card"),
  soundToggle: document.getElementById("soundToggle"),
};

// --- sound effects: synthesized Tony Hawk-style trick blips, muted by ---
// default (asked for explicitly — with events arriving several/sec off the
// real firehose, unmuted this is a deliberate cluttered cacophony).
const SOUND_KEY = "overcommit:sound";
let audioCtx = null;
let masterGain = null;
let soundOn = localStorage.getItem(SOUND_KEY) === "1";

function ensureAudio() {
  if (audioCtx) return audioCtx;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  audioCtx = new Ctx();
  masterGain = audioCtx.createGain();
  masterGain.gain.value = 0.5;
  masterGain.connect(audioCtx.destination);
  return audioCtx;
}

function noiseBurst(ctx, duration) {
  const n = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  return src;
}

// short arcade "flick" per trick — pitch rises a bit with combo length so a
// long chain audibly ramps up, same way THPS combo meters get more frantic
function playTrickBlip(comboLen) {
  if (!soundOn) return;
  const ctx = ensureAudio();
  if (!ctx) return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const freq = 260 + Math.min(comboLen, 20) * 16 + Math.random() * 40;
  osc.type = "square";
  osc.frequency.setValueAtTime(freq, t);
  osc.frequency.exponentialRampToValueAtTime(freq * 1.7, t + 0.06);
  gain.gain.setValueAtTime(0.16, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
  osc.connect(gain).connect(masterGain);
  osc.start(t);
  osc.stop(t + 0.09);
}

// low thud + noise swoosh when a combo banks
function playLandThud(big) {
  if (!soundOn) return;
  const ctx = ensureAudio();
  if (!ctx) return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(big ? 160 : 110, t);
  osc.frequency.exponentialRampToValueAtTime(40, t + 0.25);
  gain.gain.setValueAtTime(big ? 0.5 : 0.32, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
  osc.connect(gain).connect(masterGain);
  osc.start(t);
  osc.stop(t + 0.32);

  const src = noiseBurst(ctx, 0.25);
  const filt = ctx.createBiquadFilter();
  filt.type = "highpass";
  filt.frequency.value = 1200;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(big ? 0.25 : 0.15, t);
  ng.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
  src.connect(filt).connect(ng).connect(masterGain);
  src.start(t);
}

// triumphant little arpeggio for the one combo that isn't real
function playImpossibleFanfare() {
  if (!soundOn) return;
  const ctx = ensureAudio();
  if (!ctx) return;
  const t = ctx.currentTime;
  const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
  notes.forEach((f, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.value = f;
    const start = t + i * 0.09;
    gain.gain.setValueAtTime(0.001, start);
    gain.gain.exponentialRampToValueAtTime(0.3, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.35);
    osc.connect(gain).connect(masterGain);
    osc.start(start);
    osc.stop(start + 0.4);
  });
  playLandThud(true);
}

function updateSoundToggle() {
  els.soundToggle.textContent = soundOn ? "🔊 sound" : "🔇 sound";
  els.soundToggle.setAttribute("aria-pressed", soundOn ? "true" : "false");
  els.soundToggle.classList.toggle("on", soundOn);
}

function setSound(on) {
  soundOn = on;
  localStorage.setItem(SOUND_KEY, on ? "1" : "0");
  updateSoundToggle();
  if (on) {
    const ctx = ensureAudio();
    if (ctx && ctx.state === "suspended") ctx.resume();
    playTrickBlip(1);
  }
}

els.soundToggle.addEventListener("click", () => setSound(!soundOn));
updateSoundToggle();

const MAX_CHIPS = 7;
const MAX_LOG = 8;

// --- run state ---
let totalScore = 0;
let chain = []; // trick strings in the current combo
let chainScore = 0;
let landTimer = null;
let runLog = [];

const stored = safeParse(localStorage.getItem("overcommit:best"));
let best = stored || { score: 0, text: "", at: 0 };

function safeParse(s) { try { return JSON.parse(s); } catch { return null; } }

function fmt(n) { return Math.round(n).toLocaleString("en-US"); }

function renderHud() {
  els.score.textContent = fmt(totalScore + chainScore);
  els.combo.textContent = chain.length;
  els.best.textContent = best.score ? `${fmt(best.score)} — ${best.text}` : "—";
}

function addChip(text, isSpark) {
  const chip = document.createElement("div");
  chip.className = "chip" + (isSpark ? " spark" : "");
  chip.textContent = text;
  els.chips.appendChild(chip);
  els.emptyRail.style.display = "none";
  while (els.chips.children.length > MAX_CHIPS) {
    els.chips.removeChild(els.chips.firstChild);
  }
}

function flashLandBanner(text) {
  els.landBanner.textContent = text;
  els.landBanner.classList.add("show");
  setTimeout(() => els.landBanner.classList.remove("show"), 1400);
}

function pushLog(text, pts) {
  runLog.unshift({ text, pts, at: Date.now() });
  runLog = runLog.slice(0, MAX_LOG);
  els.logList.innerHTML = runLog
    .map((e) => `<li><span>${escapeHtml(e.text)}</span><span class="pts">+${fmt(e.pts)}</span></li>`)
    .join("");
}

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function addTrick() {
  const trick = generateTrick();
  chain.push(trick);
  const gain = BASE_PTS * chain.length;
  chainScore += gain;
  addChip(trick, chain.length % 5 === 0);
  playTrickBlip(chain.length);
  renderHud();
  clearTimeout(landTimer);
  landTimer = setTimeout(landCombo, STALL_GAP_MS);
  if (chain.length >= MAX_CHAIN) landCombo();
}

function landCombo() {
  if (!chain.length) return;
  clearTimeout(landTimer);
  const text = chain.length > 2 ? `${chain[0]} → … → ${chain[chain.length - 1]} (${chain.length}x)` : chain.join(" → ");
  totalScore += chainScore;
  pushLog(text, chainScore);
  flashLandBanner(`LANDED +${fmt(chainScore)}`);
  playLandThud(chain.length >= 10);
  if (chainScore > best.score) {
    best = { score: chainScore, text, at: Date.now() };
    localStorage.setItem("overcommit:best", JSON.stringify(best));
  }
  chain = [];
  chainScore = 0;
  renderHud();
}

// --- Jetstream v2 connection ---
let socket = null;
let connecting = false;
let eventTimes = [];
let authorBuffer = [];
let history = [];
let connectedAt = 0;
let lastSpikeAt = 0;
let everSpiked = false;
let spawnInFlight = false;

function setConn(label, live) {
  els.connLabel.textContent = label;
  els.dot.classList.toggle("live", !!live);
}

function connect() {
  if (socket || connecting) return;
  connecting = true;
  setConn("connecting…", false);
  try {
    socket = new WebSocket(WS_URL);
  } catch {
    connecting = false;
    setTimeout(connect, 2000);
    return;
  }
  if (!connectedAt) connectedAt = Date.now();

  socket.onopen = () => {
    connecting = false;
    setConn("live off Jetstream v2", true);
  };
  socket.onmessage = (e) => {
    let msg;
    try { msg = JSON.parse(e.data); } catch { return; }
    if (msg.kind !== "commit" || !msg.commit || msg.commit.operation !== "create") return;
    eventTimes.push(Date.now());
    if (msg.did) {
      authorBuffer.push(msg.did);
      if (authorBuffer.length > AUTHOR_BUFFER) authorBuffer.shift();
    }
    addTrick();
  };
  socket.onclose = () => {
    socket = null;
    connecting = false;
    setConn("reconnecting…", false);
    setTimeout(connect, 2000);
  };
  socket.onerror = () => {
    try { socket.close(); } catch { /* onclose reconnects */ }
  };
}

function tick() {
  const now = Date.now();
  eventTimes = eventTimes.filter((t) => now - t <= RATE_WINDOW_MS);
  const rate = eventTimes.length / (RATE_WINDOW_MS / 1000);

  history.push(rate);
  if (history.length > HISTORY_LEN) history.shift();

  const baseline = history.slice(0, -1);
  let z = 0;
  if (baseline.length >= 8) {
    const mean = baseline.reduce((a, v) => a + v, 0) / baseline.length;
    const variance = baseline.reduce((a, v) => a + (v - mean) ** 2, 0) / baseline.length;
    const std = Math.max(Math.sqrt(variance), 0.5);
    z = (rate - mean) / std;
  }

  maybeSpawnImpossible(now, z);
}

function maybeSpawnImpossible(now, z) {
  if (spawnInFlight) return;
  if (now - lastSpikeAt < SPIKE_COOLDOWN_MS) return;
  if (!authorBuffer.length) return;

  const organicSpike = z >= 2.2;
  const overdue = !everSpiked && connectedAt && now - connectedAt >= GUARANTEE_MS;
  if (!organicSpike && !overdue) return;

  everSpiked = true;
  lastSpikeAt = now;
  landImpossible();
}

async function fetchHandle(did) {
  const r = await fetch(`${PUB}/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const p = await r.json();
  return p.handle || did;
}

async function landImpossible() {
  spawnInFlight = true;
  clearTimeout(landTimer);

  const bonus = IMPOSSIBLE_BONUS + chainScore * 2;
  totalScore += bonus;
  const text = "Indy Nosebone — 50-50 FS Rail Grind";

  const candidates = authorBuffer.slice().reverse();
  const tried = new Set();
  let handle = null;
  for (const did of candidates) {
    if (tried.has(did)) continue;
    tried.add(did);
    try {
      handle = await fetchHandle(did);
      break;
    } catch { /* try next */ }
    if (tried.size >= MAX_PROFILE_ATTEMPTS) break;
  }

  chain = [];
  chainScore = 0;
  playImpossibleFanfare();

  els.impHeadline.textContent = "IMPOSSIBLE COMBO LANDED";
  els.impBody.innerHTML = handle
    ? `The firehose actually spiked, so the run stuck the one that doesn't exist — <b>${escapeHtml(text)}</b> — riding whatever <b>@${escapeHtml(handle)}</b> just posted. +${fmt(bonus)}.`
    : `The firehose actually spiked, so the run stuck the one that doesn't exist — <b>${escapeHtml(text)}</b>. +${fmt(bonus)}.`;
  els.impossible.classList.add("show");

  pushLog(`⭐ ${text}${handle ? " (@" + handle + ")" : ""}`, bonus);
  if (bonus > best.score) {
    best = { score: bonus, text: `${text}${handle ? " — @" + handle : ""}`, at: Date.now() };
    localStorage.setItem("overcommit:best", JSON.stringify(best));
  }
  renderHud();
  spawnInFlight = false;
}

// --- sharing ---
function shareText() {
  const scoreText = best.score ? `${fmt(best.score)} style points (${best.text})` : `${fmt(totalScore)} style points`;
  return `overcommit just landed ${scoreText} grinding the live Bluesky firehose — watch it happen at https://overcommit.bisks.net/`;
}

function updateShareLink() {
  els.shareBsky.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(shareText());
}

function buildShareCard() {
  const ctx = els.card.getContext("2d");
  const W = els.card.width, H = els.card.height;

  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, "#0b0b10");
  grad.addColorStop(1, "#14141d");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "#e8ff3d";
  ctx.font = "800 54px 'JetBrains Mono', monospace";
  ctx.fillText("overcommit", 64, 110);

  ctx.fillStyle = "#8d8fa8";
  ctx.font = "600 22px 'JetBrains Mono', monospace";
  ctx.fillText("live off Bluesky's Jetstream v2 firehose", 64, 150);

  ctx.strokeStyle = "#2a2a38";
  ctx.lineWidth = 2;
  ctx.strokeRect(64, 200, W - 128, 300);

  ctx.fillStyle = "#ff3df0";
  ctx.font = "800 26px 'JetBrains Mono', monospace";
  ctx.fillText("SESSION BEST", 96, 250);

  ctx.fillStyle = "#37e0ff";
  ctx.font = "800 72px 'JetBrains Mono', monospace";
  ctx.fillText(fmt(best.score || totalScore || 0), 96, 340);

  ctx.fillStyle = "#eef0ff";
  ctx.font = "700 24px 'JetBrains Mono', monospace";
  const label = (best.text || "grinding the rail, no combo landed yet");
  wrapText(ctx, label, 96, 400, W - 256, 32);

  ctx.fillStyle = "#8d8fa8";
  ctx.font = "600 20px 'JetBrains Mono', monospace";
  ctx.fillText("overcommit.bisks.net", 64, H - 48);

  els.downloadCard.href = els.card.toDataURL("image/png");
  els.downloadCard.style.display = "inline-flex";
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(" ");
  let line = "";
  let cy = y;
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, cy);
      line = w;
      cy += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, cy);
}

async function shareCard() {
  buildShareCard();
  if (navigator.share && navigator.canShare) {
    try {
      const blob = await new Promise((res) => els.card.toBlob(res, "image/png"));
      const file = new File([blob], "overcommit.png", { type: "image/png" });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], text: shareText(), title: "overcommit" });
        return;
      }
    } catch { /* fall through to download link */ }
  }
}

els.shareCard.addEventListener("click", shareCard);

// --- boot ---
renderHud();
updateShareLink();
setInterval(updateShareLink, 5000);
connect();
setInterval(tick, TICK_MS);
setInterval(() => { if (chain.length) landCombo(); }, LAND_INTERVAL_MS);
