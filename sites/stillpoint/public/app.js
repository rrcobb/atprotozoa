import { PATHS } from "./paths.js";
import { AmbientAudio } from "./audio.js";

const SITE_URL = "https://stillpoint.bisks.net/";
const LS_KEY = "stillpoint-settings";

const els = {
  menu: document.getElementById("menu"),
  pathCards: document.getElementById("pathCards"),
  session: document.getElementById("session"),
  complete: document.getElementById("complete"),
  circle: document.getElementById("circle"),
  sessionTitle: document.getElementById("sessionTitle"),
  caption: document.getElementById("caption"),
  progressFill: document.getElementById("progressFill"),
  timeElapsed: document.getElementById("timeElapsed"),
  timeTotal: document.getElementById("timeTotal"),
  playPauseBtn: document.getElementById("playPauseBtn"),
  stopBtn: document.getElementById("stopBtn"),
  voiceSelect: document.getElementById("voiceSelect"),
  rateRange: document.getElementById("rateRange"),
  voiceVolume: document.getElementById("voiceVolume"),
  musicVolume: document.getElementById("musicVolume"),
  completeTitle: document.getElementById("completeTitle"),
  completeSub: document.getElementById("completeSub"),
  restartBtn: document.getElementById("restartBtn"),
  backBtn: document.getElementById("backBtn"),
  shareIntent: document.getElementById("shareIntent"),
  copyLink: document.getElementById("copyLink"),
};

const speechSupported = "speechSynthesis" in window;
const ambient = new AmbientAudio();

// ── settings, persisted across visits ─────────────────────────────────
const settings = loadSettings();
els.rateRange.value = settings.rate;
els.voiceVolume.value = settings.voiceVolume;
els.musicVolume.value = settings.musicVolume;

function loadSettings() {
  const defaults = { rate: 95, voiceVolume: 100, musicVolume: 55, voiceName: "" };
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return defaults;
    return { ...defaults, ...JSON.parse(raw) };
  } catch {
    return defaults;
  }
}
function saveSettings() {
  try {
    localStorage.setItem(
      LS_KEY,
      JSON.stringify({
        rate: els.rateRange.value,
        voiceVolume: els.voiceVolume.value,
        musicVolume: els.musicVolume.value,
        voiceName: els.voiceSelect.value,
      })
    );
  } catch {
    // storage disabled — settings just won't persist, fine
  }
}

// ── voice list ───────────────────────────────────────────────────────
function populateVoices() {
  if (!speechSupported) {
    els.voiceSelect.innerHTML = '<option value="">(no speech synthesis in this browser)</option>';
    els.voiceSelect.disabled = true;
    return;
  }
  const voices = speechSynthesis.getVoices().filter((v) => v.lang.startsWith("en") || v.default);
  const list = voices.length ? voices : speechSynthesis.getVoices();
  if (!list.length) return;
  els.voiceSelect.innerHTML = list
    .map((v) => `<option value="${v.name}">${v.name} — ${v.lang}</option>`)
    .join("");
  if (settings.voiceName && list.some((v) => v.name === settings.voiceName)) {
    els.voiceSelect.value = settings.voiceName;
  }
}
if (speechSupported) {
  populateVoices();
  speechSynthesis.addEventListener("voiceschanged", populateVoices);
}

// ── path menu ────────────────────────────────────────────────────────
els.pathCards.innerHTML = PATHS.map(
  (p, i) => `
    <button class="card" type="button" data-idx="${i}">
      <h2>${p.title} <span class="mins">~${p.minutes} min</span></h2>
      <p>${p.tagline}</p>
    </button>`
).join("");
els.pathCards.querySelectorAll(".card").forEach((btn) => {
  btn.addEventListener("click", () => startSession(PATHS[Number(btn.dataset.idx)]));
});

// ── timing helpers ───────────────────────────────────────────────────
function estimateSpeakSeconds(text, rate) {
  const words = text.trim().split(/\s+/).length;
  const wordsPerSecond = 2.5 * rate;
  return words / wordsPerSecond;
}
function estimateTotalSeconds(path, rate) {
  return path.lines.reduce((sum, line) => sum + estimateSpeakSeconds(line.text, rate) + line.pause, 0);
}
function formatTime(seconds) {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}
const sleepMs = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitInterruptible(seconds, state) {
  let remaining = seconds * 1000;
  while (remaining > 0) {
    if (state.stopped) return;
    await sleepMs(100);
    if (!state.paused) remaining -= 100;
  }
}

function speakLine(text, state) {
  return new Promise((resolve) => {
    if (!speechSupported) {
      waitInterruptible(estimateSpeakSeconds(text, state.rate), state).then(resolve);
      return;
    }
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = state.rate;
    utter.volume = state.voiceVolume;
    if (state.voice) utter.voice = state.voice;
    utter.onend = () => resolve();
    utter.onerror = () => resolve();
    speechSynthesis.speak(utter);
  });
}

