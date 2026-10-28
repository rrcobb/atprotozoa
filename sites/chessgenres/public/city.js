import { N, GOAL, RAMPAGE_EVERY, BUILD, reach, newCity, place, bulldoze, tick, totalPop, analyze, houseCap, houseScore } from "./city-logic.js";

const $ = (id) => document.getElementById(id);
const cv = $("cc"), ctx = cv.getContext("2d");
const S = cv.width / N;
const MONTH_MS = 450;

let city, tool = "pawn", running = false, fast = false, acc = 0, last = 0, sel = -1, flash = null, toolSig = "";

function reset() {
  city = newCity(); running = false; acc = 0; sel = -1; flash = null;
  $("cShare").hidden = true;
  setMsg("pick a piece, tap a square. houses need a ♕ power plant on their rank, file or diagonal.");
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
  if (b.type !== "pawn") return `${def.label}: affects ${reach(b.type, Math.floor(idx / N), idx % N).length} squares.`;
  if (!i.power) return "house: no power — nobody moves in. put a ♕ on its rank, file or diagonal.";
  return `house: ${b.pop}/${houseCap(i)} people. parks ${i.parks}, shops ${i.shops}, factories ${i.factories} (happiness ×${houseScore(i).toFixed(2)}).`;
}

cv.addEventListener("click", (e) => {
  if (city.status !== "playing") return;
  const r = cv.getBoundingClientRect();
  const c = Math.floor((e.clientX - r.left) / r.width * N), row = Math.floor((e.clientY - r.top) / r.height * N);
  const idx = row * N + c;
  if (tool === "bulldoze") { setMsg(bulldoze(city, idx) ? "cleared." : "nothing there."); sel = -1; ui(); return; }
  if (city.cells[idx]) { sel = sel === idx ? -1 : idx; setMsg(describe(idx)); return; }
  if (!place(city, tool, idx)) { setMsg(city.money < BUILD[tool].cost ? "not enough funds." : "occupied."); return; }
  sel = idx; setMsg(describe(idx)); ui();
});

$("cPause").addEventListener("click", () => { running = !running; ui(); });
$("cFast").addEventListener("click", () => { fast = !fast; ui(); });
$("cRestart").addEventListener("click", reset);

function finish() {
  running = false;
  const won = city.status === "won";
  setMsg(won ? `${totalPop(city)} citizens in ${city.month} months. the city is complete.` : "bankrupt. the giant queen takes what's left.");
  const txt = won ? `I grew Chess City 2000 to ${GOAL} people in ${city.month} months.` : `Chess City 2000 went bankrupt at month ${city.month} with ${totalPop(city)} people.`;
  $("cShareLink").href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(txt + "\nhttps://chessgenres.bisks.net/#city");
  $("cShare").hidden = false;
}

function advance() {
  const ev = tick(city);
  if (ev.length) { setMsg(ev.join(" ")); flash = 1; }
  if (city.status !== "playing") finish();
  ui();
}

function draw() {
  const inf = analyze(city);
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    ctx.fillStyle = (r + c) % 2 ? "#9b6b43" : "#e9d8b4";
    ctx.fillRect(c * S, r * S, S, S);
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
  if (flash > 0) { ctx.fillStyle = `rgba(216,88,74,${flash * 0.35})`; ctx.fillRect(0, 0, cv.width, cv.height); }
}

function frame(ts) {
  const dt = Math.min(250, ts - last || 0); last = ts;
  if (flash > 0) flash = Math.max(0, flash - dt / 600);
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
