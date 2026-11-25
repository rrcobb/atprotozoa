import { SIZE, GOAL, GLYPH, LIVES, JOBS, PROPS, MAX_WANTED, newGame, myMoves, move, wait, rankTitle, score, ownedCount } from "./grand-logic.js";

const $ = (id) => document.getElementById(id);
const cv = $("gc"), ctx = cv.getContext("2d"), CELL = cv.width / SIZE;
let s, fx = [], prev = { cash: 0, wanted: 0 }, raf = 0;

// extra HUD built here so index.html only keeps the shared section
const sub = document.createElement("p");
sub.id = "gSub"; sub.style.cssText = "margin:0 0 8px;font-variant-numeric:tabular-nums";
$("gc").before(sub);
const radio = document.createElement("p");
radio.id = "gRadio"; radio.className = "dim"; radio.style.cssText = "margin:8px 0 0;font-style:italic;min-height:1.4em";
$("gc").after(radio);

const randomSeed = () => (Date.now() & 0x7fffffff) || 1;
function reset() { s = newGame(randomSeed()); fx = []; prev = { cash: 0, wanted: 0 }; ui(); }

function glyph(g, x, y, fill, stroke, size = 0.75) {
  ctx.font = `${CELL * size}px serif`; ctx.lineWidth = 3; ctx.strokeStyle = stroke; ctx.fillStyle = fill;
  ctx.strokeText(g, x * CELL + CELL / 2, y * CELL + CELL / 2 - 2);
  ctx.fillText(g, x * CELL + CELL / 2, y * CELL + CELL / 2 - 2);
}
const tag = (txt, x, y, col = "#fff") => { ctx.fillStyle = col; ctx.font = `bold ${CELL * 0.2}px system-ui`; ctx.fillText(txt, x * CELL + CELL / 2, (y + 0.9) * CELL); };

