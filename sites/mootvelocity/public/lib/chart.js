// chart.js — a log/log scatter: active tenure (x) vs followers (y), one
// account per dot. Emphasis form (dataviz skill): "you" in the accent hue,
// every moot in the de-emphasis gray — the story is one point among its
// peers, not eight named series. Diagonal guide lines are constant-velocity
// isolines (followers = velocity * days), so a dot's position above/below a
// guide reads directly as "faster/slower than that rate".

const NS = "http://www.w3.org/2000/svg";

function el(tag, attrs) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}

function logScale(domainMin, domainMax, rangeMin, rangeMax) {
  const lo = Math.log10(Math.max(domainMin, 0.5));
  const hi = Math.log10(Math.max(domainMax, domainMin * 1.01));
  const span = hi - lo || 1;
  return (v) => rangeMin + ((Math.log10(Math.max(v, 0.5)) - lo) / span) * (rangeMax - rangeMin);
}

// "nice" powers-of-ten (and their 2x/5x) between lo and hi, for axis ticks
// and velocity guide lines.
function niceLogTicks(lo, hi) {
  const ticks = [];
  const startExp = Math.floor(Math.log10(Math.max(lo, 0.5)));
  const endExp = Math.ceil(Math.log10(hi));
  for (let e10 = startExp; e10 <= endExp; e10++) {
    for (const m of [1, 2, 5]) {
      const v = m * Math.pow(10, e10);
      if (v >= lo * 0.9 && v <= hi * 1.1) ticks.push(v);
    }
  }
  return ticks;
}

function daysLabel(days) {
  if (days < 60) return Math.round(days) + "d";
  const months = days / 30.44;
  if (months < 24) return Math.round(months) + "mo";
  return Math.round(months / 12) + "y";
}

function followersLabel(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(n >= 10000000 ? 0 : 1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "k";
  return String(Math.round(n));
}

// points: [{ did, handle, displayName, avatar, activeDays, followers, velocityPerMonth, isSubject, confidence }]
export function renderChart(svg, points, { tooltip, onHover } = {}) {
  svg.innerHTML = "";
  const plottable = points.filter((p) => p.activeDays != null && p.followers != null);
  if (!plottable.length) return;

  const W = 720, H = 440;
  const pad = { l: 52, r: 20, t: 20, b: 40 };
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);

  const days = plottable.map((p) => Math.max(1, p.activeDays));
  const followers = plottable.map((p) => Math.max(1, p.followers));
  const xMin = Math.min(...days) * 0.7;
  const xMax = Math.max(...days) * 1.4;
  const yMin = Math.min(...followers) * 0.6;
  const yMax = Math.max(...followers) * 1.6;

  const x = logScale(xMin, xMax, pad.l, W - pad.r);
  const y = logScale(yMin, yMax, H - pad.b, pad.t);

  const root = el("g", {});
  svg.appendChild(root);

  // gridlines (recessive, hairline) + axis ticks
  const xTicks = niceLogTicks(xMin, xMax);
  const yTicks = niceLogTicks(yMin, yMax);
  for (const t of xTicks) {
    const gx = x(t);
    root.appendChild(el("line", { x1: gx, x2: gx, y1: pad.t, y2: H - pad.b, class: "gridline" }));
    const lbl = el("text", { x: gx, y: H - pad.b + 16, class: "axistext", "text-anchor": "middle" });
    lbl.textContent = daysLabel(t);
    root.appendChild(lbl);
  }
  for (const t of yTicks) {
    const gy = y(t);
    root.appendChild(el("line", { x1: pad.l, x2: W - pad.r, y1: gy, y2: gy, class: "gridline" }));
    const lbl = el("text", { x: pad.l - 8, y: gy + 3, class: "axistext", "text-anchor": "end" });
    lbl.textContent = followersLabel(t);
    root.appendChild(lbl);
  }
  root.appendChild(el("line", { x1: pad.l, x2: pad.l, y1: pad.t, y2: H - pad.b, class: "axisline" }));
  root.appendChild(el("line", { x1: pad.l, x2: W - pad.r, y1: H - pad.b, y2: H - pad.b, class: "axisline" }));

  const xlab = el("text", { x: (pad.l + W - pad.r) / 2, y: H - 4, class: "axislabel", "text-anchor": "middle" });
  xlab.textContent = "active time (real posting history, not account age) →";
  root.appendChild(xlab);
  const ylab = el("text", {
    x: -((H - pad.b + pad.t) / 2), y: 14, class: "axislabel", "text-anchor": "middle",
    transform: "rotate(-90)",
  });
  ylab.textContent = "followers →";
  root.appendChild(ylab);

  // constant-velocity guide lines: followers = v * (days/30.44). For a given
  // v, clip the line to wherever it's actually inside the plotted box.
  for (const v of [1, 10, 100, 1000, 10000]) {
    const xAtYMin = (yMin * 30.44) / v;
    const xAtYMax = (yMax * 30.44) / v;
    const xStart = Math.max(xMin, xAtYMin);
    const xEnd = Math.min(xMax, xAtYMax);
    if (xStart >= xEnd) continue;
    const yStart = (v * xStart) / 30.44;
    const yEnd = (v * xEnd) / 30.44;
    root.appendChild(el("line", { x1: x(xStart), y1: y(yStart), x2: x(xEnd), y2: y(yEnd), class: "veloline" }));
    const label = el("text", { x: x(xEnd) - 4, y: y(yEnd) - 4, class: "velolabel", "text-anchor": "end" });
    label.textContent = followersLabel(v) + "/mo";
    root.appendChild(label);
  }

  // dots: moots first (so "you" draws on top), transparent hit area ≥24px
  const ordered = plottable.slice().sort((a, b) => (a.isSubject ? 1 : 0) - (b.isSubject ? 1 : 0));
  for (const p of ordered) {
    const cx = x(Math.max(1, p.activeDays));
    const cy = y(Math.max(1, p.followers));
    const g = el("g", { class: "dot" + (p.isSubject ? " subject" : "") });

    const hit = el("circle", { cx, cy, r: 13, class: "hit" });
    const mark = el("circle", {
      cx, cy,
      r: p.isSubject ? 9 : 6,
      class: "mark" + (p.confidence === "floor" ? " estimate" : ""),
    });
    g.appendChild(hit);
    g.appendChild(mark);
    g.addEventListener("pointerenter", (e) => onHover && onHover(p, e));
    g.addEventListener("pointermove", (e) => onHover && onHover(p, e));
    g.addEventListener("pointerleave", () => onHover && onHover(null));
    g.addEventListener("focus", () => onHover && onHover(p));
    g.setAttribute("tabindex", "0");
    root.appendChild(g);
  }
}
