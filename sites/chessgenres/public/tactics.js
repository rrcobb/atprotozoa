import { SIZE, BATTLES, MAX_ROSTER, MAX_LEVEL, GLYPH, ABILITIES, GEAR, gearById, xpNeeded, reviveCost, newCampaign, startBattle, retryBattle, endBattle, buildBattle, recruit, buyGear, equip, revive, release, living, unitAt, tileAt, legalMoves, attackTargets, abilityTargets, doAbility, doMove, doAttack, wait, beginEnemyPhase, enemyStep, finishEnemyPhase, dangerSquares } from "./tactics-logic.js";

const $ = (id) => document.getElementById(id);
const cv = $("tc"), ctx = cv.getContext("2d"), CELL = cv.width / SIZE;
const KEY = "chessgenres-tactics-v2";
const AI_MARK = { guard: "⛨", sniper: "◎", assassin: "☠" };
const AI_TEXT = { aggro: "charges the weakest target", guard: "holds its ground until you come close", sniper: "shoots from where it can't be hit back", assassin: "hunts your king" };
let camp, s, sel = null, abilityMode = false, danger = false, busy = false, floaters = [], actor = null, summary = null, raf = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : ms));
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function save() { try { localStorage.setItem(KEY, JSON.stringify(camp)); } catch { /* storage full or blocked: play on without saving */ } }
function load() {
  try {
    const c = JSON.parse(localStorage.getItem(KEY) || "null");
    // A reload mid-battle goes back to the camp as it was when you marched out.
    if (c && c.roster && c.state === "battle" && c.snap) { Object.assign(c, JSON.parse(c.snap), { state: "camp" }); }
    if (c && c.roster && c.state === "camp" && c.n < BATTLES) return c;
  } catch { /* corrupt save: start fresh */ }
  return null;
}

function newGame(seed) { camp = newCampaign(seed); summary = null; save(); toCamp(); }
function toCamp() { s = null; sel = null; abilityMode = false; floaters = []; ui(); }
function march() { s = startBattle(camp); save(); sel = null; abilityMode = false; floaters = []; busy = false; ui(); }

const moves = () => (sel && !busy ? legalMoves(s, sel) : []);
const targets = () => (sel && !sel.acted && !abilityMode ? attackTargets(s, sel) : []);
const abTargets = () => (sel && abilityMode ? abilityTargets(s, sel) : []);

function drain() { const t = performance.now(); for (const f of s.fx.splice(0)) floaters.push({ ...f, t }); kick(); }
function kick() { if (!raf) raf = requestAnimationFrame(loop); }
function loop() {
  raf = 0;
  if (!s) return;
  draw();
  if (floaters.length || actor) raf = requestAnimationFrame(loop);
}

