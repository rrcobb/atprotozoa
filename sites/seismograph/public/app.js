// app.js — the instrument. Take a handle's one-way follows (from graph.js),
// scroll a strip of chart paper under a needle, and plant one spike per
// unrequited follow. Bigger accounts = taller spikes. Hover a spike to read who.
//
// The drum runs continuously once it has readings: the paper scrolls right→left,
// spikes wheel around and around, and the needle rides the sum of whatever
// spikes it's currently over. When there are no readings it draws a flat line
// with the faint tremor of a machine left running in an empty room.

import { unrequited } from "./lib/graph.js";

const DEFAULT_HANDLE = "xan.lol";

const $ = (id) => document.getElementById(id);
const form = $("form");
const handleInput = $("handle");
const goBtn = $("go");
const statusEl = $("status");
const richterEl = $("richter");
const readingEl = $("reading");
const rosterEl = $("roster");
const canvas = $("drum");
const tip = $("tip");
const machine = $("machine");
const ctx = canvas.getContext("2d");

// ── drum state ────────────────────────────────────────────────────────────
// The trace is a ring of "events" laid along a virtual belt of length BELT (in
// px). Time scrolls the belt under a fixed needle at NEEDLE_X. Each event is a
// Gaussian bump; the needle height at any x is the sum of nearby bumps plus a
// little idle tremor.
const NEEDLE_X_FRAC = 0.78; // needle sits toward the right, paper feeds from left
const PX_PER_EVENT = 74; // spacing along the belt between successive spikes
const SPEED = 58; // px/sec the paper scrolls
const BUMP_SIGMA = 12; // px width of a single spike
let events = []; // { pos, amp, person }  pos in belt-px
let belt = 0; // total belt length (px)
let offset = 0; // how far the belt has scrolled (px), grows forever
let hasReadings = false;
let running = false;
let lastT = 0;

