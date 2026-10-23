import { login, completeLoginIfCallback, getSession, clearSession } from "./lib/oauth.js";
import {
  REACTORS, HULLS, SKILLS, MODULES, MAX_WEIGHT, evaluate, normalizeShip, shipValue, wallet,
  stationary, yieldPerTick, holdContents, simulateDuel, duelSeed, snapshot, diffShips,
} from "./lib/engine.js";
import { SHIP, DUEL, listAll, listPilots, profiles, resolveActor, putShip, putDuel, newRkey } from "./lib/pds.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const say = (t) => { $("msg").textContent = t || ""; };

let session = null;
let fleet = [];        // [{ rkey, value }] from my PDS
let selected = null;   // rkey being edited
let draft = null;      // unsaved edits of the selected ship
let viewing = null;    // { did, handle, ships } currently open in the world tab
let duelResult = null; // last previewed duel

// ---- boot ----------------------------------------------------------------

$("title-secret").addEventListener("click", () => {
  const h = $("handle");
  h.value = "@cee.wtf";
  h.dispatchEvent(new Event("input", { bubbles: true }));
  h.dispatchEvent(new Event("change", { bubbles: true }));
  h.focus();
});
if (window.attachHandleTypeahead) {
  attachHandleTypeahead($("handle"));
  attachHandleTypeahead($("lookup"));
}

$("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const h = $("handle").value.trim().replace(/^@/, "");
  if (!h) return say("type your handle first");
  say("redirecting to your PDS…");
  try { await login(h); } catch (err) { say(`sign-in failed: ${err.message}`); }
});
$("logout").addEventListener("click", async () => {
  await clearSession();
  location.reload();
});

document.querySelectorAll("#tabs button").forEach((b) =>
  b.addEventListener("click", () => showTab(b.dataset.tab)));
function showTab(name) {
  document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === name));
  for (const t of ["hangar", "world", "log", "manual"]) $(`tab-${t}`).hidden = t !== name;
}

(async function boot() {
  try {
    session = (await completeLoginIfCallback()) || (await getSession());
  } catch (err) {
    say(err.message);
  }
  if (session) {
    $("login-form").hidden = true;
    $("whoami").hidden = false;
    $("whoami").textContent = `@${session.handle}`;
    $("logout").hidden = false;
    $("hangar-guest").hidden = true;
    $("hangar").hidden = false;
    try { await loadFleet(); } catch (err) { say(`couldn't read your fleet: ${err.message}`); }
    renderHangar();
    setInterval(updateHoldLive, 5000);
  }
})();

async function loadFleet() {
  const recs = await listAll(session.did, SHIP);
  fleet = recs.map((r) => ({ rkey: r.rkey, value: r.value }));
  if (!selected || !fleet.find((f) => f.rkey === selected)) selected = fleet.find((f) => !f.value.retired)?.rkey || null;
  draft = null;
}

// ---- hangar --------------------------------------------------------------

const activeFleet = () => fleet.filter((f) => !f.value.retired);
const currentWallet = () => wallet(fleet.map((f) => f.value));
const saved = () => fleet.find((f) => f.rkey === selected)?.value || null;
const working = () => draft || saved();

function blankShip(name) {
  const now = new Date().toISOString();
  return {
    name, hull: "frigate", reactor: "fission",
    skills: ["mine", "haul", "scan", "strike"],
    matrix: [[1, 1, 1, 0], [1, 1, 1, 0], [1, 1, 1, 1], [1, 0, 1, 1]],
    mods: [], docked: 0, dockedAt: now, createdAt: now, updatedAt: now,
  };
}

$("new-ship").addEventListener("click", async () => {
  if (!session) return;
  const n = activeFleet().length + 1;
  const rec = blankShip(`hauler-${n}`);
  if (currentWallet() - shipValue(rec) < 0) return say("not enough credits for another hull");
  try {
    say("commissioning…");
    const rkey = newRkey("s");
    await putShip(session, rkey, rec);
    fleet.push({ rkey, value: rec });
    selected = rkey; draft = null;
    say("");
    renderHangar();
  } catch (err) { say(err.message); }
});

