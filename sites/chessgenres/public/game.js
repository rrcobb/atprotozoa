import { N, PIECES, KINDS, WAVES, DIFFS, SPECIAL, TARGET_MODES, RELICS, MAX_UP, attackSquares, pathPos, waveSpawns, waveTheme, describeWave,
  hpScale, isPathSquare, makePath, mulberry32, isBossWave, hitDamage, defenders, towerDmg, towerCd, upgradeCost, upgrades, pickTarget,
  offerRelics, pieceCost, tdScore } from "./logic.js";

const $ = (id) => document.getElementById(id);
const cv = $("c"), ctx = cv.getContext("2d");
const S = cv.width / N;

let shopSig = "", selSig = "", st, pick = "rook", sel = null, last = 0, path, seed, diff = "normal", fx = [], shake = 0;

const bestKey = () => `cg-td-best-${diff}`;
const getBest = () => { try { return +localStorage.getItem(bestKey()) || 0; } catch { return 0; } };
const setBest = (v) => { try { localStorage.setItem(bestKey(), String(v)); } catch { /* private mode: best score just isn't kept */ } };

// Extra controls (seed, difficulty, freeze, relics, tower panel) are built here so index.html stays untouched.
const bar = document.createElement("div");
bar.className = "ctl"; bar.id = "tdBar";
bar.innerHTML = `<label class="dim">seed <input id="tdSeed" size="7" inputmode="numeric"></label>
  <button id="tdSeedGo">load</button><button id="tdSeedRnd">🎲 new map</button>
  <select id="tdDiff">${Object.entries(DIFFS).map(([k, d]) => `<option value="${k}">${d.label}</option>`).join("")}</select>
  <span class="dim" id="tdBest"></span>`;
cv.before(bar);
const extra = document.createElement("div");
extra.innerHTML = `<p id="tdPreview" class="dim"></p>
  <div class="ctl"><button id="tdFreeze">♔ check: freeze 3s</button><button id="tdEndless" hidden>carry on: endless</button></div>
  <div id="tdRelics" class="shop" hidden></div><div id="tdSel" class="shop"></div>`;
$("shop").before(extra);
$("tdDiff").value = diff;

function randSeed() { return 1 + Math.floor(Math.random() * 99999); }

function reset(newSeed) {
  seed = newSeed || seed || randSeed();
  path = makePath(seed);
  const d = DIFFS[diff];
  st = { gold: d.gold, lives: d.lives, wave: 0, towers: [], enemies: [], queue: [], clock: 0, running: false, over: false, won: false,
    endless: false, shots: [], relics: [], offers: null, freeze: 0, charges: 1, frozen: 0, kills: 0 };
  sel = null; fx = []; shake = 0; selSig = ""; shopSig = "";
  $("tdSeed").value = seed;
  $("share").hidden = true; $("tdEndless").hidden = true;
  setMsg("pick a piece, tap a free square. dark purple is the road. tap a placed piece to upgrade it.");
  ui();
}

function setMsg(t, end) { const m = $("msg"); m.textContent = t; m.className = end ? "end" : ""; }
const theme = () => waveTheme(seed, st.wave + 1);
const defendAll = () => { for (const t of st.towers) t.def = defenders(st.towers, t); };
const cost = (k) => pieceCost(k, st.relics);

function ui() {
  $("wave").nextSibling.textContent = st.endless ? " (endless)" : "/10";
  $("wave").textContent = st.wave; $("gold").textContent = Math.floor(st.gold); $("lives").textContent = st.lives;
  const nxt = $("next");
  nxt.disabled = st.running || st.over || !!st.offers;
  const nw = st.wave + 1;
  nxt.textContent = st.over ? "game over" : st.offers ? "pick a relic" : isBossWave(nw) ? "send the boss" : `send wave ${nw}`;
  $("sell").disabled = !sel || st.over;
  $("tdBest").textContent = `best (${diff}): ${getBest()}`;
  $("tdPreview").textContent = st.over || st.running ? "" : `next, wave ${nw} — ${describeWave(nw, theme())}`;
  const fz = $("tdFreeze");
  fz.textContent = `♔ check: freeze 3s (${st.charges})`;
  fz.disabled = !st.running || st.over || st.charges < 1 || st.frozen > 0;
  // ui() runs every frame during a wave; only touch the DOM when the shop changes or clicks get eaten.
  const sig = pick + Object.keys(PIECES).map((k) => st.gold < cost(k)).join() + st.relics.length;
  if (sig !== shopSig) {
    shopSig = sig;
    $("shop").innerHTML = Object.entries(PIECES).map(([k, p]) =>
      `<button data-k="${k}" title="${SPECIAL[k]}" class="${pick === k ? "sel" : ""}" ${st.gold < cost(k) ? "disabled" : ""}>${p.glyph} ${p.label} · ${cost(k)}</button>`).join("");
  }
  renderSel();
  renderRelics();
}

