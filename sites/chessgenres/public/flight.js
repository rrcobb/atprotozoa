import { SIZE, CRAFT, CARGO, WEATHER, UPGRADES, GOAL, REROLL_COST, ABORT_FEE, newFlight, legalMoves, fly, stormSet, nextStormSet, visible, score,
  newCareer, makeOffers, reroll, whyNot, startContract, planState, finishFlight, abortFlight, buyUpgrade, buyCraft, maxFuelFor, maxHullFor, deadlineFor, contractPay } from "./flight-logic.js";

const $ = (id) => document.getElementById(id);
const cv = $("fc"), ctx = cv.getContext("2d"), CELL = cv.width / SIZE;
const SAVE = "chessgenres.flight.career";
let mode = "career", phase = "board", c, s = null, sel = { offer: 0, type: "p" }, quickType = "n", trail = [], banked = false, lastFinish = null;

// extra UI is built here so index.html only keeps the shared section
const board = document.createElement("div");
board.id = "fBoard"; board.style.margin = "10px 0";
$("fPick").after(board);
const status = document.createElement("p");
status.id = "fStatus"; status.style.cssText = "margin:0 0 8px;white-space:pre-line";
$("fc").before(status);

function load() {
  try {
    const j = JSON.parse(localStorage.getItem(SAVE));
    if (j && j.fleet && j.upgrades) return Object.assign(newCareer(j.seed), j, { offers: null });
  } catch {}
  return newCareer((Date.now() & 0x7fffffff) || 1);
}
function save() {
  try { const { offers, ...rest } = c; localStorage.setItem(SAVE, JSON.stringify(rest)); } catch {}
}

const route = (plan) => [plan.airports[0].name, ...plan.stops.map((i) => plan.airports[i].name)].join(" → ");
function offers() { return c.offers || makeOffers(c); }

function previewState() {
  const o = offers()[sel.offer] || offers()[0];
  const type = whyNot(c, o, sel.type) ? "p" : sel.type;
  return planState(c, o.plan, type);
}