function renderHangar() {
  $("wallet").textContent = `· ${currentWallet()} cr`;
  const f = $("fleet");
  f.innerHTML = "";
  for (const s of activeFleet()) {
    const b = document.createElement("button");
    b.className = "ship" + (s.rkey === selected ? " on" : "");
    const v = s.value;
    b.innerHTML = `${esc(v.name)}<small>${esc(v.hull)} · ${esc(v.reactor)} · <span data-hold="${esc(s.rkey)}">${holdNow(v)}</span> cr in hold</small>`;
    b.addEventListener("click", () => { selected = s.rkey; draft = null; renderHangar(); });
    f.appendChild(b);
  }
  if (!activeFleet().length) f.innerHTML = '<div class="dim">no ships yet.</div>';
  renderEditor();
}

function holdNow(v) {
  return holdContents(v, Date.parse(v.dockedAt) || Date.now(), Date.now());
}
function updateHoldLive() {
  document.querySelectorAll("[data-hold]").forEach((el) => {
    const s = fleet.find((x) => x.rkey === el.dataset.hold);
    if (s) el.textContent = holdNow(s.value);
  });
  const h = $("hold-now");
  if (h && saved()) h.textContent = holdNow(saved());
}

function renderEditor() {
  const ed = $("editor");
  const ship = working();
  if (!ship) { ed.hidden = true; return; }
  ed.hidden = false;
  const s = normalizeShip(ship);
  const ev = evaluate(s);
  const reactor = REACTORS[s.reactor], hull = HULLS[s.hull];
  const dirty = !!draft;
  const w = currentWallet() + (saved() ? shipValue(saved()) : 0) - shipValue(s);
  const errors = [...ev.errors];
  if (w < 0) errors.push(`${-w} credits short for this refit`);
  const pi = ev.ok ? stationary(s) : [];

  let html = `<h3>${esc(s.name)}</h3>
  <div class="row"><label>name <input id="f-name" value="${esc(s.name)}" maxlength="40"></label></div>
  <div class="row">
    <label>hull <select id="f-hull">${Object.entries(HULLS).map(([k, h]) => `<option value="${k}" ${k === s.hull ? "selected" : ""}>${h.label} (${h.cost} cr)</option>`).join("")}</select></label>
    <label>reactor <select id="f-reactor">${Object.entries(REACTORS).map(([k, r]) => `<option value="${k}" ${k === s.reactor ? "selected" : ""}>${r.label} · ${r.output}MW · ${r.slots} skills (${r.cost} cr)</option>`).join("")}</select></label>
  </div>`;
  if (reactor) html += `<div class="dim">${esc(reactor.label)} runs: ${reactor.tags.join(", ")}</div>`;

  const draw = ev.draw ?? 0, out = ev.output || reactor?.output || 1;
  html += `<div class="row"><span>power ${draw}/${out} MW</span></div>
    <div class="meter ${draw > out ? "over" : ""}"><i style="width:${Math.min(100, (draw / out) * 100)}%"></i></div>`;

  html += `<h3 style="margin-top:12px">skills (${s.skills.length}/${reactor?.slots ?? "?"})</h3><div class="chips" id="skill-chips">`;
  for (const [id, sk] of Object.entries(SKILLS)) {
    const on = s.skills.includes(id);
    const allowed = reactor?.tags.includes(sk.tag);
    const full = reactor && s.skills.length >= reactor.slots;
    const off = !on && (!allowed || full);
    html += `<span class="chip ${on ? "on" : ""} ${off ? "off" : ""}" data-skill="${id}" title="${esc(describeSkill(sk))}">${id} <em>${sk.tag} · ${sk.draw}MW</em></span>`;
  }
  html += `</div>`;

  html += `<h3 style="margin-top:12px">modules (${s.mods.length}/${hull?.modSlots ?? "?"})</h3><div class="chips" id="mod-chips">`;
  for (const [id, m] of Object.entries(MODULES)) {
    const on = s.mods.includes(id);
    const off = !on && hull && s.mods.length >= hull.modSlots;
    html += `<span class="chip ${on ? "on" : ""} ${off ? "off" : ""}" data-mod="${id}" title="${esc(JSON.stringify(m.add))}">${esc(m.label)} <em>${m.draw}MW · ${m.cost}cr</em></span>`;
  }
  html += `</div>`;

  if (s.skills.length) {
    html += `<h3 style="margin-top:12px">transition weights (row → next column)</h3>
    <table class="m"><tr><th></th>${s.skills.map((x) => `<th>${esc(x)}</th>`).join("")}<th>time</th></tr>`;
    s.skills.forEach((from, i) => {
      html += `<tr><th>${esc(from)}</th>${s.skills.map((_, j) => `<td><input type="number" min="0" max="${MAX_WEIGHT}" data-i="${i}" data-j="${j}" value="${s.matrix[i][j]}"></td>`).join("")}<td>${pi.length ? Math.round(pi[i] * 100) + "%" : "–"}</td></tr>`;
    });
    html += `</table>`;
  }

  if (ev.ok) {
    const st = ev.stats;
    html += `<h3 style="margin-top:12px">stat block</h3><div class="stats">
      <div>hull<b>${st.hp}</b></div><div>shield<b>${st.shield}</b></div><div>armor<b>${st.armor}</b></div>
      <div>speed<b>${st.speed}</b></div><div>accuracy<b>${Math.round(st.acc * 100)}%</b></div><div>regen<b>${st.regen}/rd</b></div>
      <div>hold<b>${st.cargo} cr</b></div><div>job yield<b>${yieldPerTick(s).toFixed(1)}/min</b></div></div>`;
  }
  if (errors.length) html += `<div class="errs">${errors.map(esc).join("<br>")}</div>`;

  const sv = saved();
  html += `<div class="row">
    <button id="f-save" class="primary" ${!ev.ok || w < 0 || !dirty ? "disabled" : ""}>save refit</button>
    <button id="f-revert" ${dirty ? "" : "disabled"}>revert</button>
    <button id="f-dock" ${sv && !dirty ? "" : "disabled"}>dock · collect <span id="hold-now">${sv ? holdNow(sv) : 0}</span> cr</button>
    <button id="f-retire" class="danger" ${sv ? "" : "disabled"}>scrap (refund ${sv ? shipValue(sv) : 0} cr)</button>
  </div>
  <div class="dim">lifetime docked: ${sv?.docked || 0} cr${dirty ? " · saving a refit banks the hold first" : ""}</div>`;
  ed.innerHTML = html;
  wireEditor();
}

