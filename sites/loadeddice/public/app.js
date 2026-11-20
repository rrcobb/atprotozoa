import { N, PICTURES, blank, buildDice, rollSet, match } from "./lib/dice.js";

const $ = (id) => document.getElementById(id);
const grid = $("grid"), target = $("target");
const gctx = grid.getContext("2d"), tctx = target.getContext("2d");

let pic, dice, tally, rolls, maxCount, auto = false, brush = 1;

function setPicture(p) {
  pic = p;
  dice = buildDice(pic);
  drawTarget();
  renderDie($("rowDie"), dice.rowDie, -1);
  $("colDie").innerHTML = "";
  $("last").textContent = "roll to see which faces land.";
  resetTally();
}

function resetTally() {
  tally = new Array(N * N).fill(0);
  rolls = 0; maxCount = 0;
  drawGrid();
  stats();
}

function cell(ctx, canvas, r, c, v, tint) {
  const s = canvas.width / N;
  const a = Math.round(v * 255);
  ctx.fillStyle = `rgb(${a},${Math.round(a * 0.78)},${Math.round(a * 0.4)})`;
  ctx.fillRect(c * s, r * s, s, s);
}

function drawTarget() {
  tctx.clearRect(0, 0, target.width, target.height);
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) cell(tctx, target, r, c, pic[r][c]);
}

function drawGrid() {
  gctx.fillStyle = "#0a0908";
  gctx.fillRect(0, 0, grid.width, grid.height);
  if (!maxCount) return;
  for (let r = 0; r < N; r++)
    for (let c = 0; c < N; c++) {
      const n = tally[r * N + c];
      if (n) cell(gctx, grid, r, c, n / maxCount);
    }
}

function stats() {
  $("rolls").textContent = rolls.toLocaleString();
  $("match").textContent = Math.round(match(pic, tally, rolls) * 100) + "%";
  const text = rolls
    ? `I rolled 21 lopsided dice ${rolls.toLocaleString()} times and they drew a picture (${$("match").textContent} match) 🎲`
    : "21 lopsided dice that draw a picture when you roll them 🎲";
  $("share").href = "https://bsky.app/intent/compose?text=" +
    encodeURIComponent(text + " https://loadeddice.bisks.net/");
}

function renderDie(el, die, hit) {
  el.innerHTML = "";
  die.weights.forEach((w, i) => {
    const f = document.createElement("div");
    f.className = "face" + (w <= 0 ? " zero" : "") + (i === hit ? " hit" : "");
    f.style.flexGrow = String(w);
    f.title = `face ${i + 1}: ${(die.total ? (w / die.total) * 100 : 0).toFixed(1)}%`;
    if (w > 0) f.textContent = i + 1;
    el.appendChild(f);
  });
}

function rollMany(n) {
  let last = null;
  for (let i = 0; i < n; i++) {
    const res = rollSet(dice);
    if (!res) { $("last").textContent = "the picture has no ink — paint something."; return; }
    const k = res.r * N + res.c;
    if (++tally[k] > maxCount) maxCount = tally[k];
    rolls++;
    last = res;
  }
  if (last) {
    // Only the final roll of a batch is shown on the dice; the rest are just tallied.
    renderDie($("rowDie"), dice.rowDie, last.r);
    renderDie($("colDie"), dice.colDice[last.r], last.c);
    $("colCaption").textContent = `column die #${last.r + 1} — face size = ink in that cell`;
    $("last").textContent = `row die → ${last.r + 1}, column die #${last.r + 1} → ${last.c + 1}`;
  }
  drawGrid();
  stats();
}

function loop() {
  if (!auto) return;
  rollMany(Number($("speed").value));
  requestAnimationFrame(loop);
}

function setAuto(on) {
  auto = on;
  $("auto").textContent = on ? "⏸ pause" : "▶ auto";
  $("auto").classList.toggle("on", on);
  if (on) requestAnimationFrame(loop);
}

// ---- painting the target ----
function paintAt(ev) {
  const rect = target.getBoundingClientRect();
  const c = Math.floor(((ev.clientX - rect.left) / rect.width) * N);
  const r = Math.floor(((ev.clientY - rect.top) / rect.height) * N);
  if (r < 0 || c < 0 || r >= N || c >= N || pic[r][c] === brush) return;
  pic[r][c] = brush;
  dice = buildDice(pic);
  drawTarget();
  renderDie($("rowDie"), dice.rowDie, -1);
  resetTally();
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
preset.onchange = () => setPicture(preset.value === "blank" ? blank() : PICTURES[preset.value]());

$("roll1").onclick = () => rollMany(1);
$("roll100").onclick = () => rollMany(100);
$("auto").onclick = () => setAuto(!auto);
$("reset").onclick = () => resetTally();

setPicture(PICTURES.heart());