function renderSel() {
  const t = sel, up = t ? upgrades(t) : 0, uc = t ? upgradeCost(t.type, t) : 0;
  const sig = t ? [t.r, t.c, t.up.power, t.up.haste, t.mode, t.def, st.gold >= uc, st.over].join() : "none";
  if (sig === selSig) return;
  selSig = sig;
  const box = $("tdSel");
  if (!t) { box.innerHTML = `<span class="dim">tip: a piece guarded by another piece (inside its move range) hits 20% harder.</span>`; return; }
  const can = up < MAX_UP && st.gold >= uc && !st.over;
  const full = up >= MAX_UP;
  box.innerHTML = `<span class="dim">${PIECES[t.type].glyph} ${SPECIAL[t.type]}. dmg ${towerDmg(t, st.relics).toFixed(0)}, guarded ×${t.def || 0}. upgrades ${up}/${MAX_UP}</span>
    <button data-up="power" ${can ? "" : "disabled"}>⚔ power · ${full ? "max" : uc}</button>
    <button data-up="haste" ${can ? "" : "disabled"}>⚡ haste · ${full ? "max" : uc}</button>
    <button data-mode="1">target: ${TARGET_MODES[t.mode]}</button>`;
}

$("tdSel").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b || !sel || st.over) return;
  if (b.dataset.mode) { sel.mode = (sel.mode + 1) % TARGET_MODES.length; selSig = ""; ui(); return; }
  const k = b.dataset.up, c = upgradeCost(sel.type, sel);
  if (!k || upgrades(sel) >= MAX_UP || st.gold < c) return;
  st.gold -= c; sel.up[k]++; sel.spent += c;
  burst(sel.c, sel.r, "#e8b04a", 10); float(sel.c, sel.r, k === "power" ? "⚔ +dmg" : "⚡ +speed", "#e8b04a");
  selSig = ""; ui();
});

function renderRelics() {
  const box = $("tdRelics");
  const sig = st.offers ? st.offers.join() : "";
  if (box.dataset.sig === sig) return;
  box.dataset.sig = sig;
  box.hidden = !st.offers;
  box.innerHTML = st.offers ? `<span class="dim">choose a relic:</span>` + st.offers.map((k) => `<button data-relic="${k}"><b>${RELICS[k].label}</b> <small>${RELICS[k].desc}</small></button>`).join("") : "";
}
$("tdRelics").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-relic]"); if (!b || !st.offers) return;
  const k = b.dataset.relic;
  if (k === "heart") st.lives += 2; else if (k === "loot") st.gold += 150;
  if (k !== "heart" && k !== "loot") st.relics.push(k);
  st.offers = null; shopSig = ""; selSig = "";
  setMsg(`took ${RELICS[k].label}: ${RELICS[k].desc}.`);
  ui();
});

$("shop").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-k]"); if (!b) return;
  pick = b.dataset.k; shopSig = ""; ui();
});

cv.addEventListener("click", (e) => {
  if (st.over) return;
  const r = cv.getBoundingClientRect();
  const c = Math.floor((e.clientX - r.left) / r.width * N), row = Math.floor((e.clientY - r.top) / r.height * N);
  const at = st.towers.find((t) => t.r === row && t.c === c);
  if (at) { sel = sel === at ? null : at; selSig = ""; ui(); return; }
  sel = null; selSig = "";
  if (isPathSquare(row, c, path)) { setMsg("that's the road — towers go on the other squares."); ui(); return; }
  const price = cost(pick);
  if (st.gold < price) { setMsg("not enough gold for that piece."); ui(); return; }
  st.gold -= price;
  const t = { type: pick, r: row, c, cd: 0, cells: attackSquares(pick, row, c), spent: price, up: { power: 0, haste: 0 }, mode: 0, def: 0 };
  st.towers.push(t); sel = t; defendAll(); setMsg(SPECIAL[pick] + ".");
  burst(c, row, "#fff8e8", 8);
  ui();
});

