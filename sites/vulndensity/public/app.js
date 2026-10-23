import { VULNS } from "./data.js";

const Y0 = 1980, Y1 = 2026, N = Y1 - Y0 + 1;
const M = { l: 62, b: 54, t: 16, r: 16 };
const cv = document.getElementById("plot");
const ctx = cv.getContext("2d");
const W = cv.width - M.l - M.r, H = cv.height - M.t - M.b;
const cw = W / N, ch = H / N;
const px = (yr) => M.l + (yr - Y0) * cw;          // left edge of a year column
const py = (yr) => M.t + (Y1 - yr) * ch;          // top edge of a year row

const rows = VULNS.map(([name, id, a, b]) => ({ name, id, a, b, life: b - a }));
const $ = (id) => document.getElementById(id);
let sel = null;      // {a, b} selected cell
let hover = null;

const STOPS = [[8, 10, 12], [60, 20, 90], [190, 40, 90], [255, 138, 61], [255, 235, 140]];
function ramp(t) {
  t = Math.max(0, Math.min(1, t)) * (STOPS.length - 1);
  const i = Math.min(STOPS.length - 2, Math.floor(t)), f = t - i;
  return STOPS[i].map((c, k) => Math.round(c + (STOPS[i + 1][k] - c) * f));
}

function grid(mode, bw) {
  const g = new Float64Array(N * N); // g[(b-Y0)*N + (a-Y0)] sampled at cell centres
  if (mode === "cells") {
    for (const r of rows) g[(r.b - Y0) * N + (r.a - Y0)]++;
    return g;
  }
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    let s = 0;
    for (const r of rows) {
      const dx = (r.a - Y0) - i, dy = (r.b - Y0) - j;
      s += Math.exp(-(dx * dx + dy * dy) / (2 * bw * bw));
    }
    g[j * N + i] = s;
  }
  return g;
}

function draw() {
  const mode = $("mode").value, bw = +$("bw").value;
  $("bwWrap").hidden = mode === "cells";
  $("bwOut").textContent = bw + "y";
  ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.fillStyle = "#080a0c"; ctx.fillRect(0, 0, cv.width, cv.height);
  const g = grid(mode, bw);
  let max = 0; for (const v of g) if (v > max) max = v;

  ctx.save();
  // keep only the triangle where discovery >= introduction
  ctx.beginPath(); ctx.moveTo(px(Y0), py(Y0) + ch); ctx.lineTo(px(Y0), py(Y1));
  ctx.lineTo(px(Y1 + 1), py(Y1)); ctx.closePath(); ctx.clip();
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const v = g[j * N + i];
    const t = mode === "cells" ? (v ? 0.25 + 0.75 * v / max : 0) : Math.pow(v / max, 0.8);
    const [r, gg, b] = ramp(t);
    ctx.fillStyle = `rgb(${r},${gg},${b})`;
    ctx.fillRect(px(Y0 + i), py(Y0 + j), cw + 0.5, ch + 0.5);
  }
  ctx.restore();

  // diagonal: discovered the same year it shipped
  ctx.strokeStyle = "#8794a3"; ctx.setLineDash([5, 5]); ctx.beginPath();
  ctx.moveTo(px(Y0), py(Y0) + ch); ctx.lineTo(px(Y1 + 1), py(Y1)); ctx.stroke(); ctx.setLineDash([]);

  if ($("dots").checked) {
    ctx.fillStyle = "rgba(255,255,255,.75)";
    for (const r of rows) {
      ctx.beginPath(); ctx.arc(px(r.a) + cw / 2, py(r.b) + ch / 2, 2, 0, 7); ctx.fill();
    }
  }
  if (sel) { ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.strokeRect(px(sel.a), py(sel.b), cw, ch); ctx.lineWidth = 1; }

  // axes
  ctx.fillStyle = "#8794a3"; ctx.font = "14px ui-monospace, monospace";
  ctx.textAlign = "center";
  for (let y = 1980; y <= Y1; y += 5) ctx.fillText(y, px(y) + cw / 2, cv.height - M.b + 20);
  ctx.textAlign = "right";
  for (let y = 1980; y <= Y1; y += 5) ctx.fillText(y, M.l - 8, py(y) + ch / 2 + 5);
  ctx.textAlign = "center";
  ctx.fillText("year introduced", M.l + W / 2, cv.height - 10);
  ctx.save(); ctx.translate(14, M.t + H / 2); ctx.rotate(-Math.PI / 2); ctx.fillText("year discovered", 0, 0); ctx.restore();
  ctx.strokeStyle = "#232a33"; ctx.strokeRect(M.l, M.t, W, H);
}

