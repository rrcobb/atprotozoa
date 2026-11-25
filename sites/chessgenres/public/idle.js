import { LINES, ACHIEVEMENTS, DECREES, MAX_DECREE, decreeCost, freeCrowns, pendingCrowns, ascend, buyDecree, checkAchievements, achCount, hireForeman, toggleForeman, foremanCost, fastForward, claimGolden, eventDelay, pickOffer, resolveOffer, OFFERS, costOf, synergy, liveGps, buffMult, crownMult, achMult, goalRate, automate, buyScare, scareCost, theft, MAX_SCARE, CROW_EVERY, MILESTONES, newGame, tick, click, clickPower, buyMachines, buyMax, buySpeed, buyGuild, machineCost, speedCost, guildCost, guildMult, lineRate, goldPerSec, milestoneMult, visible, fmt, save, load } from "./idle-logic.js";

const $ = (id) => document.getElementById(id);
const BASE = "chessgenres-idle-v1";
// Long Corvid hard mode keeps its own save so the normal factory survives a visit.
let KEY = localStorage.getItem(BASE + ":mode") === "corvid" ? BASE + "-corvid" : BASE;
let g = load(localStorage.getItem(KEY) || ""), last = 0, buyN = 1, sig = "", metaSig = "", floaters = [], lastSave = 0, shown = false;
let golden = null, offer = null, nextEvent = eventDelay(g), combo = 0, lastStamp = 0, toastT = 0;

const cv = $("iFloor"), ctx = cv.getContext("2d");

// Credit time spent away. Idle games pay you for the hours you were gone, so
// the whole gap counts.
const away = g.t > 0 ? Math.max(0, (Date.now() - (Number(localStorage.getItem(KEY + ":at")) || Date.now())) / 1000) : 0;
if (KEY !== BASE) g.hard = true;
if (away > 5) {
  const before = g.gold, r0 = g.raids; fastForward(g, away);
  $("iMsg").textContent = `welcome back — the factory ran for ${fmt(away / 60)} min and made ${fmt(g.gold - before)} gold net${g.hard ? `, with ${g.raids - r0} crow raids` : ""}.`;
}