function draw() {
  const st = s || (mode === "career" ? previewState() : null);
  if (!st) { ctx.clearRect(0, 0, cv.width, cv.height); return; }
  ctx.clearRect(0, 0, cv.width, cv.height);
  const storms = stormSet(st), warn = nextStormSet(st), warn2 = st.forecast > 1 ? nextStormSet(st, 2) : new Set();
  const flying = s && s.status === "playing", moves = flying ? legalMoves(st) : [];
  const fog = (x, y) => !visible(st, x, y);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    ctx.fillStyle = (x + y) % 2 ? "#27506b" : "#2f6283";
    ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
    const k = x + "," + y;
    if (!fog(x, y)) {
      if (warn2.has(k)) { ctx.strokeStyle = "rgba(200,210,230,.35)"; ctx.setLineDash([5, 5]); ctx.lineWidth = 2; ctx.strokeRect(x * CELL + 6, y * CELL + 6, CELL - 12, CELL - 12); ctx.setLineDash([]); }
      if (warn.has(k)) { ctx.fillStyle = "rgba(200,210,230,.22)"; ctx.fillRect(x * CELL, y * CELL, CELL, CELL); }
    }
    if (st.mountains.has(k)) { ctx.fillStyle = "#6a6f66"; ctx.beginPath(); ctx.moveTo(x * CELL + 8, (y + 1) * CELL - 8); ctx.lineTo((x + 0.5) * CELL, y * CELL + 10); ctx.lineTo((x + 1) * CELL - 8, (y + 1) * CELL - 8); ctx.fill(); ctx.fillStyle = "#f1f3f0"; ctx.beginPath(); ctx.moveTo((x + 0.5) * CELL, y * CELL + 10); ctx.lineTo((x + 0.36) * CELL, y * CELL + 32); ctx.lineTo((x + 0.64) * CELL, y * CELL + 32); ctx.fill(); }
  }
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  const label = (x, y, txt, col) => { ctx.fillStyle = col; ctx.font = `bold ${CELL * 0.17}px system-ui`; ctx.fillText(txt, (x + 0.5) * CELL, (y + 0.88) * CELL); };
  st.airports.forEach((a, i) => {
    const isDest = a.x === st.dest.x && a.y === st.dest.y && (!s || s.status === "playing");
    const later = st.stops.slice(st.leg + 1).some((si) => st.airports[si] === a);
    ctx.fillStyle = isDest ? "#6fd48a" : later ? "#4f8f66" : "#8aa7b8";
    ctx.fillRect(a.x * CELL + 8, a.y * CELL + 8, CELL - 16, CELL - 16);
    if (isDest) { ctx.strokeStyle = "#ffe08a"; ctx.lineWidth = 3; ctx.strokeRect(a.x * CELL + 4, a.y * CELL + 4, CELL - 8, CELL - 8); }
    label(a.x, a.y, a.name, "#0e1f13");
    if (isDest || later) { ctx.fillStyle = "#0e1f13"; ctx.font = `bold ${CELL * 0.3}px system-ui`; ctx.fillText(st.stops.indexOf(st.airports.indexOf(a)) + 1 || "", (a.x + 0.5) * CELL, (a.y + 0.4) * CELL); }
  });
  for (const p of st.pads) { ctx.fillStyle = "#e8b04a"; ctx.font = `${CELL * 0.5}px serif`; ctx.fillText("⛽", (p.x + 0.5) * CELL, (p.y + 0.5) * CELL); }
  if (flying) for (const m of moves) {
    ctx.fillStyle = "rgba(255,255,255,.18)"; ctx.fillRect(m.x * CELL + 3, m.y * CELL + 3, CELL - 6, CELL - 6);
    ctx.fillStyle = "#fff"; ctx.font = `bold ${CELL * 0.18}px system-ui`; ctx.fillText(m.cost, m.x * CELL + CELL * 0.82, m.y * CELL + CELL * 0.2);
  }
  if (trail.length > 1) { ctx.strokeStyle = "rgba(255,255,255,.35)"; ctx.lineWidth = 3; ctx.setLineDash([4, 6]); ctx.beginPath(); trail.forEach((p, i) => { const px = (p.x + 0.5) * CELL, py = (p.y + 0.5) * CELL; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }); ctx.stroke(); ctx.setLineDash([]); }
  for (const k of storms) {
    const [x, y] = k.split(",").map(Number);
    if (fog(x, y)) continue;
    ctx.fillStyle = "rgba(60,50,80,.85)"; ctx.beginPath(); ctx.arc((x + 0.5) * CELL, (y + 0.5) * CELL, CELL * 0.4, 0, 7); ctx.fill();
    ctx.font = `${CELL * 0.5}px serif`; ctx.fillStyle = "#fff"; ctx.fillText("⛈", (x + 0.5) * CELL, (y + 0.5) * CELL);
  }
  if (st.fogRadius !== Infinity) {
    ctx.fillStyle = "rgba(190,200,215,.55)";
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) if (fog(x, y)) ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
  }
  if (st.emergency) { ctx.strokeStyle = "#ff3b30"; ctx.lineWidth = 6; ctx.strokeRect(3, 3, cv.width - 6, cv.height - 6); }
  ctx.font = `${CELL * 0.75}px serif`; ctx.lineWidth = 4; ctx.strokeStyle = "#102030"; ctx.fillStyle = st.status === "lost" ? "#d8584a" : st.emergency ? "#ffb4a8" : "#fff";
  ctx.strokeText(CRAFT[st.type].glyph, (st.pos.x + 0.5) * CELL, (st.pos.y + 0.5) * CELL - 3);
  ctx.fillText(CRAFT[st.type].glyph, (st.pos.x + 0.5) * CELL, (st.pos.y + 0.5) * CELL - 3);
}

