import { lineChart, spark, color } from "./charts.js";
import { newGame, step, build, buildHub, netWorth, rivalWorth, COST, RATE, UPKEEP, MAX_WORKSHOP, WORKSHOP_STEP } from "./sim.js";

const KEY = "foundry-rivals-v1";
const $ = (id) => document.getElementById(id);
const fmt = (n) => Math.round(n).toLocaleString();
const money = (n) => (n < 0 ? "-$" : "$") + fmt(Math.abs(n));

let s;
try { s = JSON.parse(localStorage.getItem(KEY)); } catch (e) { s = null; }
if (!s || !s.regions) s = newGame((Math.random() * 1e9) | 0);

let speed = 1, paused = false, acc = 0, last = performance.now();

function save() { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} }

function mines() {
  $("mines").innerHTML = s.mines.map((m, i) => `
    <div class="row"><span>${m.name}</span><span class="dim">stock ${fmt(m.stock)} · $${m.price.toFixed(2)}/ore · ${m.rate}/day</span></div>
    <div class="row"><input type="range" min="0" max="${m.rate}" value="${s.contract[i]}" data-mine="${i}"><b>${s.contract[i]}/day</b></div>`).join("");
}

function factory() {
  const defs = [["smelter", "smelter", "2 ore → 1 plate"], ["assembler", "assembler", "2 plates → 1 gear"], ["works", "widget works", "1 gear + 1 plate → 1 widget"], ["truck", "truck", `moves ${RATE.truck} units/day to hubs`]];
  $("factory").innerHTML = defs.map(([k, label, what]) => `
    <div class="row"><span>${s.b[k]} × ${label} <span class="dim">(${what}${RATE[k] && k !== "truck" ? `, ${RATE[k]}/day each` : ""}; $${UPKEEP[k]}/day)</span></span>
    <button data-build="${k}" ${s.cash < COST[k] ? "disabled" : ""}>+ ${money(COST[k])}</button></div>`).join("") +
    `<div class="row"><span>stock</span><span class="dim">ore ${fmt(s.inv.ore)} · plates ${fmt(s.inv.plate)} · gears ${fmt(s.inv.gear)} · widgets ${fmt(s.inv.widget)}</span></div>`;
}

function logi() {
  $("logi").innerHTML = `
    <div class="row"><span>widget price</span><b>$${s.price.widget}</b></div>
    <div class="row"><input type="range" id="pw" min="12" max="46" value="${s.price.widget}"></div>
    <div class="row"><span>gear price (towns pay ≤ $16)</span><b>$${s.price.gear}</b></div>
    <div class="row"><input type="range" id="pg" min="4" max="20" value="${s.price.gear}"></div>
    <div class="row"><span>ship gears to hubs</span><button id="sg" class="${s.shipGears ? "on" : ""}">${s.shipGears ? "yes" : "no"}</button></div>
    <p class="hint">towns that buy your gears build workshops (+25% widget demand each). widgets travel factory → hub by your trucks, hub → town by the cheapest distributor AI with capacity.</p>`;
}

function regions() {
  $("regions").innerHTML = s.regions.map((r, ri) => `
    <div class="region"><div class="row"><b>${r.name}</b>
      ${r.hub ? `<span class="dim">hub stock: ${fmt(r.stock.widget)} widgets, ${fmt(r.stock.gear)} gears</span>` : `<button data-hub="${ri}" ${s.cash < COST.hub ? "disabled" : ""}>open hub ${money(COST.hub)}</button>`}</div>
      <div class="dim">distributors: ${r.dists.map((d) => `${d.name} ($${d.fee}/unit, ${d.cap}/day)`).join(" · ")}</div>
      <div id="rc${ri}" class="rc"></div>
      ${r.towns.map((t) => `<div class="town"><span>${t.name}</span><span>pop ${fmt(t.pop)}</span><span>demand ${t.demand.toFixed(1)}/day</span><span>${Math.round(t.sat * 100)}% served · workshop ${t.workshop}/${MAX_WORKSHOP}</span></div>`).join("")}
    </div>`).join("");
}

function board() {
  const rows = [{ n: "you", w: netWorth(s), me: true, d: `${s.b.works * RATE.works} widgets/day cap` },
    ...s.rivals.map((r) => ({ n: r.name, w: rivalWorth(r), d: `${r.cap}/day at $${r.price.toFixed(1)}` }))].sort((a, b) => b.w - a.w);
  $("board").innerHTML = rows.map((r, i) => `<div class="row ${r.me ? "me" : ""}"><span>${i + 1}. ${r.n} <span class="dim">${r.d}</span></span><b>${money(r.w)}</b></div>`).join("");
  const rank = rows.findIndex((r) => r.me) + 1;
  $("share").href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(
    `day ${s.day} in foundry rivals: #${rank} of 4 factories, net worth ${money(netWorth(s))}. https://foundry-rivals.bisks.net/`);
}

