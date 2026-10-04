// app.js — UI + persistence for bailiwick. All game rules live in engine.js.
// Save = one record, net.bisks.bailiwick.manor/self, in the player's own PDS
// (putRecord via lib/oauth.js's DPoP session). Guests get the same state in
// localStorage. Reads of the record are public (getRecord needs no login).

import { login, getSession, clearSession, completeLoginIfCallback, dpopFetch } from "./lib/oauth.js";
import {
  newState, dayPlan, dateOf, resolve, endDay, buy, sellGrain, grainPrice, collectDues, retire, previewFor,
  stakes, idleRate, improvementCost, skillNeed, skillBonus, omenOf, shareText,
  findMatter, diceLeft, MAX_WEARY,
} from "./engine.js";
import { SKILLS, RISK_NAMES, BAND_NAMES, IMPROVEMENTS } from "./content.js";

const COLLECTION = "net.bisks.bailiwick.manor";
const LOCAL_KEY = "bailiwick:save:v1";
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const randSeed = () => crypto.getRandomValues(new Uint32Array(1))[0];

const el = {
  who: $("who"), saveState: $("save-state"), intro: $("intro"), game: $("game"), handle: $("handle-input"),
  loginBtn: $("login-btn"), guestBtn: $("guest-btn"), status: $("status"), logout: $("logout-btn"),
  stats: $("stats"), dice: $("dice"), diceHint: $("dice-hint"), push: $("push-box"), result: $("result"),
  matters: $("matters"), standing: $("standing"), endDay: $("end-day"), imps: $("improvements"), market: $("market"),
  dues: $("dues-line"), journal: $("journal"), skills: $("skills"), chronicle: $("chronicle"), share: $("share-btn"),
  retire: $("retire-btn"), signin: $("signin-btn"),
};
if (window.attachHandleTypeahead) window.attachHandleTypeahead(el.handle);

let session = null;
let S = null; // the game state (engine.js shape)
let selDie = null; // index into today's dice
let lastResult = null; // { title, result } shown above the matters until the next action
let tab = "today";

function setStatus(msg, isErr) {
  el.status.textContent = msg || "";
  el.status.classList.toggle("error", !!isErr);
}
function toast(msg) {
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

// ---- persistence -------------------------------------------------------------

function setSave(msg, err) {
  el.saveState.textContent = msg;
  el.saveState.classList.toggle("err", !!err);
}

function loadLocal() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function fetchRemote() {
  const pds = session.pdsUrl.replace(/\/$/, "");
  const url = `${pds}/xrpc/com.atproto.repo.getRecord?repo=${encodeURIComponent(session.did)}&collection=${COLLECTION}&rkey=self`;
  let res = await fetch(url).catch(() => null);
  if (!res) res = await dpopFetch(session, url); // PDS without CORS on public reads
  if (res.status === 404 || res.status === 400) return null; // RecordNotFound
  if (!res.ok) throw new Error(`couldn't read your save (${res.status})`);
  const data = await res.json();
  return data.value && data.value.state ? data.value.state : null;
}

async function pushRemote() {
  const pds = session.pdsUrl.replace(/\/$/, "");
  const res = await dpopFetch(session, `${pds}/xrpc/com.atproto.repo.putRecord`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      repo: session.did,
      collection: COLLECTION,
      rkey: "self",
      validate: false, // custom lexicon, not published
      record: { $type: COLLECTION, v: 1, savedAt: new Date().toISOString(), state: S },
    }),
  });
  if (!res.ok) throw new Error(`save failed (${res.status})`);
}

let saveTimer = null;
let saving = false;
let dirty = false;
function save() {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(S)); } catch {}
  if (!session) { setSave("saved in this browser"); return; }
  dirty = true;
  setSave("saving…");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 700);
}
async function flush() {
  if (saving) { saveTimer = setTimeout(flush, 400); return; }
  saving = true;
  dirty = false;
  try {
    await pushRemote();
    setSave(dirty ? "saving…" : "saved to your PDS");
  } catch (e) {
    dirty = true;
    setSave("not saved yet — will retry (" + (e.message || e) + ")", true);
    saveTimer = setTimeout(flush, 8000);
  }
  saving = false;
}

// ---- rendering ---------------------------------------------------------------

function meter(pct, warn) {
  return `<div class="meter${warn ? " warn" : ""}"><i style="width:${Math.max(0, Math.min(100, pct))}%"></i></div>`;
}