function renderBoard() {
  const inFlight = s && s.status === "playing";
  board.hidden = mode === "career" && inFlight;
  if (board.hidden) return;
  if (mode === "quick") {
    board.innerHTML = `<p class="dim">quick hop: one flight from HOME to the AIRPORT, free fuel, no contracts. pick any aircraft.</p><div class="shop"><button data-act="career" class="go">back to career</button></div>`;
    return;
  }
  const os = offers();
  const hist = c.history.slice(-10).join(" ") || "none yet";
  const type = sel.type;
  board.innerHTML =
    `<p style="margin:0 0 6px">cash <b style="color:var(--accent)">$${c.cash}</b> / $${GOAL} to retire · flights ${c.flights} · record ${hist}${c.won ? " · RETIRED" : ""}</p>` +
    `<div class="shop">` + os.map((o, i) => {
      const cg = CARGO[o.plan.cargo], dl = deadlineFor(o.plan, whyNot(c, o, type) ? "p" : type);
      const why = whyNot(c, o, type);
      return `<button class="fcard ${i === sel.offer ? "sel" : ""}" data-offer="${i}">${cg.glyph} <b>${cg.name}</b> · $${o.pay}<br><small>${route(o.plan)}<br>${WEATHER[o.plan.weather].label} (${WEATHER[o.plan.weather].blurb})${dl ? `<br>deadline ${dl} turns` : ""}<br>${cg.blurb}${why ? `<br><span style="color:var(--bad)">${type}: ${why}</span>` : ""}</small></button>`;
    }).join("") + `</div>` +
    `<div class="shop">` + Object.entries(UPGRADES).map(([id, u]) => {
      const lvl = c.upgrades[id], maxed = lvl >= u.max, price = u.price[lvl];
      return `<button data-up="${id}" ${maxed || c.cash < price ? "disabled" : ""} title="${u.blurb}">${u.name} ${lvl}/${u.max}${maxed ? "" : ` · $${price}`}</button>`;
    }).join("") + `</div>` +
    `<div class="shop"><button class="go" data-act="takeoff" ${whyNot(c, os[sel.offer], type) ? "disabled" : ""} style="background:var(--accent);color:#1a1209;font-weight:600">take off</button>` +
    `<button data-act="quick">quick hop</button><button data-act="newcareer">new career</button></div>`;
}

function renderPick() {
  const inFlight = s && s.status === "playing";
  $("fPick").hidden = mode === "career" && inFlight;
  if (mode === "quick") {
    $("fPick").innerHTML = Object.entries(CRAFT).map(([t, cr]) => `<button data-t="${t}" class="${t === quickType ? "sel" : ""}" title="${cr.blurb}">${cr.glyph} ${cr.name}</button>`).join("");
    return;
  }
  const o = offers()[sel.offer];
  $("fPick").innerHTML = Object.entries(CRAFT).map(([t, cr]) => {
    if (!c.fleet[t]) return `<button data-buy="${t}" ${c.cash < cr.price ? "disabled" : ""} title="${cr.blurb}">buy ${cr.glyph} ${cr.name} · $${cr.price}</button>`;
    const why = whyNot(c, o, t);
    return `<button data-t="${t}" class="${t === sel.type ? "sel" : ""}" title="${why || cr.blurb}">${cr.glyph} ${cr.name} <small>${maxFuelFor(c, t)}⛽ ${maxHullFor(c, t)}♥</small>${why ? " ✖" : ""}</button>`;
  }).join("");
}

function bank() {
  if (!s || mode !== "career" || banked || s.status === "playing") return;
  banked = true;
  const before = c.cash;
  finishFlight(c, s);
  save();
  lastFinish = { delta: c.cash - before };
  if (s.status === "won") s.log.push(`bank: ${c.cash >= before ? "+" : "-"}$${Math.abs(c.cash - before)} → $${c.cash}.${c.won ? " you can afford to retire. the airline is yours." : ""}`);
  else s.log.push(`the aircraft is gone${s.type === "p" ? " (the loaner will do)" : " (insurance paid 40%)"}. cash $${c.cash}.`);
}

