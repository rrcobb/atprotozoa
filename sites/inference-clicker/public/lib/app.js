// app.js — the page: renders game.js state, wires the controls, saves locally
// and (when signed in) to the player's PDS.

import * as G from "./game.js";
import { login, completeLoginIfCallback, getSession, clearSession } from "./oauth.js";
import { CAST, RARITIES, rarity, charById, MAX_CHAR_LEVEL } from "./cast.js";
import { readSave, writeSave } from "./pds.js";

const LS_KEY = "inference-clicker:save";
const PDS_EVERY_MS = 60_000; // one putRecord a minute is plenty for a save file
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let state = G.loadState(localStorage.getItem(LS_KEY));
let session = null;
let lastTick = Date.now();
let lastPds = 0;
let dirtySincePds = false;
let lastPulls = []; // results of the most recent pull, shown above the roster

// --- log ---------------------------------------------------------------------

function log(text, kind = "") {
  const el = $("log");
  const d = document.createElement("div");
  if (kind) d.className = kind;
  d.textContent = `${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })} ${text}`;
  el.appendChild(d);
  while (el.children.length > 80) el.removeChild(el.firstChild);
  el.scrollTop = el.scrollHeight;
}
const logEvents = (evs) => evs.forEach((e) => log(e.text, e.kind));

function setStatus(msg, kind = "") {
  const el = $("status");
  el.textContent = msg;
  el.className = kind;
}

// --- persistence -------------------------------------------------------------

function saveLocal() {
  state.savedAt = Date.now();
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch {}
}

async function saveToPds(manual = false) {
  if (!session) return;
  try {
    await writeSave(session, G.toRecord(state));
    lastPds = Date.now();
    dirtySincePds = false;
    if (manual) setStatus("saved to your PDS", "ok");
  } catch (e) {
    setStatus(e.message || "save failed", "err");
  }
}

// Furthest-along wins: the save with more lifetime tokens is the real one.
async function syncWithPds() {
  try {
    const rec = await readSave(session);
    const remote = G.fromRecord(rec);
    if (remote && G.progress(remote) > G.progress(state)) {
      state = remote;
      saveLocal();
      log("loaded your further-along save from your PDS", "info");
      setStatus("loaded your save from your PDS", "ok");
    } else {
      await saveToPds();
      setStatus(remote ? "this device was ahead; PDS updated" : "first save written to your PDS", "ok");
    }
  } catch (e) {
    setStatus(e.message || "could not reach your PDS", "err");
  }
  renderAll(true);
}

// --- actions -----------------------------------------------------------------

const ACTIONS = {
  gpu: (id) => G.buyGpu(state, id),
  upgrade: (id) => G.buyUpgrade(state, id),
  region: (id) => G.buyRegion(state, id),
  replica: (id) => G.buyReplica(state, id),
  train: () => G.startTraining(state),
  serve: (id) => G.setServing(state, id),
  pull: (id) => {
    const res = G.pull(state, Number(id) === 10 ? 10 : 1);
    if (!res) return false;
    lastPulls = res;
    for (const r of res) {
      const c = charById(r.id);
      if (r.isNew && (c.rarity === "SR" || c.rarity === "SSR")) log(`new ${rarity(c.rarity).name} hire: ${c.name}${c.bad ? " (a baddie)" : ""}`, c.bad ? "bad" : "good");
    }
    return true;
  },
  ng: () => {
    if (!G.ngReady(state)) return false;
    if (!confirm(`Start NG+ ${state.ng + 1}? Your company resets. Your cast, trophies and pity carry over. Tokens/s ×${G.ngMult({ ng: state.ng + 1 })}, but prices +25% and outages +30% per cycle.`)) return false;
    G.ngPlus(state);
    lastPulls = [];
    log(`NG+ ${state.ng}: seed-0 is live again. the cast stays.`, "info");
    return true;
  },
};

function onPanelClick(e) {
  const b = e.target.closest("button[data-act]");
  if (!b || b.disabled) return;
  if (ACTIONS[b.dataset.act](b.dataset.id)) {
    logEvents(G.checkAchievements(state));
    dirtySincePds = true;
    renderAll(true);
  }
}

$("clickBtn").addEventListener("click", (e) => {
  const p = G.click(state);
  logEvents(G.checkAchievements(state));
  dirtySincePds = true;
  const f = document.createElement("span");
  f.className = "float";
  f.textContent = "+" + G.fmt(p);
  f.style.left = (e.clientX || window.innerWidth / 2) - 10 + "px";
  f.style.top = (e.clientY || window.innerHeight / 2) - 20 + "px";
  document.body.appendChild(f);
  setTimeout(() => f.remove(), 800);
  renderHud();
});

