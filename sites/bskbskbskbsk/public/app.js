// app.js — wires the start button, mode switcher and volume slider to the
// lure engine (lures.js, Web Audio) and the wandering dot (wander.js, pure
// math). The cycle timing itself lives in cycle.js so it stays testable
// without a browser.

import { createLureEngine } from "./lib/lures.js";
import { buildCycle } from "./lib/cycle.js";
import { wanderStep, pickTarget, hasArrived } from "./lib/wander.js";

const mainBtn = document.getElementById("main-btn");
const masterVol = document.getElementById("master-vol");
const modeBtns = [...document.querySelectorAll(".mode-btn")];
const modeVal = document.getElementById("mode-val");
const stage = document.getElementById("stage");
const dot = document.getElementById("dot");
const catCameBtn = document.getElementById("cat-came-btn");
const catCount = document.getElementById("cat-count");
const shareIntent = document.getElementById("share-intent");

const MODE_LABEL = { all: "all lures", clicks: "clicks only", chirp: "chirp only", squeak: "squeak only" };

let ctx = null;
let engine = null;
let playing = false;
let mode = "all";

let cycleTimeoutIds = [];
let cycleIntervalId = null;

let dotX = 0, dotY = 0, targetX = 0, targetY = 0, pausedUntil = 0, dotAnimId = null;

function setMode(next) {
  mode = next;
  modeVal.textContent = MODE_LABEL[mode];
  modeBtns.forEach((b) => b.classList.toggle("on", b.dataset.mode === mode));
  if (playing) scheduleCycle();
}
modeBtns.forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));
setMode("all");

async function ensureAudio() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    engine = createLureEngine(ctx);
    engine.setVolume(parseFloat(masterVol.value));
  }
  if (ctx.state === "suspended") await ctx.resume();
  return engine;
}

masterVol.addEventListener("input", () => {
  if (engine) engine.setVolume(parseFloat(masterVol.value));
});

function clearCycle() {
  cycleTimeoutIds.forEach(clearTimeout);
  cycleTimeoutIds = [];
  if (cycleIntervalId) clearInterval(cycleIntervalId);
  cycleIntervalId = null;
}

function fireEvent(type) {
  engine.play(type);
  if (type === "click" && "vibrate" in navigator) navigator.vibrate(25);
}

function scheduleCycle() {
  clearCycle();
  const { events, cycleMs } = buildCycle(mode);
  const fireOnce = () => {
    events.forEach((e) => {
      cycleTimeoutIds.push(setTimeout(() => fireEvent(e.type), e.at));
    });
  };
  fireOnce();
  cycleIntervalId = setInterval(fireOnce, cycleMs);
}

function stageBounds() {
  const r = stage.getBoundingClientRect();
  return { width: r.width, height: r.height };
}

function startDot() {
  const { width, height } = stageBounds();
  dotX = width / 2;
  dotY = height / 2;
  targetX = dotX;
  targetY = dotY;
  pausedUntil = 0;

  const tick = () => {
    const now = performance.now();
    const { width, height } = stageBounds();
    if (now >= pausedUntil) {
      const arrived = hasArrived(dotX, dotY, targetX, targetY, 2);
      if (arrived) {
        pausedUntil = now + 300 + Math.random() * 700;
        const t = pickTarget(width, height, Math.random);
        targetX = t.x;
        targetY = t.y;
      } else {
        const p = wanderStep(dotX, dotY, targetX, targetY, 0.07);
        dotX = p.x;
        dotY = p.y;
      }
    }
    dot.style.left = `${dotX}px`;
    dot.style.top = `${dotY}px`;
    dotAnimId = requestAnimationFrame(tick);
  };
  dotAnimId = requestAnimationFrame(tick);
}

function stopDot() {
  if (dotAnimId) cancelAnimationFrame(dotAnimId);
  dotAnimId = null;
}

mainBtn.addEventListener("click", async () => {
  if (!playing) {
    await ensureAudio();
    playing = true;
    mainBtn.textContent = "■ stop";
    stage.classList.add("active");
    scheduleCycle();
    startDot();
  } else {
    playing = false;
    mainBtn.textContent = "▶ start attracting";
    stage.classList.remove("active");
    clearCycle();
    stopDot();
  }
});

// ---- self-reported "a cat came" counter, local to this browser ------------

const STORAGE_KEY = "bskbskbskbsk-cat-reports";

function loadCount() {
  return parseInt(localStorage.getItem(STORAGE_KEY) || "0", 10) || 0;
}

function updateShare(count) {
  const text =
    count > 0
      ? `bskbskbskbsk actually worked on a cat for me (${count}x so far). bskbskbskbsk.bisks.net`
      : "trying to attract a cat with synthesized clicks, a chirp, a squeak and a wandering dot. bskbskbskbsk.bisks.net";
  shareIntent.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(text);
}

function refreshCount() {
  const count = loadCount();
  catCount.textContent = String(count);
  updateShare(count);
}

catCameBtn.addEventListener("click", () => {
  const count = loadCount() + 1;
  localStorage.setItem(STORAGE_KEY, String(count));
  refreshCount();
});

refreshCount();
