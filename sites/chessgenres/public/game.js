import { N, PATH, PIECES, KINDS, WAVES, attackSquares, pathPos, waveSpawns, hpScale, isPathSquare } from "./logic.js";

const $ = (id) => document.getElementById(id);
const cv = $("c"), ctx = cv.getContext("2d");
const S = cv.width / N;


let shopSig = "", st, pick = "rook", sel = null, last = 0;

function reset() {
  st = { gold: 250, lives: 10, wave: 0, towers: [], enemies: [], queue: [], clock: 0, running: false, over: false, shots: [] };
  sel = null;
  $("share").hidden = true;
  setMsg("pick a piece, tap a free square. the dark purple squares are the path.");
  ui();
}

function setMsg(t, end) { const m = $("msg"); m.textContent = t; m.className = end ? "end" : ""; }

function ui() {
  $("wave").textContent = st.wave; $("gold").textContent = Math.floor(st.gold); $("lives").textContent = st.lives;
  const nxt = $("next");
  nxt.disabled = st.running || st.over;
  nxt.textContent = st.over ? "game over" : st.wave + 1 === WAVES ? "send the final boss" : `send wave ${st.wave + 1}`;
  $("sell").disabled = !sel || st.over;
  // ui() runs every frame during a wave; only touch the DOM when the shop changes or clicks get eaten.
  const sig = pick + Object.values(PIECES).map((p) => st.gold < p.cost).join();
  if (sig === shopSig) return;
  shopSig = sig;
  $("shop").innerHTML = Object.entries(PIECES).map(([k, p]) =>
    `<button data-k="${k}" class="${pick === k ? "sel" : ""}" ${st.gold < p.cost ? "disabled" : ""}>${p.glyph} ${p.label} · ${p.cost}</button>`).join("");
}

$("shop").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-k]"); if (!b) return;
  pick = b.dataset.k; ui();
});

cv.addEventListener("click", (e) => {
  if (st.over) return;
  const r = cv.getBoundingClientRect();
  const c = Math.floor((e.clientX - r.left) / r.width * N), row = Math.floor((e.clientY - r.top) / r.height * N);
  const at = st.towers.find((t) => t.r === row && t.c === c);
  if (at) { sel = sel === at ? null : at; ui(); return; }
  sel = null;
  if (isPathSquare(row, c)) { setMsg("that's the path — towers go on the other squares."); ui(); return; }
  const def = PIECES[pick];
  if (st.gold < def.cost) { setMsg("not enough gold for that piece."); ui(); return; }
  st.gold -= def.cost;
  const t = { type: pick, r: row, c, cd: 0, cells: attackSquares(pick, row, c), spent: def.cost };
  st.towers.push(t); sel = t; setMsg("");
  ui();
});

$("sell").addEventListener("click", () => {
  if (!sel) return;
  st.gold += Math.floor(sel.spent / 2);
  st.towers = st.towers.filter((t) => t !== sel); sel = null; ui();
});

$("next").addEventListener("click", () => {
  if (st.running || st.over) return;
  st.wave++; st.clock = 0; st.running = true;
  st.queue = waveSpawns(st.wave);
  setMsg(st.wave === WAVES ? "the final boss approaches." : "");
  ui();
});
$("restart").addEventListener("click", reset);

function enemyCell(e) { const [r, c] = pathPos(e.t); return [Math.round(r), Math.round(c)]; }

function step(dt) {
  if (!st.running || st.over) return;
  st.clock += dt;
  while (st.queue.length && st.queue[0].at <= st.clock) {
    const q = st.queue.shift(), k = KINDS[q.kind];
    const hp = k.hp * (q.kind === "boss" ? 1 : hpScale(st.wave));
    st.enemies.push({ kind: q.kind, hp, max: hp, t: 0 });
  }
  for (const e of st.enemies) {
    e.t += KINDS[e.kind].speed * dt;
    if (e.t >= PATH.length - 1) { st.lives -= KINDS[e.kind].leak; e.dead = true; }
  }
  for (const t of st.towers) {
    t.cd -= dt;
    if (t.cd > 0) continue;
    const inRange = st.enemies.filter((e) => !e.dead && e.hp > 0 && t.cells.some(([a, b]) => { const [er, ec] = enemyCell(e); return a === er && b === ec; }));
    if (!inRange.length) continue;
    const tgt = inRange.reduce((a, b) => (b.t > a.t ? b : a)); // furthest along the path
    tgt.hp -= PIECES[t.type].dmg; t.cd = PIECES[t.type].cd;
    st.shots.push({ from: [t.r, t.c], to: pathPos(tgt.t), ttl: 0.12 });
    if (tgt.hp <= 0) { st.gold += KINDS[tgt.kind].reward; tgt.dead = true; if (tgt.kind === "boss") tgt.slain = true; }
  }
  const slain = st.enemies.some((e) => e.slain);
  st.enemies = st.enemies.filter((e) => !e.dead);
  for (const s of st.shots) s.ttl -= dt;
  st.shots = st.shots.filter((s) => s.ttl > 0);
  if (st.lives <= 0) return finish(false);
  if (slain) return finish(true);
  if (!st.queue.length && !st.enemies.length) {
    st.running = false;
    st.gold += 40 + st.wave * 10;
    setMsg(`wave ${st.wave} cleared. +${40 + st.wave * 10} gold.`);
  }
  ui();
}