for (const id of ["p-fleet", "p-regions", "p-lab", "p-upgrades", "p-pulls", "p-trophies", "p-ng"]) $(id).addEventListener("click", onPanelClick);

$("tabs").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-tab]");
  if (!b) return;
  for (const t of $("tabs").querySelectorAll("button")) t.setAttribute("aria-selected", String(t === b));
  for (const name of ["fleet", "regions", "lab", "upgrades", "pulls", "trophies", "ng"]) $("p-" + name).hidden = name !== b.dataset.tab;
});

const handleValue = () => $("handle").value.trim().replace(/^@/, "").trim();

async function signIn() {
  const h = handleValue();
  if (!h) return setStatus("type your handle first", "err");
  saveLocal();
  setStatus("redirecting to your PDS…");
  try { await login(h); } catch (e) { setStatus(e.message || "sign-in failed", "err"); }
}
$("signinBtn").addEventListener("click", signIn);
$("handle").addEventListener("keydown", (e) => { if (e.key === "Enter") signIn(); });
$("saveBtn").addEventListener("click", () => { saveLocal(); saveToPds(true); });
$("signoutBtn").addEventListener("click", async () => {
  await clearSession();
  session = null;
  renderAuth();
  setStatus("signed out; progress stays on this device");
});

// --- rendering ---------------------------------------------------------------

const lastHtml = {};
// Only touch the DOM when the markup changed, so a button never gets replaced
// between pointer-down and pointer-up.
function setHtml(id, html) {
  if (lastHtml[id] === html) return;
  lastHtml[id] = html;
  $(id).innerHTML = html;
}

function btn(act, id, label, cost, extra = "") {
  const ok = state.tokens >= cost;
  return `<button class="buy" data-act="${act}" data-id="${esc(id)}" ${ok && !extra ? "" : "disabled"}>${label}<br>${G.fmt(cost)} tokens</button>`;
}

function renderFleet() {
  const total = G.GPUS.reduce((n, g) => n + G.owned(state, g.id), 0);
  const rows = [];
  for (const g of G.GPUS) {
    const have = G.owned(state, g.id);
    const cost = G.gpuCost(state, g);
    if (!have && state.lifetime < g.cost * 0.4) {
      rows.push(`<div class="row locked"><div class="t">??? </div><div class="d">keep serving to unlock</div></div>`);
      break;
    }
    const each = g.tps * G.servingModel(state).q * G.globalMult(state) * G.coverage(state);
    rows.push(`<div class="row"><div class="t"><span class="glasses" title="totally a different company">🥸</span> <b>${esc(g.name)}</b> ×${have}</div><div class="d">${esc(g.blurb)} · ${G.fmt(each)} tok/s each</div><div class="btns">${btn("gpu", g.id, "rack one", cost)}</div></div>`);
  }
  setHtml("p-fleet", rows.join("") + (total ? "" : `<div class="sub">click the big button, then rack your first T4.</div>`));
}

function renderRegions() {
  const nActive = Object.keys(state.regions).length;
  const rows = [`<div class="sub">GPUs are spread across your regions by demand. each extra region reaches +${Math.round(G.COVERAGE_PER_REGION * 100)}% more users, but an outage there takes its share of traffic offline. replicas take over a failing region ${Math.round(G.failoverChance(state) * 100)}% of the time each.</div>`];
  let shownLocked = false;
  for (const r of G.REGIONS) {
    const reg = state.regions[r.id];
    if (!reg) {
      if (shownLocked) continue;
      shownLocked = true;
      rows.push(`<div class="row locked"><div class="t"><b>${esc(r.name)}</b> <span class="badge">${esc(r.place)}</span></div><div class="d">demand ${r.weight.toFixed(1)} · incident risk ${(r.fail * 100).toFixed(2)}%/s</div><div class="btns">${btn("region", r.id, "open region", r.cost)}</div></div>`);
      continue;
    }
    const down = state.down[r.id] > 0;
    const pips = "●".repeat(reg.replicas) + "○".repeat(G.MAX_REPLICAS - reg.replicas);
    const status = down ? `<span class="badge bad">DOWN ${Math.ceil(state.down[r.id])}s</span>` : `<span class="badge on">up</span>`;
    const full = reg.replicas >= G.MAX_REPLICAS;
    rows.push(`<div class="row ${down ? "down" : ""}"><div class="t"><b>${esc(r.name)}</b> <span class="badge">${esc(r.place)}</span> ${status}</div><div class="d">demand ${r.weight.toFixed(1)} · risk ${(r.fail * 100).toFixed(2)}%/s · replicas <span class="pips">${pips}</span></div><div class="btns">${full ? `<button class="buy" disabled>replicas maxed</button>` : btn("replica", r.id, "add replica", G.replicaCost(state, r))}</div></div>`);
  }
  setHtml("p-regions", rows.join(""));
  return nActive;
}

