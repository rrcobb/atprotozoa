import { N, ROUNDS, UNITS, RELICS, makeUnit, tick, result, alive, mergeOnce, maxBoard, income, interest, streakBonus, enemyPlan, acceptsDraw,
  mulberry32, activeSynergies, applySynergies, offerRelics, autoScore, isBossRound } from "./auto-logic.js";

const $ = (id) => document.getElementById(id);
const cv = $("ac"), ctx = cv.getContext("2d");
const S = cv.width / N;
let tickMs = 450; // halved by the speed button
const BENCH = 8, SHOP = 5, REROLL = 1;
const SELL = (p) => Math.max(1, Math.floor(UNITS[p.type].cost * (p.star === 1 ? 1 : p.star === 2 ? 3 : 9) / 2));

let g, sel = null, battle = null, acc = 0, last = 0, ticks = 0, stalled = 0, fx = [], shake = 0, planCache = null;

const BEST = "cg-auto-best";
const getBest = () => { try { return +localStorage.getItem(BEST) || 0; } catch { return 0; } };
const setBest = (v) => { try { localStorage.setItem(BEST, String(v)); } catch { /* private mode: best score just isn't kept */ } };
const randSeed = () => 1 + Math.floor(Math.random() * 99999);

// Extra controls are built here so index.html stays untouched.
const bar = document.createElement("div");
bar.className = "ctl";
bar.innerHTML = `<label class="dim">seed <input id="aSeed" size="7" inputmode="numeric"></label>
  <button id="aSeedGo">load</button><button id="aSeedRnd">🎲 new run</button><button id="aSpeed">speed: 1x</button><span class="dim" id="aBest"></span>`;
cv.before(bar);
const extra = document.createElement("div");
extra.innerHTML = `<p id="aScout" class="dim"></p><p id="aSyn" class="dim"></p><div id="aRelics" class="shop" hidden></div>
  <div class="ctl"><button id="aEndless" hidden>keep climbing: endless</button></div>`;
$("aShop").before(extra);

const relicBonus = () => (g.relics.includes("slot") ? 1 : 0);
// The enemy army is fixed by seed + round, so it can be scouted before you commit.
function plan() {
  if (!planCache || planCache.key !== g.seed + ":" + g.round) planCache = { key: g.seed + ":" + g.round, p: enemyPlan(g.round, mulberry32(g.seed * 101 + g.round)) };
  return planCache.p;
}
const freshEnemies = () => enemyPlan(g.round, mulberry32(g.seed * 101 + g.round)).units;

function rollShop() {
  const types = Object.keys(UNITS);
  // cheap pieces show up more often than queens
  const w = types.map((t) => (t === "q" && g.round < 4 ? 0 : 8 - UNITS[t].cost)); // queens show up from round 4
  const tot = w.reduce((a, b) => a + b, 0);
  g.shop = Array.from({ length: SHOP }, () => {
    let x = Math.random() * tot, i = 0;
    while (x >= w[i]) { x -= w[i]; i++; }
    return types[i];
  });
}
function reset(seed) {
  g = { round: 1, gold: 10, hp: 10, bench: [], board: [], shop: [], status: "prep", seed: seed || g?.seed || randSeed(), relics: [], offers: null, streak: 0, won: false, endless: false, freeRoll: false };
  g.freeRoll = false; planCache = null;
  rollShop(); sel = null; battle = null; fx = []; shake = 0;
  $("aSeed").value = g.seed;
  $("aShare").hidden = true; $("aEndless").hidden = true;
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
  $("aRound").nextSibling.textContent = g.endless ? " (endless)" : `/${ROUNDS}`;
  $("aRound").textContent = g.round; $("aGold").textContent = g.gold; $("aHp").textContent = g.hp;
  $("aBoardCount").textContent = `${g.board.length}/${maxBoard(g.round, relicBonus())}`;
  const prep = g.status === "prep" && !g.offers;
  $("aBest").textContent = `best ${getBest()} · score ${autoScore(g)}`;
  const pl = plan(), counts = {};
  for (const u of pl.units) counts[u.type] = (counts[u.type] || 0) + 1;
  $("aScout").textContent = g.status === "prep" ? `scouting round ${g.round}: ${pl.label} — ` + Object.entries(counts).map(([t, n]) => `${n}${UNITS[t].glyph[1]}`).join(" ") + (g.streak > 1 ? ` · win streak ${g.streak}` : "") : "";
  const syn = activeSynergies(g.board);
  $("aSyn").textContent = syn.length ? "synergies: " + syn.map((s) => `${s.label} ×${s.count}${s.hp > 1 ? ` +${Math.round((s.hp - 1) * 100)}%hp` : ""}${s.atk > 1 ? ` +${Math.round((s.atk - 1) * 100)}%atk` : ""}`).join(" · ")
    : "synergies: field 3 pawns, 2 knights, 2 bishops, 2 rooks or 2 queens (or one each of ♘♗♖♕) for bonuses.";
  const rb = $("aRelics");
  rb.hidden = !g.offers;
  rb.innerHTML = g.offers ? `<span class="dim">choose an augment:</span>` + g.offers.map((k) => `<button data-relic="${k}"><b>${RELICS[k].label}</b> <small>${RELICS[k].desc}</small></button>`).join("") : "";
  $("aShop").innerHTML = g.shop.map((t, i) => t
    ? `<button data-buy="${i}" ${prep && g.gold >= UNITS[t].cost ? "" : "disabled"}>${UNITS[t].glyph[0]} ${UNITS[t].label} · ${UNITS[t].cost}</button>` : "").join("")
    + `<button data-reroll="1" ${prep && (g.freeRoll || g.gold >= REROLL) ? "" : "disabled"}>🎲 reroll · ${g.freeRoll ? "free" : REROLL}</button>`;
  const stars = (p) => "★".repeat(p.star);
  $("aBench").innerHTML = Array.from({ length: BENCH }, (_, i) => {
    const p = g.bench[i];
    return p ? `<button data-bench="${i}" class="${sel && sel.bench === i ? "sel" : ""}">${UNITS[p.type].glyph[0]}<small>${stars(p)}</small></button>` : `<button disabled class="slot">·</button>`;
  }).join("");
  $("aFight").disabled = !prep || !g.board.length;
  $("aFight").textContent = g.offers ? "choose an augment" : prep ? `fight round ${g.round}` : g.status === "fight" ? "fighting…" : "game over";
  $("aSell").disabled = !prep || !sel;
  $("aDraw").disabled = g.status !== "fight" || !battle;
}