function finish(won) {
  st.over = true; st.running = false; st.lives = Math.max(0, st.lives);
  const txt = won ? `I beat the final boss of chess tower defense with ${st.lives} lives left and ${st.towers.length} pieces.`
                  : `The chess final boss got me on wave ${st.wave} of chess tower defense.`;
  setMsg(won ? `checkmate. the queen is down with ${st.lives} lives to spare.` : `the king has fallen on wave ${st.wave}.`, true);
  $("shareLink").href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(txt + "\nhttps://chessgenres.bisks.net/");
  $("share").hidden = false;
  ui();
}

function draw() {
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    ctx.fillStyle = isPathSquare(r, c) ? ((r + c) % 2 ? "#3b2f4a" : "#46385a") : ((r + c) % 2 ? "#9b6b43" : "#e9d8b4");
    ctx.fillRect(c * S, r * S, S, S);
  }
  if (sel) {
    ctx.fillStyle = "rgba(232,176,74,.35)";
    for (const [r, c] of sel.cells) ctx.fillRect(c * S, r * S, S, S);
  }
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillStyle = "#e8b04a"; ctx.font = `${S * 0.4}px system-ui`;
  ctx.fillText("▶", PATH[0][1] * S + S / 2, PATH[0][0] * S + S / 2);
  const end = PATH[PATH.length - 1];
  ctx.fillText("♚", end[1] * S + S / 2, end[0] * S + S / 2);
  for (const t of st.towers) {
    ctx.font = `${S * 0.78}px serif`;
    ctx.fillStyle = "#fff8e8"; ctx.strokeStyle = "#1a1209"; ctx.lineWidth = 3;
    ctx.strokeText(PIECES[t.type].glyph, t.c * S + S / 2, t.r * S + S / 2 + 3);
    ctx.fillText(PIECES[t.type].glyph, t.c * S + S / 2, t.r * S + S / 2 + 3);
    if (t === sel) { ctx.strokeStyle = "#e8b04a"; ctx.lineWidth = 3; ctx.strokeRect(t.c * S + 2, t.r * S + 2, S - 4, S - 4); }
  }
  ctx.strokeStyle = "#e8b04a"; ctx.lineWidth = 2;
  for (const s of st.shots) {
    const [tr, tc] = s.to;
    ctx.beginPath(); ctx.moveTo(s.from[1] * S + S / 2, s.from[0] * S + S / 2); ctx.lineTo(tc * S + S / 2, tr * S + S / 2); ctx.stroke();
  }
  for (const e of st.enemies) {
    const k = KINDS[e.kind], [r, c] = pathPos(e.t), x = c * S + S / 2, y = r * S + S / 2;
    ctx.font = `${S * k.size * 1.4}px serif`;
    ctx.fillStyle = "#15101c"; ctx.strokeStyle = e.kind === "boss" ? "#d8584a" : "#c9b8e8"; ctx.lineWidth = 2;
    ctx.strokeText(k.glyph, x, y); ctx.fillText(k.glyph, x, y);
    const w = S * (e.kind === "boss" ? 1.4 : 0.6);
    ctx.fillStyle = "#400"; ctx.fillRect(x - w / 2, y - S * k.size * 0.9, w, 4);
    ctx.fillStyle = "#6c6"; ctx.fillRect(x - w / 2, y - S * k.size * 0.9, w * Math.max(0, e.hp / e.max), 4);
  }
}

function frame(ts) {
  const dt = Math.min(0.1, (ts - last) / 1000 || 0); last = ts;
  step(dt); draw();
  requestAnimationFrame(frame);
}

reset();
requestAnimationFrame(frame);
