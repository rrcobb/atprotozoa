import { N, GOAL, RAMPAGE_EVERY, BUILD, TAX, reach, newCity, place, bulldoze, tick, totalPop, analyze, houseCap, houseScore, omenSquares, omenName, cityScore, preview, advise, houseMood, TIERS, idleBuildings, overlayFor, monthReport, GOAL as GOAL_POP } from "./city-logic.js";

const $ = (id) => document.getElementById(id);
const cv = $("cc"), ctx = cv.getContext("2d");
const S = cv.width / N;
const MONTH_MS = 450;

let city, tool = "pawn", running = false, fast = false, acc = 0, last = 0, sel = -1, flash = null, toolSig = "", fx = [];

const BEST = "cg-city-best";
const getBest = () => { try { return +localStorage.getItem(BEST) || 0; } catch { return 0; } };
const setBest = (v) => { try { localStorage.setItem(BEST, String(v)); } catch { /* private mode: best score just isn't kept */ } };
const randSeed = () => 1 + Math.floor(Math.random() * 99999);

// Extra controls are built here so index.html stays untouched.
const bar = document.createElement("div");
bar.className = "ctl";
bar.innerHTML = `<label class="dim">map <input id="cSeed" size="7" inputmode="numeric"></label>
  <button id="cSeedGo">load</button><button id="cTax">tax: normal</button><button id="cView">view: normal</button><span class="dim" id="cBest"></span>`;
cv.before(bar);
const info = document.createElement("p");
info.id = "cInfo"; info.className = "dim";
cv.after(info);
const hint = document.createElement("p");
hint.id = "cHint"; hint.className = "dim"; hint.style.minHeight = "2.8em";
cv.before(hint);
const adv = document.createElement("ul");
adv.id = "cAdvice"; adv.style.cssText = "list-style:none;padding:0;margin:8px 0;font-size:.9em";
info.after(adv);
const money = document.createElement("span");
money.id = "cIncome"; $("cMoney").after(money);
const log = document.createElement("ul");
log.id = "cLog"; log.style.cssText = "list-style:none;padding:0;margin:8px 0;font-size:.82em;opacity:.8";
adv.after(log);
const prog = document.createElement("div");
prog.style.cssText = "height:10px;background:rgba(26,18,9,.5);border-radius:5px;margin:6px 0;position:relative;overflow:hidden";
prog.innerHTML = '<div id="cProg" style="height:100%;width:0;background:#8fbf6a;transition:width .3s"></div>';
prog.title = "progress to the goal population";
cv.before(prog);
const trend = document.createElement("p");
trend.id = "cTrend"; trend.className = "dim"; trend.style.margin = "2px 0";
cv.after(trend);
let hov = -1, pv = null, history = [], view = 0, hiAdv = null, popHist = [];
const VIEWS = ["normal", "power", "mood"];
const tierName = () => TIERS[city.tier || 0].name;
function note(t) { history.unshift(`month ${city.month}: ${t}`); history.length = Math.min(history.length, 6); renderLog(); }
function renderLog() { log.innerHTML = ""; for (const t of history) { const li = document.createElement("li"); li.textContent = t; log.append(li); } }

function reset(seed) {
  city = newCity(seed || randSeed()); history = []; popHist = []; renderLog(); running = false; acc = 0; sel = -1; flash = null; fx = [];
  $("cSeed").value = city.seed; hov = -1; pv = null;
  $("cShare").hidden = true;
  setMsg("pick a piece, tap a square. houses need a ♕ power plant on their rank, file or diagonal. blue squares are lakes, ◆ is ore.");
  ui();
}
function setMsg(t) { $("cMsg").textContent = t; }

