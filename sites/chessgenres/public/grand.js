import { SIZE, GOAL, GLYPH, MAP, SPRAY, newGame, myMoves, move, wait, MAX_WANTED } from "./grand-logic.js";

const $ = (id) => document.getElementById(id);
const cv = $("gc"), ctx = cv.getContext("2d"), CELL = cv.width / SIZE;
let s;

function reset() { s = newGame((Date.now() & 0x7fffffff) || 1); ui(); }

function glyph(g, x, y, fill, stroke, size = 0.75) {
  ctx.font = `${CELL * size}px serif`; ctx.lineWidth = 3; ctx.strokeStyle = stroke; ctx.fillStyle = fill;
  ctx.strokeText(g, x * CELL + CELL / 2, y * CELL + CELL / 2 - 3);
  ctx.fillText(g, x * CELL + CELL / 2, y * CELL + CELL / 2 - 3);
}

function draw() {
  ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    if (MAP[y][x] === "#") {
      ctx.fillStyle = "#2a2f3d"; ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
      ctx.fillStyle = (x * 7 + y * 3) % 3 ? "#e8c96a" : "#566";
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) ctx.fillRect(x * CELL + 10 + i * 28, y * CELL + 10 + j * 28, 14, 14);
    } else {
      ctx.fillStyle = (x + y) % 2 ? "#4b4b52" : "#56565e"; ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
    }
  }
  ctx.fillStyle = "#3fb56b"; ctx.fillRect(SPRAY.x * CELL + 4, SPRAY.y * CELL + 4, CELL - 8, CELL - 8);
  ctx.fillStyle = "#06220f"; ctx.font = `bold ${CELL * 0.17}px system-ui`; ctx.fillText("SPRAY", SPRAY.x * CELL + CELL / 2, SPRAY.y * CELL + CELL / 2);
  for (const c of s.cash_at) { ctx.fillStyle = "#6fd48a"; ctx.font = `bold ${CELL * 0.7}px system-ui`; ctx.fillText("$", c.x * CELL + CELL / 2, c.y * CELL + CELL / 2); }
  if (s.status === "playing") {
    ctx.fillStyle = "rgba(90,170,255,.4)";
    for (const m of myMoves(s)) ctx.fillRect(m.x * CELL, m.y * CELL, CELL, CELL);
  }
  for (const c of s.cars) {
    ctx.fillStyle = "#a43d3d"; ctx.fillRect(c.x * CELL + 8, c.y * CELL + 8, CELL - 16, CELL - 16);
    glyph(GLYPH[c.t], c.x, c.y, "#fff", "#400", 0.6);
  }
  for (const c of s.civs) glyph(GLYPH.p, c.x, c.y, "#e9d8b4", "#222", 0.6);
  for (const c of s.cops) {
    ctx.fillStyle = "#1c3f8a"; ctx.fillRect(c.x * CELL + 6, c.y * CELL + 6, CELL - 12, CELL - 12);
    glyph(GLYPH[c.t], c.x, c.y, "#fff", "#08183a", 0.62);
    ctx.fillStyle = s.turn % 2 ? "#e33" : "#39f"; ctx.fillRect(c.x * CELL + CELL / 2 - 6, c.y * CELL + 6, 12, 5);
  }
  glyph(s.status === "lost" ? "✖" : GLYPH[s.me.ride], s.me.x, s.me.y, "#f6c453", "#1a1209");
}

function ui() {
  draw();
  $("gCash").textContent = "$" + s.cash;
  $("gGoal").textContent = "$" + GOAL;
  $("gStars").textContent = "★".repeat(s.wanted) + "☆".repeat(MAX_WANTED - s.wanted);
  $("gRide").textContent = s.me.ride === "k" ? "on foot" : GLYPH[s.me.ride];
  $("gTurn").textContent = s.turn;
  const over = s.status !== "playing";
  $("gWait").disabled = over;
  $("gLog").textContent = s.log.slice(-4).join("\n");
  $("gLog").className = over ? "end" : "";
  if (over) {
    const txt = s.status === "won" ? `I made $${s.cash} in ${s.turn} turns in Grand Chess Auto with ${s.crimes} crimes.` : `WASTED in Grand Chess Auto on turn ${s.turn} with $${s.cash}.`;
    $("gShareLink").href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(txt + "\nhttps://chessgenres.bisks.net/#grand");
    $("gShare").hidden = false;
  } else $("gShare").hidden = true;
}

cv.addEventListener("click", (e) => {
  if (s.status !== "playing") return;
  const r = cv.getBoundingClientRect();
  const x = Math.floor(((e.clientX - r.left) / r.width) * SIZE), y = Math.floor(((e.clientY - r.top) / r.height) * SIZE);
  move(s, x, y);
  ui();
});
$("gWait").addEventListener("click", () => { wait(s); ui(); });
$("gRestart").addEventListener("click", reset);
reset();
