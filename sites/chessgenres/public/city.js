import { N, GOAL, RAMPAGE_EVERY, BUILD, TAX, reach, newCity, place, bulldoze, tick, totalPop, analyze, houseCap, houseScore, omenSquares, omenName, cityScore } from "./city-logic.js";

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
  <button id="cSeedGo">load</button><button id="cTax">tax: normal</button><span class="dim" id="cBest"></span>`;
cv.before(bar);
const info = document.createElement("p");
info.id = "cInfo"; info.className = "dim";
cv.after(info);

function reset(seed) {
  city = newCity(seed || randSeed()); running = false; acc = 0; sel = -1; flash = null; fx = [];
  $("cSeed").value = city.seed;
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
  info.textContent = (k ? `contract: ${k.text} by month ${k.due} for +${k.pay}. ` : "") + (city.omen ? `WARNING: ${omenName(city.omen)} next month.` : "");
  const sig = tool + Object.values(BUILD).map((b) => city.money < b.cost).join();
  if (sig === toolSig) return;
  toolSig = sig;
  $("cTools").innerHTML = Object.entries(BUILD).map(([k, b]) =>
    `<button data-k="${k}" class="${tool === k ? "sel" : ""}" ${city.money < b.cost ? "disabled" : ""}>${b.glyph} ${b.label} · ${b.cost}</button>`).join("")
    + `<button data-k="bulldoze" class="${tool === "bulldoze" ? "sel" : ""}">🚜 bulldoze</button>`;
}

$("cTools").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-k]"); if (!b) return;
  tool = b.dataset.k; toolSig = ""; ui();
});

function describe(idx) {
  const b = city.cells[idx];
  if (!b) return "";
  const def = BUILD[b.type], i = analyze(city)[idx];
  if (b.type === "king") return "fire station: disasters can't hurt this square or its eight neighbours.";
  if (b.type === "rook" && city.terrain[idx] === 2) return "factory on ore: +40 funds a month, plus its usual output.";
  if (b.type !== "pawn") return `${def.label}: affects ${reach(b.type, Math.floor(idx / N), idx % N).length} squares.`;
  if (!i.power) return "house: no power — nobody moves in. put a ♕ on its rank, file or diagonal.";
  return `house: ${b.pop}/${houseCap(i, city.tax)} people${i.lake ? " (lakeside +)" : ""}. parks ${i.parks}, shops ${i.shops}, factories ${i.factories} (happiness ×${houseScore(i).toFixed(2)}).`;
}

cv.addEventListener("click", (e) => {
  if (city.status !== "playing") return;
  const r = cv.getBoundingClientRect();
  const c = Math.floor((e.clientX - r.left) / r.width * N), row = Math.floor((e.clientY - r.top) / r.height * N);
  const idx = row * N + c;
  if (tool === "bulldoze") { if (city.cells[idx]) sparkle(idx, "#9a8f80", 8); setMsg(bulldoze(city, idx) ? "cleared." : "nothing there."); sel = -1; ui(); return; }
  if (city.cells[idx]) { sel = sel === idx ? -1 : idx; setMsg(describe(idx)); return; }
  if (!place(city, tool, idx)) { setMsg(city.terrain[idx] === 1 ? "that's a lake — you can't build there." : city.money < BUILD[tool].cost ? "not enough funds." : "occupied."); return; }
  sel = idx; setMsg(describe(idx)); sparkle(idx, "#fff8e8", 8); ui();
});

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
  const ev = tick(city);
  if (ev.length) setMsg(ev.join(" "));
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
  if (city.omen) {
    const pulse = 0.25 + 0.2 * Math.sin(performance.now() / 150);
    ctx.fillStyle = `rgba(216,88,74,${pulse})`;
    for (const i of omenSquares(city.omen)) ctx.fillRect((i % N) * S, Math.floor(i / N) * S, S, S);
  }
  const hov = sel >= 0 && city.cells[sel] ? city.cells[sel] : null;
  if (hov && hov.type !== "pawn") {
    ctx.fillStyle = "rgba(232,176,74,.4)";
    for (const [r, c] of reach(hov.type, Math.floor(sel / N), sel % N)) ctx.fillRect(c * S, r * S, S, S);
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
    }
  });
  if (sel >= 0) { ctx.strokeStyle = "#e8b04a"; ctx.lineWidth = 3; ctx.strokeRect((sel % N) * S + 2, Math.floor(sel / N) * S + 2, S - 4, S - 4); }
  for (const f of fx) {
    ctx.globalAlpha = Math.max(0, f.ttl / f.max);
    if (f.k === "p") { ctx.fillStyle = f.color; ctx.fillRect(f.x - 2, f.y - 2, 4, 4); }
    else { ctx.fillStyle = f.color; ctx.strokeStyle = "#000"; ctx.lineWidth = 3; ctx.font = `bold ${S * 0.25}px system-ui`; ctx.strokeText(f.text, f.x, f.y); ctx.fillText(f.text, f.x, f.y); }
  }
  ctx.globalAlpha = 1;
  if (flash > 0) { ctx.fillStyle = `rgba(216,88,74,${flash * 0.35})`; ctx.fillRect(0, 0, cv.width, cv.height); }
}

function frame(ts) {
  const dt = Math.min(250, ts - last || 0); last = ts;
  if (flash > 0) flash = Math.max(0, flash - dt / 600);
  for (const f of fx) { f.ttl -= dt / 1000; if (f.k === "p") { f.x += f.vx * dt / 1000; f.y += f.vy * dt / 1000; } else f.y -= 24 * dt / 1000; }
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
