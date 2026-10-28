import { N, ROUNDS, UNITS, makeUnit, tick, result, alive, mergeOnce, maxBoard, income, enemyTeam } from "./auto-logic.js";

const $ = (id) => document.getElementById(id);
const cv = $("ac"), ctx = cv.getContext("2d");
const S = cv.width / N;
const TICK_MS = 450;
const BENCH = 8, SHOP = 5, REROLL = 1;
const SELL = (p) => Math.max(1, Math.floor(UNITS[p.type].cost * (p.star === 1 ? 1 : p.star === 2 ? 3 : 9) / 2));

let g, sel = null, battle = null, acc = 0, last = 0, ticks = 0, fx = [];

function rollShop() {
  const types = Object.keys(UNITS);
  // cheap pieces show up more often than queens
  const w = types.map((t) => 8 - UNITS[t].cost);
  const tot = w.reduce((a, b) => a + b, 0);
  g.shop = Array.from({ length: SHOP }, () => {
    let x = Math.random() * tot, i = 0;
    while (x >= w[i]) { x -= w[i]; i++; }
    return types[i];
  });
}
function reset() {
  g = { round: 1, gold: 10, hp: 10, bench: [], board: [], shop: [], status: "prep" };
  rollShop(); sel = null; battle = null; fx = [];
  $("aShare").hidden = true;
  setMsg("buy pieces from the shop, then put them on your three ranks. three of a kind merge into a star.");
  ui();
}
function setMsg(t, end) { $("aMsg").textContent = t; $("aMsg").className = end ? "end" : ""; }

function merge() {
  const all = g.board.concat(g.bench);
  let did = false;
  while (mergeOnce(all)) did = true;
  if (did) {
    g.board = all.filter((p) => p.r !== undefined);
    g.bench = all.filter((p) => p.r === undefined);
    setMsg("three of a kind merged into a starred piece!");
  }
}

function ui() {
  $("aRound").textContent = g.round; $("aGold").textContent = g.gold; $("aHp").textContent = g.hp;
  $("aBoardCount").textContent = `${g.board.length}/${maxBoard(g.round)}`;
  const prep = g.status === "prep";
  $("aShop").innerHTML = g.shop.map((t, i) => t
    ? `<button data-buy="${i}" ${prep && g.gold >= UNITS[t].cost ? "" : "disabled"}>${UNITS[t].glyph[0]} ${UNITS[t].label} · ${UNITS[t].cost}</button>` : "").join("")
    + `<button data-reroll="1" ${prep && g.gold >= REROLL ? "" : "disabled"}>🎲 reroll · ${REROLL}</button>`;
  const stars = (p) => "★".repeat(p.star);
  $("aBench").innerHTML = Array.from({ length: BENCH }, (_, i) => {
    const p = g.bench[i];
    return p ? `<button data-bench="${i}" class="${sel && sel.bench === i ? "sel" : ""}">${UNITS[p.type].glyph[0]}<small>${stars(p)}</small></button>` : `<button disabled class="slot">·</button>`;
  }).join("");
  $("aFight").disabled = !prep || !g.board.length;
  $("aFight").textContent = prep ? `fight round ${g.round}` : g.status === "fight" ? "fighting…" : "game over";
  $("aSell").disabled = !prep || !sel;
}

function setSel(s) { sel = s; ui(); }

$("aShop").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b || g.status !== "prep") return;
  if (b.dataset.reroll) { if (g.gold < REROLL) return; g.gold -= REROLL; rollShop(); ui(); return; }
  const i = +b.dataset.buy, t = g.shop[i];
  if (!t || g.gold < UNITS[t].cost) return;
  if (g.bench.length >= BENCH) { setMsg("bench is full — sell something."); return; }
  g.gold -= UNITS[t].cost; g.shop[i] = null;
  g.bench.push({ type: t, star: 1 });
  merge(); ui();
});

$("aBench").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-bench]"); if (!b || g.status !== "prep") return;
  const i = +b.dataset.bench;
  setSel(sel && sel.bench === i ? null : { bench: i });
});

cv.addEventListener("click", (e) => {
  if (g.status !== "prep") return;
  const rc = cv.getBoundingClientRect();
  const c = Math.floor((e.clientX - rc.left) / rc.width * N), r = Math.floor((e.clientY - rc.top) / rc.height * N);
  const there = g.board.find((p) => p.r === r && p.c === c);
  if (!sel) { if (there) setSel({ r, c }); return; }
  if (r < N - 3) { setMsg("your pieces start on the bottom three ranks."); return; }
  if (sel.bench !== undefined) {
    if (there) { setSel({ r, c }); return; }
    if (g.board.length >= maxBoard(g.round)) { setMsg(`only ${maxBoard(g.round)} pieces fit on the board this round.`); return; }
    const p = g.bench.splice(sel.bench, 1)[0];
    p.r = r; p.c = c; g.board.push(p);
    setSel(null); return;
  }
  const from = g.board.find((p) => p.r === sel.r && p.c === sel.c);
  if (!from) { setSel(null); return; }
  if (there && there !== from) { [from.r, there.r] = [there.r, from.r]; [from.c, there.c] = [there.c, from.c]; }
  else if (!there) { from.r = r; from.c = c; }
  setSel(null);
});

