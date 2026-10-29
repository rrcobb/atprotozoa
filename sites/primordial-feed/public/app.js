// The Primordial Feed — browser half. Jetstream posts become organisms in the
// Tank (sim.js). Everything runs client-side; the only persistence is a small
// "history" record in localStorage.
import { Tank, W, H, GW, GH, NUT, HUES, hueOf, fmt } from "./sim.js";

const JETSTREAM = "wss://jetstream2.us-east.bsky.network/subscribe?wantedCollections=app.bsky.feed.post";
const $ = (id) => document.getElementById(id);
const canvas = $("tank"), ctx = canvas.getContext("2d");
const tank = new Tank();
const STORE = "primordial-feed:v1";
let selected = null;
let seen = 0, admittedCount = 0, lastAdmit = 0, connText = "connecting…";

// ---- history (localStorage) ----
const hist = (() => {
  try { return JSON.parse(localStorage.getItem(STORE)) || null; } catch { return null; }
})() || { visits: 0, born: 0, died: {}, fossils: [] };
hist.visits++;
function saveHist() { try { localStorage.setItem(STORE, JSON.stringify(hist)); } catch {} }

tank.onDeath = (o) => {
  hist.died[o.cause] = (hist.died[o.cause] || 0) + 1;
  if (!o.descendant) {
    const life = tank.t - o.born;
    hist.fossils.push({ text: o.post.text.slice(0, 200), url: o.post.url, life: Math.round(life), cause: o.cause, kids: o.children });
    hist.fossils.sort((a, b) => b.life - a.life);
    hist.fossils.length = Math.min(hist.fossils.length, 25); // keeps the stored record small
    if (life > 300) tank.log(`A ${o.diet} that lived ${fmt(life)} has died of ${o.cause}.`);
  }
  if (o === selected) renderOrganism();
};

// ---- jetstream ----
function connect() {
  const ws = new WebSocket(JETSTREAM);
  ws.onopen = () => { connText = "listening to the firehose"; updateStrip(); };
  ws.onclose = () => { connText = "reconnecting…"; updateStrip(); setTimeout(connect, 2000); };
  ws.onerror = () => ws.close();
  ws.onmessage = (ev) => {
    let m; try { m = JSON.parse(ev.data); } catch { return; }
    if (m.kind !== "commit" || m.commit?.operation !== "create" || m.commit.collection !== "app.bsky.feed.post") return;
    seen++;
    const r = m.commit.record;
    if (!r || typeof r.text !== "string" || r.text.length < 25) return;
    if (r.langs && r.langs.length && !r.langs.includes("en")) return;
    // Pacing: the firehose is hundreds of posts a second; a tank that took them
    // all would be soup. One arrival per 350ms is what the tank can show readably.
    const now = performance.now();
    if (now - lastAdmit < 350) return;
    lastAdmit = now;
    const o = tank.admit({
      text: r.text, isReply: !!r.reply, hasEmbed: !!r.embed,
      did: m.did, url: `https://bsky.app/profile/${m.did}/post/${m.commit.rkey}`,
    });
    if (o) { admittedCount++; o.fresh = 1; }
  };
}
connect();

// ---- canvas ----
let dpr = 1, cw = 0, ch = 0, sc = 1, ox = 0, oy = 0;
function resize() {
  const r = canvas.parentElement.getBoundingClientRect();
  dpr = Math.min(2, window.devicePixelRatio || 1);
  cw = r.width; ch = r.height;
  canvas.width = Math.max(1, cw * dpr); canvas.height = Math.max(1, ch * dpr);
  sc = Math.min(cw / W, ch / H);
  ox = (cw - W * sc) / 2; oy = (ch - H * sc) / 2;
}
addEventListener("resize", resize); resize();