function setSel(s) { sel = s; ui(); }

$("aShop").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b || g.status !== "prep") return;
  if (g.offers) return;
  if (b.dataset.reroll) { if (g.freeRoll) g.freeRoll = false; else if (g.gold < REROLL) return; else g.gold -= REROLL; rollShop(); ui(); return; }
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
    if (g.board.length >= maxBoard(g.round, relicBonus())) { setMsg(`only ${maxBoard(g.round, relicBonus())} pieces fit on the board this round.`); return; }
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
$("aRestart").addEventListener("click", () => reset(g.seed));
$("aSeedGo").addEventListener("click", () => { const v = parseInt($("aSeed").value, 10); reset(Number.isFinite(v) && v > 0 ? v : randSeed()); });
$("aSeed").addEventListener("keydown", (e) => { if (e.key === "Enter") $("aSeedGo").click(); });
$("aSeedRnd").addEventListener("click", () => reset(randSeed()));
$("aSpeed").addEventListener("click", () => { tickMs = tickMs === 450 ? 200 : 450; $("aSpeed").textContent = `speed: ${tickMs === 450 ? "1x" : "2x"}`; });
$("aRelics").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-relic]"); if (!b || !g.offers) return;
  takeRelic(b.dataset.relic);
});
function takeRelic(k) {
  if (k === "heal") g.hp += 3; else if (k === "bank") { g.gold += 4; g.relics.push(k); } else g.relics.push(k);
  g.offers = null;
  setMsg(`took ${RELICS[k].label}: ${RELICS[k].desc}.`);
  ui();
}
$("aEndless").addEventListener("click", () => {
  if (g.status !== "over" || !g.won || g.hp <= 0) return;
  g.endless = true; g.round++; g.status = "prep"; g.freeRoll = g.relics.includes("roll");
  rollShop(); $("aEndless").hidden = true; $("aShare").hidden = true;
  setMsg("endless: every 10th round a bigger giant queen arrives. how far can you climb?");
  ui();
});
$("aDraw").addEventListener("click", () => {
  if (g.status !== "fight" || !battle) return;
  if (acceptsDraw(battle)) endBattle("draw", "draw agreed.");
  else setMsg("the enemy declines your draw offer — it thinks it's winning.");
});

$("aFight").addEventListener("click", () => {
  if (g.status !== "prep" || !g.board.length) return;
  const mine = g.board.map((p) => makeUnit(p.type, p.star, 0, p.r, p.c));
  const syn = applySynergies(mine, g.relics);
  battle = mine.concat(freshEnemies());
  ticks = 0; stalled = 0; acc = 0; sel = null; g.status = "fight";
  setMsg(isBossRound(g.round) ? "the giant queen enters the board." : syn.length ? `fight! ${syn.map((s) => s.label).join(", ")} active.` : "fight!");
  ui();
});

