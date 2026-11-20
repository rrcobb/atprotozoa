import { N, CELLS, CELL_OF_SUM, PICTURES, blank, targetPmf, sumPmf, rollFast, match } from "./lib/dice.js";
import { createEvolver } from "./lib/evolve.js";
import { topFaceUp } from "./lib/geometry.js";
import { makeBody, throwDice, stepWorld, qRot, qConj } from "./lib/physics.js";
import { drawScene, qAxis } from "./lib/render3d.js";

const $ = (id) => document.getElementById(id);
const tray = $("tray"), tctx = tray.getContext("2d");
const grid = $("grid"), gctx = grid.getContext("2d");
const target = $("target"), pctx = target.getContext("2d");
const expected = $("expected"), ectx = expected.getContext("2d");

let pic, ev, models = [], bodies = [];
let tally, rolls, misses, maxCount, lastCell = -1;
let evolving = true, adoptedFit = -1, adoptedAt = 0, bestFitSeen = 0, lastGain = 0;
let phase = "idle";            // idle (dice float and turn) | rolling | rested
let rollStart = 0, speed = 1, auto = false, fastAuto = false, brush = 1;
let picDirty = false, picDirtyAt = 0;

// ---- grids ----
function cellFill(ctx, canvas, k, v) {
  const s = canvas.width / N, a = Math.round(Math.min(1, v) * 255);
  ctx.fillStyle = `rgb(${a},${Math.round(a * 0.78)},${Math.round(a * 0.4)})`;
  ctx.fillRect((k % N) * s, Math.floor(k / N) * s, s, s);
}
function paintGrid(ctx, canvas, valueAt) {
  ctx.fillStyle = "#0a0908";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let k = 0; k < CELLS; k++) { const v = valueAt(k); if (v > 0) cellFill(ctx, canvas, k, v); }
}
function drawTarget() { paintGrid(pctx, target, (k) => pic[Math.floor(k / N)][k % N]); }
function drawExpected() {
  if (!models.length) return;
  const pmf = sumPmf(models);
  const cell = new Float64Array(CELLS);
  let max = 0;
  for (let s = 0; s < CELLS; s++) { cell[CELL_OF_SUM[s]] = pmf[s]; max = Math.max(max, pmf[s]); }
  paintGrid(ectx, expected, (k) => (max ? cell[k] / max : 0));
}
function drawTally() {
  paintGrid(gctx, grid, (k) => (maxCount ? tally[k] / maxCount : 0));
  if (lastCell >= 0) {
    const s = grid.width / N;
    gctx.strokeStyle = "#fff"; gctx.lineWidth = 2;
    gctx.strokeRect((lastCell % N) * s + 1, Math.floor(lastCell / N) * s + 1, s - 2, s - 2);
  }
}

function resetTally() {
  tally = new Array(CELLS).fill(0);
  rolls = 0; misses = 0; maxCount = 0; lastCell = -1;
  drawTally();
  stats();
}

function stats() {
  $("rolls").textContent = rolls.toLocaleString();
  $("misses").textContent = misses.toLocaleString();
  const m = Math.round(match(pic, tally, rolls) * 100);
  $("match").textContent = m + "%";
  const text = rolls
    ? `I threw 5 lumpy evolved dice ${rolls.toLocaleString()} times and their summed top faces drew a picture (${m}% match) 🎲`
    : "evolved lumpy dice whose summed top faces draw a picture 🎲";
  $("share").href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(text + " https://loadeddice.bisks.net/");
}

// ---- dice strips ----
function renderStrips() {
  const host = $("dieStrips");
  host.innerHTML = "";
  models.forEach((m, i) => {
    const row = document.createElement("div");
    row.className = "die";
    m.p.forEach((p, fi) => {
      const f = document.createElement("div");
      f.className = "face" + (p <= 1e-9 ? " zero" : "");
      f.style.flexGrow = String(p);
      f.title = `value ${m.vals[fi]}: ${(p * 100).toFixed(1)}% on top`;
      if (p > 1e-9) f.textContent = m.vals[fi];
      row.appendChild(f);
    });
    const cap = document.createElement("div");
    cap.className = "caption";
    cap.textContent = `die ${i + 1}: ${m.poly.normals.length} planes, ${m.poly.faces.length} faces left`;
    host.append(row, cap);
  });
}

