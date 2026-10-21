import * as L from "./logic.js";
import { LINES, CULT_TEXT, ENDING } from "./dialogue.js";

const KEY = "undergrow-save-v1";
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

let s = load();
let place = "roof";

function load() {
  try {
    const j = JSON.parse(localStorage.getItem(KEY) || "null");
    if (j && j.v === 1 && Array.isArray(j.plots)) return j;
  } catch (_) {}
  const n = L.newState();
  n.log.unshift("you wake on a rooftop between two humming AC units. the city glows. you have 4 spores and a plan.");
  return n;
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (_) {} }
function say(m) { if (!m) return; s.log.unshift(m); if (s.log.length > 40) s.log.length = 40; }

const PLACES = () => {
  const p = [["roof", "🏙️ rooftop"], ["market", "🏮 night market"], ["wires", "🔌 wires"], ["stoop", "🚪 stoop"]];
  if (s.cult.stage >= 1) p.push(["drain", "🕳️ the drain"]);
  return p;
};

function npcCard(id) {
  const n = L.NPCS[id], h = L.hearts(s, id);
  const lines = LINES[id][h];
  const line = lines[(s.day + id.length) % lines.length];
  const gifts = Object.keys(s.crops).filter((k) => s.crops[k] > 0 && !L.CROPS[k].noSell);
  return `<div class="panel"><div class="npc"><div class="face">${n.icon}</div><div>
    <b>${esc(n.name)}</b> <small>the ${n.kind}</small> <span class="hearts">${"♥".repeat(h)}${"♡".repeat(5 - h)}</span>
    <div class="say">“${esc(line)}”</div>
    <div class="row"><button data-act="talk" data-id="${id}" ${s.talked[id] ? "disabled" : ""}>${s.talked[id] ? "chatted today" : "chat (+friendship)"}</button>
    ${gifts.map((k) => `<button data-act="gift" data-id="${id}" data-crop="${k}" ${s.gifted[id] ? "disabled" : ""}>gift ${L.CROPS[k].icon} ${L.CROPS[k].name}</button>`).join("")}
    </div></div></div></div>`;
}

function viewRoof() {
  const tools = [["till", "⛏️ till"], ["water", "💧 water"], ["harvest", "🧺 harvest"]];
  for (const k of Object.keys(L.CROPS)) if (s.seeds[k] > 0) tools.push([k, `${L.CROPS[k].icon} plant (${s.seeds[k]})`]);
  const grid = s.plots.map((p, i) => {
    const r = L.ripe(s, p);
    let face = p.crop ? (r ? L.CROPS[p.crop].icon : p.age > 0 ? "🌱" : "·") : "";
    if (p.crop && !r && p.age === 0) face = "🫧";
    const cls = ["plot", p.tilled && "tilled", p.watered && "wet", r && "ripe"].filter(Boolean).join(" ");
    const sm = p.crop && !r ? `<small>${p.age}/${L.growDays(s, p.crop)}</small>` : "";
    return `<button class="${cls}" data-act="plot" data-i="${i}" aria-label="plot ${i + 1}">${face}${sm}</button>`;
  }).join("");
  return `<div class="panel"><h2>your plot — ${s.tool === "till" || s.tool === "water" || s.tool === "harvest" ? s.tool : "planting " + L.CROPS[s.tool].name}</h2>
    <div class="tools">${tools.map(([k, t]) => `<button data-act="tool" data-k="${k}" class="${s.tool === k ? "on" : ""}">${t}</button>`).join("")}</div>
    <div class="grid">${grid}</div>
    <div class="row"><button data-act="forage">🗑️ dumpster dive (1⚡)</button></div></div>`;
}

function viewMarket() {
  const sell = Object.keys(s.crops).filter((k) => s.crops[k] > 0 && !L.CROPS[k].noSell);
  const total = sell.reduce((a, k) => a + L.priceOf(s, k) * s.crops[k], 0);
  const seeds = ["moss", "glow", "bean", "cheese"].map((k) => `<button data-act="buy" data-k="${k}" ${s.coins < L.CROPS[k].seed ? "disabled" : ""}>${L.CROPS[k].icon} ${L.CROPS[k].name} seed — ${L.CROPS[k].seed}¢ <small>(${L.CROPS[k].days}d, sells ~${L.priceOf(s, k)}¢)</small></button>`).join("");
  const six = L.isSixthNight(s.day) ? `<p class="say" style="color:var(--pink)">it's a sixth night. the neon flickers in sixes and nobody quite looks at the drain.</p>` : "";
  return `${six}<div class="panel"><h2>Pidge's seed cart</h2><div class="row">${seeds}</div></div>
    <div class="panel"><h2>sell crates</h2>
    <div>${sell.length ? sell.map((k) => `${L.CROPS[k].icon} ${s.crops[k]} × ${L.priceOf(s, k)}¢`).join(" · ") : "nothing to sell yet."}</div>
    <div class="row"><button data-act="sell" ${sell.length ? "" : "disabled"}>sell everything (${total}¢)</button></div></div>
    ${npcCard("pidge")}${npcCard("kess")}`;
}