function renderLab() {
  const gen = state.nextGen;
  const [lo, hi] = G.qualityRange(state);
  const rows = [];
  let train;
  if (state.training) {
    const t = state.training;
    const pct = Math.max(0, Math.min(100, (1 - t.remaining / t.total) * 100));
    train = `<div class="row"><div class="t"><b>training ${esc(G.modelName(t.gen))}</b> <span class="badge bad">30% of fleet busy</span></div><div class="d">${Math.ceil(Math.max(0, t.remaining))}s left<div class="bar"><i style="width:${pct.toFixed(1)}%"></i></div></div></div>`;
  } else {
    train = `<div class="row"><div class="t"><b>train ${esc(G.modelName(gen))}</b></div><div class="d">expected ≈ ${(G.trend(gen) * (lo + hi) / 2).toFixed(2)}× · could land anywhere from ${(G.trend(gen) * lo).toFixed(2)}× to ${(G.trend(gen) * hi).toFixed(2)}× · ${Math.round(G.trainingSeconds(state, gen))}s run</div><div class="btns">${btn("train", "x", "start run", G.trainingCost(gen))}</div></div>`;
  }
  rows.push(train);
  const serving = G.servingModel(state);
  const depth = G.level(state, "evals");
  rows.push(`<div class="row"><div class="t"><b>auto-serve</b> ${state.serving === "auto" ? `<span class="badge on">on</span>` : ""}</div><div class="d">${depth ? `picks the best of the latest model and ${depth} previous` : "always serves the latest model, good or bad"}</div><div class="btns"><button class="buy" data-act="serve" data-id="auto" ${state.serving === "auto" ? "disabled" : ""}>use auto</button></div></div>`);
  const maxQ = Math.max(...state.models.map((m) => m.q));
  for (const m of [...state.models].reverse()) {
    const on = serving.id === m.id;
    rows.push(`<div class="row"><div class="t"><b>${esc(m.name)}</b> ${m.q.toFixed(2)}× ${on ? `<span class="badge on">serving</span>` : ""}${m.q === maxQ ? `<span class="badge">best</span>` : ""}<div class="bar"><i style="width:${(m.q / maxQ) * 100}%"></i></div></div><div class="btns"><button class="buy" data-act="serve" data-id="${esc(m.id)}" ${state.serving === m.id ? "disabled" : ""}>pin this</button></div></div>`);
  }
  setHtml("p-lab", rows.join(""));
}

function renderUpgrades() {
  const groups = { serving: "serving", reliability: "reliability", research: "research" };
  const rows = [];
  for (const [g, title] of Object.entries(groups)) {
    rows.push(`<div class="sub">${title}</div>`);
    for (const u of G.UPGRADES.filter((x) => x.group === g)) {
      const lv = G.level(state, u.id);
      const maxed = lv >= u.max;
      rows.push(`<div class="row"><div class="t"><b>${esc(u.name)}</b> <span class="badge">lv ${lv}/${u.max}</span></div><div class="d">${esc(u.desc)}</div><div class="btns">${maxed ? `<button class="buy" disabled>maxed</button>` : btn("upgrade", u.id, "upgrade", G.upgradeCost(state, u))}</div></div>`);
    }
  }
  setHtml("p-upgrades", rows.join(""));
}

const perkText = (c) => Object.entries(c.perk).map(([k, v]) => {
  const label = { tps: "tokens/s", click: "click power", train: "training speed", fail: "outages", viral: "viral spikes" }[k];
  return `<span class="${(k === "fail") === v > 0 ? "neg" : "pos"}">${v > 0 ? "+" : "−"}${Math.round(Math.abs(v) * 100)}% ${label}</span>`;
}).join(" · ");