// ---- evolution <-> the dice in the tray ----
function adopt(ind) {
  if (!ind.models) return;
  models = ind.models;
  bodies = models.map((m) => { const b = makeBody(m.poly); b.labels = m.vals; return b; });
  phase = "idle";
  adoptedFit = ind.fit; adoptedAt = performance.now();
  renderStrips();
  drawExpected();
  resetTally(); // old tallies belong to old dice
  $("fit").textContent = (ind.fit * 100).toFixed(1) + "%";
  $("sum").textContent = "dice ready: throw them.";
}

function restartEvolution() {
  ev = createEvolver(targetPmf(pic));
  bestFitSeen = 0; lastGain = 0;
  setEvolving(true);
  adopt(ev.best);
}

function setEvolving(on) {
  evolving = on;
  $("evolve").textContent = on ? "⏸ evolving" : "▶ evolve";
  $("evolve").classList.toggle("on", on);
}

function evolveFrame(now) {
  const t0 = performance.now();
  while (performance.now() - t0 < 8) ev.step();
  $("gen").textContent = ev.generation;
  const best = ev.best;
  if (best.fit > bestFitSeen + 1e-4) { bestFitSeen = best.fit; lastGain = ev.generation; }
  $("fit").textContent = (best.fit * 100).toFixed(1) + "%";
  // converged: no gain in 500 generations
  const stalled = ev.generation - lastGain > 500;
  // show the improved dice (never swap them out from under a throw in flight)
  if ((best.fit > adoptedFit + 1e-4 && now - adoptedAt > 300 || (stalled && best.fit > adoptedFit)) && phase !== "rolling") adopt(best);
  if (stalled) { setEvolving(false); $("sum").textContent = "converged. throw the dice."; }
}

// Rolling means the dice have to hold still: freeze the best set so far
// (otherwise the next improvement would swap the dice and wipe the tally).
function settleEvolution() {
  if (!evolving || !ev) return;
  if (ev.best.fit > adoptedFit && phase !== "rolling") adopt(ev.best);
  setEvolving(false);
}

// ---- throwing ----
function throwNow() {
  if (phase === "rolling" || !bodies.length) return;
  settleEvolution();
  throwDice(bodies);
  phase = "rolling";
  rollStart = performance.now();
  $("sum").textContent = "tumbling…";
}

function forceSettle() {
  for (const b of bodies) if (!b.settled) {
    const inv = qConj(b.q);
    b.settled = true; b.top = topFaceUp(b.poly, (v) => qRot(inv, v));
  }
}

function record(sum) {
  rolls++;
  if (sum < CELLS) {
    const k = CELL_OF_SUM[sum];
    if (++tally[k] > maxCount) maxCount = tally[k];
    lastCell = k;
  } else { misses++; }
}

function finishThrow() {
  phase = "rested";
  const vals = bodies.map((b, i) => models[i].vals[b.top]);
  const sum = vals.reduce((a, b) => a + b, 0);
  record(sum);
  const where = sum < CELLS ? `cell ${(CELL_OF_SUM[sum] % N) + 1},${Math.floor(CELL_OF_SUM[sum] / N) + 1}` : "off the grid";
  $("sum").textContent = `${vals.join(" + ")} = ${sum} → ${where}`;
  drawTally();
  stats();
  if (auto) setTimeout(() => { if (auto) throwNow(); }, 900 / speed);
}

// Show a sampled roll: lay each die on the floor with the sampled face up.
function poseRoll(faces) {
  const n = bodies.length;
  bodies.forEach((b, i) => {
    const f = b.poly.faces[faces[i]];
    // rotate the face normal onto +y, then spin about y for variety
    const ax = [-f.n[2], 0, f.n[0]], s = Math.hypot(ax[0], ax[2]);
    const q0 = s < 1e-9 ? (f.n[1] > 0 ? [0, 0, 0, 1] : [1, 0, 0, 0]) : qAxis(ax, Math.atan2(s, f.n[1]));
    const spin = qAxis([0, 1, 0], Math.random() * 6.283);
    b.q = qMul(spin, q0);
    let low = Infinity;
    for (const v of b.poly.verts) low = Math.min(low, qRot(b.q, v)[1]);
    b.pos = [(i - (n - 1) / 2) * 2.3 + (Math.random() - 0.5) * 0.5, -low, (Math.random() - 0.5) * 2.4];
    b.vel = [0, 0, 0]; b.w = [0, 0, 0];
    b.settled = true; b.top = faces[i];
  });
  phase = "rested";
}
const qMul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];

