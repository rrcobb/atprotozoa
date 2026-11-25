import { SIZE, GLYPH, COIN_RANGE, newRun, floorLevel, completeFloor, failFloor, kingMoves, moveKing, wait, dangerNext, nextPatrol, visionOf, hidden, throwCoin, shoot, useBox, dartTarget } from "./stealth-logic.js";

const $ = (id) => document.getElementById(id);
const cv = $("sc"), ctx = cv.getContext("2d"), CELL = cv.width / SIZE;
let s, run, tool = "move", banked = false, failed = false, lastResult = "";
const BEST_KEY = "chessgenres.stealth.best";
const best = () => { try { return +localStorage.getItem(BEST_KEY) || 0; } catch { return 0; } };
const saveBest = (v) => { try { if (v > best()) localStorage.setItem(BEST_KEY, v); } catch {} };

// extra UI is built here so index.html only needs the shared section
const bar = document.createElement("div");
bar.className = "ctl"; bar.id = "sTools"; bar.style.cssText = "margin-top:8px;display:flex;gap:6px;flex-wrap:wrap";
$("sRestart").parentElement.after(bar);
const info = document.createElement("p");
info.id = "sRun"; info.className = "dim"; info.style.margin = "8px 0 0";
cv.before(info);

function startFloor() { s = floorLevel(run); banked = false; failed = false; tool = "move"; ui(); }
function newGameRun(seed) { run = newRun(seed); lastResult = ""; startFloor(); }
const randomSeed = () => (Date.now() & 0x7fffffff) || 1;
const dailySeed = () => { const d = new Date(); return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate(); };

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
  const locked = s.keycard && !s.hasKey;
  ctx.fillStyle = locked ? "#8a6a3a" : "#6fd48a"; ctx.fillRect(s.exit.x * CELL + 6, s.exit.y * CELL + 6, CELL - 12, CELL - 12);
  ctx.fillStyle = "#0e1f13"; ctx.font = `bold ${CELL * 0.2}px system-ui`; ctx.fillText(locked ? "LOCKED" : "EXIT", s.exit.x * CELL + CELL / 2, s.exit.y * CELL + CELL / 2);
  if (locked) { ctx.fillStyle = "#6fb4ff"; ctx.font = `${CELL * 0.6}px serif`; ctx.fillText("◆", s.keycard.x * CELL + CELL / 2, s.keycard.y * CELL + CELL / 2); }
  for (const w of s.walls) { ctx.fillStyle = "#14130f"; ctx.fillRect(w.x * CELL, w.y * CELL, CELL, CELL); ctx.strokeStyle = "#6b6a5e"; ctx.lineWidth = 2; ctx.strokeRect(w.x * CELL + 3, w.y * CELL + 3, CELL - 6, CELL - 6); }
  for (const b of s.boxes) { ctx.fillStyle = "#a47c45"; ctx.fillRect(b.x * CELL + 10, b.y * CELL + 10, CELL - 20, CELL - 20); ctx.fillStyle = "#4b3517"; ctx.font = `${CELL * 0.4}px system-ui`; ctx.fillText("▣", b.x * CELL + CELL / 2, b.y * CELL + CELL / 2); }
  ctx.fillStyle = "rgba(90,170,255,.4)";
  if (tool === "move") for (const m of moves) ctx.fillRect(m.x * CELL, m.y * CELL, CELL, CELL);
  if (tool === "coin" && s.status === "playing") {
    ctx.fillStyle = "rgba(255,215,90,.3)";
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      const d = Math.max(Math.abs(x - s.king.x), Math.abs(y - s.king.y));
      if (d >= 1 && d <= COIN_RANGE && !s.walls.some((w) => w.x === x && w.y === y)) ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
    }
  }
  if (tool === "dart" && s.status === "playing") {
    ctx.strokeStyle = "#ff5a4a"; ctx.lineWidth = 4;
    for (const g of s.guards) if (dartTarget(s, g.x, g.y) === g) ctx.strokeRect(g.x * CELL + 3, g.y * CELL + 3, CELL - 6, CELL - 6);
  }
  for (const g of s.guards) {
    if (s.alert === 0 && s.status === "playing") {
      const n = nextPatrol(g);
      ctx.globalAlpha = 0.25; ctx.font = `${CELL * 0.7}px serif`; ctx.fillStyle = "#fff";
      ctx.fillText(GLYPH[g.t], n.x * CELL + CELL / 2, n.y * CELL + CELL / 2 - 3);
      ctx.globalAlpha = 1;
    }
    ctx.globalAlpha = g.asleep > 0 ? 0.45 : 1;
    ctx.font = `${CELL * 0.75}px serif`; ctx.lineWidth = 3; ctx.strokeStyle = "#fff"; ctx.fillStyle = s.alert > 0 ? "#b32121" : "#0c0c0c";
    ctx.strokeText(GLYPH[g.t], g.x * CELL + CELL / 2, g.y * CELL + CELL / 2 - 3);
    ctx.fillText(GLYPH[g.t], g.x * CELL + CELL / 2, g.y * CELL + CELL / 2 - 3);
    ctx.globalAlpha = 1;
    const tag = g.asleep > 0 ? "z" + g.asleep : g.freeze > 0 && s.alert === 0 ? "?" : s.alert > 0 ? "!" : "";
    if (tag) { ctx.fillStyle = "#ffd23c"; ctx.font = `bold ${CELL * 0.3}px system-ui`; ctx.fillText(tag, g.x * CELL + CELL * 0.82, g.y * CELL + CELL * 0.2); }
  }
  ctx.globalAlpha = hidden(s) ? 0.5 : 1;
  ctx.font = `${CELL * 0.75}px serif`; ctx.lineWidth = 3; ctx.strokeStyle = "#1a1209"; ctx.fillStyle = "#f6c453";
  ctx.strokeText("♔", s.king.x * CELL + CELL / 2, s.king.y * CELL + CELL / 2 - 3);
  ctx.fillText("♔", s.king.x * CELL + CELL / 2, s.king.y * CELL + CELL / 2 - 3);
  ctx.globalAlpha = 1;
}