function endBattle(res, why = "") {
  const won = res === "player", drew = res === "draw";
  const left = alive(battle, won ? 0 : 1).length;
  battle = null;
  const bank = g.relics.includes("bank") ? 1 : 0;
  if (drew) {
    // A draw costs no hp, pays the plain income plus interest, keeps the streak, and replays the same round.
    const gain = income(g.round, false) + interest(g.gold) + bank;
    g.gold += gain; g.status = "prep"; g.freeRoll = g.relics.includes("roll"); rollShop();
    setMsg(`draw${why ? " — " + why.replace(/\.$/, "") : ""}. no hp lost, +${gain} gold. round ${g.round} again.`);
    ui(); return;
  }
  if (!won) g.hp -= Math.max(1, left);
  g.streak = won ? g.streak + 1 : 0;
  const gain = income(g.round, won) + interest(g.gold) + streakBonus(g.streak) + bank;
  g.gold += gain;
  if (g.hp <= 0) { g.status = "over"; finish(false); return; }
  if (won && g.round === ROUNDS && !g.won) { g.won = true; g.status = "over"; finish(true); return; }
  const done = g.round;
  if (done % 2 === 0) g.offers = offerRelics(mulberry32(g.seed * 13 + done), g.relics);
  g.round++; g.status = "prep"; g.freeRoll = g.relics.includes("roll"); rollShop();
  setMsg((won ? `round won. +${gain} gold (interest and streak included).` : `round lost — ${left} enemy piece${left === 1 ? "" : "s"} survived. -${Math.max(1, left)} hp, +${gain} gold.`) + (g.offers ? " choose an augment." : ""));
  ui();
}
function finish(won) {
  const score = autoScore(g), prev = getBest();
  if (score > prev) setBest(score);
  const best = score > prev ? " — new best!" : "";
  const txt = won ? `I beat the giant queen in Chess Autobattler (seed ${g.seed}) with ${g.hp} hp to spare. score ${score}.` : `My Chess Autobattler run (seed ${g.seed}) fell at round ${g.round}. score ${score}.`;
  setMsg(won ? `the giant queen falls. you win! score ${score}${best}. keep climbing?` : `knocked out at round ${g.round}. score ${score}${best}.`, true);
  $("aShareLink").href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(txt + "\nhttps://chessgenres.bisks.net/#autobattler");
  $("aShare").hidden = false;
  $("aEndless").hidden = !won;
  ui();
}

function addFx(e) {
  const cx = (p) => p[1] * S + S / 2, cy = (p) => p[0] * S + S / 2;
  if (e.kind === "hit") {
    fx.push({ k: "line", a: e.from, b: e.to, ttl: 0.3, max: 0.3 });
    fx.push({ k: "txt", x: cx(e.to), y: cy(e.to) - 6, text: String(e.dmg), color: e.killed ? "#ff9a8a" : "#fff", ttl: 0.8, max: 0.8 });
    if (e.killed) { shake = 0.2; for (let i = 0; i < 8; i++) { const a = Math.random() * 6.283, v = 40 + Math.random() * 80; fx.push({ k: "p", x: cx(e.to), y: cy(e.to), vx: Math.cos(a) * v, vy: Math.sin(a) * v, color: "#e8b04a", ttl: 0.5, max: 0.5 }); } }
  } else if (e.kind === "promote") fx.push({ k: "txt", x: cx(e.at), y: cy(e.at), text: "♕ promoted!", color: "#e8b04a", ttl: 1.2, max: 1.2 });
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
  ctx.save();
  if (shake > 0) ctx.translate((Math.random() - 0.5) * shake * 16, (Math.random() - 0.5) * shake * 16);
  if (g.status === "prep" && !battle) {
    ctx.globalAlpha = 0.35; // scouted enemy army, drawn as ghosts
    for (const u of plan().units) glyph(u, u.c * S + S / 2, u.r * S + S / 2 + 2);
    ctx.globalAlpha = 1;
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
    const a = Math.max(0, f.ttl / f.max);
    if (f.k === "line") { ctx.strokeStyle = `rgba(232,176,74,${a})`; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(f.a[1] * S + S / 2, f.a[0] * S + S / 2); ctx.lineTo(f.b[1] * S + S / 2, f.b[0] * S + S / 2); ctx.stroke(); continue; }
    ctx.globalAlpha = a;
    if (f.k === "p") { ctx.fillStyle = f.color; ctx.fillRect(f.x - 2, f.y - 2, 4, 4); }
    else { ctx.fillStyle = f.color; ctx.strokeStyle = "#000"; ctx.lineWidth = 3; ctx.font = `bold ${S * 0.24}px system-ui`; ctx.textAlign = "center"; ctx.strokeText(f.text, f.x, f.y); ctx.fillText(f.text, f.x, f.y); }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function frame(ts) {
  const dt = Math.min(250, ts - last || 0); last = ts;
  for (const f of fx) { f.ttl -= dt / 1000; if (f.k === "p") { f.x += f.vx * dt / 1000; f.y += f.vy * dt / 1000; } else if (f.k === "txt") f.y -= 26 * dt / 1000; }
  fx = fx.filter((f) => f.ttl > 0);
  shake = Math.max(0, shake - dt / 1000);
  // Only simulate while the autobattler genre is on screen.
  if (battle && !$("autobattler").hidden) {
    acc += dt;
    while (battle && acc >= tickMs) {
      acc -= tickMs; ticks++;
      const evs = tick(battle);
      stalled = evs.length ? 0 : stalled + 1;
      for (const e of evs) addFx(e);
      const res = result(battle, ticks, stalled);
      if (res) { endBattle(res, res === "draw" ? (stalled ? "stalemate, nobody can make progress." : "both sides wiped out or evenly matched.") : ""); break; }
    }
  }
  draw();
  requestAnimationFrame(frame);
}

reset();
requestAnimationFrame(frame);
