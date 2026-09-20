// touch the stove: a clicker that never says no. Every touch pays out;
// touching fast builds a combo multiplier that pays out more; secret bonus
// stoves spawn on a random timer (a variable-ratio schedule, the same shape
// that makes slot machines and notification badges hard to put down) and
// pay out a lot if you catch them before they fizzle. No login, no server —
// everything lives in localStorage.
import { multiplierForCombo } from "./lib/scoring.js";

const SITE_URL = "https://touchthestove.bisks.net/";
const STORAGE_KEY = "touchthestove:v1";
const COMBO_WINDOW_MS = 650;
const BONUS_MIN_DELAY_MS = 5000;
const BONUS_MAX_DELAY_MS = 15000;

const TOUCH_ACHIEVEMENTS = [
  { id: "t1", n: 1, title: "First Contact" },
  { id: "t2", n: 5, title: "Didn't Learn" },
  { id: "t3", n: 15, title: "Repeat Offender" },
  { id: "t4", n: 40, title: "Nerve Damage Enthusiast" },
  { id: "t5", n: 100, title: "Certified Menace" },
  { id: "t6", n: 250, title: "The Stove Flinches First" },
  { id: "t7", n: 600, title: "One With The Burner" },
  { id: "t8", n: 1500, title: "Beyond Pain" },
  { id: "t9", n: 4000, title: "Ascended" },
  { id: "t10", n: 10000, title: "The Stove Retired, Not You" },
];

const BONUS_ACHIEVEMENTS = [
  { id: "b1", n: 1, title: "Found One" },
  { id: "b2", n: 5, title: "Bonus Hunter" },
  { id: "b3", n: 15, title: "You're Not Supposed To See These" },
  { id: "b4", n: 40, title: "The Stoves Talk About You" },
];

const FLAVOR_LINES = [
  "OW.", "hot.", "worth it.", "again.", "no regrets.", "still fine.",
  "cannot stop.", "muscle memory now.", "this is the way.", "one more.",
  "definitely fine.", "the stove understands you.", "just once more.",
];
const BONUS_LINES = ["found it.", "lucky.", "that one paid.", "hidden stove located.", "nice reflexes."];
const JACKPOT_LINES = ["JACKPOT.", "the forbidden burner.", "you weren't supposed to find this one.", "certified secret."];

const els = {
  scoreVal: document.getElementById("scoreVal"),
  touchVal: document.getElementById("touchVal"),
  comboVal: document.getElementById("comboVal"),
  stage: document.getElementById("stage"),
  stove: document.getElementById("stove"),
  flavor: document.getElementById("flavor"),
  titleBanner: document.getElementById("titleBanner"),
  achList: document.getElementById("achList"),
  shareBluesky: document.getElementById("shareBluesky"),
  resetBtn: document.getElementById("resetBtn"),
};

function defaultState() {
  return { score: 0, touches: 0, bonusFound: 0, bestCombo: 0, achTouch: [], achBonus: [] };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    return Object.assign(defaultState(), JSON.parse(raw));
  } catch {
    return defaultState();
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // storage full or disabled — the game still works this session, it just won't persist
  }
}

let state = loadState();
let comboCount = 0;
let lastTouchTime = 0;
let comboResetTimer = null;
let bannerTimer = null;
let audioCtx = null;

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function renderStats() {
  els.scoreVal.textContent = state.score;
  els.touchVal.textContent = state.touches;
}

function renderAchievements() {
  const parts = [];
  for (const a of TOUCH_ACHIEVEMENTS) {
    if (state.achTouch.includes(a.id)) parts.push(`<span class="ach earned">🏅 ${a.title}</span>`);
  }
  const nextTouch = TOUCH_ACHIEVEMENTS.find((a) => !state.achTouch.includes(a.id));
  if (nextTouch) parts.push(`<span class="ach locked">🔒 ??? at ${nextTouch.n} touches</span>`);

  for (const a of BONUS_ACHIEVEMENTS) {
    if (state.achBonus.includes(a.id)) parts.push(`<span class="ach earned">✨ ${a.title}</span>`);
  }
  const nextBonus = BONUS_ACHIEVEMENTS.find((a) => !state.achBonus.includes(a.id));
  if (nextBonus) parts.push(`<span class="ach locked">🔒 ??? at ${nextBonus.n} secret stoves</span>`);

  els.achList.innerHTML = parts.join("");
}

function announceTitle(text) {
  els.titleBanner.textContent = "🏅 new title: " + text;
  els.titleBanner.hidden = false;
  els.titleBanner.classList.remove("pop");
  void els.titleBanner.offsetWidth;
  els.titleBanner.classList.add("pop");
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => {
    els.titleBanner.hidden = true;
  }, 4000);
}

function checkTouchAchievements() {
  for (const a of TOUCH_ACHIEVEMENTS) {
    if (state.touches >= a.n && !state.achTouch.includes(a.id)) {
      state.achTouch.push(a.id);
      announceTitle(a.title);
    }
  }
  saveState();
  renderAchievements();
}

function checkBonusAchievements() {
  for (const a of BONUS_ACHIEVEMENTS) {
    if (state.bonusFound >= a.n && !state.achBonus.includes(a.id)) {
      state.achBonus.push(a.id);
      announceTitle(a.title);
    }
  }
  saveState();
  renderAchievements();
}

