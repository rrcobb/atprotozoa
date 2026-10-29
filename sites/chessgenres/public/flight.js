import { SIZE, CRAFT, newFlight, legalMoves, fly, stormSet, nextStormSet, score } from "./flight-logic.js";

const $ = (id) => document.getElementById(id);
const cv = $("fc"), ctx = cv.getContext("2d"), CELL = cv.width / SIZE;
let s, type = "n";

function pick() {
  $("fPick").innerHTML = Object.entries(CRAFT).map(([t, c]) =>
    `<button data-t="${t}" class="${t === type ? "sel" : ""}" title="${c.blurb}">${c.glyph} ${c.name}</button>`).join("");
}
function reset() { s = newFlight(type); pick(); ui(); }

function draw() {
  ctx.clearRect(0, 0, cv.width, cv.height);
  const storms = stormSet(s), warn = nextStormSet(s), moves = legalMoves(s);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    ctx.fillStyle = (x + y) % 2 ? "#27506b" : "#2f6283";
    ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
    const k = x + "," + y;
    if (warn.has(k)) { ctx.fillStyle = "rgba(200,210,230,.22)"; ctx.fillRect(x * CELL, y * CELL, CELL, CELL); }
    if (s.mountains.has(k)) { ctx.fillStyle = "#6a6f66"; ctx.beginPath(); ctx.moveTo(x * CELL + 8, (y + 1) * CELL - 8); ctx.lineTo((x + 0.5) * CELL, y * CELL + 10); ctx.lineTo((x + 1) * CELL - 8, (y + 1) * CELL - 8); ctx.fill(); ctx.fillStyle = "#f1f3f0"; ctx.beginPath(); ctx.moveTo((x + 0.5) * CELL, y * CELL + 10); ctx.lineTo((x + 0.36) * CELL, y * CELL + 32); ctx.lineTo((x + 0.64) * CELL, y * CELL + 32); ctx.fill(); }
  }
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  const label = (x, y, txt, col) => { ctx.fillStyle = col; ctx.font = `bold ${CELL * 0.17}px system-ui`; ctx.fillText(txt, (x + 0.5) * CELL, (y + 0.88) * CELL); };
  ctx.fillStyle = "#6fd48a"; ctx.fillRect(s.dest.x * CELL + 8, s.dest.y * CELL + 8, CELL - 16, CELL - 16); label(s.dest.x, s.dest.y, "AIRPORT", "#0e1f13");
  ctx.fillStyle = "#8aa7b8"; ctx.fillRect(8, (SIZE - 1) * CELL + 8, CELL - 16, CELL - 16); label(0, SIZE - 1, "HOME", "#10202a");
  for (const p of s.pads) { ctx.fillStyle = "#e8b04a"; ctx.font = `${CELL * 0.5}px serif`; ctx.fillText("⛽", (p.x + 0.5) * CELL, (p.y + 0.5) * CELL); }
  if (s.status === "playing") for (const m of moves) {
    ctx.fillStyle = "rgba(255,255,255,.18)"; ctx.fillRect(m.x * CELL + 3, m.y * CELL + 3, CELL - 6, CELL - 6);
    ctx.fillStyle = "#fff"; ctx.font = `bold ${CELL * 0.18}px system-ui`; ctx.fillText(m.cost, m.x * CELL + CELL * 0.82, m.y * CELL + CELL * 0.2);
  }
  for (const k of storms) {
    const [x, y] = k.split(",").map(Number);
    ctx.fillStyle = "rgba(60,50,80,.85)"; ctx.beginPath(); ctx.arc((x + 0.5) * CELL, (y + 0.5) * CELL, CELL * 0.4, 0, 7); ctx.fill();
    ctx.font = `${CELL * 0.5}px serif`; ctx.fillStyle = "#fff"; ctx.fillText("⛈", (x + 0.5) * CELL, (y + 0.5) * CELL);
  }
  ctx.font = `${CELL * 0.75}px serif`; ctx.lineWidth = 4; ctx.strokeStyle = "#102030"; ctx.fillStyle = s.status === "lost" ? "#d8584a" : "#fff";
  ctx.strokeText(CRAFT[s.type].glyph, (s.pos.x + 0.5) * CELL, (s.pos.y + 0.5) * CELL - 3);
  ctx.fillText(CRAFT[s.type].glyph, (s.pos.x + 0.5) * CELL, (s.pos.y + 0.5) * CELL - 3);
}

function ui() {
  draw();
  $("fFuel").textContent = `${s.fuel}/${s.maxFuel}`;
  $("fHull").textContent = s.hull;
  $("fTurn").textContent = s.turn;
  $("fCraft").textContent = CRAFT[s.type].name;
  $("fLog").textContent = s.log.slice(-3).join("\n");
  $("fLog").className = s.status === "playing" ? "" : "end";
  if (s.status !== "playing") {
    const txt = s.status === "won"
      ? `I landed a ${CRAFT[s.type].name} in Microsoft Chess Flight Simulator with ${s.fuel} fuel to spare (score ${score(s)}).`
      : `I crashed a ${CRAFT[s.type].name} in Microsoft Chess Flight Simulator.`;
    $("fShareLink").href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(txt + "\nhttps://chessgenres.bisks.net/#flight");
    $("fShare").hidden = false;
  } else $("fShare").hidden = true;
}

cv.addEventListener("click", (e) => {
  if (s.status !== "playing") return;
  const r = cv.getBoundingClientRect();
  const x = Math.floor(((e.clientX - r.left) / r.width) * SIZE), y = Math.floor(((e.clientY - r.top) / r.height) * SIZE);
  if (fly(s, x, y)) ui();
});
$("fPick").addEventListener("click", (e) => { const b = e.target.closest("button[data-t]"); if (b) { type = b.dataset.t; reset(); } });
$("fRestart").addEventListener("click", reset);
reset();