function draw(now = 0) {
  ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const c = s.map[y][x], px = x * CELL, py = y * CELL;
    if (c === "#") {
      ctx.fillStyle = "#2a2f3d"; ctx.fillRect(px, py, CELL, CELL);
      ctx.fillStyle = (x * 7 + y * 3) % 3 ? "#e8c96a" : "#566";
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) ctx.fillRect(px + CELL * 0.2 + i * CELL * 0.32, py + CELL * 0.2 + j * CELL * 0.32, CELL * 0.2, CELL * 0.2);
    } else if (c === "~" || c === "=") {
      ctx.fillStyle = "#1f4f73"; ctx.fillRect(px, py, CELL, CELL);
      ctx.strokeStyle = "rgba(255,255,255,.18)"; ctx.lineWidth = 2; ctx.beginPath();
      const w = Math.sin(now / 500 + x + y) * 3;
      ctx.moveTo(px + 6, py + CELL * 0.35 + w); ctx.lineTo(px + CELL - 6, py + CELL * 0.35 - w);
      ctx.moveTo(px + 6, py + CELL * 0.7 - w); ctx.lineTo(px + CELL - 6, py + CELL * 0.7 + w); ctx.stroke();
      if (c === "=") { ctx.fillStyle = "#8a6a43"; ctx.fillRect(px, py + 4, CELL, CELL - 8); ctx.fillStyle = "#6b4f2e"; for (let i = 1; i < 4; i++) ctx.fillRect(px + (i * CELL) / 4 - 1, py + 4, 2, CELL - 8); }
    } else { ctx.fillStyle = (x + y) % 2 ? "#4b4b52" : "#56565e"; ctx.fillRect(px, py, CELL, CELL); }
  }
  ctx.fillStyle = "#3fb56b"; ctx.fillRect(s.spray.x * CELL + 4, s.spray.y * CELL + 4, CELL - 8, CELL - 8);
  ctx.fillStyle = "#06220f"; ctx.font = `bold ${CELL * 0.17}px system-ui`; ctx.fillText("SPRAY", s.spray.x * CELL + CELL / 2, s.spray.y * CELL + CELL / 2);
  for (const p of s.props) {
    ctx.fillStyle = p.owned ? "#3a6a8a" : "#5a4a2a"; ctx.fillRect(p.x * CELL + 4, p.y * CELL + 4, CELL - 8, CELL - 8);
    ctx.font = `${CELL * 0.5}px serif`; ctx.fillStyle = "#fff"; ctx.fillText(PROPS[p.type].glyph, p.x * CELL + CELL / 2, p.y * CELL + CELL * 0.42);
    tag(p.owned ? (p.type === "garage" && p.stock ? GLYPH[p.stock] : "yours") : "$" + p.price, p.x, p.y - 0.08, p.owned ? "#bfe3ff" : "#ffd88a");
  }
  for (const c of s.cash_at) { ctx.fillStyle = "#6fd48a"; ctx.font = `bold ${CELL * 0.7}px system-ui`; ctx.fillText("$", c.x * CELL + CELL / 2, c.y * CELL + CELL / 2); }
  const pulse = 0.85 + 0.15 * Math.sin(now / 250);
  for (const o of s.offers) {
    ctx.fillStyle = "rgba(255,210,90,.28)"; ctx.beginPath(); ctx.arc((o.x + 0.5) * CELL, (o.y + 0.5) * CELL, CELL * 0.46 * pulse, 0, 7); ctx.fill();
    ctx.font = `${CELL * 0.55}px serif`; ctx.fillStyle = "#fff"; ctx.fillText(JOBS[o.kind].glyph, (o.x + 0.5) * CELL, (o.y + 0.5) * CELL);
  }
  const j = s.job;
  if (j) {
    const mark = (m, txt, col) => { ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.strokeRect(m.x * CELL + 4, m.y * CELL + 4, CELL - 8, CELL - 8); ctx.fillStyle = col; ctx.font = `bold ${CELL * 0.5}px system-ui`; ctx.fillText(txt, (m.x + 0.5) * CELL, (m.y + 0.5) * CELL); };
    if (j.to) mark(j.to, "⚑", "#ffd23c");
    if (j.cps) j.cps.forEach((c, i) => { if (i >= j.next) mark(c, i === j.next ? "🏁" : String(i + 1), i === j.next ? "#6fd48a" : "#8aa"); });
    if (j.target) { glyph("☠", j.target.x, j.target.y, "#ff5a4a", "#200", 0.7); }
  }
  if (s.status === "playing") {
    ctx.fillStyle = "rgba(90,170,255,.4)";
    for (const m of myMoves(s)) ctx.fillRect(m.x * CELL, m.y * CELL, CELL, CELL);
  }
  for (const c of s.cars) {
    ctx.fillStyle = "#a43d3d"; ctx.fillRect(c.x * CELL + 7, c.y * CELL + 7, CELL - 14, CELL - 14);
    glyph(GLYPH[c.t], c.x, c.y, "#fff", "#400", 0.6);
  }
  for (const b of s.blocks) { ctx.font = `${CELL * 0.7}px serif`; ctx.fillStyle = "#fff"; ctx.fillText("🚧", (b.x + 0.5) * CELL, (b.y + 0.5) * CELL); }
  for (const c of s.civs) glyph(GLYPH.p, c.x, c.y, "#e9d8b4", "#222", 0.6);
  for (const c of s.cops) {
    ctx.fillStyle = "#1c3f8a"; ctx.fillRect(c.x * CELL + 5, c.y * CELL + 5, CELL - 10, CELL - 10);
    glyph(GLYPH[c.t], c.x, c.y, "#fff", "#08183a", 0.62);
    ctx.fillStyle = s.turn % 2 ? "#e33" : "#39f"; ctx.fillRect(c.x * CELL + CELL / 2 - 6, c.y * CELL + 5, 12, 5);
  }
  if (s.me.armor) { ctx.strokeStyle = "#7fd0ff"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc((s.me.x + 0.5) * CELL, (s.me.y + 0.5) * CELL, CELL * 0.45, 0, 7); ctx.stroke(); }
  glyph(s.status === "lost" ? "✖" : GLYPH[s.me.ride], s.me.x, s.me.y, "#f6c453", "#1a1209");
  for (const f of fx) {
    const k = (now - f.t0) / 900;
    ctx.globalAlpha = Math.max(0, 1 - k); ctx.fillStyle = f.col; ctx.font = `bold ${CELL * 0.4}px system-ui`;
    ctx.fillText(f.txt, (f.x + 0.5) * CELL, (f.y + 0.3) * CELL - k * CELL * 0.8); ctx.globalAlpha = 1;
  }
}