function draw() {
  const now = performance.now();
  ctx.clearRect(0, 0, cv.width, cv.height);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    ctx.fillStyle = (x + y) % 2 ? "#9b6b43" : "#e9d8b4";
    ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
    const t = tileAt(s, x, y), px = x * CELL, py = y * CELL;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    if (t === "#") {
      ctx.fillStyle = "#3d3a45"; ctx.fillRect(px, py, CELL, CELL);
      ctx.strokeStyle = "#2a2830"; ctx.lineWidth = 2;
      for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(px, py + (i * CELL) / 4); ctx.lineTo(px + CELL, py + (i * CELL) / 4); ctx.stroke(); }
    } else if (t === "c") { ctx.fillStyle = "rgba(50,140,60,.38)"; ctx.fillRect(px, py, CELL, CELL); ctx.fillStyle = "rgba(20,80,30,.8)"; ctx.font = `${CELL * 0.3}px serif`; ctx.fillText("♣", px + CELL * 0.84, py + CELL * 0.16); }
    else if (t === "l") { const p = 0.55 + 0.2 * Math.sin(now / 300 + x + y); ctx.fillStyle = `rgba(230,80,20,${p})`; ctx.fillRect(px, py, CELL, CELL); }
    else if (t === "h") { ctx.fillStyle = "rgba(120,200,255,.4)"; ctx.fillRect(px, py, CELL, CELL); ctx.fillStyle = "#1a5a8a"; ctx.font = `${CELL * 0.34}px serif`; ctx.fillText("✚", px + CELL * 0.84, py + CELL * 0.16); }
    else if (t === "x") { ctx.fillStyle = "rgba(240,200,60,.5)"; ctx.fillRect(px, py, CELL, CELL); ctx.fillStyle = "#6a4a00"; ctx.font = `${CELL * 0.5}px serif`; ctx.fillText("⚑", px + CELL / 2, py + CELL / 2); }
  }
  if (danger) {
    ctx.fillStyle = "rgba(150,40,170,.28)";
    for (const key of dangerSquares(s)) { const [x, y] = key.split(",").map(Number); ctx.fillRect(x * CELL, y * CELL, CELL, CELL); }
  }
  ctx.fillStyle = "rgba(60,120,230,.45)";
  for (const m of moves()) ctx.fillRect(m.x * CELL, m.y * CELL, CELL, CELL);
  ctx.fillStyle = "rgba(60,200,100,.5)";
  for (const t of abTargets()) ctx.fillRect(t.x * CELL, t.y * CELL, CELL, CELL);
  for (const u of living(s, "p").concat(living(s, "e"))) {
    const cx = u.x * CELL + CELL / 2, cy = u.y * CELL + CELL / 2;
    if (u === sel) { ctx.strokeStyle = "#e8b04a"; ctx.lineWidth = 4; ctx.strokeRect(u.x * CELL + 3, u.y * CELL + 3, CELL - 6, CELL - 6); }
    if (actor && u.id === actor) { ctx.strokeStyle = "#ff5a3c"; ctx.lineWidth = 4; ctx.strokeRect(u.x * CELL + 3, u.y * CELL + 3, CELL - 6, CELL - 6); if (u.from) { ctx.setLineDash([5, 5]); ctx.strokeRect(u.from.x * CELL + 8, u.from.y * CELL + 8, CELL - 16, CELL - 16); ctx.setLineDash([]); } }
    ctx.font = `${CELL * 0.7}px serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.globalAlpha = u.side === "p" && u.acted ? 0.45 : 1;
    ctx.lineWidth = 3; ctx.strokeStyle = u.side === "p" ? "#1a1209" : "#fff";
    ctx.fillStyle = u.side === "p" ? "#f6c453" : (u.part || u.commander ? "#7a1f1f" : "#1a1209");
    ctx.strokeText(GLYPH[u.side][u.t], cx, cy - 4); ctx.fillText(GLYPH[u.side][u.t], cx, cy - 4);
    ctx.globalAlpha = 1;
    const w = CELL - 14, f = u.hp / u.maxHp;
    ctx.fillStyle = "#000"; ctx.fillRect(u.x * CELL + 7, u.y * CELL + CELL - 12, w, 6);
    ctx.fillStyle = u.side === "p" ? "#5fcf6f" : "#d8584a"; ctx.fillRect(u.x * CELL + 7, u.y * CELL + CELL - 12, w * f, 6);
    ctx.font = `${CELL * 0.2}px system-ui`; ctx.fillStyle = "#fff"; ctx.strokeStyle = "#000"; ctx.lineWidth = 3;
    if (u.side === "e" && AI_MARK[u.ai]) { ctx.strokeText(AI_MARK[u.ai], u.x * CELL + 12, u.y * CELL + 12); ctx.fillText(AI_MARK[u.ai], u.x * CELL + 12, u.y * CELL + 12); }
    if (u.side === "p" && ABILITIES[u.t]) { const t = u.cd > 0 ? String(u.cd) : "★"; ctx.strokeText(t, u.x * CELL + 12, u.y * CELL + 12); ctx.fillText(t, u.x * CELL + 12, u.y * CELL + 12); }
  }
  ctx.fillStyle = "rgba(230,50,50,.5)";
  for (const t of targets()) ctx.fillRect(t.x * CELL, t.y * CELL, CELL, CELL);
  // floating numbers
  floaters = floaters.filter((f) => now - f.t < 1000);
  for (const f of floaters) {
    const a = (now - f.t) / 1000;
    ctx.globalAlpha = 1 - a * a; ctx.font = `bold ${CELL * 0.4}px system-ui`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.lineWidth = 4; ctx.strokeStyle = "#000"; ctx.fillStyle = f.kind === "heal" ? "#6fe08a" : f.kind === "hurt" ? "#ff6a5a" : "#ffe27a";
    const x = f.x * CELL + CELL / 2, y = f.y * CELL + CELL * 0.3 - a * CELL * 0.6;
    ctx.strokeText(f.text, x, y); ctx.fillText(f.text, x, y);
  }
  ctx.globalAlpha = 1;
}

function info(u) {
  if (!u) return "tap one of your gold pieces. blue: where it can walk. red: who it can hit. ★ on a piece means its ability is ready.";
  const side = u.side === "p" ? "yours" : "enemy";
  const ab = u.side === "p" && ABILITIES[u.t] ? ` · ${ABILITIES[u.t].name}: ${ABILITIES[u.t].text}${u.cd ? ` (ready in ${u.cd})` : ""}` : "";
  const ai = u.side === "e" ? ` · ${AI_TEXT[u.ai] || ""}` : "";
  const g = u.gear ? ` · ${gearById(u.gear).name}` : "";
  return `${side} ${u.name}${u.side === "p" ? ` L${u.lvl}` : ""}: ${u.hp}/${u.maxHp} hp, attack ${u.atk}${u.fixed ? ", can't move" : ""}${g}${ab}${ai}`;
}

function shareLink(txt) { $("tShareLink").href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(txt + "\nhttps://chessgenres.bisks.net/#tactics"); }

function ui() {
  const inCamp = !s;
  $("tCamp").hidden = !inCamp; $("tc").hidden = inCamp; $("tCtl").hidden = inCamp; $("tInfo").hidden = inCamp; $("tLog").hidden = inCamp;
  $("tGold").textContent = camp.gold;
  if (inCamp) { renderCamp(); return; }
  draw();
  $("tTurn").textContent = s.turn + (s.turnLimit ? `/${s.turnLimit}` : "");
  $("tStage").textContent = `${camp.n + 1}/${BATTLES} ${s.title}`;
  const ps = living(s, "p"), es = living(s, "e");
  $("tParty").textContent = ps.map((u) => `${GLYPH.p[u.t]} ${u.hp}`).join("  ");
  $("tFoes").textContent = es.length;
  $("tObj").textContent = "objective: " + s.objective.text;
  const over = s.status !== "playing";
  $("tEnd").disabled = over || busy;
  $("tWait").disabled = over || busy || !sel || sel.acted;
  const ab = sel && ABILITIES[sel.t];
  $("tAbility").disabled = over || busy || !sel || !ab || abilityTargets(s, sel).length === 0;
  $("tAbility").textContent = ab && sel ? `${ab.name}${sel.cd ? ` (${sel.cd})` : ""}` : "ability";
  $("tAbility").classList.toggle("sel", abilityMode);
  $("tDanger").classList.toggle("sel", danger);
  $("tNext").hidden = s.status !== "won";
  $("tRetry").hidden = s.status !== "lost";
  $("tInfo").textContent = busy ? "the enemy moves..." : abilityMode ? `${ABILITIES[sel.t].name}: tap a green square.` : info(sel);
  let log = s.log.slice(-4).join("\n");
  if (s.status === "won") log += camp.n + 1 >= BATTLES ? "\nthe dragon is dead. the board is yours." : "\nvictory! on to camp.";
  if (s.status === "lost") log += "\nyour king has fallen. checkmate. retry the battle or start over.";
  $("tLog").textContent = log;
  $("tLog").className = over ? "end" : "";
  if (s.status === "lost" || (s.status === "won" && camp.n + 1 >= BATTLES)) {
    const txt = s.status === "won" ? `I led my chess party through ${BATTLES} battles and slew the chess dragon in Chess Tactics (seed ${camp.seed}, ${camp.retries} retries).` : `The chess dragon's army beat my Chess Tactics party at battle ${camp.n + 1} (${s.title}).`;
    shareLink(txt); $("tShare").hidden = false;
  } else $("tShare").hidden = true;
}