function describeSkill(sk) {
  const bits = [];
  if (sk.dmg) bits.push(`${sk.hits > 1 ? sk.hits + "× " : ""}${sk.dmg} dmg${sk.pierce ? " (pierces armor)" : ""}`);
  if (sk.self) bits.push(`${sk.self} self-damage`);
  if (sk.shield) bits.push(`+${sk.shield} shield`);
  if (sk.heal) bits.push(`+${sk.heal} hp`);
  if (sk.guard) bits.push("halves next hit");
  if (sk.evade) bits.push("dodges next attack");
  if (sk.cloak) bits.push("untargetable if first");
  if (sk.aim) bits.push(`+${Math.round(sk.aim * 100)}% aim`);
  if (sk.yield) bits.push(`${sk.yield} cr/min on a job`);
  return bits.join(", ") || sk.tag;
}

function edit(fn) {
  const cur = normalizeShip(working());
  const next = { ...cur };
  fn(next);
  // keep the matrix square and in sync with the skill list
  const old = normalizeShip(working());
  next.matrix = next.skills.map((a) => next.skills.map((b) => {
    const i = old.skills.indexOf(a), j = old.skills.indexOf(b);
    return i >= 0 && j >= 0 ? old.matrix[i][j] : 1;
  }));
  draft = next;
  renderEditor();
}

function wireEditor() {
  $("f-name").addEventListener("change", (e) => edit((n) => { n.name = e.target.value.trim() || "unnamed"; }));
  $("f-hull").addEventListener("change", (e) => edit((n) => { n.hull = e.target.value; }));
  $("f-reactor").addEventListener("change", (e) => edit((n) => { n.reactor = e.target.value; }));
  document.querySelectorAll("[data-skill]").forEach((c) => c.addEventListener("click", () => {
    if (c.classList.contains("off")) return;
    const id = c.dataset.skill;
    edit((n) => { n.skills = n.skills.includes(id) ? n.skills.filter((x) => x !== id) : [...n.skills, id]; });
  }));
  document.querySelectorAll("[data-mod]").forEach((c) => c.addEventListener("click", () => {
    if (c.classList.contains("off")) return;
    const id = c.dataset.mod;
    edit((n) => { n.mods = n.mods.includes(id) ? n.mods.filter((x) => x !== id) : [...n.mods, id]; });
  }));
  document.querySelectorAll(".m input").forEach((inp) => inp.addEventListener("change", () => {
    const i = +inp.dataset.i, j = +inp.dataset.j;
    const v = Math.max(0, Math.min(MAX_WEIGHT, Math.round(+inp.value || 0)));
    edit((n) => { n.matrix = n.matrix.map((r) => r.slice()); n.matrix[i][j] = v; });
    // edit() rebuilds the matrix from the old one, so apply the cell after
    const d = normalizeShip(draft); d.matrix[i][j] = v; draft = d; renderEditor();
  }));
  $("f-revert").addEventListener("click", () => { draft = null; renderEditor(); });
  $("f-save").addEventListener("click", saveRefit);
  $("f-dock").addEventListener("click", dock);
  $("f-retire").addEventListener("click", retire);
}