$("sell").addEventListener("click", () => {
  if (!sel) return;
  st.gold += Math.floor(sel.spent / 2);
  st.towers = st.towers.filter((t) => t !== sel); sel = null; defendAll(); selSig = ""; ui();
});

$("next").addEventListener("click", () => {
  if (st.running || st.over || st.offers) return;
  st.wave++; st.clock = 0; st.running = true;
  st.queue = waveSpawns(st.wave, waveTheme(seed, st.wave));
  setMsg(isBossWave(st.wave) ? "the boss approaches." : describeWave(st.wave, waveTheme(seed, st.wave)));
  ui();
});
$("restart").addEventListener("click", () => reset(seed));
$("tdSeedGo").addEventListener("click", () => { const v = parseInt($("tdSeed").value, 10); reset(Number.isFinite(v) && v > 0 ? v : randSeed()); });
$("tdSeed").addEventListener("keydown", (e) => { if (e.key === "Enter") $("tdSeedGo").click(); });
$("tdSeedRnd").addEventListener("click", () => reset(randSeed()));
$("tdDiff").addEventListener("change", (e) => { diff = e.target.value; reset(seed); });
$("tdFreeze").addEventListener("click", () => {
  if (!st.running || st.charges < 1 || st.frozen > 0) return;
  st.charges--; st.frozen = 3; shake = 0.2; setMsg("check! everything on the road freezes for 3 seconds."); ui();
});
$("tdEndless").addEventListener("click", () => {
  if (!st.won || !st.over) return;
  st.over = false; st.endless = true; st.enemies = []; st.queue = []; st.running = false; $("tdEndless").hidden = true; $("share").hidden = true;
  st.gold += 100; setMsg("endless mode: waves keep coming and a bigger boss arrives every 10. survive as long as you can."); ui();
});

function enemyCell(e) { const [r, c] = pathPos(e.t, path); return [Math.round(r), Math.round(c)]; }

// --- juice ---
function float(c, r, text, color) { fx.push({ k: "txt", x: c * S + S / 2, y: r * S + S / 2, text, color, ttl: 0.8, max: 0.8 }); }
function burst(c, r, color, n) {
  for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, v = 40 + Math.random() * 90;
    fx.push({ k: "p", x: c * S + S / 2, y: r * S + S / 2, vx: Math.cos(a) * v, vy: Math.sin(a) * v, color, ttl: 0.5, max: 0.5 }); }
}

function kill(e) {
  const k = KINDS[e.kind];
  e.dead = true; st.kills++;
  const gain = Math.round(k.reward * (st.relics.includes("levy") ? 1.3 : 1));
  st.gold += gain;
  const [r, c] = pathPos(e.t, path);
  if (gain) float(c, r, "+" + gain, "#e8d36a");
  burst(c, r, e.kind === "boss" ? "#d8584a" : "#c9b8e8", e.kind === "boss" ? 40 : 6);
  if (e.kind === "boss") { e.slain = true; shake = 0.6; }
}
function hurt(e, dmg, pierce) {
  const d = hitDamage(dmg, KINDS[e.kind].armor, pierce);
  e.hp -= d;
  const [r, c] = pathPos(e.t, path);
  if (d >= 1) float(c + (Math.random() - 0.5) * 0.4, r - 0.2, d.toFixed(0), "#fff");
  if (e.hp <= 0 && !e.dead) kill(e);
}