function renderStats() {
  el.stats.innerHTML = [
    `<div class="stat"><div class="k">strongbox</div><div class="v">${S.coin}d</div></div>`,
    `<div class="stat"><div class="k">grain</div><div class="v">${S.grain}</div></div>`,
    `<div class="stat"><div class="k">lord's favour</div><div class="v">${S.favor}</div>${meter(S.favor)}</div>`,
    `<div class="stat"><div class="k">folk goodwill</div><div class="v">${S.folk}</div>${meter(S.folk)}</div>`,
    `<div class="stat"><div class="k">weariness</div><div class="v">${S.weary}<span class="fine">/${MAX_WEARY}</span></div>${meter((S.weary / MAX_WEARY) * 100, S.weary >= 4)}</div>`,
  ].join("");
}

function matterCard(plan, m, standing) {
  const done = S.today.done.find((d) => d.k === m.key);
  const showDone = done && !standing;
  const skill = SKILLS[m.skill];
  const bonus = skillBonus(S, m.skill);
  const chips = `<div class="chips"><span class="chip">${skill.name}${bonus ? " +" + bonus : ""}</span><span class="chip risk-${m.risk}">${RISK_NAMES[m.risk]}</span></div>`;
  if (showDone) {
    return `<div class="card m-done b${done.b}"><div class="m-head"><span class="m-title">${esc(m.title)}</span><span class="band">${BAND_NAMES[done.b]} · ${done.v}</span></div><div class="m-text">${esc(m.out[done.b].t)}</div></div>`;
  }
  let act;
  if (selDie === null) {
    act = `<span class="preview">pick a die above</span>`;
  } else {
    const p = previewFor(S, m, plan.dice[selDie], el.push.checked);
    act = `<span class="preview">${plan.dice[selDie]}${p.bonus ? " + " + p.bonus : ""}${el.push.checked ? " + 1" : ""} = ${p.eff} → ${BAND_NAMES[p.band]}</span>` +
      `<button class="btn primary" data-act="take" data-key="${esc(m.key)}">${standing ? "do it" : "take it on"}</button>`;
  }
  return `<div class="card"><div class="m-head"><span class="m-title">${esc(m.title)}</span>${chips}</div><div class="m-text">${esc(m.text)}</div><div class="row">${act}</div></div>`;
}

function renderToday() {
  const plan = dayPlan(S);
  const left = diceLeft(S, plan);
  if (selDie !== null && !left.some((d) => d.i === selDie)) selDie = null;
  el.dice.innerHTML = plan.dice
    .map((v, i) => {
      const used = S.today.used.includes(i);
      return `<button class="die${selDie === i ? " sel" : ""}" data-die="${i}" ${used ? "disabled" : ""} aria-label="die showing ${v}">${v}</button>`;
    })
    .join("");
  el.diceHint.textContent = left.length
    ? `${left.length} of ${plan.dice.length} dice left. Choose a die, then a matter. Each skill point pair adds +1 to the die; a push adds another.`
    : `All ${plan.dice.length} dice are spent. Sunset whenever you're ready.`;
  if (lastResult) {
    const r = lastResult.result;
    const fx = [];
    if (r.fx.c) fx.push(`${r.fx.c > 0 ? "+" : ""}${r.fx.c}d`);
    if (r.fx.g) fx.push(`${r.fx.g > 0 ? "+" : ""}${r.fx.g} grain`);
    if (r.fx.l) fx.push(`${r.fx.l > 0 ? "+" : ""}${r.fx.l} lord's favour`);
    if (r.fx.f) fx.push(`${r.fx.f > 0 ? "+" : ""}${r.fx.f} folk goodwill`);
    if (r.fx.w) fx.push(`${r.fx.w > 0 ? "+" : ""}${r.fx.w} weariness`);
    el.result.hidden = false;
    el.result.innerHTML = `<div class="band">${BAND_NAMES[r.band]} — die ${r.dieVal}${r.bonus ? " + " + r.bonus : ""}${r.push ? " + push" : ""} = ${r.eff}</div><div class="m-title">${esc(lastResult.title)}</div><p>${esc(r.text)}</p><div class="fxline">${fx.join(" · ") || "no change"}${r.levelUp ? ` · ${SKILLS[r.levelUp.skill].name} rises to ${r.levelUp.level}` : ""}</div>`;
  } else {
    el.result.hidden = true;
  }
  el.matters.innerHTML = plan.matters.map((m) => matterCard(plan, m, false)).join("");
  el.standing.innerHTML = plan.standing.map((m) => matterCard(plan, m, true)).join("");
}

