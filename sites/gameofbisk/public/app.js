import { parsePostLink, getPostByLink, getRecentPosts } from "./lib/bisks.js";
import { rasterizeBisk } from "./lib/rasterize.js";
import { LIFE_PRESETS, lifeLikeStep, brainStep, antStep, elementaryStep } from "./lib/automata.js";

const COLS = 72;
const ROWS = 44;

const els = {
  form: document.getElementById("findForm"),
  input: document.getElementById("handleInput"),
  findBtn: document.getElementById("findBtn"),
  msg: document.getElementById("msg"),
  picker: document.getElementById("picker"),
  pickerList: document.getElementById("pickerList"),
  biskCard: document.getElementById("biskCard"),
  sim: document.getElementById("sim"),
  automatonSelect: document.getElementById("automatonSelect"),
  ruleControls: document.getElementById("ruleControls"),
  ruleNumber: document.getElementById("ruleNumber"),
  rulePresets: document.getElementById("rulePresets"),
  canvas: document.getElementById("gridCanvas"),
  playBtn: document.getElementById("playBtn"),
  stepBtn: document.getElementById("stepBtn"),
  resetBtn: document.getElementById("resetBtn"),
  randomBtn: document.getElementById("randomBtn"),
  speed: document.getElementById("speed"),
  genCounter: document.getElementById("genCounter"),
  legend: document.getElementById("legend"),
  shareBtn: document.getElementById("shareBtn"),
  downloadBtn: document.getElementById("downloadBtn"),
};

if (window.attachHandleTypeahead) window.attachHandleTypeahead(els.input);

const ctx = els.canvas.getContext("2d");

let currentBisk = null;
let seedGrid = null; // the original bisk-derived grid, kept around for "reset"
let grid = null; // life-like / elementary CA cells (0/1), or the ant board (0/1)
let brainGrid = null; // Brian's Brain cells (0/1/2)
let ants = [];
let gen = 0;
let running = false;
let rafId = null;
let lastStepTime = 0;

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function setMsg(text, kind) {
  els.msg.textContent = text;
  els.msg.className = "msg" + (kind ? ` ${kind}` : "");
}

// ---- fetching a bisk ------------------------------------------------------

async function loadPostLink(actor, rkey) {
  setMsg(`loading that bisk…`);
  els.picker.hidden = true;
  try {
    const bisk = await getPostByLink(actor, rkey);
    selectBisk(bisk);
  } catch (e) {
    setMsg(`couldn't load that post — ${(e && e.message) || "check the link"}.`, "err");
  }
}

async function loadHandle(handle) {
  setMsg(`resolving @${handle.replace(/^@/, "")}…`);
  els.picker.hidden = true;
  els.biskCard.hidden = true;
  els.sim.hidden = true;
  try {
    const { author, posts } = await getRecentPosts(handle);
    if (!posts.length) {
      setMsg(`@${author.handle} has no recent top-level posts to grid-ify.`, "err");
      return;
    }
    renderPicker(author, posts);
    setMsg(`pick a bisk from @${author.handle} to render.`, "ok");
  } catch (e) {
    setMsg(`couldn't load that handle — ${(e && e.message) || "check it and try again"}.`, "err");
  }
}

function renderPicker(author, posts) {
  els.pickerList.innerHTML = posts
    .map(
      (p, i) => `<li>
        <button class="pickBtn" data-i="${i}" type="button">
          ${author.avatar ? `<img src="${esc(author.avatar)}" alt="" />` : `<span class="ph">${esc((author.displayName || "?").slice(0, 2))}</span>`}
          <span class="ptext">${esc(p.text.length > 140 ? p.text.slice(0, 140) + "…" : p.text)}</span>
        </button>
      </li>`,
    )
    .join("");
  els.picker.hidden = false;
  [...els.pickerList.querySelectorAll(".pickBtn")].forEach((b) => {
    b.onclick = () => selectBisk(posts[Number(b.dataset.i)]);
  });
}