function updateShareLink() {
  const bestMult = multiplierForCombo(state.bestCombo);
  const text =
    `i have touched the stove ${state.touches} times and generated ${state.score} heat ` +
    `on touchthestove.bisks.net (best combo ×${bestMult}). it has taught me nothing. ${SITE_URL}`;
  els.shareBluesky.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(text);
}

function spawnFloater(text, x, y) {
  const el = document.createElement("span");
  el.className = "floater";
  el.textContent = text;
  el.style.left = x + "px";
  el.style.top = y + "px";
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 900);
}

function showFlavor(text) {
  els.flavor.textContent = text;
  els.flavor.classList.remove("show");
  void els.flavor.offsetWidth;
  els.flavor.classList.add("show");
}

function shakeBody(mult) {
  if (mult < 2) return;
  document.body.classList.remove("shake");
  void document.body.offsetWidth;
  document.body.classList.add("shake");
}

function setHeat(v) {
  els.stove.style.setProperty("--heat", String(Math.max(0, Math.min(100, v))));
}

function ensureAudio() {
  try {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      audioCtx = new Ctx();
    }
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  } catch {
    return null;
  }
}

function playTone(mult, opts = {}) {
  const ctx = ensureAudio();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = opts.type || "square";
  const freq = (opts.baseFreq || 220) + mult * 35;
  osc.frequency.setValueAtTime(freq, ctx.currentTime);
  gain.gain.setValueAtTime(0.001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(opts.vol || 0.08, ctx.currentTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.14);
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.15);
}

function playBonusChime(jackpot) {
  const base = jackpot ? 400 : 300;
  [0, 90, 180].forEach((t, i) => {
    setTimeout(() => playTone(i + 2, { baseFreq: base + i * 120, type: "sine", vol: 0.09 }), t);
  });
}

function onTouch(x, y) {
  const now = Date.now();
  comboCount = now - lastTouchTime <= COMBO_WINDOW_MS ? comboCount + 1 : 1;
  lastTouchTime = now;
  const mult = multiplierForCombo(comboCount);

  state.score += mult;
  state.touches += 1;
  if (comboCount > state.bestCombo) state.bestCombo = comboCount;
  saveState();

  renderStats();
  els.comboVal.textContent = "×" + mult;
  setHeat(mult * 9 + comboCount * 2);
  spawnFloater("+" + mult, x, y);
  showFlavor(pick(FLAVOR_LINES));
  shakeBody(mult);
  playTone(mult);
  updateShareLink();
  checkTouchAchievements();

  clearTimeout(comboResetTimer);
  comboResetTimer = setTimeout(() => {
    comboCount = 0;
    els.comboVal.textContent = "×1";
    setHeat(0);
  }, COMBO_WINDOW_MS + 50);
}

function rectsOverlap(x, y, size, rect) {
  const pad = 24;
  return !(
    x + size < rect.left - pad ||
    x > rect.right + pad ||
    y + size < rect.top - pad ||
    y > rect.bottom + pad
  );
}

function scheduleBonus() {
  const delay = BONUS_MIN_DELAY_MS + Math.random() * (BONUS_MAX_DELAY_MS - BONUS_MIN_DELAY_MS);
  setTimeout(spawnBonus, delay);
}

function fizzle(btn) {
  btn.classList.add("fizzle");
  setTimeout(() => btn.remove(), 400);
}

function spawnBonus() {
  if (document.hidden) {
    scheduleBonus();
    return;
  }
  const jackpot = Math.random() < 0.08;
  const size = jackpot ? 60 : 46;
  const margin = 16;
  const stageRect = els.stage.getBoundingClientRect();

  let x = margin, y = margin, tries = 0;
  do {
    x = margin + Math.random() * Math.max(1, window.innerWidth - size - margin * 2);
    y = margin + Math.random() * Math.max(1, window.innerHeight - size - margin * 2);
    tries++;
  } while (tries < 8 && rectsOverlap(x, y, size, stageRect));

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "bonus-stove" + (jackpot ? " jackpot" : "");
  btn.style.left = x + "px";
  btn.style.top = y + "px";
  btn.setAttribute("aria-label", "secret bonus stove");
  btn.textContent = jackpot ? "💎" : "🔥";
  document.body.appendChild(btn);

  const life = jackpot ? 1600 : 1800 + Math.random() * 1400;
  let claimed = false;

  btn.addEventListener(
    "click",
    (e) => {
      if (claimed) return;
      claimed = true;
      const value = jackpot ? 150 + Math.floor(Math.random() * 250) : 15 + Math.floor(Math.random() * 45);
      state.score += value;
      state.bonusFound += 1;
      saveState();
      renderStats();
      spawnFloater("+" + value, e.clientX, e.clientY);
      showFlavor(pick(jackpot ? JACKPOT_LINES : BONUS_LINES));
      playBonusChime(jackpot);
      updateShareLink();
      btn.remove();
      checkBonusAchievements();
      scheduleBonus();
    },
    { once: true }
  );

  setTimeout(() => {
    if (claimed) return;
    fizzle(btn);
    scheduleBonus();
  }, life);
}

function wireStove() {
  els.stove.addEventListener("click", (e) => onTouch(e.clientX, e.clientY));
}

function wireReset() {
  els.resetBtn.addEventListener("click", () => {
    if (!confirm("start over? this clears your heat, touches, and titles.")) return;
    localStorage.removeItem(STORAGE_KEY);
    location.reload();
  });
}

renderStats();
renderAchievements();
updateShareLink();
wireStove();
wireReset();
scheduleBonus();