function ui() {
  const pop = totalPop(city);
  $("cMonth").textContent = city.month; $("cMoney").textContent = city.money; $("cPop").textContent = pop;
  $("cRampIn").textContent = RAMPAGE_EVERY - (city.month % RAMPAGE_EVERY);
  $("cPause").textContent = city.status !== "playing" ? "game over" : running ? "pause" : "play";
  $("cPause").disabled = city.status !== "playing";
  $("cFast").textContent = "fast: " + (fast ? "on" : "off");
  $("cTax").textContent = "tax: " + TAX[city.tax].label;
  $("cBest").textContent = `best score ${getBest()} · score ${cityScore(city)}`;
  const k = city.contract;
  const bd = city.lastBreakdown;
  money.textContent = city.lastIncome === undefined ? "" : ` (${city.lastIncome >= 0 ? "+" : ""}${city.lastIncome}/mo)`;
  money.style.color = (city.lastIncome ?? 0) < 0 ? "#d8584a" : "#8fbf6a";
  money.title = bd ? `houses +${bd.homes}, shops +${bd.shops}, factories +${bd.factories}, upkeep -${bd.upkeep}` : "";
  $("cProg").style.width = Math.min(100, pop / GOAL_POP * 100) + "%";
  $("cView").textContent = "view: " + VIEWS[view];
  const rec = popHist.slice(-6);
  trend.textContent = rec.length >= 2 ? `growth: ${rec[rec.length - 1] - rec[0] >= 0 ? "+" : ""}${rec[rec.length - 1] - rec[0]} people over the last ${rec.length - 1} months` + (view ? ` · ${view === 1 ? "yellow = powered, dark = no power" : "green happy, amber ok, red unhappy"}` : "") : (view ? (view === 1 ? "yellow = powered, dark = no power" : "green happy, amber ok, red unhappy") : "");
  adv.innerHTML = "";
  for (const a of advise(city).slice(0, 5)) {
    const li = document.createElement("li");
    li.style.cursor = a.squares ? "pointer" : "default";
    if (a.squares) { li.title = "hover to highlight on the board"; li.addEventListener("mouseenter", () => { hiAdv = a.squares; }); li.addEventListener("mouseleave", () => { hiAdv = null; }); }
    li.textContent = (a.level === "bad" ? "✖ " : a.level === "warn" ? "▲ " : "✔ ") + a.text;
    li.style.color = a.level === "bad" ? "#e5806f" : a.level === "warn" ? "#e8b04a" : "#8fbf6a";
    adv.append(li);
  }
  if (bd) adv.title = `last month: houses +${bd.homes}, shops +${bd.shops}, factories +${bd.factories}, upkeep -${bd.upkeep}`;
  info.textContent = `${tierName()} · ` + (k ? `contract: ${k.text} by month ${k.due} for +${k.pay}. ` : "") + (city.omen ? `WARNING: ${omenName(city.omen)} next month.` : "");
  const sig = tool + Object.values(BUILD).map((b) => city.money < b.cost).join();
  if (sig === toolSig) return;
  toolSig = sig;
  $("cTools").innerHTML = Object.entries(BUILD).map(([k, b]) =>
    `<button data-k="${k}" class="${tool === k ? "sel" : ""}" ${city.money < b.cost ? "disabled" : ""}>${b.glyph} ${b.label} · ${b.cost}</button>`).join("")
    + `<button data-k="bulldoze" class="${tool === "bulldoze" ? "sel" : ""}">🚜 bulldoze</button>`;
}

$("cTools").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-k]"); if (!b) return;
  tool = b.dataset.k; toolSig = ""; refreshHint(); ui();
});

function refreshHint() {
  pv = hov >= 0 && tool !== "bulldoze" && !city.cells[hov] ? preview(city, tool, hov) : null;
  const idle = idleBuildings(city)[hov];
  if (idle && !pv && tool !== "bulldoze") { hint.textContent = "⚠ " + idle; hint.style.color = "#e8b04a"; return; }
  if (pv) { hint.textContent = pv.text; hint.style.color = pv.ok ? "" : "#e5806f"; }
  else if (hov >= 0 && city.cells[hov]) { hint.textContent = tool === "bulldoze" ? "click to bulldoze this." : describe(hov); hint.style.color = ""; }
  else { hint.textContent = "hover a square to preview what a building would do there."; hint.style.color = ""; }
}
cv.addEventListener("mousemove", (e) => {
  const r = cv.getBoundingClientRect();
  const c = Math.floor((e.clientX - r.left) / r.width * N), row = Math.floor((e.clientY - r.top) / r.height * N);
  const h = c >= 0 && c < N && row >= 0 && row < N ? row * N + c : -1;
  if (h !== hov) { hov = h; refreshHint(); }
});
cv.addEventListener("mouseleave", () => { hov = -1; refreshHint(); });

function totalCapNow() { const inf = analyze(city); return city.cells.reduce((s, b, i) => s + (b && b.type === "pawn" ? houseCap(inf[i], city.tax) : 0), 0); }