function renderCamp() {
  $("tStage").textContent = camp.state === "won" ? "complete" : `${camp.n + 1}/${BATTLES} camp`;
  $("tTurn").textContent = "–"; $("tFoes").textContent = "–";
  $("tParty").textContent = camp.roster.filter((m) => m.alive).map((m) => GLYPH.p[m.t]).join(" ");
  const next = camp.state === "won" ? null : buildBattle(camp);
  $("tObj").textContent = next ? `next: ${next.title}. ${next.objective.text}` : "";
  const bag = camp.inv.length ? camp.inv.map((id) => gearById(id).name).join(", ") : "empty";
  const rows = camp.roster.map((m) => {
    const need = xpNeeded(m.lvl), g = m.gear ? gearById(m.gear) : null;
    const opts = [...new Set(camp.inv)].map((id) => `<option value="${id}">${gearById(id).name} (${gearById(id).text})</option>`).join("");
    const ab = ABILITIES[m.t];
    if (!m.alive) return `<div class="unit dead"><span class="gl">${GLYPH.p[m.t]}</span><span class="grow"><b>${m.name}</b> L${m.lvl} fell in battle</span><button data-revive="${m.uid}" ${camp.gold >= reviveCost(m) ? "" : "disabled"}>revive · ${reviveCost(m)}g</button>${m.t === "k" ? "" : `<button data-release="${m.uid}">dismiss</button>`}</div>`;
    return `<div class="unit"><span class="gl">${GLYPH.p[m.t]}</span><span class="grow"><b>${m.name}</b> L${m.lvl}${m.lvl >= MAX_LEVEL ? " (max)" : ` (${m.xp}/${need} xp)`}<br><small class="dim">${m.hp + (g && g.fx.hp || 0)} hp · ${m.atk + (g && g.fx.atk || 0)} atk${ab ? ` · ${ab.name}: ${ab.text}` : " · promotes to a queen on the last rank"}</small></span>
      <select data-eq="${m.uid}" aria-label="gear for ${m.name}"><option value="${m.gear || ""}">${g ? g.name : "no gear"}</option>${m.gear ? '<option value="">take off</option>' : ""}${opts}</select></div>`;
  }).join("");
  const o = camp.offers;
  const rec = o ? o.recruits.map((r, i) => `<button data-rec="${i}" ${r.sold || camp.gold < r.price || camp.roster.length >= MAX_ROSTER ? "disabled" : ""}>${GLYPH.p[r.t]} recruit ${r.t === "p" ? "pawn" : { n: "knight", b: "bishop", r: "rook", q: "queen" }[r.t]} · ${r.price}g${r.sold ? " (hired)" : ""}</button>`).join(" ") : "";
  const gear = o ? o.gear.map((r, i) => { const g = gearById(r.id); return `<button data-gear="${i}" ${r.sold || camp.gold < r.price ? "disabled" : ""} title="${esc(g.text)}">${g.name} (${g.text}) · ${r.price}g${r.sold ? " (bought)" : ""}</button>`; }).join(" ") : "";
  let head = "";
  if (summary) head = `<p>${summary.won ? `battle won: +${summary.gold} gold. ` : ""}${summary.levels.map(esc).join(", ")}${summary.fallen.length ? ` fallen: ${summary.fallen.join(", ")}.` : ""}</p>`;
  if (camp.state === "won") {
    shareLink(`I led my chess party through ${BATTLES} battles and slew the chess dragon in Chess Tactics (seed ${camp.seed}, ${camp.retries} retries).`);
    $("tShare").hidden = false;
    $("tCamp").innerHTML = `<p class="end"><b>campaign complete.</b> the dragon is dead and the board is yours.</p><div class="camp">${rows}</div><div class="ctl"><button class="go" id="tAgain">new campaign</button></div>`;
    return;
  }
  $("tShare").hidden = true;
  $("tCamp").innerHTML = `${head}<p class="dim">healing is free between battles. roster ${camp.roster.length}/${MAX_ROSTER}. gear bag: ${bag}. seed ${esc(camp.seed)}.</p><div class="camp">${rows}</div>
    <p><b>recruits</b></p><div class="ctl">${rec}</div><p><b>gear for sale</b></p><div class="ctl">${gear}</div>
    <div class="ctl" style="margin-top:12px"><button class="go" id="tMarch">march to battle ${camp.n + 1}</button></div>`;
  $("tMarch").addEventListener("click", march);
}