function rollMany(n) {
  if (!models.length) return;
  settleEvolution();
  let last = null;
  for (let i = 0; i < n; i++) { last = rollFast(models); record(last.sum); }
  if (last && phase !== "rolling") poseRoll(last.faces); // the dice on the tray show the latest roll
  if (n === 1 || last) $("sum").textContent = `from the odds: ${last.faces.map((f, i) => models[i].vals[f]).join(" + ")} = ${last.sum}`;
  drawTally();
  stats();
}

// ---- main loop ----
let prev = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - prev) / 1000);
  prev = now;
  if (picDirty && now - picDirtyAt > 250) { picDirty = false; restartEvolution(); }
  if (evolving && ev) evolveFrame(now);
  if (phase === "rolling") {
    const done = stepWorld(bodies, dt * speed);
    if (!done && now - rollStart > 10000) forceSettle();
    if (done || bodies.every((b) => b.settled)) finishThrow();
  } else if (phase === "idle") {
    const t = now / 1000;
    bodies.forEach((b, i) => {
      b.settled = false;
      b.pos = [(i - (bodies.length - 1) / 2) * 2.3, 1.9 + 0.15 * Math.sin(t * 1.3 + i), 0.2];
      b.q = qAxis([1, 0.6 + i * 0.25, 0.3], t * 0.8 + i);
    });
  }
  if (fastAuto && !picDirty) rollMany(100);
  drawScene(tctx, bodies, (b) => (v) => qRot(b.q, v), tray.width, tray.height);
  requestAnimationFrame(frame);
}

// ---- painting the target ----
function paintAt(ev2) {
  const rect = target.getBoundingClientRect();
  const c = Math.floor(((ev2.clientX - rect.left) / rect.width) * N);
  const r = Math.floor(((ev2.clientY - rect.top) / rect.height) * N);
  if (r < 0 || c < 0 || r >= N || c >= N || pic[r][c] === brush) return;
  pic[r][c] = brush;
  drawTarget();
  picDirty = true; picDirtyAt = performance.now(); // restart evolution once the brush pauses
}
let painting = false;
target.addEventListener("pointerdown", (e) => { painting = true; target.setPointerCapture(e.pointerId); paintAt(e); });
target.addEventListener("pointermove", (e) => { if (painting) paintAt(e); });
target.addEventListener("pointerup", () => { painting = false; });

function setBrush(id, v) {
  brush = v;
  for (const b of ["brushInk", "brushLight", "brushErase"]) $(b).classList.toggle("on", b === id);
}
$("brushInk").onclick = () => setBrush("brushInk", 1);
$("brushLight").onclick = () => setBrush("brushLight", 0.4);
$("brushErase").onclick = () => setBrush("brushErase", 0);

const preset = $("preset");
for (const name of [...Object.keys(PICTURES), "blank"]) {
  const o = document.createElement("option");
  o.value = o.textContent = name;
  preset.appendChild(o);
}
function setPicture(p) {
  pic = p;
  drawTarget();
  if (pic.flat().every((v) => v <= 0)) {
    // nothing to draw: leave the dice as they are and wait for some ink
    evolving = false; ev = null; picDirty = false; setEvolving(false);
    $("sum").textContent = "the picture has no ink: paint something.";
    resetTally();
    return;
  }
  restartEvolution();
}
preset.onchange = () => setPicture(preset.value === "blank" ? blank() : PICTURES[preset.value]());

// ---- buttons ----
$("throw").onclick = throwNow;
$("auto").onclick = () => {
  auto = !auto;
  $("auto").textContent = auto ? "⏸ stop throwing" : "▶ auto-throw";
  $("auto").classList.toggle("on", auto);
  if (auto) throwNow();
};
$("speed").onchange = () => { speed = Number($("speed").value); };
$("fast").onclick = () => rollMany(100);
$("fastAuto").onclick = () => {
  fastAuto = !fastAuto;
  $("fastAuto").textContent = fastAuto ? "⏸ stop" : "▶ fast auto";
  $("fastAuto").classList.toggle("on", fastAuto);
};
$("reset").onclick = () => { resetTally(); };
$("evolve").onclick = () => {
  if (!ev) return;
  if (!evolving) lastGain = ev.generation; // give it another stretch before it can call itself converged
  setEvolving(!evolving);
};
$("scramble").onclick = () => { if (ev) restartEvolution(); };

setPicture(PICTURES.heart());
requestAnimationFrame(frame);