function cellAt(ev) {
  const r = cv.getBoundingClientRect(), k = cv.width / r.width;
  const x = (ev.clientX - r.left) * k, y = (ev.clientY - r.top) * k;
  const a = Y0 + Math.floor((x - M.l) / cw), b = Y1 - Math.floor((y - M.t) / ch);
  if (a < Y0 || a > Y1 || b < Y0 || b > Y1) return null;
  return { a, b, x: ev.clientX - r.left, y: ev.clientY - r.top, w: r.width };
}
const inCell = (c) => rows.filter((r) => r.a === c.a && r.b === c.b);

function esc(s) { return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

cv.addEventListener("mousemove", (ev) => {
  const c = cellAt(ev), tip = $("tip");
  if (!c || c.b < c.a) { tip.hidden = true; return; }
  const hit = inCell(c);
  tip.innerHTML = `<b>introduced ${c.a} → found ${c.b}</b> (${c.b - c.a}y)<br>` +
    (hit.length ? hit.map((r) => esc(r.name)).join("<br>") : "<span style='color:#8794a3'>none in the dataset</span>");
  tip.hidden = false;
  tip.style.left = Math.min(c.x + 14, c.w - 270) + "px";
  tip.style.top = c.y + 14 + "px";
});
cv.addEventListener("mouseleave", () => { $("tip").hidden = true; });
cv.addEventListener("click", (ev) => {
  const c = cellAt(ev);
  sel = c && c.b >= c.a ? { a: c.a, b: c.b } : null;
  draw(); renderList();
});
$("clear").addEventListener("click", () => { sel = null; draw(); renderList(); });
for (const id of ["mode", "bw", "dots"]) $(id).addEventListener("input", draw);

function median(xs) { const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }

function renderStats() {
  const lives = rows.map((r) => r.life);
  const longest = rows.reduce((p, r) => (r.life > p.life ? r : p));
  const same = rows.filter((r) => r.life === 0).length;
  const over10 = rows.filter((r) => r.life >= 10).length;
  const tiles = [
    [rows.length, "vulnerabilities plotted"],
    [median(lives) + "y", "median time lurking"],
    [Math.round(over10 / rows.length * 100) + "%", "lurked 10+ years"],
    [same, "found the year they shipped"],
    [longest.life + "y", "longest: " + longest.name],
  ];
  $("stats").innerHTML = tiles.map(([b, s]) => `<div><b>${esc(String(b))}</b>${esc(s)}</div>`).join("");
}

function renderList() {
  const shown = (sel ? rows.filter((r) => r.a === sel.a && r.b === sel.b) : rows)
    .slice().sort((x, y) => y.life - x.life || x.a - y.a);
  $("listHead").textContent = sel ? `introduced ${sel.a}, found ${sel.b}` : "all vulnerabilities, longest-lurking first";
  $("clear").hidden = !sel;
  $("list").innerHTML = shown.length
    ? shown.map((r) => `<li><span class="yrs">${r.a} → ${r.b} (${r.life}y)</span><span>${esc(r.name)}</span><span class="id">${esc(r.id)}</span></li>`).join("")
    : "<li>nothing in the dataset for that cell</li>";
}

const text = `Security vulnerabilities by year introduced vs. year discovered — median ${median(rows.map((r) => r.life))} years lurking, longest ${Math.max(...rows.map((r) => r.life))}.`;
$("share").href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(text + " https://vulndensity.bisks.net/");

renderStats(); renderList(); draw();