$("tCamp").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  if (b.id === "tAgain") return newGame();
  if (b.dataset.rec != null) recruit(camp, +b.dataset.rec);
  else if (b.dataset.gear != null) buyGear(camp, +b.dataset.gear);
  else if (b.dataset.revive != null) revive(camp, +b.dataset.revive);
  else if (b.dataset.release != null) release(camp, +b.dataset.release);
  else return;
  save(); ui();
});
$("tCamp").addEventListener("change", (e) => {
  const sel2 = e.target.closest("select[data-eq]"); if (!sel2) return;
  const m = camp.roster.find((r) => r.uid === +sel2.dataset.eq);
  if (sel2.value !== (m.gear || "")) equip(camp, m.uid, sel2.value || null);
  save(); ui();
});

cv.addEventListener("click", (e) => {
  if (!s || busy || s.status !== "playing") return;
  const r = cv.getBoundingClientRect();
  const x = Math.floor(((e.clientX - r.left) / r.width) * SIZE), y = Math.floor(((e.clientY - r.top) / r.height) * SIZE);
  const u = unitAt(s, x, y);
  if (sel && abilityMode) {
    if (u && abilityTargets(s, sel).includes(u)) { doAbility(s, sel, u); sel = null; abilityMode = false; drain(); return ui(); }
    abilityMode = false;
  }
  if (sel) {
    if (u && targets().includes(u)) { doAttack(s, sel, u); sel = null; drain(); return ui(); }
    if (!u && moves().some((m) => m.x === x && m.y === y)) { doMove(s, sel, x, y); drain(); return ui(); }
  }
  if (u && u.side === "p") sel = u.acted ? null : u;
  else if (u) { sel = null; ui(); $("tInfo").textContent = info(u) + (u.part === "head" ? " (armor -1 per living claw)" : ""); return; }
  else sel = null;
  ui();
});