function describe(idx) {
  const b = city.cells[idx];
  if (!b) return "";
  const def = BUILD[b.type], i = analyze(city)[idx];
  if (b.type === "king") return "fire station: disasters can't hurt this square or its eight neighbours.";
  if (b.type === "rook" && city.terrain[idx] === 2) return "factory on ore: +40 funds a month, plus its usual output.";
  if (b.type !== "pawn") return `${def.label}: affects ${reach(b.type, Math.floor(idx / N), idx % N).length} squares.`;
  if (!i.power) return "house: no power — nobody moves in. put a ♕ on its rank, file or diagonal.";
  const m = houseMood(city, i, idx);
  return `house ${m.face} ${b.pop}/${houseCap(i, city.tax)} people${i.lake ? " (lakeside +)" : ""}. parks ${i.parks}, shops ${i.shops}, factories ${i.factories} (happiness ×${houseScore(i).toFixed(2)}). ${m.why}`;
}

cv.addEventListener("click", (e) => {
  if (city.status !== "playing") return;
  const r = cv.getBoundingClientRect();
  const c = Math.floor((e.clientX - r.left) / r.width * N), row = Math.floor((e.clientY - r.top) / r.height * N);
  const idx = row * N + c;
  hov = idx;
  if (tool === "bulldoze") { if (city.cells[idx]) sparkle(idx, "#9a8f80", 8); setMsg(bulldoze(city, idx) ? "cleared." : "nothing there."); sel = -1; ui(); return; }
  if (city.cells[idx]) { sel = sel === idx ? -1 : idx; setMsg(describe(idx)); return; }
  const capBefore = totalCapNow();
  if (!place(city, tool, idx)) { setMsg(city.terrain[idx] === 1 ? "that's a lake — you can't build there." : city.money < BUILD[tool].cost ? "not enough funds." : "occupied."); return; }
  sel = idx; setMsg(describe(idx)); sparkle(idx, "#fff8e8", 8);
  floatText(idx, "-" + BUILD[tool].cost, "#e5806f");
  { const d = totalCapNow() - capBefore; if (tool !== "pawn" && d !== 0) floatText(idx, (d > 0 ? "+" : "") + d + " room", d > 0 ? "#8fbf6a" : "#e8b04a"); }
  if (tool === "pawn") { const p = analyze(city)[idx]; floatText(idx, p.power ? "powered ✔" : "no power!", p.power ? "#8fbf6a" : "#e5806f"); }
  else if (tool === "queen") { const n = reach("queen", Math.floor(idx / N), idx % N).filter((j) => city.cells[j[0] * N + j[1]] && city.cells[j[0] * N + j[1]].type === "pawn").length; floatText(idx, n ? `powers ${n}` : "powers 0 homes", n ? "#8fbf6a" : "#e8b04a"); } refreshHint(); ui();
});

$("cView").addEventListener("click", () => { view = (view + 1) % VIEWS.length; ui(); });
$("cPause").addEventListener("click", () => { running = !running; ui(); });
$("cFast").addEventListener("click", () => { fast = !fast; ui(); });
$("cRestart").addEventListener("click", () => reset());
$("cSeedGo").addEventListener("click", () => { const v = parseInt($("cSeed").value, 10); reset(Number.isFinite(v) && v > 0 ? v : undefined); });
$("cSeed").addEventListener("keydown", (e) => { if (e.key === "Enter") $("cSeedGo").click(); });
$("cTax").addEventListener("click", () => { city.tax = (city.tax + 1) % TAX.length; setMsg(`taxes ${TAX[city.tax].label}: ${city.tax === 0 ? "slower income but houses fit more people" : city.tax === 2 ? "more income but houses are crowded out" : "balanced"}.`); ui(); });

function sparkle(idx, color, n) {
  const x = (idx % N) * S + S / 2, y = Math.floor(idx / N) * S + S / 2;
  for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, v = 40 + Math.random() * 90; fx.push({ k: "p", x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, color, ttl: 0.6, max: 0.6 }); }
}
function floatText(idx, text, color) { fx.push({ k: "t", x: (idx % N) * S + S / 2, y: Math.floor(idx / N) * S + S / 2, text, color, ttl: 1.1, max: 1.1 }); }

function finish() {
  running = false;
  const won = city.status === "won";
  const score = cityScore(city), prev = getBest();
  if (score > prev) setBest(score);
  setMsg(won ? `${totalPop(city)} citizens in ${city.month} months. the city is complete. score ${score}${score > prev ? " — new best!" : ""}.` : `bankrupt at month ${city.month}. score ${score}${score > prev ? " — new best!" : ""}.`);
  const txt = won ? `I grew Chess City 2000 (map ${city.seed}) to ${GOAL} people in ${city.month} months. score ${score}.` : `Chess City 2000 (map ${city.seed}) went bankrupt at month ${city.month} with ${totalPop(city)} people. score ${score}.`;
  $("cShareLink").href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(txt + "\nhttps://chessgenres.bisks.net/#city");
  $("cShare").hidden = false;
}

