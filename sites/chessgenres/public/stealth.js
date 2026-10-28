import { SIZE, GLYPH, STAGES, newLevel, kingMoves, moveKing, wait, dangerNext, nextPatrol, visionOf, isBox, hidden, nextLevel } from "./stealth-logic.js";

const $ = (id) => document.getElementById(id);
const cv = $("sc"), ctx = cv.getContext("2d"), CELL = cv.width / SIZE;
let s;

function reset() { s = newLevel(0); $("sShare").hidden = true; ui(); }

function draw() {
  ctx.clearRect(0, 0, cv.width, cv.height);
  const danger = dangerNext(s), moves = kingMoves(s);
  const now = new Set();
  if (s.alert > 0) for (const g of s.guards) for (const k of visionOf(s, g)) now.add(k);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    ctx.fillStyle = (x + y) % 2 ? "#3a3a36" : "#52524b";
    ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
    const k = x + "," + y;
    if (danger.has(k)) { ctx.fillStyle = "rgba(220,60,50,.38)"; ctx.fillRect(x * CELL, y * CELL, CELL, CELL); }
    if (now.has(k)) { ctx.strokeStyle = "rgba(255,200,60,.9)"; ctx.lineWidth = 3; ctx.strokeRect(x * CELL + 4, y * CELL + 4, CELL - 8, CELL - 8); }
  }
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillStyle = "#6fd48a"; ctx.fillRect(s.exit.x * CELL + 6, s.exit.y * CELL + 6, CELL - 12, CELL - 12);
  ctx.fillStyle = "#0e1f13"; ctx.font = `bold ${CELL * 0.2}px system-ui`; ctx.fillText("EXIT", s.exit.x * CELL + CELL / 2, s.exit.y * CELL + CELL / 2);
  for (const w of s.walls) { ctx.fillStyle = "#14130f"; ctx.fillRect(w.x * CELL, w.y * CELL, CELL, CELL); ctx.strokeStyle = "#6b6a5e"; ctx.lineWidth = 2; ctx.strokeRect(w.x * CELL + 3, w.y * CELL + 3, CELL - 6, CELL - 6); }
  for (const b of s.boxes) { ctx.fillStyle = "#a47c45"; ctx.fillRect(b.x * CELL + 10, b.y * CELL + 10, CELL - 20, CELL - 20); ctx.fillStyle = "#4b3517"; ctx.font = `${CELL * 0.4}px system-ui`; ctx.fillText("▣", b.x * CELL + CELL / 2, b.y * CELL + CELL / 2); }
  ctx.fillStyle = "rgba(90,170,255,.4)";
  for (const m of moves) ctx.fillRect(m.x * CELL, m.y * CELL, CELL, CELL);
  for (const g of s.guards) {
    if (s.alert === 0 && s.status === "playing") {
      const n = nextPatrol(g);
      ctx.globalAlpha = 0.25; ctx.font = `${CELL * 0.7}px serif`; ctx.fillStyle = "#fff";
      ctx.fillText(GLYPH[g.t], n.x * CELL + CELL / 2, n.y * CELL + CELL / 2 - 3);
      ctx.globalAlpha = 1;
    }
    ctx.font = `${CELL * 0.75}px serif`; ctx.lineWidth = 3; ctx.strokeStyle = "#fff"; ctx.fillStyle = s.alert > 0 ? "#b32121" : "#0c0c0c";
    ctx.strokeText(GLYPH[g.t], g.x * CELL + CELL / 2, g.y * CELL + CELL / 2 - 3);
    ctx.fillText(GLYPH[g.t], g.x * CELL + CELL / 2, g.y * CELL + CELL / 2 - 3);
    if (s.alert > 0) { ctx.fillStyle = "#ffd23c"; ctx.font = `bold ${CELL * 0.3}px system-ui`; ctx.fillText("!", g.x * CELL + CELL * 0.82, g.y * CELL + CELL * 0.2); }
  }
  ctx.globalAlpha = hidden(s) ? 0.5 : 1;
  ctx.font = `${CELL * 0.75}px serif`; ctx.lineWidth = 3; ctx.strokeStyle = "#1a1209"; ctx.fillStyle = "#f6c453";
  ctx.strokeText("♔", s.king.x * CELL + CELL / 2, s.king.y * CELL + CELL / 2 - 3);
  ctx.fillText("♔", s.king.x * CELL + CELL / 2, s.king.y * CELL + CELL / 2 - 3);
  ctx.globalAlpha = 1;
}

function ui() {
  draw();
  const st = STAGES[s.stage];
  $("sStage").textContent = `${s.stage + 1}/${STAGES.length} ${st.name}`;
  $("sTurn").textContent = s.turn;
  const al = $("sAlert");
  al.textContent = s.alert > 0 ? `ALERT ${s.alert}` : hidden(s) ? "hidden" : "clear";
  al.style.color = s.alert > 0 ? "var(--bad)" : "";
  const over = s.status !== "playing";
  $("sWait").disabled = over;
  $("sNext").hidden = !(s.status === "won" && s.stage + 1 < STAGES.length);
  $("sLog").textContent = s.log.slice(-3).join("\n");
  $("sLog").className = over ? "end" : "";
  if (s.status === "lost") $("sLog").textContent += "\n(tap restart to try again)";
  if (over && (s.status === "lost" || s.stage + 1 >= STAGES.length)) {
    const txt = s.status === "won" ? `I infiltrated Metal Rook in Chess Solid in ${s.turn} turns (spotted ${s.seen}×).` : `I got caught in Chess Solid on floor ${s.stage + 1}.`;
    $("sShareLink").href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(txt + "\nhttps://chessgenres.bisks.net/#stealth");
    $("sShare").hidden = false;
  } else $("sShare").hidden = true;
}

cv.addEventListener("click", (e) => {
  if (s.status !== "playing") return;
  const r = cv.getBoundingClientRect();
  const x = Math.floor(((e.clientX - r.left) / r.width) * SIZE), y = Math.floor(((e.clientY - r.top) / r.height) * SIZE);
  moveKing(s, x, y);
  ui();
});
$("sWait").addEventListener("click", () => { wait(s); ui(); });
$("sNext").addEventListener("click", () => { s = nextLevel(s); ui(); });
$("sRestart").addEventListener("click", () => { s = newLevel(s.stage === STAGES.length - 1 && s.status === "won" ? 0 : s.stage); ui(); });
reset();