function renderEstate() {
  el.dues.innerHTML = `Tenants pay in even while you're away: <b>${idleRate(S)}d per idle hour</b> (more with a mill, alehouse or bridge). Strongbox stakes are ×${stakes(S)} on every matter.`;
  el.imps.innerHTML = IMPROVEMENTS.map((i) => {
    const lvl = S.imp[i.id];
    const cost = improvementCost(i.id, lvl);
    return `<div class="imp"><div class="em">${i.emoji}</div><div><div class="nm">${esc(i.name)}<span class="lv">level ${lvl}</span></div><div class="fine">${esc(i.blurb)}</div></div><button class="btn${S.coin >= cost ? " primary" : ""}" data-act="buy" data-id="${i.id}" ${S.coin >= cost ? "" : "disabled"}>${lvl ? "improve" : "build"} · ${cost}d</button></div>`;
  }).join("");
  const price = grainPrice(S);
  el.market.innerHTML = `<b>The market</b> <span class="fine">grain fetches ${price}d a bushel just now</span><div class="row"><button class="btn" data-act="sell" data-n="10" ${S.grain < 1 ? "disabled" : ""}>sell 10</button><button class="btn" data-act="sell" data-n="${S.grain}" ${S.grain < 1 ? "disabled" : ""}>sell all ${S.grain}</button></div>`;
}

function renderJournal() {
  el.journal.innerHTML = S.journal.slice().reverse()
    .map((j) => `<li><span class="jd">${esc(dateOf(j.d).label)}</span>${esc(j.t)}</li>`).join("");
}

function renderYou() {
  el.skills.innerHTML = `<b>Your skills</b> <span class="fine">(they travel with you to every manor)</span>` +
    Object.entries(SKILLS).map(([k, sk]) => {
      const s = S.skills[k];
      return `<div class="skillrow"><div><b>${sk.name}</b> ${s.l}</div><div>${meter((s.x / skillNeed(s.l)) * 100)}<div class="fine">${esc(sk.blurb)} · ${s.x}/${skillNeed(s.l)} to next${skillBonus(S, k) ? ` · adds +${skillBonus(S, k)} to dice` : ""}</div></div></div>`;
    }).join("") +
    `<div class="fine">Matters settled: ${S.totals.matters} · good days: ${S.totals.great} · setbacks: ${S.totals.setbacks} · days worked: ${S.totals.days}</div>`;
  el.chronicle.innerHTML = `<b>Chronicle</b>` + (S.chronicle.length
    ? S.chronicle.slice().reverse().map((c) => `<div class="fine">Run ${c.run}: ${esc(c.name)} for ${esc(c.lord)} — ${c.days} days, ${c.prosperity} improvements, folk ${c.folk}, favour ${c.favor} (left ${esc(c.ended)})</div>`).join("")
    : `<div class="fine">No manors handed on yet. This is run ${S.run}: ${esc(S.manor.name)}.</div>`);
  el.share.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(shareText(S));
  el.retire.textContent = "hand the manor on & start a new one";
}

function render() {
  const plan = dayPlan(S);
  const omen = omenOf(S);
  $("manor-name").textContent = S.manor.name;
  $("date-line").textContent = `${plan.date.label} · ${plan.date.feast ? plan.date.feast.name + " · " : ""}day ${S.day + 1} of run ${S.run}`;
  $("weather-line").textContent = `${plan.date.seasonName}: ${plan.weatherText}`;
  $("omen-line").innerHTML = `<b>${esc(omen.name)}.</b> ${esc(omen.blurb.replace("{lord}", S.manor.lord))}<br>Lord: ${esc(S.manor.lord)} · ${esc(S.manor.reeve)}`;
  renderStats();
  renderToday();
  renderEstate();
  renderJournal();
  renderYou();
  document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("on", b.dataset.tab === tab));
  document.querySelectorAll("[data-panel]").forEach((p) => { p.hidden = p.dataset.panel !== tab; });
}

// ---- events -----------------------------------------------------------------

el.dice.addEventListener("click", (e) => {
  const b = e.target.closest("[data-die]");
  if (!b || b.disabled) return;
  const i = Number(b.dataset.die);
  selDie = selDie === i ? null : i;
  renderToday();
});
el.push.addEventListener("change", renderToday);

