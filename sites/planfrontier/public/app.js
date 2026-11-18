import { paretoFront, paretoRanks, yearlyCost } from "./pareto.js";

const STORE = "planfrontier.plans.v1";
const $ = (id) => document.getElementById(id);
const NS = "http://www.w3.org/2000/svg";

// dir: which way is "better". fmt: how to print a value.
const money = (v) => "$" + Math.round(v).toLocaleString();
const METRICS = [
  { key: "premium", label: "Monthly premium", dir: "min", fmt: money },
  { key: "deductible", label: "Deductible", dir: "min", fmt: money },
  { key: "oopMax", label: "Out-of-pocket max", dir: "min", fmt: money },
  { key: "coinsurance", label: "Coinsurance (you pay)", dir: "min", fmt: (v) => v + "%" },
  { key: "pcpCopay", label: "Primary-care copay", dir: "min", fmt: money },
  { key: "av", label: "Coverage (actuarial value)", dir: "max", fmt: (v) => v + "%" },
  { key: "network", label: "Network breadth", dir: "max", fmt: (v) => v + "/100" },
  { key: "yearly", label: "Total yearly cost at your care level", dir: "min", fmt: money },
];
const byKey = Object.fromEntries(METRICS.map((m) => [m.key, m]));

let plans = [];
let selected = null;
let spend = 5000;

async function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE));
    if (Array.isArray(saved) && saved.length) return saved;
  } catch {}
  return fetch("data/plans.json").then((r) => r.json());
}
const save = () => localStorage.setItem(STORE, JSON.stringify(plans));

// yearly is derived from the slider, so it's attached fresh before every draw
function withDerived() {
  return plans.map((p) => Object.assign(p, { yearly: yearlyCost(p, spend) }));
}

function axes() {
  return [byKey[$("xs").value], byKey[$("ys").value]];
}

function el(tag, attrs, parent) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}

function draw() {
  const rows = withDerived();
  const [mx, my] = axes();
  const front = paretoFront(rows, [mx, my]);
  const svg = $("chart");
  svg.replaceChildren();
  const W = 960, H = 520, L = 70, R = 30, T = 20, B = 60;
  const range = (m) => {
    const vs = rows.map((p) => p[m.key]);
    let lo = Math.min(...vs), hi = Math.max(...vs);
    if (lo === hi) { lo -= 1; hi += 1; }
    const pad = (hi - lo) * 0.08;
    return [lo - pad, hi + pad];
  };
  const [x0, x1] = range(mx), [y0, y1] = range(my);
  // "better" is always up and to the right, like a frontier-model chart
  const sx = (v) => { const t = (v - x0) / (x1 - x0); return L + (mx.dir === "min" ? 1 - t : t) * (W - L - R); };
  const sy = (v) => { const t = (v - y0) / (y1 - y0); return H - B - (my.dir === "min" ? 1 - t : t) * (H - T - B); };

  for (let i = 0; i <= 5; i++) {
    const vx = x0 + ((x1 - x0) * i) / 5, vy = y0 + ((y1 - y0) * i) / 5;
    el("line", { x1: sx(vx), x2: sx(vx), y1: T, y2: H - B, class: "grid", "stroke-opacity": 0.5 }, svg);
    el("line", { x1: L, x2: W - R, y1: sy(vy), y2: sy(vy), class: "grid", "stroke-opacity": 0.5 }, svg);
    const g = el("g", { class: "axis" }, svg);
    el("text", { x: sx(vx), y: H - B + 16, "text-anchor": "middle" }, g).textContent = mx.fmt(vx);
    el("text", { x: L - 8, y: sy(vy) + 4, "text-anchor": "end" }, g).textContent = my.fmt(vy);
  }
  const g = el("g", { class: "axis" }, svg);
  el("text", { x: (L + W - R) / 2, y: H - 14, "text-anchor": "middle", style: "font-size:13px" }, g).textContent = mx.label + " (better →)";
  el("text", { x: 16, y: (T + H - B) / 2, "text-anchor": "middle", transform: `rotate(-90 16 ${(T + H - B) / 2})`, style: "font-size:13px" }, g).textContent = my.label + " (better →)";

  const fs = front.slice().sort((a, b) => sx(a[mx.key]) - sx(b[mx.key]));
  if (fs.length > 1) {
    // staircase through the front so the "nothing beats this" edge reads as a frontier
    let d = `M${sx(fs[0][mx.key])},${sy(fs[0][my.key])}`;
    for (let i = 1; i < fs.length; i++) d += ` H${sx(fs[i][mx.key])} V${sy(fs[i][my.key])}`;
    el("path", { d, fill: "none", stroke: "#4ade80", "stroke-width": 2, "stroke-dasharray": "5 4", opacity: 0.7 }, svg);
  }

  rows.forEach((p) => {
    const on = front.includes(p);
    const gp = el("g", { class: "pt" + (on ? "" : " dom"), tabindex: 0 }, svg);
    const cx = sx(p[mx.key]), cy = sy(p[my.key]);
    el("circle", {
      cx, cy, r: p === selected ? 9 : on ? 7 : 5,
      fill: on ? "#4ade80" : "#6b7385", stroke: p === selected ? "#fbbf24" : "#0f1115", "stroke-width": p === selected ? 3 : 1.5,
    }, gp);
    const t = el("text", { x: cx + 10, y: cy + 4 }, gp);
    t.textContent = p.name;
    gp.addEventListener("click", () => select(p));
    gp.addEventListener("keydown", (e) => { if (e.key === "Enter") select(p); });
  });

  // frontier list
  $("fcount").textContent = front.length + " of " + rows.length;
  const ol = $("front");
  ol.replaceChildren();
  fs.forEach((p) => {
    const li = document.createElement("li");
    li.textContent = `${p.name} — ${mx.fmt(p[mx.key])}, ${my.fmt(p[my.key])}`;
    li.addEventListener("click", () => select(p));
    ol.appendChild(li);
  });
  renderDetail(rows, front);
  renderTable(rows, front);
}