function advance() {
  const before = { pop: totalPop(city), money: city.money };
  const ev = tick(city);
  popHist.push(totalPop(city));
  if (!ev.length && city.month % 6 === 0) note(monthReport(before, city));
  const pn = totalPop(city) - before.pop;
  if (pn !== 0 && city.cells.some((b) => b && b.type === "pawn")) { const hs = city.cells.findIndex((b) => b && b.type === "pawn" && b.pop > 0); if (hs >= 0 && city.month % 2 === 0) floatText(hs, (pn > 0 ? "+" : "") + pn + " pop", pn > 0 ? "#8fbf6a" : "#e5806f"); }
  if (ev.length) { setMsg(ev.join(" ")); for (const e of ev) note(e); }
  if (city.tierUp) { fx.push({ k: "b", text: "🏙 " + city.tierUp + "!", ttl: 2.2, max: 2.2 }); for (let i = 0; i < 30; i++) sparkle(Math.floor(Math.random() * N * N), "#e8d36a", 4); }
  if (ev.some((e) => e.startsWith("contract done"))) fx.push({ k: "b", text: "contract complete 💰", ttl: 1.6, max: 1.6 });
  refreshHint();
  if (city.lastLost.length) { flash = 1; for (const i of city.lastLost) sparkle(i, "#d8584a", 14); }
  city.cells.forEach((b, i) => { if (b && b.type === "pawn" && b.pop > 0 && city.month % 3 === 0) floatText(i, "+" + Math.round(0.12 * b.pop * TAX[city.tax].income), "#e8d36a"); });
  if (city.status !== "playing") finish();
  ui();
}