async function selectBisk(bisk) {
  currentBisk = bisk;
  els.picker.hidden = true;
  els.biskCard.hidden = false;
  els.biskCard.innerHTML = `
    <img class="avatar" ${bisk.author.avatar ? `src="${esc(bisk.author.avatar)}"` : ""} alt="" />
    <div class="meta">
      <div class="who"><b>${esc(bisk.author.displayName)}</b> <span class="handle">@${esc(bisk.author.handle)}</span></div>
      <div class="text">${esc(bisk.text)}</div>
      <a class="link" href="https://bsky.app/profile/${esc(bisk.author.handle)}/post/${esc(bisk.uri.split("/").pop())}" target="_blank" rel="noopener">the bisk itself →</a>
    </div>`;
  try {
    history.replaceState(null, "", `?post=${encodeURIComponent(`https://bsky.app/profile/${bisk.author.handle}/post/${bisk.uri.split("/").pop()}`)}`);
  } catch {}

  setMsg("rendering the bisk to a grid…", "ok");
  els.sim.hidden = false;
  seedGrid = await rasterizeBisk(bisk, COLS, ROWS);
  setMsg(`gridified — ${COLS}×${ROWS} cells. pick an automaton and hit play.`, "ok");
  resetToSeed();
  draw();
  els.sim.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ---- automaton state --------------------------------------------------

function currentKey() {
  return els.automatonSelect.value;
}

function resetToSeed() {
  stop();
  gen = 0;
  grid = seedGrid.slice();
  brainGrid = Uint8Array.from(seedGrid); // 1 -> firing, 0 -> off
  ants = [
    { x: Math.floor(COLS / 2), y: Math.floor(ROWS / 2), dir: 0 },
  ];
  updateLegend();
  updateGenCounter();
}

function randomize() {
  stop();
  gen = 0;
  const key = currentKey();
  if (key === "brain") {
    brainGrid = new Uint8Array(COLS * ROWS);
    for (let i = 0; i < brainGrid.length; i++) brainGrid[i] = Math.random() < 0.15 ? 1 : 0;
  } else {
    grid = new Uint8Array(COLS * ROWS);
    for (let i = 0; i < grid.length; i++) grid[i] = Math.random() < 0.3 ? 1 : 0;
    ants = [{ x: Math.floor(COLS / 2), y: Math.floor(ROWS / 2), dir: 0 }];
  }
  updateGenCounter();
  draw();
}

function step() {
  const key = currentKey();
  if (key === "brain") {
    brainGrid = brainStep(brainGrid, COLS, ROWS);
  } else if (key === "ant") {
    antStep(grid, COLS, ROWS, ants);
  } else if (key === "elementary") {
    const n = Number(els.ruleNumber.value);
    grid = elementaryStep(grid, COLS, ROWS, Number.isFinite(n) ? n : 30);
  } else {
    const preset = LIFE_PRESETS[key] || LIFE_PRESETS.life;
    grid = lifeLikeStep(grid, COLS, ROWS, preset.born, preset.survive);
  }
  gen++;
  updateGenCounter();
}

function updateGenCounter() {
  els.genCounter.textContent = `gen ${gen}`;
}

function updateLegend() {
  const key = currentKey();
  if (key === "brain") {
    els.legend.textContent = "Brian's Brain: a cell fires if exactly 2 neighbors fired last step, then decays through 'dying' back to off.";
  } else if (key === "ant") {
    els.legend.textContent = "Langton's Ant: on white, turn right and paint black; on black, turn left and paint white. Chaos, then eventually a highway.";
  } else if (key === "elementary") {
    els.legend.textContent = "Elementary CA: the whole grid scrolls up one row per step, and a fresh row is computed from the rule number applied to the row above.";
  } else {
    const preset = LIFE_PRESETS[key] || LIFE_PRESETS.life;
    els.legend.textContent = preset.label;
  }
  els.ruleControls.hidden = key !== "elementary";
}

// ---- rendering ----------------------------------------------------------

function fitCanvas() {
  // Measure a sibling that spans the page column on its own (the header),
  // not the canvas's own inline-block wrapper or .wrap itself — .wrap's
  // clientWidth includes its horizontal padding, and the canvas wrapper's
  // width is determined by the canvas's current size, so either would be
  // wrong or circular. header's content width already nets out .wrap's
  // padding and doesn't depend on the canvas at all.
  const wrapWidth = (document.querySelector("header") || document.body).clientWidth - 2;
  const cellPx = Math.max(4, Math.min(10, Math.floor(wrapWidth / COLS)));
  const dpr = window.devicePixelRatio || 1;
  els.canvas.style.width = `${cellPx * COLS}px`;
  els.canvas.style.height = `${cellPx * ROWS}px`;
  els.canvas.width = cellPx * COLS * dpr;
  els.canvas.height = cellPx * ROWS * dpr;
  ctx.setTransform(dpr * cellPx, 0, 0, dpr * cellPx, 0, 0);
}

const COLOR_DEAD = "#f6f3ea";
const COLOR_ALIVE = "#20241f";
const COLOR_FIRING = "#3fb6ff";
const COLOR_DYING = "#9c9c9c";
const COLOR_ANT = "#d1495b";

function draw() {
  const key = currentKey();
  ctx.fillStyle = COLOR_DEAD;
  ctx.fillRect(0, 0, COLS, ROWS);

  if (key === "brain") {
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const v = brainGrid[y * COLS + x];
        if (v === 0) continue;
        ctx.fillStyle = v === 1 ? COLOR_FIRING : COLOR_DYING;
        ctx.fillRect(x, y, 1, 1);
      }
    }
    return;
  }

  ctx.fillStyle = COLOR_ALIVE;
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (grid[y * COLS + x]) ctx.fillRect(x, y, 1, 1);
    }
  }

  if (key === "ant") {
    ctx.fillStyle = COLOR_ANT;
    for (const ant of ants) ctx.fillRect(ant.x, ant.y, 1, 1);
  }
}

