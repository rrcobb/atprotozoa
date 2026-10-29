import { SIZE, SHOOTERS, LEVELS, newShot, startShot, legal, shoot, undo, rank } from "./logic.js";

const $ = (id) => document.getElementById(id);
const cv = $("board"), ctx = cv.getContext("2d"), CELL = cv.width / SIZE;
const GLYPH = { p: "♟", n: "♞", b: "♝", r: "♜", q: "♛", k: "♚" };
let level = 0, s, seed = null;

function load(lv, sd = null) {
  level = lv; seed = sd;
  s = startShot(sd == null ? newShot(lv) : newShot(lv, sd));
  ui();
}

function center(p) { return [(p.x + 0.5) * CELL, (p.y + 0.5) * CELL]; }

function draw() {
  ctx.clearRect(0, 0, cv.width, cv.height);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    ctx.fillStyle = (x + y) % 2 ? "#9b6b43" : "#e9d8b4";
    ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
  }
  // the trail: a glowing line through every capture so far, like a killcam
  if (s.trail.length > 1) {
    ctx.save();
    ctx.lineWidth = 6; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(232,176,74,.85)"; ctx.shadowColor = "#e8b04a"; ctx.shadowBlur = 14;
    ctx.beginPath();
    s.trail.forEach((p, i) => { const [cx, cy] = center(p); i ? ctx.lineTo(cx, cy) : ctx.moveTo(cx, cy); });
    ctx.stroke();
    ctx.restore();
  }
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.lineWidth = 3; ctx.strokeStyle = "#1a1209";
  for (const t of s.left) {
    const [cx, cy] = center(t);
    ctx.font = `${CELL * 0.7}px serif`; ctx.fillStyle = t.t === "k" ? "#d8584a" : "#2b2430";
    ctx.strokeStyle = "#f1e9dc"; ctx.strokeText(GLYPH[t.t], cx, cy); ctx.fillText(GLYPH[t.t], cx, cy);
  }
  for (const m of legal(s)) {
    const [cx, cy] = center(m);
    ctx.strokeStyle = "#6fd48a"; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(cx, cy, CELL * 0.43, 0, 7); ctx.stroke();
  }
  const [px, py] = center(s.pos);
  ctx.font = `${CELL * 0.78}px serif`; ctx.lineWidth = 4; ctx.strokeStyle = "#1a1209"; ctx.fillStyle = "#fff8e8";
  ctx.strokeText(SHOOTERS[s.puzzle.type].glyph, px, py); ctx.fillText(SHOOTERS[s.puzzle.type].glyph, px, py);
}

function ui() {
  draw();
  const L = LEVELS[level];
  $("lvName").textContent = `${level + 1}. ${L.name}`;
  $("shooter").textContent = SHOOTERS[s.puzzle.type].glyph + " " + SHOOTERS[s.puzzle.type].name;
  $("left").textContent = s.left.length;
  $("style").textContent = s.style;
  $("levels").innerHTML = LEVELS.map((l, i) => `<button data-i="${i}" class="${i === level && seed == null ? "on" : ""}">${i + 1}</button>`).join("");
  $("log").textContent = s.log.slice(-3).join("\n");
  $("log").className = s.status === "won" ? "end" : "";
  $("undo").disabled = s.trail.length < 2;
  const done = s.status === "won";
  $("next").hidden = !(done && level < LEVELS.length - 1 && seed == null);
  $("rank").textContent = done ? "rank " + rank(s) + " · style " + s.style : "";
  $("share").hidden = !done;
  if (done) {
    const txt = `I cleared the board in one chain with a ${SHOOTERS[s.puzzle.type].name} on "${L.name}" in chess trickshot simulator, ${s.style} style, rank ${rank(s).split(" ")[0]}.`;
    $("shareLink").href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(txt + "\nhttps://chesstrickshot.bisks.net/");
  }
}

cv.addEventListener("click", (e) => {
  const r = cv.getBoundingClientRect();
  const x = Math.floor(((e.clientX - r.left) / r.width) * SIZE), y = Math.floor(((e.clientY - r.top) / r.height) * SIZE);
  if (shoot(s, x, y)) ui();
});
$("levels").addEventListener("click", (e) => { const b = e.target.closest("button[data-i]"); if (b) load(+b.dataset.i); });
$("undo").addEventListener("click", () => { if (undo(s)) ui(); });
$("reset").addEventListener("click", () => { startShot(s); ui(); });
$("next").addEventListener("click", () => load(level + 1));
$("random").addEventListener("click", () => load(level, 1000 + Math.floor(Math.random() * 1e6)));
load(0);
