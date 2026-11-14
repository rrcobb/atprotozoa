import { crawl } from "./search.js";
import { buildModel, makeLayout } from "./model.js";

const $ = (id) => document.getElementById(id);
const cv = $("cv"), ctx = cv.getContext("2d"), tip = $("tip");
const status = $("status");
const fmt = (ms) => new Date(ms).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
const day = (ms) => new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
const postUrl = (uri) => { const m = /^at:\/\/([^/]+)\/[^/]+\/([^/]+)$/.exec(uri); return m ? `https://bsky.app/profile/${m[1]}/post/${m[2]}` : "https://bsky.app"; };

let model = null, layout = null, t0 = 0, t1 = 0, T = 0;
let view = { x: 0, y: 0, k: 1 };
let selected = null, hover = null, playing = false, byDid = new Map();
let order = "asc", shown = 0;
const PAGE = 200; // DOM paging for the post list only — the whole history is loaded

function resize() {
  const r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  cv.width = r.width * dpr; cv.height = r.height * dpr;
  draw();
}
window.addEventListener("resize", resize);

function toScreen(n) { return [view.x + n.x * view.k, view.y + n.y * view.k]; }

function draw() {
  const dpr = window.devicePixelRatio || 1, W = cv.width, H = cv.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);
  if (!model) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const recent = Math.max((t1 - t0) / 15, 6 * 3600e3);
  ctx.lineWidth = 1;
  for (const e of model.edges) {
    const a = byDid.get(e.a), b = byDid.get(e.b);
    if (T < Math.max(e.t, a.first, b.first)) continue;
    const [x1, y1] = toScreen(a), [x2, y2] = toScreen(b);
    const hot = selected && (selected === a || selected === b);
    ctx.strokeStyle = hot ? "#ffd27a" : e.infection ? "rgba(255,120,70,.45)" : "rgba(180,160,130,.16)";
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }
  for (const n of model.nodes) {
    if (n.first > T) continue;
    const [x, y] = toScreen(n);
    const age = T - n.first, f = Math.min(1, age / recent);
    const r = (2.5 + Math.min(9, Math.sqrt(n.posts.filter((p) => p.createdAt <= T).length) * 1.4)) * Math.min(1.8, Math.max(0.6, view.k));
    ctx.fillStyle = `rgb(${Math.round(255 - f * 148)},${Math.round(90 + f * 0)},${Math.round(54 + f * 15)})`;
    if (f > 0.99) ctx.fillStyle = "#6b5a45";
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    if (n === selected || n === hover) { ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.stroke(); ctx.lineWidth = 1; }
  }
  // patient zero ring
  const z = model.nodes[0];
  if (z && z.first <= T) {
    const [x, y] = toScreen(z);
    ctx.strokeStyle = "#ffd27a"; ctx.beginPath(); ctx.arc(x, y, 14, 0, 7); ctx.stroke();
    ctx.fillStyle = "#ffd27a"; ctx.font = "11px monospace"; ctx.fillText("patient zero", x + 17, y + 4);
  }
  drawHist();
}

function drawHist() {
  const h = $("hist"), c = h.getContext("2d"), dpr = window.devicePixelRatio || 1;
  const r = h.getBoundingClientRect();
  if (h.width !== r.width * dpr) { h.width = r.width * dpr; h.height = r.height * dpr; }
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, r.width, r.height);
  const DAY = 86400e3, nb = Math.max(1, Math.ceil((t1 - t0) / DAY) + 1);
  const bins = new Array(nb).fill(0);
  for (const p of model.posts) bins[Math.floor((p.createdAt - t0) / DAY)]++;
  const mx = Math.max(...bins), bw = r.width / nb;
  bins.forEach((v, i) => {
    c.fillStyle = t0 + i * DAY <= T ? "#e8b44a" : "#4a3d2e";
    const bh = (v / mx) * (r.height - 4);
    c.fillRect(i * bw, r.height - bh, Math.max(1, bw - 1), bh);
  });
}