function draw() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#04080c"; ctx.fillRect(0, 0, cw, ch);
  ctx.save(); ctx.translate(ox, oy); ctx.scale(sc, sc);
  ctx.fillStyle = "#06100f"; ctx.fillRect(0, 0, W, H);
  // nutrient broth
  const cwid = W / GW, chei = H / GH;
  for (let c = 0; c < tank.food.length; c++) {
    const f = tank.food[c];
    for (let k = 0; k < NUT; k++) {
      ctx.fillStyle = `hsla(${HUES[k]},70%,50%,${Math.min(0.12, f[k] * 0.08)})`;
      const q = k % 2, rr = k >> 1;
      ctx.fillRect((c % GW) * cwid + q * cwid / 2, ((c / GW) | 0) * chei + rr * chei / 2, cwid / 2, chei / 2);
    }
  }
  const t = tank.t;
  for (const o of tank.orgs) {
    const hue = hueOf(o.palate);
    const pulse = 1 + 0.08 * Math.sin(t * 3 + o.id);
    const r = o.size * pulse;
    const l = 45 + Math.min(25, o.energy * 6);
    const g = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, r * 2.2);
    g.addColorStop(0, `hsla(${hue},80%,${l}%,.9)`);
    g.addColorStop(0.45, `hsla(${hue},80%,${l - 12}%,.45)`);
    g.addColorStop(1, `hsla(${hue},80%,40%,0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(o.x, o.y, r * 2.2, 0, 6.3); ctx.fill();
    ctx.fillStyle = `hsl(${hue},75%,${l}%)`; ctx.beginPath(); ctx.arc(o.x, o.y, r * 0.7, 0, 6.3); ctx.fill();
    if (o.diet === "predator") {
      ctx.strokeStyle = `hsl(${hue},80%,70%)`; ctx.lineWidth = 1.2; ctx.beginPath();
      for (let i = 0; i < 8; i++) { const a = o.a + i * 0.785; ctx.moveTo(o.x + Math.cos(a) * r * 0.8, o.y + Math.sin(a) * r * 0.8); ctx.lineTo(o.x + Math.cos(a) * r * 1.4, o.y + Math.sin(a) * r * 1.4); }
      ctx.stroke();
    }
    if (o.descendant) { ctx.setLineDash([3, 3]); ctx.strokeStyle = "rgba(255,255,255,.45)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(o.x, o.y, r * 1.1, 0, 6.3); ctx.stroke(); ctx.setLineDash([]); }
    if (o.fresh > 0) { ctx.strokeStyle = `rgba(255,255,255,${o.fresh})`; ctx.beginPath(); ctx.arc(o.x, o.y, r * (1.5 + (1 - o.fresh) * 4), 0, 6.3); ctx.stroke(); o.fresh -= 0.01; }
  }
  if (selected) {
    ctx.strokeStyle = "#7fffd4"; ctx.lineWidth = 1.5; ctx.beginPath();
    ctx.arc(selected.x, selected.y, selected.size * 1.8 + 3, 0, 6.3); ctx.stroke();
  }
  ctx.restore();
}

let last = performance.now(), acc = 0, uiAcc = 0;
function frame(now) {
  const dt = Math.min(0.25, (now - last) / 1000); last = now;
  acc += dt;
  while (acc > 0.05) { tank.step(0.05); acc -= 0.05; }
  draw();
  uiAcc += dt;
  if (uiAcc > 1) { uiAcc = 0; updateStrip(); updateTicker(); if (tab === "feed") renderFeed(); if (tab === "organism") renderOrganism(true); if (tab === "history") renderHistory(); saveHist(); }
  requestAnimationFrame(frame);
}

// ---- strip + ticker ----
function updateStrip() {
  const orgs = tank.orgs;
  const orig = orgs.filter((o) => !o.descendant).length;
  const d = tank.stats.died;
  const dead = Object.values(d).reduce((a, b) => a + b, 0);
  const diets = {};
  for (const o of orgs) diets[o.diet] = (diets[o.diet] || 0) + 1;
  const dom = Object.entries(diets).sort((a, b) => b[1] - a[1])[0];
  $("strip").innerHTML =
    `<span>alive <b>${orgs.length}</b> (${orig} authored)</span>` +
    `<span>arrived <b>${admittedCount}</b> of ${seen} posts seen</span>` +
    `<span>born <b>${tank.stats.bred}</b> · died <b>${dead}</b></span>` +
    (dom ? `<span>dominant: <b>${dom[0]}s</b></span>` : "") +
    `<span>tank age <b>${fmt(tank.t)}</b></span>` +
    `<span>${connText}</span>`;
}
function updateTicker() {
  $("ticker").innerHTML = tank.events.slice(-3).map((e) => `<div>${esc(fmt(e.t))} — ${esc(e.msg)}</div>`).join("");
}

// ---- panes ----
let tab = "organism";
for (const name of ["organism", "feed", "history"]) {
  $("tab-" + name).addEventListener("click", () => {
    tab = name;
    for (const n of ["organism", "feed", "history"]) {
      $("tab-" + n).classList.toggle("on", n === name);
      $("pane-" + n).hidden = n !== name;
    }
    if (name === "feed") renderFeed(); else if (name === "history") renderHistory(); else renderOrganism();
  });
}
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
const colorOf = (o) => `hsl(${hueOf(o.palate)},75%,55%)`;

function why(o) {
  if (!o.alive) return `Cause of death: ${o.cause}${o.killer ? ` (eaten by a ${o.killer.diet})` : ""}.`;
  const age = tank.t - o.born;
  const bits = [];
  bits.push(o.energy > 3 ? "well fed" : o.energy < 0.8 ? "close to starving" : "getting by");
  if (o.children) bits.push(`has split ${o.children}×`);
  if (o.eaten) bits.push(`has eaten ${o.eaten} neighbour${o.eaten > 1 ? "s" : ""}`);
  if (age > o.lifespan * 0.8) bits.push("nearing old age");
  return bits.join(", ") + ".";
}

function renderOrganism(soft) {
  const el = $("pane-organism"), o = selected;
  if (!o) { if (!soft) el.innerHTML = '<p class="empty">Click a creature. Each one is a real post, still alive.</p>'; return; }
  const src = o.descendant ? o.rootPost : o.post;
  const age = (o.alive ? tank.t : o.diedAt) - o.born;
  const pal = o.palate.map((v, k) => `<div class="m">nutrient ${"ABCD"[k]} <span style="color:hsl(${HUES[k]},70%,60%)">●</span> ${(v * 100) | 0}%</div><div class="bar"><i style="width:${v * 100}%;background:hsl(${HUES[k]},70%,55%)"></i></div>`).join("");
  el.innerHTML =
    `<div class="card" style="cursor:default"><div class="t">${esc(src.text)}</div>` +
    `<div class="m">${o.descendant ? "a simulated descendant of this post — it never wrote this" : `<a href="${esc(o.post.url)}" target="_blank" rel="noopener">open the original post ↗</a>`}${o.descendant ? ` · <a href="${esc(src.url)}" target="_blank" rel="noopener">source ↗</a>` : ""}</div></div>` +
    `<dl><dt>status</dt><dd>${o.alive ? "alive" : "dead"}</dd><dt>diet</dt><dd>${o.diet}</dd>` +
    `<dt>age</dt><dd>${fmt(age)} of ~${fmt(o.lifespan)}</dd><dt>energy</dt><dd>${o.energy.toFixed(1)}</dd>` +
    `<dt>size</dt><dd>${o.size.toFixed(1)}</dd><dt>speed</dt><dd>${o.speed.toFixed(0)}</dd>` +
    `<dt>offspring</dt><dd>${o.children}</dd>${o.keywords?.length ? `<dt>keywords</dt><dd>${esc(o.keywords.join(", "))}</dd>` : ""}</dl>` +
    `<div>${esc(why(o))}</div><div style="margin-top:8px">${pal}</div>`;
}

function renderFeed() {
  const list = tank.orgs.filter((o) => !o.descendant).sort((a, b) => a.born - b.born).slice(0, 60);
  // only the ones that have survived longest are listed; the rest are still newborns
  const el = $("pane-feed");
  if (!list.length) { el.innerHTML = '<p class="empty">Nothing has survived yet.</p>'; return; }
  el.innerHTML = '<p class="empty">Original posts still alive, longest-surviving first. Survival is not endorsement.</p>' +
    list.map((o) => `<div class="card${o === selected ? " sel" : ""}" data-id="${o.id}"><div class="t">${esc(o.post.text.slice(0, 220))}</div>` +
      `<div class="m"><span class="dot" style="background:${colorOf(o)}"></span>${o.diet} · alive ${fmt(tank.t - o.born)}${o.children ? ` · split ${o.children}×` : ""}</div></div>`).join("");
  el.querySelectorAll(".card").forEach((c) => c.addEventListener("click", () => {
    const o = tank.orgs.find((x) => x.id === +c.dataset.id);
    if (o) { select(o); $("tab-organism").click(); }
  }));
}

function renderHistory() {
  const died = Object.entries(hist.died).map(([k, v]) => `${k}: ${v}`).join(" · ") || "none yet";
  $("pane-history").innerHTML =
    `<p class="empty">Remembered by this browser across ${hist.visits} visit${hist.visits > 1 ? "s" : ""}. The tank itself restarts when you leave; its fossils do not.</p>` +
    `<div class="m">deaths on record — ${esc(died)}</div><h3 style="font-size:13px">longest-lived authored organisms</h3>` +
    (hist.fossils.length ? hist.fossils.map((f) => `<div class="card" style="cursor:default"><div class="t">${esc(f.text)}</div><div class="m">lived ${fmt(f.life)} · ${f.kids} splits · died of ${esc(f.cause)} · <a href="${esc(f.url)}" target="_blank" rel="noopener">post ↗</a></div></div>`).join("") : '<p class="empty">No fossils yet. Give it a few minutes.</p>');
}

function select(o) { selected = o; renderOrganism(); }

canvas.addEventListener("click", (e) => {
  const r = canvas.getBoundingClientRect();
  const x = (e.clientX - r.left - ox) / sc, y = (e.clientY - r.top - oy) / sc;
  let best = null, bd = Infinity;
  for (const o of tank.orgs) {
    const d = Math.hypot(o.x - x, o.y - y) - o.size;
    if (d < bd) { bd = d; best = o; }
  }
  if (best && bd < 28) { select(best); $("tab-organism").click(); }
});

$("share").addEventListener("click", (e) => {
  e.preventDefault();
  const txt = `My Primordial Feed tank is ${fmt(tank.t)} old: ${tank.orgs.length} real posts alive, ${tank.stats.bred} born in the tank, ${Object.values(tank.stats.died).reduce((a, b) => a + b, 0)} dead. What would a feed look like if information had to live somewhere?\nhttps://primordial-feed.bisks.net/`;
  window.open("https://bsky.app/intent/compose?text=" + encodeURIComponent(txt), "_blank", "noopener");
});

requestAnimationFrame(frame);