function step(dt) {
  for (const f of fx) { f.ttl -= dt; if (f.k === "p") { f.x += f.vx * dt; f.y += f.vy * dt; } else f.y -= 30 * dt; }
  fx = fx.filter((f) => f.ttl > 0);
  shake = Math.max(0, shake - dt);
  if (!st.running || st.over) return;
  st.clock += dt;
  if (st.frozen > 0) st.frozen = Math.max(0, st.frozen - dt);
  const diffHp = DIFFS[diff].hp;
  while (st.queue.length && st.queue[0].at <= st.clock) {
    const q = st.queue.shift(), k = KINDS[q.kind];
    const mult = q.kind === "boss" ? Math.ceil(st.wave / WAVES) * diffHp : hpScale(st.wave, diffHp);
    const hp = k.hp * mult;
    st.enemies.push({ kind: q.kind, hp, max: hp, t: 0, slow: 0 });
  }
  const frozen = st.frozen > 0;
  for (const e of st.enemies) {
    if (e.dead) continue;
    e.slow = Math.max(0, e.slow - dt);
    if (!frozen) e.t += KINDS[e.kind].speed * (e.slow > 0 ? 0.55 : 1) * dt;
    if (e.t >= path.length - 1) { st.lives -= KINDS[e.kind].leak; e.dead = true; shake = 0.3; float(path[path.length - 1][1], path[path.length - 1][0], "-" + Math.min(KINDS[e.kind].leak, 9) + "♚", "#d8584a"); }
  }
  for (const t of st.towers) {
    t.cd -= dt;
    if (t.cd > 0) continue;
    const inRange = st.enemies.filter((e) => !e.dead && e.hp > 0 && t.cells.some(([a, b]) => { const [er, ec] = enemyCell(e); return a === er && b === ec; }));
    if (!inRange.length) continue;
    const tgt = pickTarget(inRange, TARGET_MODES[t.mode]);
    const dmg = towerDmg(t, st.relics);
    t.cd = towerCd(t); t.flash = 0.12;
    hurt(tgt, dmg, t.type === "rook");
    st.shots.push({ from: [t.r, t.c], to: pathPos(tgt.t, path), ttl: 0.12 });
    if (t.type === "bishop") tgt.slow = 1.2;
    if (t.type === "knight") for (const o of inRange) if (o !== tgt && !o.dead && Math.abs(o.t - tgt.t) < 0.9) hurt(o, dmg * 0.5, false);
    if (t.type === "queen") {
      const second = pickTarget(inRange.filter((o) => o !== tgt && !o.dead), TARGET_MODES[t.mode]);
      if (second) { hurt(second, dmg * 0.6, false); st.shots.push({ from: [t.r, t.c], to: pathPos(second.t, path), ttl: 0.12 }); }
    }
  }
  const slain = st.enemies.some((e) => e.slain);
  st.enemies = st.enemies.filter((e) => !e.dead);
  for (const s of st.shots) s.ttl -= dt;
  st.shots = st.shots.filter((s) => s.ttl > 0);
  if (st.lives <= 0) return finish(false);
  if (slain && !st.won) return finish(true);
  if (!st.queue.length && !st.enemies.length) {
    st.running = false; st.frozen = 0;
    const gain = Math.round((40 + st.wave * 10) * (st.relics.includes("bank") ? 1.3 : 1));
    st.gold += gain;
    st.charges = Math.min(2, st.charges + (st.wave % (st.relics.includes("check") ? 1 : 2) === 0 ? 1 : 0)); // two stored charges at most, so it stays a panic button
    if (st.wave % 2 === 0) st.offers = offerRelics(mulberry32(seed * 7 + st.wave), st.relics);
    setMsg(`wave ${st.wave} cleared. +${gain} gold.` + (st.offers ? " choose a relic." : ""));
  }
  ui();
}

function finish(won) {
  st.over = true; st.running = false; st.lives = Math.max(0, st.lives);
  if (won) st.won = true;
  const score = tdScore(st);
  const prev = getBest(); if (score > prev) setBest(score);
  const where = `(${diff}, map ${seed})`;
  const txt = won ? `I beat the boss of chess tower defense ${where} with ${st.lives} lives left and ${st.towers.length} pieces. score ${score}.`
                  : `Chess tower defense ${where} took me down on wave ${st.wave}. score ${score}.`;
  setMsg(won ? `checkmate. the queen is down. score ${score}${score > prev ? " — new best!" : ""}. carry on in endless?` : `the king has fallen on wave ${st.wave}. score ${score}${score > prev ? " — new best!" : ""}.`, true);
  $("shareLink").href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(txt + "\nhttps://chessgenres.bisks.net/");
  $("share").hidden = false;
  $("tdEndless").hidden = !won;
  if (won) st.over = true;
  ui();
}