// floating +$ popups; the loop only runs while there's something to animate
function loop(now) {
  fx = fx.filter((f) => now - f.t0 < 900);
  draw(now);
  // animated water and job markers; stop when the section is hidden so a background tab costs nothing
  raf = cv.offsetParent ? requestAnimationFrame(loop) : 0;
}
const kick = () => { if (!raf) raf = requestAnimationFrame(loop); };

function jobText() {
  const j = s.job;
  if (!j) return s.offers.length ? "no job: step onto a glowing marker (" + s.offers.map((o) => JOBS[o.kind].glyph).join(" ") + ") to take it" : "no job";
  const left = j.deadline ? ` (${Math.max(0, j.deadline - s.turn)} turns left)` : "";
  if (j.kind === "taxi") return `🚕 deliver the fare to ⚑ for $${j.fare}${left}`;
  if (j.kind === "race") return `🏁 checkpoint ${j.next + 1}/3 for $${j.fare}${left}`;
  if (j.kind === "hit") return `☠ run down the mark for $${j.fare}${left}`;
  return "🏦 carrying loot: bank it at a safehouse or SPRAY";
}

function ui() {
  const now = performance.now();
  if (s.cash > prev.cash) fx.push({ x: s.me.x, y: s.me.y, txt: "+$" + (s.cash - prev.cash), col: "#6fd48a", t0: now });
  if (s.cash < prev.cash) fx.push({ x: s.me.x, y: s.me.y, txt: "-$" + (prev.cash - s.cash), col: "#ff8a7a", t0: now });
  if (s.wanted > prev.wanted) { cv.classList.remove("flash"); void cv.offsetWidth; cv.classList.add("flash"); }
  prev = { cash: s.cash, wanted: s.wanted };
  draw(now); kick();
  $("gCash").textContent = "$" + s.cash;
  $("gGoal").textContent = "$" + GOAL;
  $("gStars").textContent = "★".repeat(s.wanted) + "☆".repeat(MAX_WANTED - s.wanted);
  $("gRide").textContent = (s.me.ride === "k" ? "on foot" : GLYPH[s.me.ride]) + (s.me.armor ? " 🛡" : "");
  $("gTurn").textContent = s.turn;
  sub.textContent = `${rankTitle(s)} · lives ${"♥".repeat(s.lives)}${"♡".repeat(LIVES - s.lives)} · jobs ${s.done} · properties ${ownedCount(s)}/${s.props.length}` + (s.loot ? ` · loot $${s.loot}` : "") + `\n${jobText()}`;
  sub.style.whiteSpace = "pre-line";
  radio.textContent = "📻 " + s.radio;
  const over = s.status !== "playing";
  $("gWait").disabled = over;
  const here = s.props.find((p) => p.x === s.me.x && p.y === s.me.y);
  $("gWait").textContent = here && !here.owned ? `buy for $${here.price}` : "lie low";
  $("gLog").textContent = s.log.slice(-4).join("\n");
  $("gLog").className = over ? "end" : "";
  if (over) {
    const txt = s.status === "won" ? `I retired with $${s.cash} in ${s.turn} turns in Grand Chess Auto as a ${rankTitle(s)} (score ${score(s)}).` : `WASTED in Grand Chess Auto on turn ${s.turn} with $${s.cash} as a ${rankTitle(s)} (score ${score(s)}).`;
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
