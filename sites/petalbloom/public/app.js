import { normalizeHandle, getProfile, fetchPosts, fetchInteractions, hydrateReplies, hydrateProfiles, tally } from "./lib/bloom.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const NS = "http://www.w3.org/2000/svg";
const PINK = "#ff7eb6", GOLD = "#ffc65c";
const PETALS_OUTER = 16; // ring sizes are a layout choice: 16 labelled petals fit around the circle
const PETALS_INNER = 16;
const TABLE_STEP = 25;

let state = null;

attach();
function attach() {
  if (window.attachHandleTypeahead) window.attachHandleTypeahead($("handle"));
  $("goForm").addEventListener("submit", (e) => { e.preventDefault(); run(); });
  const q = new URLSearchParams(location.search).get("handle");
  if (q) { $("handle").value = q; run(); }
}

function progress(text, frac) {
  $("statusLine").textContent = text;
  $("meterBar").style.width = `${Math.round(Math.max(0.03, Math.min(1, frac)) * 100)}%`;
}

async function run() {
  const handle = normalizeHandle($("handle").value);
  $("goMsg").textContent = "";
  if (!handle) { $("goMsg").textContent = "type a handle first"; return; }
  $("goBtn").disabled = true;
  $("working").classList.remove("hidden");
  $("result").classList.add("hidden");
  try {
    progress("finding the account…", 0.03);
    const prof = await getProfile(handle);
    const max = Number($("window").value);
    progress("reading posts…", 0.08);
    const posts = await fetchPosts(prof.did, max, (n) => progress(`reading posts… ${n}`, 0.08 + Math.min(0.12, n / 5000)));
    if (!posts.length) throw new Error("no posts to look at");
    progress("finding who liked and replied…", 0.2);
    const { likes, replies } = await fetchInteractions(prof.did, posts, (n, t) => progress(`finding who liked and replied… ${n}/${t} posts`, 0.2 + 0.4 * (n / t)));
    progress("reading replies…", 0.6);
    await hydrateReplies(replies, () => progress(`reading ${replies.length} replies…`, 0.75));
    const rows = tally(likes, replies);
    progress("meeting the petals…", 0.9);
    const profiles = await hydrateProfiles(rows.map((r) => r.did)); // 25 per call, every account in the table
    state = { prof, posts, likes, replies, rows, profiles, shown: TABLE_STEP };
    render();
    $("working").classList.add("hidden");
    $("result").classList.remove("hidden");
  } catch (err) {
    $("working").classList.add("hidden");
    $("goMsg").textContent = err.message || "something went wrong";
  } finally {
    $("goBtn").disabled = false;
  }
}

const who = (did) => {
  const p = state.profiles.get(did);
  return { handle: p ? p.handle : did, name: p && p.displayName, avatar: p && p.avatar };
};
const fmt = (n) => Number(n).toLocaleString();

function render() {
  const { prof, posts, replies, rows, likes } = state;
  $("who").innerHTML = `<img src="${esc(prof.avatar || "")}" alt="" /><div><div class="nm">${esc(prof.displayName || prof.handle)}</div><div class="fine">@${esc(prof.handle)} · ${fmt(posts.length)} posts analysed</div></div>`;
  const mood = { pos: 0, neu: 0, neg: 0 };
  replies.forEach((r) => mood[r.mood]++);
  const totalLikes = posts.reduce((s, p) => s + p.likes, 0);
  const totalReplies = posts.reduce((s, p) => s + p.replies, 0);
  const tiles = [
    [fmt(totalLikes), "likes"], [fmt(totalReplies), "replies"],
    [fmt(new Set(likes.map((l) => l.did)).size), "accounts that liked"],
    [fmt(new Set(replies.map((r) => r.did)).size), "accounts that replied"],
    [(totalLikes / posts.length).toFixed(1), "likes per post"],
    [replies.length ? Math.round((100 * mood.pos) / replies.length) + "%" : "–", "replies warm"],
  ];
  $("tiles").innerHTML = tiles.map(([v, l]) => `<div class="tile"><b>${v}</b><span>${l}</span></div>`).join("");
  renderFlower();
  renderMonths();
  renderMood(mood);
  renderHeat();
  renderTop();
  renderTable();
  const text = `my petalbloom for @${prof.handle}: ${fmt(totalLikes)} likes, ${fmt(totalReplies)} replies, and a flower of the ${Math.min(rows.length, PETALS_OUTER)} accounts who show up most 🌸 https://petalbloom.bisks.net/?handle=${encodeURIComponent(prof.handle)}`;
  $("shareLink").href = `https://bsky.app/intent/compose?text=${encodeURIComponent(text)}`;
}

function el(tag, attrs, parent) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
}

function petalPath(L, w) {
  return `M0,0 C ${w},${-L * 0.25} ${w * 0.85},${-L * 0.85} 0,${-L} C ${-w * 0.85},${-L * 0.85} ${-w},${-L * 0.25} 0,0 Z`;
}