function draw() {
  ctx.save();
  if (shake > 0) ctx.translate((Math.random() - 0.5) * shake * 14, (Math.random() - 0.5) * shake * 14);
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    ctx.fillStyle = isPathSquare(r, c, path) ? ((r + c) % 2 ? "#3b2f4a" : "#46385a") : ((r + c) % 2 ? "#9b6b43" : "#e9d8b4");
    ctx.fillRect(c * S, r * S, S, S);
  }
  if (sel) {
    ctx.fillStyle = "rgba(232,176,74,.35)";
    for (const [r, c] of sel.cells) ctx.fillRect(c * S, r * S, S, S);
  }
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillStyle = "#e8b04a"; ctx.font = `${S * 0.4}px system-ui`;
  ctx.fillText("▶", path[0][1] * S + S / 2, path[0][0] * S + S / 2);
  const end = path[path.length - 1];
  ctx.fillText("♚", end[1] * S + S / 2, end[0] * S + S / 2);
  for (const t of st.towers) {
    const x = t.c * S + S / 2, y = t.r * S + S / 2 + 3;
    ctx.font = `${S * (0.78 + (t.flash > 0 ? 0.08 : 0))}px serif`;
    if (t.flash > 0) t.flash -= 0.016;
    ctx.fillStyle = "#fff8e8"; ctx.strokeStyle = "#1a1209"; ctx.lineWidth = 3;
    ctx.strokeText(PIECES[t.type].glyph, x, y); ctx.fillText(PIECES[t.type].glyph, x, y);
    ctx.fillStyle = "#e8b04a"; ctx.font = `${S * 0.2}px system-ui`;
    const n = upgrades(t);
    if (n) ctx.fillText("★".repeat(n), x, t.r * S + S * 0.12);
    if (t.def) { ctx.fillStyle = "#6fcf7a"; ctx.fillText("🛡".repeat(t.def), x, t.r * S + S * 0.92); }
    if (t === sel) { ctx.strokeStyle = "#e8b04a"; ctx.lineWidth = 3; ctx.strokeRect(t.c * S + 2, t.r * S + 2, S - 4, S - 4); }
  }
  ctx.strokeStyle = "#e8b04a"; ctx.lineWidth = 2;
  for (const s of st.shots) {
    const [tr, tc] = s.to;
    ctx.beginPath(); ctx.moveTo(s.from[1] * S + S / 2, s.from[0] * S + S / 2); ctx.lineTo(tc * S + S / 2, tr * S + S / 2); ctx.stroke();
  }
  for (const e of st.enemies) {
    const k = KINDS[e.kind], [r, c] = pathPos(e.t, path), x = c * S + S / 2, y = r * S + S / 2;
    ctx.font = `${S * k.size * 1.4}px serif`;
    ctx.fillStyle = "#15101c"; ctx.strokeStyle = e.kind === "boss" ? "#d8584a" : e.kind === "king" ? "#e8b04a" : e.slow > 0 ? "#6ab0ff" : "#c9b8e8"; ctx.lineWidth = 2;
    ctx.strokeText(k.glyph, x, y); ctx.fillText(k.glyph, x, y);
    const w = S * (e.kind === "boss" ? 1.4 : e.kind === "king" ? 0.9 : 0.6);
    ctx.fillStyle = "#400"; ctx.fillRect(x - w / 2, y - S * k.size * 0.9, w, 4);
    ctx.fillStyle = "#6c6"; ctx.fillRect(x - w / 2, y - S * k.size * 0.9, w * Math.max(0, e.hp / e.max), 4);
  }
  for (const f of fx) {
    const a = Math.max(0, f.ttl / f.max);
    ctx.globalAlpha = a;
    if (f.k === "p") { ctx.fillStyle = f.color; ctx.fillRect(f.x - 2, f.y - 2, 4, 4); }
    else { ctx.fillStyle = f.color; ctx.strokeStyle = "#000"; ctx.lineWidth = 3; ctx.font = `bold ${S * 0.26}px system-ui`; ctx.strokeText(f.text, f.x, f.y); ctx.fillText(f.text, f.x, f.y); }
  }
  ctx.globalAlpha = 1;
  if (st.frozen > 0) { ctx.fillStyle = "rgba(106,176,255,.2)"; ctx.fillRect(0, 0, cv.width, cv.height); }
  ctx.restore();
}

function frame(ts) {
  const dt = Math.min(0.1, (ts - last) / 1000 || 0); last = ts;
  // Only simulate while the tower defense genre is on screen.
  if (!$("td").hidden) { step(dt); draw(); }
  requestAnimationFrame(frame);
}

reset();
requestAnimationFrame(frame);