function viewWires() {
  const ups = Object.keys(L.UPGRADES).map((k) => {
    const u = L.UPGRADES[k], ok = L.canUpgrade(s, k);
    const cost = L.upgradeCost(s, k);
    return `<div class="row"><button data-act="up" data-k="${k}" ${!ok || s.coins < cost ? "disabled" : ""}>${ok ? `${u.name} — ${cost}¢` : `${u.name} ✓`}</button><small>${u.text}</small></div>`;
  }).join("");
  return `<div class="panel"><h2>Volt's bench</h2>${ups}</div>${npcCard("volt")}`;
}

function viewStoop() {
  const caps = s.caps ? `<div class="panel"><small>in your pocket: ${s.caps} hex-stamped bottlecap${s.caps > 1 ? "s" : ""}.</small></div>` : "";
  return `${npcCard("tux")}${caps}`;
}

function viewDrain() {
  const st = s.cult.stage;
  let act = "";
  if (st === 1) act = `<button data-act="offerMoss">offer six gutter moss (${s.crops.moss || 0}/6)</button>`;
  if (st === 2) act = `<button data-act="offerHollow">offer a hollowroot ${L.isSixthNight(s.day) ? "(it's a sixth night)" : "(wait for a sixth night)"}</button>`;
  const ending = s.cult.joined ? `<p class="say">${esc(ENDING)}</p>` : "";
  return `<div class="panel cult"><h2>the Sixth House</h2><p class="say">${esc(CULT_TEXT[st] || "")}</p>${ending}<div class="row">${act}</div></div>${npcCard("skit")}`;
}

function render() {
  $("day").textContent = s.day;
  $("energy").textContent = s.energy;
  $("maxE").textContent = s.maxEnergy;
  $("coins").textContent = s.coins;
  const t = $("title");
  t.hidden = !s.cult.joined;
  t.textContent = "🖐️ Sixth Hand";
  if (!PLACES().some(([k]) => k === place)) place = "roof";
  $("nav").innerHTML = PLACES().map(([k, t2]) => `<button data-act="go" data-k="${k}" class="${place === k ? "on" : ""}">${t2}</button>`).join("");
  $("view").innerHTML = { roof: viewRoof, market: viewMarket, wires: viewWires, stoop: viewStoop, drain: viewDrain }[place]();
  $("log").innerHTML = s.log.slice(0, 8).map((m) => `<div>${esc(m)}</div>`).join("");
  const txt = `🐀 day ${s.day} in undergrow: ${s.coins}¢, ${s.stats.harvested} harvested${s.cult.joined ? ", and I joined the Sixth House" : ""}.`;
  $("share").href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(txt + " https://undergrow.bisks.net/");
  save();
}

function act(a, d) {
  const stageBefore = s.cult.stage;
  if (a === "go") place = d.k;
  else if (a === "tool") s.tool = d.k;
  else if (a === "plot") { const r = L.actOnPlot(s, +d.i); say(r.msg); }
  else if (a === "forage") { say(L.forage(s).msg); say(L.checkCultStage(s)); }
  else if (a === "buy") { if (L.buySeed(s, d.k)) say(`bought a ${L.CROPS[d.k].name} seed.`); }
  else if (a === "sell") { const r = L.sellAll(s); say(`sold ${r.n} crops for ${r.total}¢.`); }
  else if (a === "up") { if (L.buyUpgrade(s, d.k)) say(`Volt bolts on the ${L.UPGRADES[d.k].name}. “don't touch the red wire.”`); }
  else if (a === "talk") { L.talk(s, d.id); say(`you chat with ${L.NPCS[d.id].name}.`); }
  else if (a === "gift") {
    const r = L.giftTo(s, d.id, d.crop);
    say(r.ok ? `${L.NPCS[d.id].name} ${r.tier === "love" ? "is delighted!" : r.tier === "like" ? "likes it." : "accepts it politely."}` : r.msg);
  }
  else if (a === "offerMoss") { const r = L.offerMoss(s); say(r.msg); }
  else if (a === "offerHollow") { const r = L.offerHollow(s); say(r.msg); if (r.ok) say(CULT_TEXT[3]); }
  if (stageBefore !== s.cult.stage && s.cult.stage === 2) say(CULT_TEXT[2]);
  render();
}

document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-act]");
  if (b && !b.disabled) act(b.dataset.act, b.dataset);
});

$("sleep").addEventListener("click", () => {
  const r = L.endDay(s);
  say(`day ${s.day}. ${r.rain ? "acid-rain washed the roof; everything drank. " : ""}${r.grown} plots grew${r.dry ? `, ${r.dry} stayed thirsty` : ""}.`);
  if (L.isSixthNight(s.day)) say("it is a sixth night. the drain hums.");
  render();
});
$("reset").addEventListener("click", () => {
  if (!confirm("start over? your save will be erased.")) return;
  localStorage.removeItem(KEY); s = load(); place = "roof"; render();
});

render();