function onTake(key) {
  if (selDie === null) return;
  const plan = dayPlan(S);
  const m = findMatter(plan, key);
  const r = resolve(S, key, selDie, el.push.checked);
  if (r.error) { toast(r.error); return; }
  S = r.state;
  lastResult = { title: m.title, result: r.result };
  selDie = null;
  el.push.checked = false;
  save();
  render();
}
el.game.addEventListener("click", (e) => {
  const b = e.target.closest("[data-act]");
  if (!b || b.disabled) return;
  const act = b.dataset.act;
  if (act === "take") onTake(b.dataset.key);
  else if (act === "buy") {
    const r = buy(S, b.dataset.id);
    if (r.error) { toast(r.error); return; }
    S = r.state;
    save();
    render();
  } else if (act === "sell") {
    const r = sellGrain(S, Number(b.dataset.n));
    if (r.error) { toast(r.error); return; }
    S = r.state;
    toast(`sold ${r.n} bushels for ${r.got}d`);
    save();
    render();
  }
});

el.endDay.addEventListener("click", () => {
  const plan = dayPlan(S);
  const left = diceLeft(S, plan).length;
  if (left && !confirm(`${left} ${left === 1 ? "die is" : "dice are"} unspent. End the day anyway?`)) return;
  const r = endDay(S);
  S = r.state;
  lastResult = null;
  selDie = null;
  tab = "today";
  toast(`sunset — the estate earned ${r.pence}d`);
  save();
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
});

document.querySelector(".tabs").addEventListener("click", (e) => {
  const b = e.target.closest("[data-tab]");
  if (!b) return;
  tab = b.dataset.tab;
  render();
});

el.retire.addEventListener("click", () => {
  if (!confirm(`Hand ${S.manor.name} on and take up a new manor? You keep your skills and a quarter of your savings; the rest stays with the old village.`)) return;
  S = retire(S, randSeed());
  lastResult = null;
  selDie = null;
  tab = "today";
  save();
  render();
  toast(`welcome to ${S.manor.name}`);
});

// handle input: strip a leading @ and whitespace
el.loginBtn.addEventListener("click", async () => {
  const h = el.handle.value.trim().replace(/^@/, "");
  if (!h) { setStatus("type your handle first", true); return; }
  el.loginBtn.disabled = true;
  setStatus("redirecting to your PDS…");
  try {
    if (S) localStorage.setItem(LOCAL_KEY, JSON.stringify(S));
    await login(h); // navigates away on success
  } catch (e) {
    setStatus(e.message || String(e), true);
    el.loginBtn.disabled = false;
  }
});
el.handle.addEventListener("keydown", (e) => { if (e.key === "Enter") el.loginBtn.click(); });
el.guestBtn.addEventListener("click", () => {
  S = newState(randSeed());
  enter();
});
el.signin.addEventListener("click", () => {
  // back to the sign-in card; the guest game is already in localStorage and is adopted if the PDS has no save yet
  el.game.hidden = true;
  el.intro.hidden = false;
  el.handle.focus();
});
el.logout.addEventListener("click", async () => {
  await clearSession();
  session = null;
  location.reload();
});

function enter() {
  el.intro.hidden = true;
  el.game.hidden = false;
  el.logout.hidden = !session;
  el.signin.hidden = !!session;
  el.who.textContent = session ? "@" + session.handle : "playing as a guest";
  const dues = collectDues(S, Date.now());
  S = dues.state;
  if (dues.hours) toast(`${dues.hours}h away: the tenants left ${dues.pence}d in the strongbox`);
  save();
  render();
}

// dues keep arriving while the page stays open
setInterval(() => {
  if (!S) return;
  const d = collectDues(S, Date.now());
  if (d.hours) {
    S = d.state;
    toast(`the tenants left ${d.pence}d in the strongbox`);
    save();
    render();
  }
}, 60000);

async function boot() {
  try {
    const cb = await completeLoginIfCallback();
    if (cb) session = cb;
  } catch (e) {
    setStatus(e.message || String(e), true);
  }
  if (!session) session = await getSession();
  const local = loadLocal();
  if (session) {
    setStatus("reading your manor from your PDS…");
    el.intro.hidden = false;
    try {
      const remote = await fetchRemote();
      // the PDS copy is the truth; a browser-only game is adopted only when the PDS has none yet
      S = remote || local || newState(randSeed());
    } catch (e) {
      setStatus(e.message || String(e), true);
      return;
    }
    setStatus("");
    enter();
  } else if (local) {
    S = local;
    enter();
  }
}
boot();