const GEAR_LABEL = { coin: ["coin", "🪙"], dart: ["dart", "💉"], box: ["box", "📦"] };
function toolbar() {
  const over = s.status !== "playing";
  bar.innerHTML = `<button data-tool="move" class="${tool === "move" ? "go" : ""}">step</button>` +
    ["coin", "dart", "box"].map((g) => `<button data-tool="${g}" class="${tool === g ? "go" : ""}" ${over || s.gear[g] < 1 ? "disabled" : ""} title="${g === "coin" ? "toss a coin: a nearby guard stares at the noise for 3 turns" : g === "dart" ? "tranquilise the first guard on a line (range 5): asleep 8 turns" : "hide under a box for one turn"}">${GEAR_LABEL[g][1]} ${GEAR_LABEL[g][0]} ×${s.gear[g]}</button>`).join("") +
    `<button data-tool="daily" title="a shared seed for today">daily seed</button><button data-tool="newrun">new run</button>`;
}

function bank() {
  if (s.status === "won" && !banked) {
    banked = true;
    const r = completeFloor(run, s);
    saveBest(run.score);
    lastResult = `floor ${run.floor} cleared: rank ${r.rank}, +${r.points}` + (r.reward.length ? `, gained ${r.reward.join(" + ")}` : "");
    s.log.push(lastResult);
  }
  if (s.status === "lost" && !failed) {
    failed = true;
    if (failFloor(run) === "over") { s.log.push(`out of continues. run over at floor ${s.floor + 1} with ${run.score} points.`); saveBest(run.score); }
  }
}

function ui() {
  bank();
  draw();
  const flashing = s.alert > 0 && !s.wasAlert;
  s.wasAlert = s.alert > 0;
  if (flashing) { cv.classList.remove("flash"); void cv.offsetWidth; cv.classList.add("flash"); }
  $("sStage").textContent = `${s.floor + 1} ${s.name}`;
  $("sTurn").textContent = s.par ? `${s.turn} (par ${s.par})` : s.turn;
  info.textContent = `score ${run.score} · best ${Math.max(best(), run.score)} · continues ${run.lives} · seed ${run.seed}` + (run.ranks.length ? " · ranks " + run.ranks.slice(-8).join("") : "") + (s.keycard ? (s.hasKey ? " · keycard ✓" : " · keycard needed") : "");
  const al = $("sAlert");
  al.textContent = s.alert > 0 ? `ALERT ${s.alert}` : hidden(s) ? "hidden" : "clear";
  al.style.color = s.alert > 0 ? "var(--bad)" : "";
  const over = s.status !== "playing";
  $("sWait").disabled = over;
  $("sNext").hidden = s.status !== "won";
  $("sNext").textContent = "next floor";
  $("sRestart").disabled = s.status === "won";
  $("sRestart").textContent = run.over ? "new run" : `retry floor (${run.lives} continue${run.lives === 1 ? "" : "s"})`;
  $("sLog").textContent = s.log.slice(-3).join("\n");
  $("sLog").className = over ? "end" : "";
  if (s.status === "lost" && !run.over) $("sLog").textContent += "\n(retry costs a continue)";
  toolbar();
  if (run.over || s.status === "won") {
    const txt = run.over ? `I got caught on floor ${s.floor + 1} of Chess Solid with ${run.score} points (seed ${run.seed}).` : `I've cleared ${run.floor} floors of Chess Solid with ${run.score} points (seed ${run.seed}).`;
    $("sShareLink").href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(txt + "\nhttps://chessgenres.bisks.net/#stealth");
    $("sShare").hidden = false;
  } else $("sShare").hidden = true;
}

cv.addEventListener("click", (e) => {
  if (s.status !== "playing") return;
  const r = cv.getBoundingClientRect();
  const x = Math.floor(((e.clientX - r.left) / r.width) * SIZE), y = Math.floor(((e.clientY - r.top) / r.height) * SIZE);
  if (tool === "coin") { if (throwCoin(s, x, y)) tool = "move"; }
  else if (tool === "dart") { if (shoot(s, x, y)) tool = "move"; }
  else moveKing(s, x, y);
  ui();
});
bar.addEventListener("click", (e) => {
  const b = e.target.closest("button[data-tool]");
  if (!b || b.disabled) return;
  const k = b.dataset.tool;
  if (k === "daily") return newGameRun(dailySeed());
  if (k === "newrun") return newGameRun(randomSeed());
  if (k === "box") { useBox(s); tool = "move"; }
  else tool = tool === k ? "move" : k;
  ui();
});
$("sWait").addEventListener("click", () => { wait(s); ui(); });
$("sNext").addEventListener("click", () => { if (s.status === "won") startFloor(); });
$("sRestart").addEventListener("click", () => {
  if (run.over) return newGameRun(randomSeed());
  if (s.status === "playing") {
    if (failFloor(run) === "over") { s.status = "lost"; failed = true; s.log.push(`out of continues. run over at floor ${s.floor + 1} with ${run.score} points.`); saveBest(run.score); return ui(); }
  }
  s = floorLevel(run); banked = false; failed = false; tool = "move"; ui();
});
newGameRun(randomSeed());