// ---- play/pause loop ------------------------------------------------------

function loop(t) {
  const stepsPerSec = Number(els.speed.value);
  const interval = 1000 / stepsPerSec;
  if (t - lastStepTime >= interval) {
    lastStepTime = t;
    step();
    draw();
  }
  if (running) rafId = requestAnimationFrame(loop);
}

function play() {
  if (running) return;
  running = true;
  els.playBtn.textContent = "⏸ pause";
  lastStepTime = 0;
  rafId = requestAnimationFrame(loop);
}

function stop() {
  running = false;
  els.playBtn.textContent = "▶ play";
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;
}

// ---- wiring ---------------------------------------------------------------

els.form.addEventListener("submit", (e) => {
  e.preventDefault();
  const raw = els.input.value.trim();
  if (!raw) return els.input.focus();
  const link = parsePostLink(raw);
  if (link) loadPostLink(link.actor, link.rkey);
  else loadHandle(raw);
});

els.automatonSelect.addEventListener("change", () => {
  resetToSeed();
  draw();
});
els.playBtn.addEventListener("click", () => (running ? stop() : play()));
els.stepBtn.addEventListener("click", () => {
  stop();
  step();
  draw();
});
els.resetBtn.addEventListener("click", () => {
  resetToSeed();
  draw();
});
els.randomBtn.addEventListener("click", randomize);
els.ruleNumber.addEventListener("input", () => {
  els.ruleNumber.value = Math.max(0, Math.min(255, Number(els.ruleNumber.value) || 0));
  updateLegend();
});
if (els.rulePresets) {
  els.rulePresets.querySelectorAll("button[data-rule]").forEach((b) => {
    b.onclick = () => {
      els.ruleNumber.value = b.dataset.rule;
      updateLegend();
    };
  });
}
window.addEventListener("resize", () => {
  fitCanvas();
  draw();
});

els.shareBtn.addEventListener("click", () => {
  const url = location.href.split("?")[0] + (currentBisk ? `?post=${encodeURIComponent(`https://bsky.app/profile/${currentBisk.author.handle}/post/${currentBisk.uri.split("/").pop()}`)}` : "");
  const who = currentBisk ? `@${currentBisk.author.handle}'s bisk` : "a bisk";
  const preset = LIFE_PRESETS[currentKey()];
  const ruleName = preset ? preset.label.split(" — ")[0] : currentKey() === "ant" ? "Langton's Ant" : currentKey() === "brain" ? "Brian's Brain" : "an elementary CA";
  const text = `gridified ${who} and ran ${ruleName} on it. ${url}`;
  window.open("https://bsky.app/intent/compose?text=" + encodeURIComponent(text), "_blank", "noopener");
});

els.downloadBtn.addEventListener("click", () => {
  els.canvas.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "gameofbisk.png";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });
});

// ---- boot -------------------------------------------------------------

fitCanvas();
updateLegend();

const qp = new URLSearchParams(location.search);
const postParam = qp.get("post");
const hParam = qp.get("h");
if (postParam) {
  const link = parsePostLink(postParam);
  if (link) {
    els.input.value = postParam;
    loadPostLink(link.actor, link.rkey);
  }
} else if (hParam) {
  els.input.value = hParam;
  loadHandle(hParam);
} else {
  setMsg("reads Bluesky's public API in your browser — no login.");
}