function select(p) { selected = p; draw(); }

function renderDetail(rows, front) {
  const box = $("detail");
  box.replaceChildren();
  const h = document.createElement("h2");
  h.textContent = selected ? selected.name : "Model card";
  box.appendChild(h);
  if (!selected) {
    const p = document.createElement("p");
    p.className = "sub";
    p.textContent = "Click a point or a frontier plan.";
    box.appendChild(p);
    return;
  }
  const [mx, my] = axes();
  const badge = document.createElement("span");
  const dom = front.includes(selected) ? null : rows.filter((q) => q !== selected && paretoFront([q, selected], [mx, my]).length === 1 && paretoFront([q, selected], [mx, my])[0] === q);
  badge.className = "badge" + (dom ? " d" : "");
  badge.textContent = dom ? "beaten by " + dom.map((q) => q.name).join(", ") : "on the frontier";
  h.appendChild(badge);
  // every metric as a percentile bar, oriented so a longer bar is always better
  METRICS.forEach((m) => {
    const vs = rows.map((p) => p[m.key]);
    const lo = Math.min(...vs), hi = Math.max(...vs);
    const t = hi === lo ? 1 : (selected[m.key] - lo) / (hi - lo);
    const score = m.dir === "min" ? 1 - t : t;
    const r = document.createElement("div");
    r.className = "row";
    const a = document.createElement("span"); a.textContent = m.label;
    const b = document.createElement("b"); b.textContent = m.fmt(selected[m.key]);
    r.append(a, b);
    const bar = document.createElement("div"); bar.className = "bar";
    const i = document.createElement("i"); i.style.width = Math.round(score * 100) + "%";
    bar.appendChild(i);
    box.append(r, bar);
  });
  const ranks = paretoRanks(rows, METRICS.filter((m) => m.key !== "yearly"));
  const n = document.createElement("p");
  n.className = "sub";
  n.textContent = `Across all seven plan traits at once, it sits on pareto layer ${ranks.get(selected)} (1 = unbeaten).`;
  box.appendChild(n);
}

function renderTable(rows, front) {
  const t = $("tbl");
  t.replaceChildren();
  const head = t.createTHead().insertRow();
  ["Plan", ...METRICS.map((m) => m.label.replace(/ \(.*\)/, "")), ""].forEach((s) => {
    const th = document.createElement("th"); th.textContent = s; head.appendChild(th);
  });
  const body = t.createTBody();
  rows.forEach((p) => {
    const tr = body.insertRow();
    const c0 = tr.insertCell();
    c0.textContent = (front.includes(p) ? "● " : "") + p.name;
    c0.style.cursor = "pointer";
    c0.addEventListener("click", () => select(p));
    METRICS.forEach((m) => { tr.insertCell().textContent = m.fmt(p[m.key]); });
    const x = tr.insertCell();
    const btn = document.createElement("button");
    btn.textContent = "×";
    btn.title = "remove";
    btn.addEventListener("click", () => {
      plans = plans.filter((q) => q !== p);
      if (selected === p) selected = null;
      save(); draw();
    });
    x.appendChild(btn);
  });
}

function setup() {
  for (const id of ["xs", "ys"]) {
    METRICS.forEach((m) => $(id).add(new Option(m.label, m.key)));
  }
  $("xs").value = "premium";
  $("ys").value = "av";
  $("xs").addEventListener("change", draw);
  $("ys").addEventListener("change", draw);
  $("spend").addEventListener("input", (e) => {
    spend = Number(e.target.value);
    $("spend-v").textContent = money(spend);
    draw();
  });
  $("add").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const p = { name: String(f.get("name")).trim(), tier: "Mine", hsa: false };
    for (const k of ["premium", "deductible", "oopMax", "coinsurance", "pcpCopay", "av", "network"]) p[k] = Number(f.get(k));
    plans.push(p);
    selected = p;
    save();
    e.target.reset();
    draw();
  });
  $("reset").addEventListener("click", async () => {
    localStorage.removeItem(STORE);
    plans = await load();
    selected = null;
    draw();
  });
  $("share").addEventListener("click", () => {
    const [mx, my] = axes();
    const front = paretoFront(withDerived(), [mx, my]);
    const text = `Health plans on the pareto front: ${mx.label} vs ${my.label}. ${front.length} of ${plans.length} plans are unbeaten.`;
    const url = "https://bsky.app/intent/compose?text=" + encodeURIComponent(text + "\nhttps://planfrontier.bisks.net/");
    window.open(url, "_blank", "noopener");
  });
}

setup();
load().then((p) => { plans = p; draw(); });
