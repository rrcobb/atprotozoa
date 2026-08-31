// scatter.js — the Ashby-style trade-space plot: points positioned by two
// data-driven properties (not clicked by hand, like sites/polcompass's plot),
// axes that can be log or linear, and a "selection line" through the points
// nothing else beats on both axes at once. viewBox is a fixed 0..100 square
// with margin reserved for tick labels, so pixel math stays simple.

const SVG_NS = "http://www.w3.org/2000/svg";
const V = 100;
const MARGIN = { left: 15, right: 5, top: 5, bottom: 12 };
const PLOT = { x0: MARGIN.left, y0: MARGIN.top, x1: V - MARGIN.right, y1: V - MARGIN.bottom };

function fmtCompact(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, "") + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(/\.0$/, "") + "K";
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(n < 10 ? 2 : 1);
}

// Domain padded a little past the data so edge points aren't drawn on top of
// the axis line. Log domains never go below 0 (log1p handles zero values).
export function computeDomain(values, log) {
  const finite = values.filter((v) => Number.isFinite(v));
  if (!finite.length) return { min: 0, max: 1, log };
  let min = Math.min(...finite);
  let max = Math.max(...finite);
  if (min === max) {
    min = log ? min : min - 1;
    max = max + Math.max(1, Math.abs(max) * 0.1);
  }
  if (log) min = Math.max(0, min);
  const pad = (max - min) * 0.08;
  return { min: log ? min : min - pad, max: max + pad, log };
}

function norm(v, domain) {
  const { min, max, log } = domain;
  if (log) {
    const a = Math.log10(Math.max(0, min) + 1);
    const b = Math.log10(Math.max(0, max) + 1);
    const x = Math.log10(Math.max(0, v) + 1);
    return b === a ? 0.5 : (x - a) / (b - a);
  }
  return max === min ? 0.5 : (v - min) / (max - min);
}

function toPixel(x, y, xDomain, yDomain) {
  const nx = norm(x, xDomain);
  const ny = norm(y, yDomain);
  return [PLOT.x0 + nx * (PLOT.x1 - PLOT.x0), PLOT.y1 - ny * (PLOT.y1 - PLOT.y0)];
}

function ticks(domain, count = 5) {
  const { min, max, log } = domain;
  if (log) {
    const a = Math.log10(Math.max(0, min) + 1);
    const b = Math.log10(Math.max(0, max) + 1);
    const out = [];
    for (let i = 0; i <= count; i++) {
      const t = a + ((b - a) * i) / count;
      out.push(Math.pow(10, t) - 1);
    }
    return out;
  }
  const out = [];
  for (let i = 0; i <= count; i++) out.push(min + ((max - min) * i) / count);
  return out;
}