function buyBtn(l) {
  const own = g.owned[l.id];
  if (buyN === Infinity) {
    let n = 0, gold = g.gold, c;
    while ((c = machineCost(l.id, own + n, g.hard, g.decree.thrift)) <= gold) { gold -= c; n++; }
    return { n, label: n ? `buy ${n}` : "buy", cost: machineCost(l.id, own + n, g.hard, g.decree.thrift), ok: n > 0 };
  }
  let cost = 0;
  for (let i = 0; i < buyN; i++) cost += machineCost(l.id, own + i, g.hard, g.decree.thrift);
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
        <small class="dim">${next ? `×2 at ${next} machines` : "all milestones hit"}${synergy(g, l.id) > 1 ? ` · +${Math.round((synergy(g, l.id) - 1) * 100)}% from the line above` : ""}</small></div>
      <div class="buy">
        <button data-act="m" ${b.ok ? "" : "disabled"}>${b.label} · ${fmt(b.cost)}</button>
        <button data-act="s" ${own > 0 && g.gold >= speedCost(l.id, g.speed[l.id]) ? "" : "disabled"}>2× speed · ${fmt(speedCost(l.id, g.speed[l.id]))}</button>
        ${g.foreman[l.id] ? `<button class="fm" data-act="t">foreman: ${g.foreman[l.id] === 1 ? "working" : "off duty"}</button>` : `<button class="fm" data-act="f" ${own >= 5 && g.gold >= foremanCost(l.id) ? "" : "disabled"} title="buys machines for you (needs 5 machines)">hire foreman · ${fmt(foremanCost(l.id))}</button>`}
      </div></div>`);
  });
  $("iLines").innerHTML = rows.join("");
  $("iGuild").textContent = `guild charter ×1.5 gold · ${fmt(guildCost(g.guild))}`;
  $("iGuild").disabled = g.gold < guildCost(g.guild);
  for (const b of $("iBuyN").children) b.classList.toggle("sel", Number(b.dataset.n) === buyN);
}

const comboMult = () => 1 + Math.min(2, combo * 0.1);

function buildMeta() {
  const wasOpen = [...($("iMeta").querySelectorAll ? $("iMeta").querySelectorAll("details") : [])].map((d) => d.open);
  const gain = pendingCrowns(g), free = freeCrowns(g);
  const dec = DECREES.map((d) => { const lv = g.decree[d.id]; const c = decreeCost(lv); return `<div class="line"><div class="info"><b>${d.name}</b> ${lv}/${MAX_DECREE}<br><small class="dim">${d.text}</small></div><div class="buy"><button data-dec="${d.id}" ${lv >= MAX_DECREE || free < c ? "disabled" : ""}>${lv >= MAX_DECREE ? "maxed" : `${c} crowns`}</button></div></div>`; }).join("");
  const ach = ACHIEVEMENTS.map((a) => `<div class="ach ${g.ach[a.id] ? "on" : ""}">${g.ach[a.id] ? "★" : "☆"} <b>${a.name}</b>: ${a.text}</div>`).join("");
  $("iMeta").innerHTML = `<details ${(wasOpen.length ? wasOpen[0] : g.crowns || gain) ? "open" : ""}><summary><b>ascension</b> · ${g.crowns} crowns (${free} to spend) · gold ×${(crownMult(g)).toFixed(2)}</summary>
    <p class="dim">ascending scraps your gold, machines, upgrades and foremen, but you keep crowns (+5% gold each, forever), decrees and achievements. later runs come faster, and the more you built before ascending, the more crowns you get.</p>
    <p><button class="go" data-asc="1" ${gain < 1 ? "disabled" : ""}>ascend${gain ? ` for +${gain} crowns` : " (need more total gold)"}</button></p>${dec}</details>
    <details ${wasOpen[1] ? "open" : ""}><summary><b>achievements</b> · ${achCount(g)}/${ACHIEVEMENTS.length} · gold ×${achMult(g).toFixed(2)}</summary>${ach}</details>`;
}
$("iMeta").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b || b.disabled) return;
  if (b.dataset.dec) buyDecree(g, b.dataset.dec);
  else if (b.dataset.asc) {
    const gain = pendingCrowns(g);
    if (!confirm(`ascend for ${gain} crowns? your factory is scrapped; crowns, decrees and achievements stay.`)) return;
    ascend(g); floaters = []; golden = null; offer = null; $("iMsg").textContent = `you ascend. +${gain} crowns. the factory starts over, richer in spirit.`;
  } else return;
  sig = ""; metaSig = ""; persist(); ui();
});

function ui() {
  $("iGold").textContent = fmt(g.gold);
  $("iGps").textContent = fmt(liveGps(g));
  $("iCrowns").textContent = g.crowns;
  $("iBuffWrap").hidden = !(g.frenzy > 0 || g.slow > 0);
  $("iBuff").textContent = g.slow > 0 ? `slowed ${Math.ceil(g.slow)}s` : `frenzy ${Math.ceil(g.frenzy)}s`;
  $("iDragon").textContent = fmt(lineRate(g, "dragon"));
  $("iClick").textContent = fmt(clickPower(g, comboMult()));
  $("iOffer").hidden = !offer;
  if (offer) {
    const o = OFFERS.find((x) => x.kind === offer.kind);
    $("iOfferTxt").textContent = `${o.text(g)} (${Math.ceil(offer.left)}s)`; $("iYes").textContent = o.yes; $("iNo").textContent = o.no;
  }
  $("iGuildMult").textContent = "×" + guildMult(g).toFixed(2);
  const dr = lineRate(g, "dragon"), goal = goalRate(g);
  $("iGoal").textContent = g.won ? `the chess dragon is rolling off the line at ${fmt(goal)}/s. you win${g.hard ? ", crows and all" : ""}. keep going if you like.` : `goal: ${fmt(goal)} dragons per second (now ${fmt(dr)})`;
  $("iMode").textContent = g.hard ? "back to the normal factory" : "long corvid hard mode";
  $("iCrow").hidden = !g.hard;
  if (g.hard) {
    $("iCrowTxt").textContent = `🐦‍⬛ crows raid in ${Math.max(0, Math.ceil(CROW_EVERY - g.crow))}s and take ${Math.round(theft(g) * 100)}% of your gold · ${g.raids} raids, ${fmt(g.stolen)} stolen`;
    $("iScare").textContent = g.scare >= MAX_SCARE ? "scarecrows maxed" : `scarecrow · ${fmt(scareCost(g.scare))}`;
    $("iScare").disabled = g.scare >= MAX_SCARE || g.gold < scareCost(g.scare);
  }
  $("iShare").hidden = !g.won;
  if (g.won) {
    const txt = `${g.hard ? "I beat Long Corvid hard mode: my" : "My"} chess factory is manufacturing ${fmt(dr)} chess dragons per second (${fmt(g.total)} gold made).`;
    $("iShareLink").href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(txt + "\nhttps://chessgenres.bisks.net/#idle");
  }
  const ms = [pendingCrowns(g) > 0, freeCrowns(g), g.crowns, achCount(g), g.hard, ...DECREES.map((d) => g.decree[d.id])].join();
  if (ms !== metaSig) { metaSig = ms; buildMeta(); }
  // Rebuild the shop only when what is visible or affordable changes, so buttons keep focus.
  const s = [buyN, g.guild, g.hard, g.crowns, ...LINES.map((l, i) => [visible(g, i), g.owned[l.id], g.speed[l.id], g.foreman[l.id], g.gold >= foremanCost(l.id),
    (b => b.n + ":" + b.ok)(buyBtn(l)), g.owned[l.id] > 0 && g.gold >= speedCost(l.id, g.speed[l.id])].join())].join("|") + (g.gold >= guildCost(g.guild));
  if (s !== sig) { sig = s; build(); }
  for (const l of LINES) {
    const el = $("r-" + l.id);
    if (el) el.textContent = `${fmt(lineRate(g, l.id))} ${l.label.split(" ")[0]}s/s · ${fmt(g.made[l.id])} made · sells ${fmt(l.value)} each`;
  }
}

$("iLines").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-act]"); if (!b || b.disabled) return;
  const id = b.closest(".line").dataset.id;
  if (b.dataset.act === "m") buyMachines(g, id, buyN); else if (b.dataset.act === "s") buySpeed(g, id); else if (b.dataset.act === "f") hireForeman(g, id); else toggleForeman(g, id);
  sig = ""; ui();
});
$("iScare").addEventListener("click", () => { buyScare(g); sig = ""; ui(); });
$("iMode").addEventListener("click", () => {
  persist();
  KEY = g.hard ? BASE : BASE + "-corvid";
  localStorage.setItem(BASE + ":mode", g.hard ? "normal" : "corvid");
  g = load(localStorage.getItem(KEY) || ""); g.hard = KEY !== BASE;
  floaters = []; sig = ""; metaSig = ""; golden = null; offer = null;
  $("iMsg").textContent = g.hard ? "long corvid: the crows are watching the vault. progress here saves separately." : "back in the normal factory.";
  ui();
});
$("iGuild").addEventListener("click", () => { buyGuild(g); sig = ""; ui(); });
$("iBuyN").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-n]"); if (!b) return;
  buyN = Number(b.dataset.n); sig = ""; ui();
});
$("iStamp").addEventListener("click", () => {
  const now = performance.now();
  combo = now - lastStamp < 700 ? Math.min(20, combo + 1) : 0; lastStamp = now; // 20 caps the hot-hands bonus at x3
  click(g, comboMult());
  floaters.push({ x: 60 + Math.random() * 520, y: 190, glyph: combo >= 10 ? "🔥" : "♟", life: 1, vy: -70 });
  ui();
});
$("iYes").addEventListener("click", () => answer(true));
$("iNo").addEventListener("click", () => answer(false));
function answer(yes) {
  if (!offer) return;
  $("iMsg").textContent = resolveOffer(g, offer.kind, yes); offer = null; sig = ""; ui();
}
// Golden pieces drift across the floor; tap one before it fades.
cv.addEventListener("click", (e) => {
  if (!golden) return;
  const r = cv.getBoundingClientRect();
  const x = ((e.clientX - r.left) / r.width) * cv.width, y = ((e.clientY - r.top) / r.height) * cv.height;
  if (Math.hypot(x - golden.x, y - golden.y) < 46) {
    $("iMsg").textContent = claimGolden(g, golden.kind);
    for (let i = 0; i < 12; i++) floaters.push({ x: golden.x + (Math.random() - 0.5) * 80, y: golden.y, glyph: "✨", life: 1, vy: -60 - Math.random() * 60 });
    golden = null; sig = ""; ui();
  }
});
$("iReset").addEventListener("click", () => {
  if (!confirm("scrap the factory and start over? this also erases your crowns, decrees and achievements.")) return;
  g = newGame(g.hard); sig = ""; metaSig = ""; golden = null; offer = null; localStorage.removeItem(KEY); $("iMsg").textContent = "a fresh, empty factory."; ui();
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
  if (golden) {
    golden.x += golden.vx * dt; golden.life -= dt;
    golden.y = 100 + Math.sin(golden.life * 3) * 40;
    ctx.globalAlpha = Math.min(1, golden.life);
    ctx.shadowColor = "#ffd34a"; ctx.shadowBlur = 24; ctx.fillStyle = "#ffd34a"; ctx.font = "56px serif";
    ctx.fillText(golden.kind === "knight" ? "♞" : "♟", golden.x, golden.y);
    ctx.shadowBlur = 0; ctx.globalAlpha = 1;
  }
  if (g.frenzy > 0) { ctx.fillStyle = "rgba(255,211,74,.12)"; ctx.fillRect(0, 0, cv.width, cv.height); }
  floaters = floaters.filter((f) => f.life > 0);
}

// Foremen, achievements and the random-event clock.
let autoAcc = 0;
function tickMeta(dt) {
  autoAcc += dt;
  if (autoAcc >= 0.5) { autoAcc = 0; if (automate(g)) sig = ""; }
  const won = checkAchievements(g);
  if (won.length) { $("iMsg").textContent = "achievement: " + won.map((a) => a.name).join(", ") + "!"; metaSig = ""; }
  if (offer) { offer.left -= dt; if (offer.left <= 0) answer(false); }
  if (golden && golden.life <= 0) golden = null;
  nextEvent -= dt;
  if (nextEvent <= 0) {
    nextEvent = eventDelay(g);
    if (Math.random() < 0.6 || offer) { if (!golden) golden = { x: -30, y: 100, vx: 70 + Math.random() * 40, life: 9, kind: Math.random() < 0.4 ? "knight" : "pawn" }; }
    else { const k = pickOffer(g); if (k) offer = { kind: k, left: 30 }; }
  }
}
function frame(ts) {
  const dt = Math.min(0.5, (ts - last) / 1000 || 0); last = ts;
  // Production keeps running when you're on another genre tab; only drawing waits.
  tick(g, dt);
  tickMeta(dt);
  if (!$("idle").hidden) { spawn(dt); draw(dt); ui(); }
  if (ts - lastSave > 3000) {
    lastSave = ts;
    persist();
  }
  requestAnimationFrame(frame);
}
function persist() { localStorage.setItem(KEY, save(g)); localStorage.setItem(KEY + ":at", String(Date.now())); }
addEventListener("pagehide", persist);
ui();
requestAnimationFrame(frame);