const H = () => s.hist || { day: [], cols: {} };
const col = (k) => H().cols[k] || [];
const rivalNames = () => s.rivals.map((r) => r.name.split(" ")[0]);

function charts() {
  const h = H(), d = h.day;
  $("spark").innerHTML = spark(col("nw:you"));
  $("mines-chart").innerHTML = lineChart(d, s.mines.map((m, i) => ({ name: m.name.split(" ")[0], data: col("oreprice:" + i), color: color(i + 1) })), { money: true, label: "ore price per mine over time" });
  $("factory-chart").innerHTML = lineChart(d, [{ name: "made/day", data: col("made"), color: color(5) }, { name: "sold/day", data: col("sold:you"), color: color(0), bold: true }], { label: "widgets made and sold per day" }) +
    lineChart(d, [{ name: "profit/day", data: col("profit"), color: color(2), bold: true }, { name: "costs/day", data: col("costs"), color: color(3) }], { money: true, zero: true, label: "daily profit and costs" });
  $("logi-chart").innerHTML = lineChart(d, [{ name: "you", data: col("price:you"), bold: true }, ...rivalNames().map((n, i) => ({ name: n, data: col("price:r" + i), color: color(i + 1) }))], { money: true, label: "widget price, you vs rivals" });
  $("board-chart").innerHTML = lineChart(d, [{ name: "you", data: col("nw:you"), bold: true }, ...rivalNames().map((n, i) => ({ name: n, data: col("nw:r" + i), color: color(i + 1) }))], { money: true, h: 130, label: "net worth over time" });
  s.regions.forEach((r, ri) => {
    $("rc" + ri).innerHTML = lineChart(d, r.towns.map((t, ti) => ({ name: t.name, data: col(`pop:${ri}:${ti}`), color: color(ti) })), { label: r.name + " town populations" }) +
      lineChart(d, r.towns.map((t, ti) => ({ name: t.name, data: col(`sat:${ri}:${ti}`), color: color(ti) })), { label: r.name + " % of demand served" }) ;
  });
}

function head() {
  $("day").textContent = "day " + s.day;
  $("cash").textContent = money(s.cash);
  $("nw").textContent = "net worth " + money(netWorth(s));
  const L = s.last;
  $("flow").textContent = `yesterday: ${L.widgets} widgets made, ${fmt(L.sold)} sold, revenue ${money(L.revenue)}, ore ${money(L.oreCost)}, freight ${money(L.fees)}, upkeep ${money(L.upkeep)}`;
  $("log").innerHTML = s.log.map((l) => `<li>${l}</li>`).join("");
}

// sliders re-render panels, so only rebuild the ones that change per tick
function tick() { head(); factory(); regions(); board(); charts(); }
function all() { mines(); logi(); tick(); }

document.addEventListener("input", (e) => {
  const t = e.target;
  if (t.dataset.mine !== undefined) { s.contract[+t.dataset.mine] = +t.value; t.nextElementSibling.textContent = t.value + "/day"; }
  if (t.id === "pw") { s.price.widget = +t.value; t.parentElement.previousElementSibling.lastElementChild.textContent = "$" + t.value; }
  if (t.id === "pg") { s.price.gear = +t.value; t.parentElement.previousElementSibling.lastElementChild.textContent = "$" + t.value; }
});
document.addEventListener("click", (e) => {
  const t = e.target.closest("button");
  if (!t) return;
  if (t.dataset.build) build(s, t.dataset.build);
  if (t.dataset.hub) buildHub(s, +t.dataset.hub);
  if (t.id === "sg") { s.shipGears = !s.shipGears; logi(); }
  if (t.dataset.speed) { speed = +t.dataset.speed; paused = false; }
  if (t.id === "pause") paused = !paused;
  if (t.id === "reset" && confirm("start a new game?")) { s = newGame((Math.random() * 1e9) | 0); all(); }
  $("pause").classList.toggle("on", paused);
  document.querySelectorAll("[data-speed]").forEach((b) => b.classList.toggle("on", !paused && +b.dataset.speed === speed));
  tick();
});

function frame(now) {
  if (!paused) {
    acc += (now - last) * speed;
    while (acc >= 1000) { acc -= 1000; step(s); }
  }
  last = now;
  requestAnimationFrame(frame);
}
let lastDay = s.day;
setInterval(() => {
  if (s.day !== lastDay) { lastDay = s.day; if (document.activeElement?.dataset?.mine === undefined) mines(); tick(); save(); }
}, 250);

all();
document.querySelector('[data-speed="1"]').classList.add("on");
requestAnimationFrame(frame);
