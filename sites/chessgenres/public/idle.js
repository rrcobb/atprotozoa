import { LINES, GOAL_RATE, MILESTONES, newGame, tick, click, clickPower, buyMachines, buyMax, buySpeed, buyGuild, machineCost, speedCost, guildCost, guildMult, lineRate, goldPerSec, milestoneMult, visible, fmt, save, load } from "./idle-logic.js";

const $ = (id) => document.getElementById(id);
const KEY = "chessgenres-idle-v1";
let g = load(localStorage.getItem(KEY) || ""), last = 0, buyN = 1, sig = "", floaters = [], lastSave = 0, shown = false;

const cv = $("iFloor"), ctx = cv.getContext("2d");

// Credit time spent away. Idle games pay you for the hours you were gone, so
// the whole gap counts.
const away = g.t > 0 ? Math.max(0, (Date.now() - (Number(localStorage.getItem(KEY + ":at")) || Date.now())) / 1000) : 0;
if (away > 5) {
  const before = g.gold; tick(g, away);
  $("iMsg").textContent = `welcome back — the factory ran for ${fmt(away / 60)} min and made ${fmt(g.gold - before)} gold.`;
}

function buyBtn(l) {
  const own = g.owned[l.id];
  if (buyN === Infinity) {
    let n = 0, gold = g.gold, c;
    while ((c = machineCost(l.id, own + n)) <= gold) { gold -= c; n++; }
    return { n, label: n ? `buy ${n}` : "buy", cost: machineCost(l.id, own + n) , ok: n > 0 };
  }
  let cost = 0;
  for (let i = 0; i < buyN; i++) cost += machineCost(l.id, own + i);
  return { n: buyN, label: `buy ${buyN}`, cost, ok: g.gold >= cost };
}

function build() {
  const rows = [];
  LINES.forEach((l, i) => {
    if (!visible(g, i)) return;
    const own = g.owned[l.id], b = buyBtn(l);
    const next = MILESTONES.find((m) => own < m);
    rows.push(`<div class="line" data-id="${l.id}">
      <span class="gl">${l.glyph}</span>
      <div class="info"><b>${l.label}</b> ×${own}<br>
        <small id="r-${l.id}"></small><br>
        <small class="dim">${next ? `×2 at ${next} machines` : "all milestones hit"}</small></div>
      <div class="buy">
        <button data-act="m" ${b.ok ? "" : "disabled"}>${b.label} · ${fmt(b.cost)}</button>
        <button data-act="s" ${own > 0 && g.gold >= speedCost(l.id, g.speed[l.id]) ? "" : "disabled"}>2× speed · ${fmt(speedCost(l.id, g.speed[l.id]))}</button>
      </div></div>`);
  });
  $("iLines").innerHTML = rows.join("");
  $("iGuild").textContent = `guild charter ×1.5 gold · ${fmt(guildCost(g.guild))}`;
  $("iGuild").disabled = g.gold < guildCost(g.guild);
  for (const b of $("iBuyN").children) b.classList.toggle("sel", Number(b.dataset.n) === buyN);
}

function ui() {
  $("iGold").textContent = fmt(g.gold);
  $("iGps").textContent = fmt(goldPerSec(g));
  $("iDragon").textContent = fmt(lineRate(g, "dragon"));
  $("iClick").textContent = fmt(clickPower(g));
  $("iGuildMult").textContent = "×" + guildMult(g).toFixed(2);
  const dr = lineRate(g, "dragon");
  $("iGoal").textContent = g.won ? "the chess dragon is rolling off the line at 1000/s. you win. keep going if you like." : `goal: ${fmt(GOAL_RATE)} dragons per second (now ${fmt(dr)})`;
  $("iShare").hidden = !g.won;
  if (g.won) {
    const txt = `My chess factory is manufacturing ${fmt(dr)} chess dragons per second (${fmt(g.total)} gold made).`;
    $("iShareLink").href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(txt + "\nhttps://chessgenres.bisks.net/#idle");
  }
  // Rebuild the shop only when what is visible or affordable changes, so buttons keep focus.
  const s = [buyN, g.guild, ...LINES.map((l, i) => [visible(g, i), g.owned[l.id], g.speed[l.id],
    buyBtn(l).n, g.owned[l.id] > 0 && g.gold >= speedCost(l.id, g.speed[l.id])].join())].join("|") + (g.gold >= guildCost(g.guild));
  if (s !== sig) { sig = s; build(); }
  for (const l of LINES) {
    const el = $("r-" + l.id);
    if (el) el.textContent = `${fmt(lineRate(g, l.id))} ${l.label.split(" ")[0]}s/s · ${fmt(g.made[l.id])} made · sells ${fmt(l.value)} each`;
  }
}

$("iLines").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-act]"); if (!b || b.disabled) return;
  const id = b.closest(".line").dataset.id;
  if (b.dataset.act === "m") buyMachines(g, id, buyN); else buySpeed(g, id);
  sig = ""; ui();
});
$("iGuild").addEventListener("click", () => { buyGuild(g); sig = ""; ui(); });
$("iBuyN").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-n]"); if (!b) return;
  buyN = Number(b.dataset.n); sig = ""; ui();
});
$("iStamp").addEventListener("click", () => {
  click(g);
  floaters.push({ x: 60 + Math.random() * 520, y: 190, glyph: "♟", life: 1, vy: -70 });
  ui();
});
$("iReset").addEventListener("click", () => {
  if (!confirm("scrap the factory and start over?")) return;
  g = newGame(); sig = ""; localStorage.removeItem(KEY); $("iMsg").textContent = "a fresh, empty factory."; ui();
});

// Spawn a few floating pieces per frame in proportion to what's being made,
// biggest piece you own getting the glyph.
function spawn(dt) {
  for (const l of LINES) {
    const r = lineRate(g, l.id);
    if (r <= 0) continue;
    // Visual density only: log-scaled so a 1000/s line is busy, not a white-out.
    const rate = Math.min(8, Math.log10(1 + r) * 2.2);
    if (Math.random() < rate * dt) floaters.push({ x: 20 + Math.random() * 600, y: 200, glyph: l.glyph, life: 1, vy: -40 - Math.random() * 40, big: l.id === "dragon" });
  }
}
function draw(dt) {
  ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.fillStyle = "#1c1612"; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.fillStyle = "#3a302a"; ctx.fillRect(0, 196, cv.width, 8); // conveyor
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  for (const f of floaters) {
    f.y += f.vy * dt; f.life -= dt * 0.55;
    ctx.globalAlpha = Math.max(0, f.life);
    ctx.font = `${f.big ? 40 : 24}px serif`;
    ctx.fillStyle = "#f1e9dc"; ctx.fillText(f.glyph, f.x, f.y);
  }
  ctx.globalAlpha = 1;
  floaters = floaters.filter((f) => f.life > 0);
}

function frame(ts) {
  const dt = Math.min(0.5, (ts - last) / 1000 || 0); last = ts;
  // Production keeps running when you're on another genre tab; only drawing waits.
  tick(g, dt);
  if (!$("idle").hidden) { spawn(dt); draw(dt); ui(); }
  if (ts - lastSave > 3000) {
    lastSave = ts;
    localStorage.setItem(KEY, save(g)); localStorage.setItem(KEY + ":at", String(Date.now()));
  }
  requestAnimationFrame(frame);
}
addEventListener("pagehide", () => { localStorage.setItem(KEY, save(g)); localStorage.setItem(KEY + ":at", String(Date.now())); });
ui();
requestAnimationFrame(frame);