async function saveRefit() {
  const old = saved();
  const s = normalizeShip(draft);
  const now = new Date();
  const rec = {
    ...s,
    docked: (old.docked || 0) + holdNow(old), // bank the hold earned under the old build
    dockedAt: now.toISOString(),
    createdAt: old.createdAt, updatedAt: now.toISOString(),
  };
  if (!evaluate(rec).ok) return say("that build doesn't check out");
  try {
    say("saving…");
    await putShip(session, selected, rec);
    fleet = fleet.map((f) => (f.rkey === selected ? { rkey: f.rkey, value: rec } : f));
    draft = null; say("refit saved");
    renderHangar();
  } catch (err) { say(err.message); }
}

async function dock() {
  const old = saved();
  const now = new Date().toISOString();
  const rec = { ...old, docked: (old.docked || 0) + holdNow(old), dockedAt: now };
  try {
    await putShip(session, selected, rec);
    fleet = fleet.map((f) => (f.rkey === selected ? { rkey: f.rkey, value: rec } : f));
    say(`docked: +${rec.docked - (old.docked || 0)} cr`);
    renderHangar();
  } catch (err) { say(err.message); }
}

async function retire() {
  if (!confirm("Scrap this ship? You get its build cost back; its lifetime earnings stay in your wallet.")) return;
  const old = saved();
  const rec = { ...old, docked: (old.docked || 0) + holdNow(old), dockedAt: new Date().toISOString(), retired: true, updatedAt: new Date().toISOString() };
  try {
    await putShip(session, selected, rec);
    fleet = fleet.map((f) => (f.rkey === selected ? { rkey: f.rkey, value: rec } : f));
    selected = activeFleet()[0]?.rkey || null; draft = null;
    renderHangar();
  } catch (err) { say(err.message); }
}

// ---- world: lazy-loaded pilots, diffed against what we last saw ----------

const seenKey = (did) => `skillchain:seen:${did}`;
const loadSeen = (did) => { try { return JSON.parse(localStorage.getItem(seenKey(did))) || {}; } catch { return {}; } };

$("scan-world").addEventListener("click", async () => {
  $("world-status").textContent = "listing pilots…";
  try {
    const dids = await listPilots(SHIP, (n) => { $("world-status").textContent = `${n} repos…`; });
    const profs = await profiles(dids);
    $("world-status").textContent = `${dids.length} pilot${dids.length === 1 ? "" : "s"} in the sector`;
    $("pilots").innerHTML = profs.map((p) => `<button class="ship" data-did="${esc(p.did)}">${esc(p.displayName || p.handle)} <small>@${esc(p.handle)}</small></button>`).join("");
    $("pilots").querySelectorAll("[data-did]").forEach((b) => b.addEventListener("click", () => openPilot(b.dataset.did)));
  } catch (err) { $("world-status").textContent = err.message; }
});
const doLookup = async () => {
  const v = $("lookup").value.trim().replace(/^@/, "");
  if (!v) return;
  try { await openPilot(await resolveActor(v)); } catch (err) { $("world-status").textContent = `couldn't find ${v}: ${err.message}`; }
};
$("lookup-go").addEventListener("click", doLookup);
$("lookup").addEventListener("keydown", (e) => { if (e.key === "Enter") doLookup(); });

async function openPilot(did) {
  const pv = $("pilot-view");
  pv.innerHTML = '<div class="panel dim">fetching records…</div>';
  duelResult = null;
  try {
    const [recs, [prof]] = await Promise.all([listAll(did, SHIP), profiles([did])]);
    viewing = { did, handle: prof.handle, ships: recs.filter((r) => !r.value.retired) };
    renderPilot();
  } catch (err) { pv.innerHTML = `<div class="panel errs">${esc(err.message)}</div>`; }
}

