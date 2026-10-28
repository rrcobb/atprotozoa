import { SIZE, GLYPH, STAGES, newBattle, living, unitAt, legalMoves, attackTargets, doMove, doAttack, wait, endTurn, nextBattle } from "./tactics-logic.js";

const $ = (id) => document.getElementById(id);
const cv = $("tc"), ctx = cv.getContext("2d"), CELL = cv.width / SIZE;
let s, sel = null;

function reset() { s = newBattle(0); sel = null; $("tShare").hidden = true; ui(); }

const moves = () => (sel ? legalMoves(s, sel) : []);
const targets = () => (sel && !sel.acted ? attackTargets(s, sel) : []);

function draw() {
  ctx.clearRect(0, 0, cv.width, cv.height);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    ctx.fillStyle = (x + y) % 2 ? "#9b6b43" : "#e9d8b4";
    ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
  }
  const mv = moves(), tg = targets();
  ctx.fillStyle = "rgba(60,120,230,.45)";
  for (const m of mv) ctx.fillRect(m.x * CELL, m.y * CELL, CELL, CELL);
  for (const u of living(s, "p").concat(living(s, "e"))) {
    const cx = u.x * CELL + CELL / 2, cy = u.y * CELL + CELL / 2;
    if (u === sel) { ctx.strokeStyle = "#e8b04a"; ctx.lineWidth = 4; ctx.strokeRect(u.x * CELL + 3, u.y * CELL + 3, CELL - 6, CELL - 6); }
    ctx.font = `${CELL * 0.7}px serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.globalAlpha = u.side === "p" && u.acted ? 0.45 : 1;
    ctx.lineWidth = 3; ctx.strokeStyle = u.side === "p" ? "#1a1209" : "#fff";
    ctx.fillStyle = u.side === "p" ? "#f6c453" : (u.part ? "#7a1f1f" : "#1a1209");
    ctx.strokeText(GLYPH[u.side][u.t], cx, cy - 4); ctx.fillText(GLYPH[u.side][u.t], cx, cy - 4);
    ctx.globalAlpha = 1;
    const w = CELL - 14, f = u.hp / u.maxHp;
    ctx.fillStyle = "#000"; ctx.fillRect(u.x * CELL + 7, u.y * CELL + CELL - 12, w, 6);
    ctx.fillStyle = u.side === "p" ? "#5fcf6f" : "#d8584a"; ctx.fillRect(u.x * CELL + 7, u.y * CELL + CELL - 12, w * f, 6);
  }
  ctx.fillStyle = "rgba(230,50,50,.5)";
  for (const t of tg) ctx.fillRect(t.x * CELL, t.y * CELL, CELL, CELL);
}

function info(u) {
  if (!u) return "tap one of your gold pieces. blue squares: where it can walk. red squares: who it can hit.";
  const side = u.side === "p" ? "yours" : "enemy";
  return `${side} ${u.name}: ${u.hp}/${u.maxHp} hp, attack ${u.atk}${u.fixed ? ", can't move" : ""}`;
}

function ui() {
  draw();
  const stage = STAGES[s.stage];
  $("tTurn").textContent = s.turn;
  $("tStage").textContent = `${s.stage + 1}/${STAGES.length} ${stage.name}`;
  const ps = living(s, "p"), es = living(s, "e");
  $("tParty").textContent = ps.map((u) => `${GLYPH.p[u.t]} ${u.hp}`).join("  ");
  $("tFoes").textContent = es.length;
  const over = s.status !== "playing";
  $("tEnd").disabled = over;
  $("tWait").disabled = over || !sel || sel.acted;
  $("tNext").hidden = !(s.status === "won" && s.stage + 1 < STAGES.length);
  $("tInfo").textContent = info(sel);
  let log = s.log.slice(-4).join("\n");
  if (s.status === "won") log += s.stage + 1 < STAGES.length ? "\nvictory! your party heals up and levels up." : "\nthe dragon is dead. the board is yours.";
  if (s.status === "lost") log += "\nyour king has fallen. checkmate.";
  $("tLog").textContent = log;
  $("tLog").className = over ? "end" : "";
  if (over && (s.status === "lost" || s.stage + 1 >= STAGES.length)) {
    const txt = s.status === "won" ? `I slew the chess dragon in Chess Tactics (turn ${s.turn}).` : `The chess dragon beat my Chess Tactics party at battle ${s.stage + 1}.`;
    $("tShareLink").href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(txt + "\nhttps://chessgenres.bisks.net/#tactics");
    $("tShare").hidden = false;
  } else $("tShare").hidden = true;
}

cv.addEventListener("click", (e) => {
  if (s.status !== "playing") return;
  const r = cv.getBoundingClientRect();
  const x = Math.floor(((e.clientX - r.left) / r.width) * SIZE), y = Math.floor(((e.clientY - r.top) / r.height) * SIZE);
  const u = unitAt(s, x, y);
  if (sel) {
    if (u && targets().includes(u)) { doAttack(s, sel, u); sel = null; return ui(); }
    if (!u && moves().some((m) => m.x === x && m.y === y)) { doMove(s, sel, x, y); return ui(); }
  }
  if (u && u.side === "p") sel = u.acted ? null : u;
  else if (u) { sel = null; ui(); $("tInfo").textContent = info(u) + (u.part === "head" ? " (armor −1 per living claw)" : ""); return; }
  else sel = null;
  ui();
});

$("tEnd").addEventListener("click", () => { endTurn(s); sel = null; ui(); });
$("tWait").addEventListener("click", () => { if (sel) { wait(s, sel); sel = null; ui(); } });
$("tNext").addEventListener("click", () => { s = nextBattle(s); sel = null; ui(); });
$("tRestart").addEventListener("click", reset);

reset();