function castCard(c, lv, extra = "") {
  const r = rarity(c.rarity);
  return `<div class="cc ${c.bad ? "baddie" : ""} ${extra}" style="--rc:${r.color}"><pre>${esc(c.art.join("\n"))}</pre><div class="cn"><b>${esc(c.name)}</b>${c.bad ? ` <span class="badge bad">baddie</span>` : ""}</div><div class="cr">${r.id} · ${r.name}${lv ? ` · lv ${lv}/${MAX_CHAR_LEVEL}` : ""}</div><div class="cp">${perkText(c)}</div><div class="ct">“${esc(c.tag)}”</div></div>`;
}

function renderPulls() {
  const rows = [];
  const one = G.pullCost(state, 1);
  const ten = G.pullCost(state, 10);
  rows.push(`<div class="sub">pull archetypal computer people. each copy levels their perk (up to lv ${MAX_CHAR_LEVEL}). baddies pay more and break more. pity: an epic or better every ${G.SR_PITY} pulls, a legendary every ${G.SSR_PITY}. next guaranteed: epic in ${G.SR_PITY - state.pity.sr}, legendary in ${G.SSR_PITY - state.pity.ssr}.</div>`);
  rows.push(`<div class="row"><div class="t"><b>recruit</b> <span class="badge">${state.pulls} pulls</span></div><div class="d">costs about ${G.PULL_SECONDS / 60} minutes of your current output</div><div class="btns">${btn("pull", "1", "pull ×1", one)}${btn("pull", "10", "pull ×10", ten)}</div></div>`);
  if (lastPulls.length) {
    rows.push(`<div class="cast">${lastPulls.map((r) => castCard(charById(r.id), r.level, r.isNew ? "fresh" : "")).join("")}</div>`);
  }
  const have = CAST.filter((c) => state.chars[c.id]).length;
  rows.push(`<div class="sub">roster ${have}/${CAST.length}</div>`);
  const cards = [];
  for (const r of RARITIES.slice().reverse()) {
    for (const c of CAST.filter((x) => x.rarity === r.id)) {
      cards.push(state.chars[c.id] ? castCard(c, G.charLevel(state, c.id)) : `<div class="cc unk" style="--rc:${r.color}"><pre>${esc(["", "   ?????   ", "   ?????   ", "   ?????   ", "", ""].join("\n"))}</pre><div class="cn"><b>???</b></div><div class="cr">${r.id} · ${r.name}</div></div>`);
    }
  }
  rows.push(`<div class="cast">${cards.join("")}</div>`);
  setHtml("p-pulls", rows.join(""));
}

function renderTrophies() {
  const rows = [`<div class="sub">${G.achCount(state)}/${G.ACHIEVEMENTS.length} trophies · each one is +1% tokens/s (now ×${G.achMult(state).toFixed(2)})</div>`];
  for (const a of G.ACHIEVEMENTS) {
    const got = state.ach[a.id];
    rows.push(`<div class="row ${got ? "" : "locked"}"><div class="t">${got ? "🏆" : "🔒"} <b>${esc(a.name)}</b></div><div class="d">${esc(a.desc)}</div></div>`);
  }
  setHtml("p-trophies", rows.join(""));
}

function renderNg() {
  const rows = [];
  const ready = G.ngReady(state);
  const pct = Math.min(100, (state.lifetime / G.NG_THRESHOLD) * 100);
  rows.push(`<div class="sub">NG+ resets your company and keeps your cast, pity and trophies. each cycle: tokens/s and click power ×(1 + cycles), prices +25%, outages +30%.</div>`);
  rows.push(`<div class="row"><div class="t"><b>NG+ ${state.ng + 1}</b> <span class="badge ${ready ? "on" : ""}">${ready ? "ready" : "locked"}</span></div><div class="d">${ready ? `next run: ×${G.ngMult({ ng: state.ng + 1 })} tokens/s, prices +${25 * (state.ng + 1)}%, outages +${30 * (state.ng + 1)}%` : `serve ${G.fmt(G.NG_THRESHOLD)} tokens this run to unlock (${G.fmt(state.lifetime)} so far)<div class="bar"><i style="width:${pct.toFixed(1)}%"></i></div>`}</div><div class="btns"><button class="buy" data-act="ng" data-id="x" ${ready ? "" : "disabled"}>start NG+</button></div></div>`);
  rows.push(`<div class="row"><div class="t"><b>current cycle</b></div><div class="d">${state.ng ? `NG+ ${state.ng}: ×${G.ngMult(state)} tokens/s, prices +${25 * state.ng}%, outages +${30 * state.ng}%` : "NG (the first run)"}</div></div>`);
  setHtml("p-ng", rows.join(""));
}