function statLine(ship) {
  const ev = evaluate(ship);
  if (!ev.ok) return `<span class="errs">invalid build: ${esc(ev.errors[0])}</span>`;
  const st = ev.stats;
  return `hp ${st.hp} · sh ${st.shield} · ar ${st.armor} · spd ${st.speed} · acc ${Math.round(st.acc * 100)}%`;
}

function renderPilot() {
  const pv = $("pilot-view");
  const seen = loadSeen(viewing.did);
  const mine = activeFleet();
  const self = session && session.did === viewing.did;
  let html = `<div class="panel"><h3>@${esc(viewing.handle)} — ${viewing.ships.length} ship${viewing.ships.length === 1 ? "" : "s"}</h3>`;
  for (const r of viewing.ships) {
    const prev = seen[r.rkey];
    const changes = diffShips(prev, r.value);
    const stale = prev && changes.length === 0;
    html += `<div class="panel"><b>${esc(r.value.name)}</b> <span class="dim">${esc(r.value.hull)} · ${esc(r.value.reactor)} · ${r.value.skills.length} skills</span>
      <div class="dim">${statLine(r.value)}</div>
      <div class="dim">chain: ${esc(r.value.skills.join(" · "))}${r.value.mods?.length ? " | " + esc(r.value.mods.join(", ")) : ""}</div>
      ${stale ? '<div class="dim">unchanged since you last looked</div>' : `<div class="diff">${changes.map((c) => "Δ " + esc(c)).join("<br>")}</div>`}
      ${!self && session ? `<div class="row"><button data-fight="${esc(r.rkey)}" ${mine.length ? "" : "disabled"}>simulate a duel</button></div>` : ""}
    </div>`;
  }
  if (!viewing.ships.length) html += '<div class="dim">no active ships.</div>';
  html += `<div class="row"><button id="mark-seen">mark as seen</button><span class="dim">remembers this version so the next visit only shows what changed</span></div></div>`;
  html += `<div id="duel-panel"></div>`;
  pv.innerHTML = html;
  $("mark-seen").addEventListener("click", () => {
    const m = {};
    for (const r of viewing.ships) m[r.rkey] = r.value;
    localStorage.setItem(seenKey(viewing.did), JSON.stringify(m));
    renderPilot();
  });
  pv.querySelectorAll("[data-fight]").forEach((b) => b.addEventListener("click", () => openDuelPicker(b.dataset.fight)));
  if (duelResult) renderDuel();
}

function openDuelPicker(theirRkey) {
  const target = viewing.ships.find((r) => r.rkey === theirRkey);
  const mine = activeFleet().filter((f) => evaluate(f.value).ok);
  const dp = $("duel-panel");
  if (!mine.length) { dp.innerHTML = '<div class="panel errs">you need a valid ship first.</div>'; return; }
  dp.innerHTML = `<div class="panel"><h3>duel vs ${esc(target.value.name)}</h3><div class="row">
    <label>your ship <select id="my-pick">${mine.map((f) => `<option value="${esc(f.rkey)}" ${f.rkey === selected ? "selected" : ""}>${esc(f.value.name)}</option>`).join("")}</select></label>
    <button id="run-duel" class="primary">simulate</button></div><div id="duel-out"></div></div>`;
  $("run-duel").addEventListener("click", () => {
    const mineRec = mine.find((f) => f.rkey === $("my-pick").value);
    const a = snapshot(mineRec.value), b = snapshot(target.value);
    const res = simulateDuel(a, b);
    duelResult = { a, b, res, theirRkey, myRkey: mineRec.rkey };
    renderDuel();
  });
}