// Selected piece on the board goes back to the bench with a click on "bench"; keep it simple: double use of sell/bench.
$("aToBench").addEventListener("click", () => {
  if (g.status !== "prep" || !sel || sel.bench !== undefined) return;
  if (g.bench.length >= BENCH) { setMsg("bench is full."); return; }
  const i = g.board.findIndex((p) => p.r === sel.r && p.c === sel.c);
  if (i < 0) return;
  const p = g.board.splice(i, 1)[0]; delete p.r; delete p.c; g.bench.push(p);
  setSel(null);
});
$("aSell").addEventListener("click", () => {
  if (g.status !== "prep" || !sel) return;
  let p;
  if (sel.bench !== undefined) p = g.bench.splice(sel.bench, 1)[0];
  else { const i = g.board.findIndex((q) => q.r === sel.r && q.c === sel.c); if (i >= 0) p = g.board.splice(i, 1)[0]; }
  if (p) { g.gold += SELL(p); setMsg(`sold for ${SELL(p)}.`); }
  setSel(null);
});
$("aRestart").addEventListener("click", reset);

$("aFight").addEventListener("click", () => {
  if (g.status !== "prep" || !g.board.length) return;
  battle = g.board.map((p) => makeUnit(p.type, p.star, 0, p.r, p.c)).concat(enemyTeam(g.round));
  ticks = 0; acc = 0; sel = null; g.status = "fight";
  setMsg(g.round >= ROUNDS ? "the giant queen enters the board." : "fight!");
  ui();
});

function endBattle(res) {
  const won = res === "player";
  const left = alive(battle, won ? 0 : 1).length;
  battle = null;
  if (!won) g.hp -= Math.max(1, left);
  g.gold += income(g.round, won);
  if (g.hp <= 0) { g.status = "over"; finish(false); return; }
  if (won && g.round >= ROUNDS) { g.status = "over"; finish(true); return; }
  g.round++; g.status = "prep"; rollShop();
  setMsg(won ? `round won. +${income(g.round - 1, true)} gold.` : `round lost — ${left} enemy piece${left === 1 ? "" : "s"} survived. -${Math.max(1, left)} hp.`);
  ui();
}
function finish(won) {
  const txt = won ? `I beat the giant queen in Chess Autobattler with ${g.hp} hp to spare.` : `My Chess Autobattler run fell at round ${g.round}.`;
  setMsg(won ? "the giant queen falls. you win!" : `knocked out at round ${g.round}.`, true);
  $("aShareLink").href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(txt + "\nhttps://chessgenres.bisks.net/#autobattler");
  $("aShare").hidden = false;
  ui();
}

function glyph(u, x, y) {
  ctx.font = `${S * (u.giant ? 0.95 : 0.7)}px serif`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillStyle = u.side === 0 ? "#fff8e8" : "#2a1a3a"; ctx.strokeStyle = u.side === 0 ? "#1a1209" : "#e8c6ff"; ctx.lineWidth = 3;
  const gl = UNITS[u.type].glyph[u.side];
  ctx.strokeText(gl, x, y); ctx.fillText(gl, x, y);
}
function draw() {
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    ctx.fillStyle = (r + c) % 2 ? "#9b6b43" : "#e9d8b4";
    ctx.fillRect(c * S, r * S, S, S);
  }
  if (g.status === "prep") { ctx.fillStyle = "rgba(232,176,74,.18)"; ctx.fillRect(0, (N - 3) * S, cv.width, 3 * S); }
  const list = battle || g.board.map((p) => ({ ...p, side: 0, hp: 1, maxhp: 1 }));
  for (const u of list) {
    if (u.hp <= 0) continue;
    const x = u.c * S + S / 2, y = u.r * S + S / 2 + 2;
    if (sel && !battle && sel.r === u.r && sel.c === u.c) { ctx.strokeStyle = "#e8b04a"; ctx.lineWidth = 3; ctx.strokeRect(u.c * S + 2, u.r * S + 2, S - 4, S - 4); }
    glyph(u, x, y);
    if (u.star > 1) { ctx.font = `${S * 0.2}px system-ui`; ctx.fillStyle = "#e8b04a"; ctx.fillText("★".repeat(u.star), x, u.r * S + S * 0.14); }
    if (battle) {
      const w = S * 0.8, f = Math.max(0, u.hp / u.maxhp);
      ctx.fillStyle = "#000a"; ctx.fillRect(u.c * S + S * 0.1, u.r * S + S - 8, w, 5);
      ctx.fillStyle = u.side === 0 ? "#6fcf7a" : "#d8584a"; ctx.fillRect(u.c * S + S * 0.1, u.r * S + S - 8, w * f, 5);
    }
  }
  for (const f of fx) {
    ctx.strokeStyle = `rgba(232,176,74,${f.life})`; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(f.a[1] * S + S / 2, f.a[0] * S + S / 2); ctx.lineTo(f.b[1] * S + S / 2, f.b[0] * S + S / 2); ctx.stroke();
  }
}

function frame(ts) {
  const dt = Math.min(250, ts - last || 0); last = ts;
  fx = fx.map((f) => ({ ...f, life: f.life - dt / 300 })).filter((f) => f.life > 0);
  // Only simulate while the autobattler genre is on screen.
  if (battle && !$("autobattler").hidden) {
    acc += dt;
    while (battle && acc >= TICK_MS) {
      acc -= TICK_MS; ticks++;
      for (const e of tick(battle)) if (e.kind === "hit") fx.push({ a: e.from, b: e.to, life: 1 });
      const res = result(battle, ticks);
      if (res) { endBattle(res); break; }
    }
  }
  draw();
  requestAnimationFrame(frame);
}

reset();
requestAnimationFrame(frame);