export function makeScatterSvg() {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${V} ${V}`);
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

  const axes = document.createElementNS(SVG_NS, "g");
  axes.setAttribute("data-role", "axes");
  svg.appendChild(axes);

  const frontier = document.createElementNS(SVG_NS, "g");
  frontier.setAttribute("data-role", "frontier");
  svg.appendChild(frontier);

  const markers = document.createElementNS(SVG_NS, "g");
  markers.setAttribute("data-role", "markers");
  svg.appendChild(markers);

  return svg;
}

function layer(svg, role) {
  return svg.querySelector(`[data-role="${role}"]`);
}

export function drawAxes(svg, xDomain, yDomain) {
  const g = layer(svg, "axes");
  g.replaceChildren();

  const border = document.createElementNS(SVG_NS, "rect");
  border.setAttribute("x", String(PLOT.x0));
  border.setAttribute("y", String(PLOT.y0));
  border.setAttribute("width", String(PLOT.x1 - PLOT.x0));
  border.setAttribute("height", String(PLOT.y1 - PLOT.y0));
  border.setAttribute("class", "plot-border");
  g.appendChild(border);

  for (const v of ticks(xDomain)) {
    const [px] = toPixel(v, yDomain.min, xDomain, yDomain);
    const line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("x1", String(px));
    line.setAttribute("x2", String(px));
    line.setAttribute("y1", String(PLOT.y0));
    line.setAttribute("y2", String(PLOT.y1));
    line.setAttribute("class", "grid-line");
    g.appendChild(line);

    const label = document.createElementNS(SVG_NS, "text");
    label.setAttribute("x", String(px));
    label.setAttribute("y", String(PLOT.y1 + 6));
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("class", "tick-label");
    label.textContent = fmtCompact(v);
    g.appendChild(label);
  }

  for (const v of ticks(yDomain)) {
    const [, py] = toPixel(xDomain.min, v, xDomain, yDomain);
    const line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("x1", String(PLOT.x0));
    line.setAttribute("x2", String(PLOT.x1));
    line.setAttribute("y1", String(py));
    line.setAttribute("y2", String(py));
    line.setAttribute("class", "grid-line");
    g.appendChild(line);

    const label = document.createElementNS(SVG_NS, "text");
    label.setAttribute("x", String(PLOT.x0 - 2));
    label.setAttribute("y", String(py + 1.2));
    label.setAttribute("text-anchor", "end");
    label.setAttribute("class", "tick-label");
    label.textContent = fmtCompact(v);
    g.appendChild(label);
  }
}

export function drawFrontier(svg, points, xDomain, yDomain) {
  const g = layer(svg, "frontier");
  g.replaceChildren();
  if (points.length < 2) return;

  const pts = points.map((p) => toPixel(p.x, p.y, xDomain, yDomain));
  const path = document.createElementNS(SVG_NS, "polyline");
  path.setAttribute("points", pts.map((p) => p.join(",")).join(" "));
  path.setAttribute("class", "frontier-line");
  g.appendChild(path);
}

let clipCounter = 0;

export function drawPoint(svg, point, xDomain, yDomain) {
  const [px, py] = toPixel(point.x, point.y, xDomain, yDomain);
  const g = document.createElementNS(SVG_NS, "g");
  const radius = 3.2;

  if (point.avatar) {
    const clipId = `sclip-${clipCounter++}`;
    const clip = document.createElementNS(SVG_NS, "clipPath");
    clip.setAttribute("id", clipId);
    const c = document.createElementNS(SVG_NS, "circle");
    c.setAttribute("cx", String(px));
    c.setAttribute("cy", String(py));
    c.setAttribute("r", String(radius));
    clip.appendChild(c);
    g.appendChild(clip);

    const img = document.createElementNS(SVG_NS, "image");
    img.setAttribute("href", point.avatar);
    img.setAttribute("x", String(px - radius));
    img.setAttribute("y", String(py - radius));
    img.setAttribute("width", String(radius * 2));
    img.setAttribute("height", String(radius * 2));
    img.setAttribute("clip-path", `url(#${clipId})`);
    img.setAttribute("preserveAspectRatio", "xMidYMid slice");
    g.appendChild(img);
  }

  const ring = document.createElementNS(SVG_NS, "circle");
  ring.setAttribute("cx", String(px));
  ring.setAttribute("cy", String(py));
  ring.setAttribute("r", String(radius));
  ring.setAttribute("class", point.onFrontier ? "pt-dot on-frontier" : "pt-dot");
  ring.setAttribute("fill", point.avatar ? "none" : "#1a5fd0");
  g.appendChild(ring);

  const label = document.createElementNS(SVG_NS, "text");
  label.setAttribute("x", String(px));
  label.setAttribute("y", String(py - radius - 1.6));
  label.setAttribute("text-anchor", "middle");
  label.setAttribute("class", "pt-label");
  label.textContent = point.label;
  g.appendChild(label);

  const title = document.createElementNS(SVG_NS, "title");
  title.textContent = point.label;
  g.appendChild(title);

  layer(svg, "markers").appendChild(g);
  return g;
}

export function clearPoints(svg) {
  layer(svg, "markers").replaceChildren();
}