function renderDuel() {
  const dp = $("duel-panel");
  const { a, b, res } = duelResult;
  const verdict = res.winner === "a" ? `<span class="ok">${esc(a.name)} wins</span>` : res.winner === "b" ? `<b>${esc(b.name)} wins</b>` : "draw";
  const text = `${a.name} vs ${b.name} on skillchain: ${res.winner === "a" ? "won" : res.winner === "b" ? "lost" : "drew"} in ${res.rounds} rounds`;
  const intent = `https://bsky.app/intent/compose?text=${encodeURIComponent(text + "\nhttps://skillchain.bisks.net/")}`;
  dp.innerHTML = `<div class="panel"><h3>${esc(a.name)} vs ${esc(b.name)}</h3>
    <p>${verdict} after ${res.rounds} rounds · hull left ${res.hp[0]} / ${res.hp[1]}</p>
    <div class="log">${res.log.map(esc).join("\n")}</div>
    <div class="row">
      <button id="commit-duel" class="primary">record this duel in my repo</button>
      <a href="${intent}" target="_blank" rel="noopener">post it to bluesky</a>
    </div><div class="dim">The duel record embeds both builds as snapshots; anyone can re-run it and get this same result.</div></div>`;
  $("commit-duel").addEventListener("click", async () => {
    try {
      await putDuel(session, newRkey("d"), {
        defender: viewing.did, defenderRkey: duelResult.theirRkey,
        attackerShip: duelResult.a, defenderShip: duelResult.b,
        seed: res.seed, winner: res.winner, rounds: res.rounds, createdAt: new Date().toISOString(),
      });
      say("duel recorded in your repo");
      $("commit-duel").disabled = true;
    } catch (err) { say(err.message); }
  });
}

// ---- duels & ladder ------------------------------------------------------

function verifyDuel(did, rec) {
  const v = rec.value;
  if (!v?.attackerShip || !v?.defenderShip || v.defender === did) return null;
  const sim = simulateDuel(v.attackerShip, v.defenderShip);
  if (sim.winner === null || sim.winner !== v.winner) return null;
  return sim;
}

$("sync-log").addEventListener("click", async () => {
  const st = $("log-status");
  st.textContent = "finding duelists…";
  try {
    const dids = await listPilots(DUEL);
    const all = [];
    let done = 0;
    const queue = dids.slice();
    // 6 repos in flight at once keeps a big world from stalling the tab on sockets
    await Promise.all(Array.from({ length: 6 }, async () => {
      while (queue.length) {
        const did = queue.shift();
        try {
          for (const r of await listAll(did, DUEL)) {
            const sim = verifyDuel(did, r);
            if (sim) all.push({ attacker: did, rkey: r.rkey, v: r.value, sim });
          }
        } catch {}
        st.textContent = `read ${++done}/${dids.length} repos…`;
      }
    }));
    const tally = new Map();
    const bump = (d, k) => { const t = tally.get(d) || { w: 0, l: 0, d: 0 }; t[k]++; tally.set(d, t); };
    for (const x of all) {
      const df = x.v.defender;
      if (x.v.winner === "a") { bump(x.attacker, "w"); bump(df, "l"); }
      else if (x.v.winner === "b") { bump(x.attacker, "l"); bump(df, "w"); }
      else { bump(x.attacker, "d"); bump(df, "d"); }
    }
    const rows = [...tally.entries()].sort((p, q) => (q[1].w - q[1].l) - (p[1].w - p[1].l));
    const profs = await profiles(rows.map((r) => r[0]));
    $("ladder").innerHTML = rows.length
      ? `<table class="t"><tr><th>pilot</th><th>W</th><th>L</th><th>D</th></tr>${rows.map(([d, t], i) => `<tr><td>@${esc(profs[i].handle)}</td><td>${t.w}</td><td>${t.l}</td><td>${t.d}</td></tr>`).join("")}</table>`
      : "no verified duels yet — be the first.";
    const mine = session ? all.filter((x) => x.v.defender === session.did) : [];
    const ap = await profiles([...new Set(mine.map((x) => x.attacker))]);
    const handle = new Map(ap.map((p) => [p.did, p.handle]));
    $("incoming").innerHTML = session
      ? `<h3>challenges against you</h3>` + (mine.length
        ? `<table class="t">${mine.sort((p, q) => (q.v.createdAt > p.v.createdAt ? 1 : -1)).map((x) => `<tr><td>@${esc(handle.get(x.attacker))}'s ${esc(x.v.attackerShip.name)}</td><td>vs your ${esc(x.v.defenderShip.name)}</td><td>${x.v.winner === "b" ? '<span class="ok">you won</span>' : x.v.winner === "a" ? "you lost" : "draw"}</td><td class="dim">${esc(x.v.createdAt.slice(0, 10))}</td></tr>`).join("")}</table>`
        : '<div class="dim">nobody has challenged you yet.</div>')
      : '<div class="dim">sign in to see challenges against your ships.</div>';
    st.textContent = `${all.length} verified duel${all.length === 1 ? "" : "s"} from ${dids.length} repos`;
  } catch (err) { st.textContent = err.message; }
});