// ── session playback ─────────────────────────────────────────────────
let current = null; // { path, state, ticker, keepAlive }
let lastPath = null;

function showView(view) {
  els.menu.classList.toggle("hidden", view !== "menu");
  els.session.classList.toggle("active", view === "session");
  els.complete.classList.toggle("active", view === "complete");
}

async function startSession(path) {
  const rate = Number(els.rateRange.value) / 100;
  const voiceVolume = Number(els.voiceVolume.value) / 100;
  const musicVolume = Number(els.musicVolume.value) / 100;
  const voiceName = els.voiceSelect.value;
  const voice = speechSupported ? speechSynthesis.getVoices().find((v) => v.name === voiceName) : null;
  saveSettings();

  const state = { stopped: false, paused: false, rate, voiceVolume, voice, elapsedMs: 0 };
  const totalSeconds = estimateTotalSeconds(path, rate);
  current = { path, state, totalSeconds };

  els.sessionTitle.textContent = path.title;
  els.caption.textContent = "Beginning…";
  els.caption.classList.add("dim");
  els.progressFill.style.width = "0%";
  els.timeElapsed.textContent = "0:00";
  els.timeTotal.textContent = formatTime(totalSeconds);
  els.playPauseBtn.textContent = "Pause";
  els.circle.classList.remove("paused");
  showView("session");

  if (musicVolume > 0) ambient.start(musicVolume);
  ambient.chime();

  const ticker = setInterval(() => {
    if (state.stopped || state.paused) return;
    state.elapsedMs += 250;
    els.timeElapsed.textContent = formatTime(state.elapsedMs / 1000);
    const pct = Math.min(100, (state.elapsedMs / 1000 / totalSeconds) * 100);
    els.progressFill.style.width = pct + "%";
  }, 250);
  current.ticker = ticker;

  // Chrome silently stops speechSynthesis after ~15s unless nudged.
  const keepAlive = speechSupported
    ? setInterval(() => {
        try {
          if (speechSynthesis.speaking && !state.paused) {
            speechSynthesis.pause();
            speechSynthesis.resume();
          }
        } catch {
          // best-effort nudge only
        }
      }, 9000)
    : null;
  current.keepAlive = keepAlive;

  for (const line of path.lines) {
    if (state.stopped) break;
    els.caption.textContent = line.text;
    els.caption.classList.remove("dim");
    await speakLine(line.text, state);
    if (state.stopped) break;
    await waitInterruptible(line.pause, state);
  }

  clearInterval(ticker);
  if (keepAlive) clearInterval(keepAlive);

  if (!state.stopped) {
    finishSession(path, state);
  }
}

function finishSession(path, state) {
  ambient.chime(0.28);
  setTimeout(() => ambient.stop(), 1200);

  lastPath = path;
  const minutes = Math.max(1, Math.round(state.elapsedMs / 60000));
  els.completeTitle.textContent = `${path.title} complete`;
  els.completeSub.textContent = `You just spent about ${minutes} minute${minutes === 1 ? "" : "s"} with your breath. Come back whenever you need to.`;

  const shareText = `Just finished a ${path.minutes}-minute ${path.title} meditation on stillpoint 🧘 ${SITE_URL}`;
  els.shareIntent.href = `https://bsky.app/intent/compose?text=${encodeURIComponent(shareText)}`;

  showView("complete");
  current = null;
}

function stopSession() {
  if (!current) return;
  current.state.stopped = true;
  if (speechSupported) speechSynthesis.cancel();
  clearInterval(current.ticker);
  if (current.keepAlive) clearInterval(current.keepAlive);
  ambient.stop();
  current = null;
  showView("menu");
}

els.playPauseBtn.addEventListener("click", () => {
  if (!current) return;
  const { state } = current;
  state.paused = !state.paused;
  els.playPauseBtn.textContent = state.paused ? "Resume" : "Pause";
  els.circle.classList.toggle("paused", state.paused);
  if (speechSupported) {
    try {
      if (state.paused) speechSynthesis.pause();
      else speechSynthesis.resume();
    } catch {
      // pause/resume support varies — playback state still tracked locally
    }
  }
});
els.stopBtn.addEventListener("click", stopSession);

els.musicVolume.addEventListener("input", () => {
  const v = Number(els.musicVolume.value) / 100;
  if (!ambient.running && v > 0 && current) ambient.start(v);
  else ambient.setVolume(v);
});

els.restartBtn.addEventListener("click", () => {
  if (lastPath) startSession(lastPath);
});
els.backBtn.addEventListener("click", () => showView("menu"));

els.copyLink.addEventListener("click", async (e) => {
  try {
    await navigator.clipboard.writeText(SITE_URL);
    e.target.textContent = "✓ copied!";
    setTimeout(() => (e.target.textContent = "🔗 copy link"), 1800);
  } catch {
    e.target.textContent = "copy failed — select the URL";
  }
});

window.addEventListener("beforeunload", () => {
  if (speechSupported) speechSynthesis.cancel();
});