function mix(a) {
  const t = a.likes + a.pos + a.neu;
  const replyShare = t ? (a.pos + a.neu) / t : 0;
  const ch = (i) => Math.round([255, 126, 182][i] * (1 - replyShare) + [255, 198, 92][i] * replyShare);
  return `rgb(${ch(0)},${ch(1)},${ch(2)})`;
}

function renderFlower() {
  const wrap = $("flowerWrap");
  wrap.innerHTML = "";
  const rows = state.rows;
  if (!rows.length) { wrap.textContent = "no likes or replies from anyone else found yet."; return; }
  const svg = el("svg", { viewBox: "-340 -340 680 680", role: "img", "aria-label": "flower of the most interactive accounts" });
  wrap.appendChild(svg);
  const max = rows[0].score;
  const outer = rows.slice(0, PETALS_OUTER);
  const inner = rows.slice(PETALS_OUTER, PETALS_OUTER + PETALS_INNER);
  const lenOf = (a, base, span) => base + span * Math.sqrt(a.score / max);
  // inner ring first so the outer petals overlap it
  const place = (list, offset, base, span, op) => list.forEach((a, i) => {
    const L = lenOf(a, base, span);
    const g = el("g", { class: "petal", transform: `rotate(${((i / (list.length < PETALS_OUTER ? PETALS_OUTER : list.length)) * 360 + offset).toFixed(2)})` }, svg);
    const p = el("path", { d: petalPath(L, 22 + L * 0.16), fill: mix(a), "fill-opacity": op, stroke: "#150d14", "stroke-width": 2 }, g);
    el("title", {}, p).textContent = `@${who(a.did).handle}`;
    g.addEventListener("click", () => showPetal(a));
    g.addEventListener("mouseenter", () => showPetal(a));
    if (op === 1) {
      const t = el("text", { "font-size": 11, fill: "#e6d8e0", dy: "0.35em", transform: `translate(0,${-L - 8}) rotate(-90)`, "font-family": "ui-monospace,monospace" }, g);
      t.textContent = who(a.did).handle.slice(0, 18);
    }
  });
  place(inner, 360 / PETALS_OUTER / 2, 50, 100, 0.78);
  place(outer, 0, 70, 120, 1);
  // centre: the account's avatar
  const prof = state.prof;
  el("circle", { r: 46, fill: "#150d14", stroke: GOLD, "stroke-width": 3 }, svg);
  if (prof.avatar) {
    const defs = el("defs", {}, svg);
    const cp = el("clipPath", { id: "avclip" }, defs);
    el("circle", { r: 40 }, cp);
    const im = el("image", { href: prof.avatar, x: -40, y: -40, width: 80, height: 80, "clip-path": "url(#avclip)", preserveAspectRatio: "xMidYMid slice" }, svg);
    im.setAttribute("crossorigin", "anonymous");
  }
  showPetal(rows[0]);
}

function showPetal(a) {
  const w = who(a.did);
  $("petalInfo").innerHTML = `<b>${esc(w.name || w.handle)}</b> <a href="https://bsky.app/profile/${esc(a.did)}" target="_blank" rel="noopener">@${esc(w.handle)}</a><br>${a.likes} likes · ${a.pos} warm replies · ${a.neu} neutral · ${a.neg} cold`;
}

function monthKey(iso) { return iso ? String(iso).slice(0, 7) : null; }

function renderMonths() {
  const m = new Map();
  for (const p of state.posts) {
    const k = monthKey(p.at);
    if (!k) continue;
    const r = m.get(k) || { likes: 0, replies: 0, posts: 0 };
    r.likes += p.likes; r.replies += p.replies; r.posts++;
    m.set(k, r);
  }
  const keys = [...m.keys()].sort();
  const wrap = $("monthChart");
  if (!keys.length) { wrap.textContent = "—"; return; }
  const W = 760, H = 220, pad = 24;
  const top = Math.max(...keys.map((k) => m.get(k).likes + m.get(k).replies)) || 1;
  const bw = (W - pad * 2) / keys.length;
  let s = `<svg viewBox="0 0 ${W} ${H + 24}" role="img" aria-label="likes and replies by month">`;
  keys.forEach((k, i) => {
    const r = m.get(k), x = pad + i * bw;
    const hl = ((H - 20) * r.likes) / top, hr = ((H - 20) * r.replies) / top;
    s += `<rect x="${x + 1}" y="${H - hl}" width="${Math.max(1, bw - 2)}" height="${hl}" fill="${PINK}"><title>${k}: ${r.likes} likes, ${r.replies} replies, ${r.posts} posts</title></rect>`;
    s += `<rect x="${x + 1}" y="${H - hl - hr}" width="${Math.max(1, bw - 2)}" height="${hr}" fill="${GOLD}"><title>${k}: ${r.likes} likes, ${r.replies} replies, ${r.posts} posts</title></rect>`;
  });
  const step = Math.max(1, Math.ceil(keys.length / 8));
  keys.forEach((k, i) => { if (i % step === 0) s += `<text x="${pad + i * bw}" y="${H + 16}" font-size="11" fill="#a58b9a">${k}</text>`; });
  s += `<text x="${pad}" y="12" font-size="11" fill="${PINK}">■ likes</text><text x="${pad + 60}" y="12" font-size="11" fill="${GOLD}">■ replies</text></svg>`;
  wrap.innerHTML = s;
}