function setT(frac) {
  T = t0 + (t1 - t0) * frac;
  $("scrub").value = Math.round(frac * 1000);
  $("when").textContent = fmt(T);
  draw();
}
$("scrub").addEventListener("input", (e) => { playing = false; $("play").textContent = "▶ replay"; setT(e.target.value / 1000); });
$("play").addEventListener("click", () => {
  if (playing) { playing = false; $("play").textContent = "▶ replay"; return; }
  playing = true; $("play").textContent = "❚❚ pause";
  let f = $("scrub").value >= 1000 ? 0 : $("scrub").value / 1000;
  let last = performance.now();
  const tick = (now) => {
    if (!playing) return;
    f += (now - last) / 14000; last = now;
    if (f >= 1) { f = 1; playing = false; $("play").textContent = "▶ replay"; }
    setT(f);
    if (playing) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});

// pan / zoom / pick
let drag = null;
cv.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false }; cv.setPointerCapture(e.pointerId); });
cv.addEventListener("pointermove", (e) => {
  if (drag) {
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
    view.x = drag.vx + dx; view.y = drag.vy + dy; draw();
  } else pick(e);
});
cv.addEventListener("pointerup", (e) => {
  if (drag && !drag.moved) { pick(e); select(hover); }
  drag = null;
});
cv.addEventListener("pointerleave", () => { hover = null; tip.style.display = "none"; });
cv.addEventListener("wheel", (e) => {
  e.preventDefault();
  const r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
  const k = Math.min(8, Math.max(0.1, view.k * Math.exp(-e.deltaY * 0.0015)));
  view.x = mx - ((mx - view.x) / view.k) * k; view.y = my - ((my - view.y) / view.k) * k; view.k = k; draw();
}, { passive: false });

function pick(e) {
  const r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
  let best = null, bd = 100;
  for (const n of model.nodes) {
    if (n.first > T) continue;
    const [x, y] = toScreen(n), d = (x - mx) ** 2 + (y - my) ** 2;
    if (d < bd) { bd = d; best = n; }
  }
  hover = best;
  if (best) {
    tip.style.display = "block";
    tip.style.left = Math.min(mx + 12, r.width - 270) + "px"; tip.style.top = my + 12 + "px";
    const inf = best.infector ? " · caught it from @" + byDid.get(best.infector).handle : "";
    tip.textContent = `@${best.handle} · ${best.posts.length} post${best.posts.length === 1 ? "" : "s"} · first ${day(best.first)}${inf}`;
  } else tip.style.display = "none";
  draw();
}

function select(n) {
  selected = n;
  $("clear").hidden = !n;
  renderPosts(true);
  draw();
}
$("clear").addEventListener("click", () => select(null));
$("order").addEventListener("click", () => { order = order === "asc" ? "desc" : "asc"; $("order").textContent = order === "asc" ? "oldest first" : "newest first"; renderPosts(true); });

function renderPosts(reset) {
  const box = $("posts");
  const src = selected ? selected.posts : model.posts;
  const list = order === "asc" ? src : src.slice().reverse();
  if (reset) { box.textContent = ""; shown = 0; }
  $("posthead").textContent = selected ? `@${selected.handle}'s banh mi posts (${list.length})` : `post history (${list.length} posts)`;
  const old = box.querySelector("button.more"); if (old) old.remove();
  for (const p of list.slice(shown, shown + PAGE)) {
    const d = document.createElement("div"); d.className = "post";
    const who = document.createElement("span"); who.className = "who"; who.textContent = "@" + p.handle;
    const meta = document.createElement("span"); meta.className = "meta"; meta.textContent = " · " + fmt(p.createdAt) + " · ";
    const a = document.createElement("a"); a.href = postUrl(p.uri); a.target = "_blank"; a.rel = "noopener"; a.textContent = "open";
    const t = document.createElement("p"); t.textContent = p.text;
    d.append(who, meta, a, t); box.append(d);
  }
  shown += PAGE;
  if (shown < list.length) {
    const b = document.createElement("button"); b.className = "more"; b.type = "button";
    b.textContent = `show ${Math.min(PAGE, list.length - shown)} more`;
    b.addEventListener("click", () => renderPosts(false));
    box.append(b);
  }
}