function renderHud() {
  const rate = G.tps(state);
  const cap = G.tps(state, { ignoreEvents: true });
  $("tokens").textContent = G.fmt(state.tokens);
  $("lifetime").textContent = `${G.fmt(state.lifetime)} served all-time`;
  $("tps").textContent = G.fmt(rate);
  const notes = [];
  if (G.availability(state) < 1) notes.push(`<span class="warn">${Math.round(G.availability(state) * 100)}% of traffic reachable</span>`);
  if (state.boost > 0) notes.push("viral ×2.5");
  if (state.training) notes.push("training −30%");
  $("tpsNote").innerHTML = notes.join(" · ") || (cap ? "all regions healthy" : "");
  const m = G.servingModel(state);
  $("serving").textContent = m.name;
  document.title = state.ng ? `inference clicker NG+${state.ng}` : "inference clicker — run an inference company";
  $("servingNote").textContent = `${m.q.toFixed(2)}× quality · ${state.serving === "auto" ? "auto" : "pinned"}`;
  const gpus = G.GPUS.reduce((n, g) => n + G.owned(state, g.id), 0);
  $("fleet").textContent = `${G.fmt(gpus)} GPU${gpus === 1 ? "" : "s"}`;
  $("fleetNote").textContent = `${Object.keys(state.regions).length} region${Object.keys(state.regions).length === 1 ? "" : "s"} · ${state.stats.outages} outages`;
  $("clickNote").textContent = `+${G.fmt(G.clickPower(state))} tokens`;
}

function renderShare() {
  const gpus = G.GPUS.reduce((n, g) => n + G.owned(state, g.id), 0);
  const text = `my inference company${state.ng ? ` (NG+${state.ng})` : ""} has served ${G.fmt(state.lifetime)} tokens on ${G.fmt(gpus)} GPUs across ${Object.keys(state.regions).length} region(s), ${state.stats.outages} outages and ${state.models.length - 1} models trained, ${G.achCount(state)} trophies, ${CAST.filter((c) => state.chars[c.id]).length}/${CAST.length} cast. https://inference-clicker.bisks.net/`;
  $("shareLink").href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(text);
}

function renderAuth() {
  $("signedOut").hidden = !!session;
  $("signedIn").hidden = !session;
  if (session) $("who").textContent = session.handle;
}

function renderAll(force = false) {
  renderHud();
  renderFleet();
  renderRegions();
  renderLab();
  renderUpgrades();
  renderPulls();
  renderTrophies();
  renderNg();
  if (force) renderShare();
}

// --- loop --------------------------------------------------------------------

function tick() {
  const now = Date.now();
  const dt = (now - lastTick) / 1000;
  lastTick = now;
  if (dt > 3) {
    // tab was asleep or the app was closed: catch up at the offline rate.
    const r = G.offline(state, dt);
    if (r.seconds > 30) log(`away ${Math.round(r.seconds / 60)} min — earned ${G.fmt(r.gained)} tokens while you were gone (half rate, no clicking)`, "info");
    logEvents(r.events);
  } else {
    logEvents(G.step(state, dt));
  }
  dirtySincePds = true;
  renderAll();
}

setInterval(tick, 250);
setInterval(saveLocal, 5000);
setInterval(renderShare, 5000);
setInterval(() => { if (session && dirtySincePds && Date.now() - lastPds >= PDS_EVERY_MS) saveToPds(); }, 5000);
document.addEventListener("visibilitychange", () => { if (document.hidden) { saveLocal(); if (session && dirtySincePds) saveToPds(); } });
window.addEventListener("pagehide", saveLocal);

// --- boot --------------------------------------------------------------------

(async () => {
  // Catch up on the time between the last save and now.
  const away = (Date.now() - state.savedAt) / 1000;
  if (away > 30 && state.lifetime > 0) {
    const r = G.offline(state, away);
    log(`welcome back — ${G.fmt(r.gained)} tokens came in while you were away (half rate, up to 8h)`, "info");
    logEvents(r.events);
  } else if (state.lifetime === 0) {
    log("seed-0 is live. click to serve your first tokens.", "info");
  }
  lastTick = Date.now();
  if (window.attachHandleTypeahead) window.attachHandleTypeahead($("handle"));
  renderAuth();
  renderAll(true);
  try {
    session = (await completeLoginIfCallback()) || (await getSession());
  } catch (e) {
    setStatus(e.message || "sign-in failed", "err");
  }
  renderAuth();
  if (session) await syncWithPds();
})();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
}