function renderMood(mood) {
  const t = mood.pos + mood.neu + mood.neg;
  if (!t) { $("moodChart").textContent = "no replies from other accounts found."; return; }
  const seg = (n, c, l) => (n ? `<div style="width:${(100 * n) / t}%;background:${c}" title="${l}: ${n}">${n / t > 0.08 ? Math.round((100 * n) / t) + "%" : ""}</div>` : "");
  $("moodChart").innerHTML = `<div class="bar">${seg(mood.pos, "#7fe0a4", "warm")}${seg(mood.neu, "#c9b8c4", "neutral")}${seg(mood.neg, "#ff6b6b", "cold")}</div>
    <div class="fine">${mood.pos} warm · ${mood.neu} neutral · ${mood.neg} cold, across ${fmt(t)} replies from other accounts</div>`;
}

function renderHeat() {
  const sum = Array.from({ length: 7 }, () => new Array(24).fill(0));
  const cnt = Array.from({ length: 7 }, () => new Array(24).fill(0));
  for (const p of state.posts) {
    const d = new Date(p.at);
    if (isNaN(d)) continue;
    sum[d.getDay()][d.getHours()] += p.likes; cnt[d.getDay()][d.getHours()]++;
  }
  const avg = sum.map((r, i) => r.map((v, h) => (cnt[i][h] ? v / cnt[i][h] : null)));
  const top = Math.max(1, ...avg.flat().filter((v) => v != null));
  const days = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  let s = `<svg viewBox="0 0 520 ${7 * 22 + 24}" role="img" aria-label="average likes by weekday and hour">`;
  avg.forEach((r, i) => {
    s += `<text x="0" y="${i * 22 + 15}" font-size="11" fill="#a58b9a">${days[i]}</text>`;
    r.forEach((v, h) => {
      const fill = v == null ? "#1d1220" : `rgba(255,126,182,${(0.15 + 0.85 * (v / top)).toFixed(2)})`;
      s += `<rect x="${34 + h * 20}" y="${i * 22}" width="18" height="20" rx="3" fill="${fill}"><title>${days[i]} ${h}:00 — ${v == null ? "no posts" : v.toFixed(1) + " likes avg over " + cnt[i][h] + " posts"}</title></rect>`;
    });
  });
  for (let h = 0; h < 24; h += 3) s += `<text x="${34 + h * 20}" y="${7 * 22 + 14}" font-size="10" fill="#a58b9a">${h}h</text>`;
  $("heat").innerHTML = s + "</svg>";
}

function renderTop() {
  const top = [...state.posts].sort((a, b) => b.likes + b.replies * 2 - (a.likes + a.replies * 2)).slice(0, 10);
  $("topPosts").innerHTML = `<table><tr><th>post</th><th class="n">likes</th><th class="n">replies</th></tr>${top.map((p) => {
    const rkey = p.uri.split("/").pop();
    return `<tr><td><a href="https://bsky.app/profile/${esc(state.prof.did)}/post/${esc(rkey)}" target="_blank" rel="noopener">${esc((p.text || "(no text)").slice(0, 110))}</a></td><td class="n">${fmt(p.likes)}</td><td class="n">${fmt(p.replies)}</td></tr>`;
  }).join("")}</table>`;
}

function renderTable() {
  const rows = state.rows.slice(0, state.shown);
  $("accTable").innerHTML = `<table><tr><th>#</th><th>account</th><th class="n">likes</th><th class="n">warm</th><th class="n">neutral</th><th class="n">cold</th></tr>${rows.map((a, i) => {
    const w = who(a.did);
    return `<tr><td>${i + 1}</td><td>${w.avatar ? `<img src="${esc(w.avatar)}" alt="" />` : ""}<a href="https://bsky.app/profile/${esc(a.did)}" target="_blank" rel="noopener">@${esc(w.handle)}</a></td><td class="n">${a.likes}</td><td class="n">${a.pos}</td><td class="n">${a.neu}</td><td class="n">${a.neg}</td></tr>`;
  }).join("")}</table>${state.shown < state.rows.length ? `<button class="more" id="moreBtn" type="button">show more</button>` : ""}`;
  const b = $("moreBtn");
  if (b) b.addEventListener("click", () => { state.shown += TABLE_STEP; renderTable(); });
}