function ui() {
  bank();
  const flashHit = s && s.prevHull !== undefined && s.hull < s.prevHull;
  if (s) s.prevHull = s.hull;
  if (flashHit) { cv.classList.remove("flash"); void cv.offsetWidth; cv.classList.add("flash"); }
  draw();
  const st = s || (mode === "career" ? previewState() : null);
  if (st) {
    $("fFuel").textContent = `${st.fuel}/${st.maxFuel}`;
    $("fHull").textContent = `${st.hull}/${st.maxHull}`;
    $("fTurn").textContent = st.deadline ? `${st.turn}/${st.deadline}` : st.turn;
    $("fCraft").textContent = CRAFT[st.type].name;
  }
  const playing = s && s.status === "playing";
  if (mode === "career" && st) {
    const cg = CARGO[st.cargo], next = st.airports[st.stops[Math.min(st.leg, st.stops.length - 1)]];
    status.textContent = `${cg.glyph} ${cg.name} · ${WEATHER[st.weather].label} · cash $${c.cash}` + (playing ? ` · next stop ${next.name} (leg ${st.leg + 1}/${st.stops.length})` : "") + (playing && st.bill ? ` · fuel bill $${st.bill}` : "") +
      (st.emergency ? `\n🚨 ${st.emergency.kind === "fire" ? `ENGINE FIRE: land at an airport in ${st.emergency.timer} turns` : "FUEL LEAK: land at an airport"}` : "");
    status.style.color = st.emergency ? "var(--bad)" : "";
  } else status.textContent = "";
  $("fRestart").textContent = mode === "quick" ? "new flight" : playing ? `abort flight (-$${ABORT_FEE})` : `reroll contracts ($${REROLL_COST})`;
  $("fRestart").disabled = mode === "career" && !playing && c.cash < REROLL_COST;
  if (s) $("fLog").textContent = s.log.slice(-3).join("\n");
  else $("fLog").textContent = mode === "career" ? "pick a contract and an aircraft, then take off. airports refuel you for $3 a unit and shelter you from storms." : "";
  $("fLog").className = s && s.status !== "playing" ? "end" : "";
  renderBoard(); renderPick();
  const over = s && s.status !== "playing";
  if (over) {
    const cr = CRAFT[s.type].name;
    const txt = mode === "quick"
      ? (s.status === "won" ? `I landed a ${cr} in Microsoft Chess Flight Simulator with ${s.fuel} fuel to spare (score ${score(s)}).` : `I crashed a ${cr} in Microsoft Chess Flight Simulator.`)
      : (s.status === "won" ? `I delivered ${CARGO[s.cargo].name} in a ${cr} for $${s.result.pay} (rating ${s.result.rating}) in Microsoft Chess Flight Simulator. career: $${c.cash}, ${c.flights} flights.` : `I crashed a ${cr} in Microsoft Chess Flight Simulator. career: $${c.cash}, ${c.flights} flights.`);
    $("fShareLink").href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(txt + "\nhttps://chessgenres.bisks.net/#flight");
    $("fShare").hidden = false;
  } else $("fShare").hidden = true;
}

function takeoff() {
  const o = offers()[sel.offer];
  const st = startContract(c, o, sel.type);
  if (!st) return;
  s = st; banked = false; trail = [{ ...s.pos }]; phase = "flying"; ui();
}
function newQuick() { s = newFlight(quickType); trail = [{ ...s.pos }]; banked = false; ui(); }

cv.addEventListener("click", (e) => {
  if (!s || s.status !== "playing") return;
  const r = cv.getBoundingClientRect();
  const x = Math.floor(((e.clientX - r.left) / r.width) * SIZE), y = Math.floor(((e.clientY - r.top) / r.height) * SIZE);
  if (fly(s, x, y)) { trail.push({ ...s.pos }); ui(); }
});
$("fPick").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-t],button[data-buy]");
  if (!b || b.disabled) return;
  if (mode === "quick") { quickType = b.dataset.t; return newQuick(); }
  if (b.dataset.buy) { if (buyCraft(c, b.dataset.buy)) { save(); sel.type = b.dataset.buy; } }
  else sel.type = b.dataset.t;
  s = null; trail = []; ui();
});
board.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b || b.disabled) return;
  if (b.dataset.offer !== undefined) { sel.offer = +b.dataset.offer; s = null; trail = []; }
  else if (b.dataset.up) { if (buyUpgrade(c, b.dataset.up)) save(); }
  else if (b.dataset.act === "takeoff") return takeoff();
  else if (b.dataset.act === "quick") { mode = "quick"; newQuick(); return; }
  else if (b.dataset.act === "career") { mode = "career"; s = null; trail = []; }
  else if (b.dataset.act === "newcareer") { if (confirm("start a new career? your cash, fleet and upgrades are wiped.")) { c = newCareer((Date.now() & 0x7fffffff) || 1); sel = { offer: 0, type: "p" }; s = null; trail = []; save(); } }
  ui();
});
$("fRestart").addEventListener("click", () => {
  if (mode === "quick") return newQuick();
  if (s && s.status === "playing") { abortFlight(c, s); save(); s.status = "lost"; banked = true; s.log.push(`flight aborted. -$${ABORT_FEE}. cash $${c.cash}.`); s = null; trail = []; }
  else { reroll(c); s = null; trail = []; }
  ui();
});
c = load();
ui();