$("tAbility").addEventListener("click", () => {
  if (!sel || busy) return;
  const t = abilityTargets(s, sel);
  if (!t.length) return;
  if (t.length === 1 && t[0] === sel) { doAbility(s, sel, sel); sel = null; abilityMode = false; drain(); }
  else abilityMode = !abilityMode;
  ui();
});
$("tDanger").addEventListener("click", () => { danger = !danger; ui(); });

async function enemyPhase() {
  busy = true; sel = null; abilityMode = false; ui();
  const ids = beginEnemyPhase(s); drain();
  for (const id of ids) {
    if (s.status !== "playing") break;
    const before = s.log.length;
    const r = enemyStep(s, id);
    drain();
    if (r) { actor = id; ui(); await sleep(r.target ? 520 : 300); actor = null; }
    void before;
  }
  finishEnemyPhase(s); drain();
  busy = false; actor = null; ui();
}
$("tEnd").addEventListener("click", () => { if (s && !busy && s.status === "playing") enemyPhase(); });
$("tWait").addEventListener("click", () => { if (sel) { wait(s, sel); sel = null; abilityMode = false; ui(); } });
$("tNext").addEventListener("click", () => {
  summary = endBattle(camp, s); if (summary) summary.won = true;
  save(); toCamp();
});
$("tRetry").addEventListener("click", () => { s = retryBattle(camp); sel = null; floaters = []; busy = false; ui(); });
$("tRestart").addEventListener("click", () => { if (confirm("abandon this campaign and start over?")) newGame(); });

camp = load();
if (camp) toCamp(); else newGame();