function draw() {
  const inf = analyze(city);
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const tr = city.terrain[r * N + c];
    ctx.fillStyle = tr === 1 ? ((r + c) % 2 ? "#2f6f9a" : "#3b82b0") : (r + c) % 2 ? "#9b6b43" : "#e9d8b4";
    ctx.fillRect(c * S, r * S, S, S);
    if (tr === 2) { ctx.fillStyle = "#3a2a20"; ctx.font = `${S * 0.3}px system-ui`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("◆", c * S + S * 0.8, r * S + S * 0.2); }
  }
  if (view) { const ov = overlayFor(city, VIEWS[view], inf); for (const k in ov) { ctx.fillStyle = ov[k]; ctx.fillRect((k % N) * S, Math.floor(k / N) * S, S, S); } }
  if (hiAdv) { const t = performance.now() / 200; ctx.strokeStyle = "#fff8e8"; ctx.lineWidth = 3 + Math.sin(t); for (const i of hiAdv) ctx.strokeRect((i % N) * S + 2, Math.floor(i / N) * S + 2, S - 4, S - 4); }
  if (city.omen) {
    const pulse = 0.25 + 0.2 * Math.sin(performance.now() / 150);
    ctx.fillStyle = `rgba(216,88,74,${pulse})`;
    for (const i of omenSquares(city.omen)) ctx.fillRect((i % N) * S, Math.floor(i / N) * S, S, S);
  }
  if (pv) {
    for (const [r, c] of pv.reach) { ctx.fillStyle = "rgba(232,176,74,.22)"; ctx.fillRect(c * S, r * S, S, S); }
    for (const i of pv.good) { ctx.strokeStyle = "#8fbf6a"; ctx.lineWidth = 4; ctx.strokeRect((i % N) * S + 3, Math.floor(i / N) * S + 3, S - 6, S - 6); }
    for (const i of pv.bad) { ctx.strokeStyle = "#d8584a"; ctx.lineWidth = 4; ctx.strokeRect((i % N) * S + 3, Math.floor(i / N) * S + 3, S - 6, S - 6); }
    ctx.globalAlpha = 0.5; ctx.font = `${S * 0.72}px serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "#fff8e8";
    ctx.fillText(BUILD[tool].glyph, (hov % N) * S + S / 2, Math.floor(hov / N) * S + S / 2 + 2); ctx.globalAlpha = 1;
  }
  const selB = sel >= 0 && city.cells[sel] ? city.cells[sel] : null;
  if (selB && selB.type !== "pawn") {
    ctx.fillStyle = "rgba(232,176,74,.4)";
    for (const [r, c] of reach(selB.type, Math.floor(sel / N), sel % N)) ctx.fillRect(c * S, r * S, S, S);
  }
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  city.cells.forEach((b, i) => {
    if (!b) return;
    const x = (i % N) * S + S / 2, y = Math.floor(i / N) * S + S / 2;
    ctx.font = `${S * 0.72}px serif`;
    ctx.fillStyle = "#fff8e8"; ctx.strokeStyle = "#1a1209"; ctx.lineWidth = 3;
    ctx.strokeText(BUILD[b.type].glyph, x, y + 2); ctx.fillText(BUILD[b.type].glyph, x, y + 2);
    if (b.type === "pawn") {
      ctx.font = `${S * 0.2}px system-ui`; ctx.fillStyle = inf[i].power ? "#1a1209" : "#d8584a";
      ctx.fillText(inf[i].power ? b.pop : "no power", x, y + S * 0.38);
      if (inf[i].power) {
        const cap = houseCap(inf[i], city.tax), w = S - 10, fill = Math.min(1, b.pop / Math.max(1, cap));
        ctx.fillStyle = "rgba(26,18,9,.45)"; ctx.fillRect((i % N) * S + 5, (Math.floor(i / N) + 1) * S - 5, w, 3);
        ctx.fillStyle = fill >= 1 ? "#e8b04a" : "#8fbf6a"; ctx.fillRect((i % N) * S + 5, (Math.floor(i / N) + 1) * S - 5, w * fill, 3);
        ctx.font = `${S * 0.24}px system-ui`; ctx.fillText(houseMood(city, inf[i], i).face, (i % N) * S + S * 0.2, Math.floor(i / N) * S + S * 0.2);
      }
    }
  });
  const idleB = idleBuildings(city);
  for (const k in idleB) { ctx.font = `${S * 0.28}px system-ui`; ctx.fillStyle = "#e8b04a"; ctx.strokeStyle = "#1a1209"; ctx.lineWidth = 3; const x = (k % N) * S + S * 0.8, y = Math.floor(k / N) * S + S * 0.2; ctx.strokeText("⚠", x, y); ctx.fillText("⚠", x, y); }
  if (sel >= 0) { ctx.strokeStyle = "#e8b04a"; ctx.lineWidth = 3; ctx.strokeRect((sel % N) * S + 2, Math.floor(sel / N) * S + 2, S - 4, S - 4); }
  for (const f of fx) {
    ctx.globalAlpha = Math.max(0, Math.min(1, f.ttl / f.max * 2));
    if (f.k === "b") { ctx.font = `bold ${S * 0.8}px system-ui`; ctx.textAlign = "center"; ctx.fillStyle = "#fff8e8"; ctx.strokeStyle = "#1a1209"; ctx.lineWidth = 6; const y = cv.height * 0.45 - (1 - f.ttl / f.max) * 20; ctx.strokeText(f.text, cv.width / 2, y); ctx.fillText(f.text, cv.width / 2, y); }
    else if (f.k === "p") { ctx.fillStyle = f.color; ctx.fillRect(f.x - 2, f.y - 2, 4, 4); }
    else { ctx.fillStyle = f.color; ctx.strokeStyle = "#000"; ctx.lineWidth = 3; ctx.font = `bold ${S * 0.25}px system-ui`; ctx.strokeText(f.text, f.x, f.y); ctx.fillText(f.text, f.x, f.y); }
  }
  ctx.globalAlpha = 1;
  if (flash > 0) { ctx.fillStyle = `rgba(216,88,74,${flash * 0.35})`; ctx.fillRect(0, 0, cv.width, cv.height); }
}

function frame(ts) {
  const dt = Math.min(250, ts - last || 0); last = ts;
  if (flash > 0) flash = Math.max(0, flash - dt / 600);
  for (const f of fx) { f.ttl -= dt / 1000; if (f.k === "p") { f.x += f.vx * dt / 1000; f.y += f.vy * dt / 1000; } else if (f.k === "t") f.y -= 24 * dt / 1000; }
  fx = fx.filter((f) => f.ttl > 0);
  // Only simulate while the city genre is on screen.
  if (running && !$("city").hidden && city.status === "playing") {
    acc += dt * (fast ? 3 : 1);
    while (acc >= MONTH_MS && city.status === "playing") { acc -= MONTH_MS; advance(); }
  }
  draw();
  requestAnimationFrame(frame);
}

reset();
requestAnimationFrame(frame);