// device-pixel-ratio aware sizing
function sizeCanvas() {
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const cssW = canvas.clientWidth;
  const cssH = canvas.clientHeight;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener("resize", sizeCanvas);

// Build the belt of events from a list of one-way follows. amp is 0..1 weight.
function loadEvents(oneway) {
  events = oneway.map((p, i) => ({
    pos: (i + 1) * PX_PER_EVENT,
    amp: typeof p.weight === "number" ? p.weight : 0.5,
    person: p,
  }));
  belt = (oneway.length + 2) * PX_PER_EVENT;
  offset = 0;
  hasReadings = oneway.length > 0;
}

// height contribution of the belt at a given belt-position `bp`, summing bumps.
function traceAt(bp) {
  if (!hasReadings) return 0;
  // belt wraps: bring bp into [0, belt)
  let x = ((bp % belt) + belt) % belt;
  let h = 0;
  // only nearby events matter (within ~3 sigma); scan the whole small list — a
  // few hundred at most, cheap enough per frame column.
  for (const ev of events) {
    // consider the event and its wrap-around neighbor so spikes near the seam
    // don't blink.
    for (const c of [ev.pos, ev.pos - belt, ev.pos + belt]) {
      const d = x - c;
      if (d > -40 && d < 40) {
        h += ev.amp * Math.exp(-(d * d) / (2 * BUMP_SIGMA * BUMP_SIGMA));
      }
    }
  }
  return h;
}

// idle tremor: a low, slow wobble so a flat line still feels alive/lonely.
function tremor(bp) {
  return (
    0.012 * Math.sin(bp * 0.05) +
    0.008 * Math.sin(bp * 0.13 + 1.7) +
    0.006 * Math.sin(bp * 0.017)
  );
}

function drawGrid(w, h, mid) {
  ctx.clearRect(0, 0, w, h);
  // paper fill
  ctx.fillStyle = "#f4efe4";
  ctx.fillRect(0, 0, w, h);

  // faint vertical ruling that scrolls with the paper (so motion is legible)
  const rule = "#e2c6b8";
  ctx.strokeStyle = rule;
  ctx.lineWidth = 1;
  const spacing = 26;
  const shift = -(offset % spacing);
  ctx.beginPath();
  for (let x = shift; x < w; x += spacing) {
    ctx.moveTo(Math.round(x) + 0.5, 0);
    ctx.lineTo(Math.round(x) + 0.5, h);
  }
  ctx.stroke();

  // horizontal amplitude datum lines
  ctx.strokeStyle = rule;
  ctx.beginPath();
  for (const frac of [0.2, 0.5, 0.8]) {
    const y = Math.round(h * frac) + 0.5;
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
  }
  ctx.stroke();

  // the strong center datum (the resting needle position)
  ctx.strokeStyle = "#cf9c8c";
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.moveTo(0, Math.round(mid) + 0.5);
  ctx.lineTo(w, Math.round(mid) + 0.5);
  ctx.stroke();
}

let liveReading = "— idle —";

function frame(t) {
  if (!running) return;
  if (!lastT) lastT = t;
  const dt = Math.min(0.05, (t - lastT) / 1000);
  lastT = t;
  offset += SPEED * dt;

  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  const mid = h * 0.52;
  const amp = h * 0.4; // max pixels the needle can swing up
  const needleX = w * NEEDLE_X_FRAC;

  drawGrid(w, h, mid);

  // draw the trace: for each screen column x, the belt position under it is
  // (offset + x). Newer paper is to the right of the needle isn't shown feeding;
  // we render the whole width so past spikes stream leftward off-screen.
  ctx.strokeStyle = "#17130d";
  ctx.lineWidth = 1.6;
  ctx.lineJoin = "round";
  ctx.beginPath();
  let needleY = mid;
  for (let x = 0; x <= w; x++) {
    const bp = offset + x;
    const val = traceAt(bp) + tremor(bp);
    const y = mid - val * amp;
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
    if (x === Math.round(needleX)) needleY = y;
  }
  ctx.stroke();

  // the needle: a vertical arm + tip pinned at needleX riding the trace
  ctx.strokeStyle = "#8a2f22";
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(needleX + 0.5, 0);
  ctx.lineTo(needleX + 0.5, h);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "#8a2f22";
  ctx.beginPath();
  ctx.arc(needleX, needleY, 3.2, 0, Math.PI * 2);
  ctx.fill();

  // live reading in the plate: how hard is the needle swinging right now?
  const swing = (mid - needleY) / amp;
  updateReading(swing);

  requestAnimationFrame(frame);
}

let readingTick = 0;
function updateReading(swing) {
  // throttle plate text so it's readable
  if (++readingTick % 6 !== 0) return;
  if (!hasReadings) {
    readingEl.textContent = "— quiet —";
    return;
  }
  const mag = Math.max(0, swing);
  const bars = "▁▂▃▄▅▆▇█";
  const idx = Math.min(bars.length - 1, Math.floor(mag * bars.length));
  readingEl.textContent = `swing ${bars[idx]} ${(mag * 9).toFixed(1)}`;
}

function startDrum() {
  running = true;
  lastT = 0;
  requestAnimationFrame(frame);
}

// ── hover: map mouse x on the canvas back to the nearest spike ───────────────
machine.addEventListener("mousemove", (e) => {
  if (!hasReadings) {
    tip.style.opacity = 0;
    return;
  }
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  if (x < 0 || x > rect.width || y < 0 || y > rect.height) {
    tip.style.opacity = 0;
    return;
  }
  const bp = offset + x;
  const bpm = ((bp % belt) + belt) % belt; // mouse position on the wrapped belt
  // find the belt event whose wrapped position is closest to the mouse
  let best = null;
  let bestD = 22; // px tolerance
  for (const ev of events) {
    const cm = ((ev.pos % belt) + belt) % belt;
    let dist = Math.abs(bpm - cm);
    dist = Math.min(dist, belt - dist); // account for the seam
    if (dist < bestD) {
      bestD = dist;
      best = ev;
    }
  }
  if (best) {
    const p = best.person;
    const cnt =
      typeof p.followersCount === "number"
        ? ` · <span class="n">${fmt(p.followersCount)} followers</span>`
        : "";
    tip.innerHTML = `${escapeHtml(p.displayName)} — @${escapeHtml(p.handle)}${cnt}`;
    tip.style.left = x + "px";
    tip.style.top = y + "px";
    tip.style.opacity = 1;
  } else {
    tip.style.opacity = 0;
  }
});
machine.addEventListener("mouseleave", () => (tip.style.opacity = 0));

// ── run flow ────────────────────────────────────────────────────────────────
function setStatus(msg, isErr) {
  statusEl.textContent = msg || "";
  statusEl.classList.toggle("err", !!isErr);
}

async function run(actor) {
  goBtn.disabled = true;
  handleInput.disabled = true;
  richterEl.innerHTML = "";
  rosterEl.innerHTML = "";
  hasReadings = false;
  events = [];
  readingEl.textContent = "…";
  setStatus("warming up the drum…");
  try {
    const res = await unrequited(actor, { onStep: (m) => setStatus(m) });
    render(res);
  } catch (err) {
    setStatus(err.message || String(err), true);
    readingEl.textContent = "— fault —";
  } finally {
    goBtn.disabled = false;
    handleInput.disabled = false;
  }
}

function render(res) {
  const { self, oneway, counts } = res;
  loadEvents(oneway);

  const name = self.displayName || self.handle;
  if (oneway.length === 0) {
    setStatus(
      `flat line. every one of @${self.handle}'s ${counts.follows} follows follows back. the needle rests.`,
    );
    richterEl.innerHTML = `<b>0</b> unrequited follows · a perfectly still drum.`;
    startDrum();
    return;
  }

  setStatus("");
  const magnitude = richter(counts.oneway);
  richterEl.innerHTML =
    `<b>${counts.oneway}</b> follows that don't follow back ` +
    `<span class="big">— magnitude ${magnitude}</span> · ` +
    `out of ${counts.follows} followed, ${counts.followers} following back.`;

  renderRoster(oneway);
  startDrum();
}

// a fake-Richter number: log-scaled count, so 4 reads gentle and 900 reads big.
function richter(n) {
  if (n <= 0) return "0.0";
  return (Math.log10(n + 1) * 1.9).toFixed(1);
}

function renderRoster(oneway) {
  const top = oneway.slice(0, 60);
  const items = top
    .map((p) => {
      const amp = "▁▂▃▄▅▆▇█"[
        Math.min(7, Math.floor((p.weight || 0) * 8))
      ];
      const cnt =
        typeof p.followersCount === "number" ? fmt(p.followersCount) : "—";
      const av = p.avatar
        ? `<img src="${escapeAttr(p.avatar)}" alt="" loading="lazy" />`
        : `<img alt="" />`;
      return `<li>
        <span class="amp">${amp} ${cnt}</span>
        ${av}
        <span class="who">
          <a href="https://bsky.app/profile/${escapeAttr(p.handle)}" target="_blank" rel="noopener">${escapeHtml(p.displayName)}</a>
          <span class="h">@${escapeHtml(p.handle)}</span>
        </span>
      </li>`;
    })
    .join("");
  const more =
    oneway.length > top.length
      ? `<p class="more">…and ${oneway.length - top.length} more twitches down the strip.</p>`
      : "";
  rosterEl.innerHTML = `
    <h2>the loudest twitches — biggest accounts you follow into the void</h2>
    <ol>${items}</ol>
    ${more}`;
}

// ── helpers ─────────────────────────────────────────────────────────────────
function fmt(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "k";
  return String(n);
}
function escapeHtml(s) {
  return String(s || "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}
const escapeAttr = escapeHtml;

// ── boot ────────────────────────────────────────────────────────────────────
form.addEventListener("submit", (e) => {
  e.preventDefault();
  const v = handleInput.value.trim();
  const actor = v || DEFAULT_HANDLE;
  const url = new URL(location.href);
  url.searchParams.set("h", actor.replace(/^@/, ""));
  history.replaceState(null, "", url);
  run(actor);
});

sizeCanvas();
// draw an idle drum immediately so the paper is scrolling before any search
startDrum();

// deep-link ?h=handle, else default
const params = new URLSearchParams(location.search);
const initial = params.get("h");
if (initial) {
  handleInput.value = initial;
  run(initial);
} else {
  handleInput.value = DEFAULT_HANDLE;
  run(DEFAULT_HANDLE);
}