function stats() {
  const infected = model.nodes.length, links = model.edges.filter((e) => e.infection).length;
  const peak = (() => { const m = new Map(); for (const p of model.posts) { const k = day(p.createdAt); m.set(k, (m.get(k) || 0) + 1); } return [...m].sort((a, b) => b[1] - a[1])[0]; })();
  const hubs = model.nodes.slice().sort((a, b) => b.deg - a.deg)[0];
  const items = [
    [model.posts.length.toLocaleString(), "banh mi posts"],
    [infected.toLocaleString(), "accounts infected"],
    [links.toLocaleString(), "traceable transmissions"],
    [peak ? peak[0] : "-", `peak day (${peak ? peak[1] : 0} posts)`],
    [hubs ? "@" + hubs.handle : "-", "biggest hub"],
  ];
  const box = $("stats"); box.textContent = ""; box.hidden = false;
  for (const [b, s] of items) {
    const d = document.createElement("div"); d.className = "stat";
    const bb = document.createElement("b"); bb.textContent = b;
    const ss = document.createElement("span"); ss.textContent = s;
    d.append(bb, ss); box.append(d);
  }
  const pz = $("pz"); pz.textContent = "";
  for (const n of model.nodes.slice(0, 12)) {
    const li = document.createElement("li");
    const p = n.posts[0];
    li.append(`${day(n.first)} — `);
    const a = document.createElement("a"); a.href = postUrl(p.uri); a.target = "_blank"; a.rel = "noopener"; a.textContent = "@" + n.handle;
    li.append(a, ": " + p.text.replace(/\s+/g, " ").slice(0, 110) + (n.infector ? ` (from @${byDid.get(n.infector).handle})` : ""));
    pz.append(li);
  }
  $("pzsec").hidden = false;
  const first = model.nodes[0];
  $("share").href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(
    `${infected.toLocaleString()} accounts have posted about banh mi on Bluesky. patient zero: @${first.handle}. watch it spread:\nhttps://banhmi-contagion.bisks.net/`);
}

async function main() {
  const res = await crawl((n, label) => { status.textContent = `${n.toLocaleString()} posts found so far… (${label})`; });
  if (!res.posts.length) { status.classList.add("err"); status.textContent = "the search came back empty — Bluesky's search may be rate limiting; reload in a minute."; return; }
  model = buildModel(res.posts);
  byDid = new Map(model.nodes.map((n) => [n.did, n]));
  t0 = model.posts[0].createdAt; t1 = Math.max(model.posts[model.posts.length - 1].createdAt, t0 + 3600e3);
  stats();
  $("controls").hidden = false; $("hist").hidden = false; $("postsec").hidden = false;
  status.textContent = res.failed ? `${res.failed} search window(s) failed after retries, so some posts may be missing. Laying out the graph…` : "laying out the graph…";
  const r = cv.getBoundingClientRect();
  view = { x: r.width / 2, y: r.height / 2, k: 1 };
  resize();
  setT(1);
  renderPosts(true);
  layout = makeLayout(model);
  let iters = 0;
  const frame = () => {
    const start = performance.now();
    while (performance.now() - start < 12 && iters < 350) { layout.step(); iters++; }
    if (iters === 350) fit();
    draw();
    if (iters < 350) requestAnimationFrame(frame);
    else status.textContent = (res.failed ? status.textContent.replace(/ Laying.*/, "") + " " : "") + "Done. Hit replay to watch it spread.";
  };
  requestAnimationFrame(frame);
}

function fit() {
  let xs = model.nodes.map((n) => n.x).sort((a, b) => a - b), ys = model.nodes.map((n) => n.y).sort((a, b) => a - b);
  const lo = (a) => a[Math.floor(a.length * 0.02)], hi = (a) => a[Math.ceil(a.length * 0.98) - 1];
  const r = cv.getBoundingClientRect();
  const w = hi(xs) - lo(xs) + 40, h = hi(ys) - lo(ys) + 40;
  view.k = Math.min(r.width / w, r.height / h, 3);
  view.x = r.width / 2 - ((lo(xs) + hi(xs)) / 2) * view.k;
  view.y = r.height / 2 - ((lo(ys) + hi(ys)) / 2) * view.k;
}

main().catch((e) => { status.classList.add("err"); status.textContent = "something broke: " + e.message; });
