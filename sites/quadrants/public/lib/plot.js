// plot.js — shared SVG quadrant-plot rendering, used by both index.html (the
// create-a-chart live preview) and chart.html (the live view + click-to-place).
// viewBox is a fixed 0..100 square so pixel<->normalized-coordinate math stays
// simple: normalized x/y run -1..1, center at (50,50), +y is UP (flipped from
// SVG's native down-positive y).

const SVG_NS = "http://www.w3.org/2000/svg";
const V = 100; // viewBox size

export function makePlotSvg() {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${V} ${V}`);
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

  const cross = document.createElementNS(SVG_NS, "g");
  cross.innerHTML = `
    <line x1="${V / 2}" y1="0" x2="${V / 2}" y2="${V}" stroke="#14171a" stroke-width="0.6" />
    <line x1="0" y1="${V / 2}" x2="${V}" y2="${V / 2}" stroke="#14171a" stroke-width="0.6" />
  `;
  svg.appendChild(cross);

  const markers = document.createElementNS(SVG_NS, "g");
  markers.setAttribute("data-role", "markers");
  svg.appendChild(markers);

  return svg;
}

function markerLayer(svg) {
  return svg.querySelector('[data-role="markers"]') || svg;
}

export function clearMarkers(svg) {
  markerLayer(svg).replaceChildren();
}

// x,y in [-1,1], +y up -> [px,py] in the 0..100 viewBox, +py down.
function toPixel(x, y) {
  return [((x + 1) / 2) * V, ((1 - y) / 2) * V];
}

// A pointer event on the svg element -> normalized [x,y] in [-1,1], clamped.
export function eventToNorm(svg, evt) {
  const rect = svg.getBoundingClientRect();
  const px = ((evt.clientX - rect.left) / rect.width) * V;
  const py = ((evt.clientY - rect.top) / rect.height) * V;
  const x = Math.max(-1, Math.min(1, (px / V) * 2 - 1));
  const y = Math.max(-1, Math.min(1, 1 - (py / V) * 2));
  return [x, y];
}

export function drawAnchor(svg, anchor, { onClick } = {}) {
  const [px, py] = toPixel(anchor.x, anchor.y);
  const g = document.createElementNS(SVG_NS, "g");
  const size = 2.1;
  const pts = [
    [px, py - size], [px + size, py], [px, py + size], [px - size, py],
  ].map((p) => p.join(",")).join(" ");
  const poly = document.createElementNS(SVG_NS, "polygon");
  poly.setAttribute("points", pts);
  poly.setAttribute("class", "anchor-dot");
  g.appendChild(poly);

  const label = document.createElementNS(SVG_NS, "text");
  label.setAttribute("x", String(px));
  label.setAttribute("y", String(py - size - 1.4));
  label.setAttribute("text-anchor", "middle");
  label.setAttribute("class", "anchor-label");
  label.textContent = anchor.label;
  g.appendChild(label);

  if (onClick) {
    g.style.cursor = "pointer";
    g.addEventListener("click", (e) => {
      e.stopPropagation();
      onClick(anchor);
    });
  }
  markerLayer(svg).appendChild(g);
  return g;
}

let clipCounter = 0;

export function drawPosition(svg, pos, { mine = false, moot = false, radius = 3.4 } = {}) {
  const [px, py] = toPixel(pos.x, pos.y);
  const g = document.createElementNS(SVG_NS, "g");
  g.setAttribute("data-did", pos.did || "");

  const cls = ["pos-dot"];
  if (mine) cls.push("mine");
  else if (moot) cls.push("moot");

  if (pos.avatar) {
    const clipId = `pclip-${clipCounter++}`;
    const clip = document.createElementNS(SVG_NS, "clipPath");
    clip.setAttribute("id", clipId);
    const clipCircle = document.createElementNS(SVG_NS, "circle");
    clipCircle.setAttribute("cx", String(px));
    clipCircle.setAttribute("cy", String(py));
    clipCircle.setAttribute("r", String(radius));
    clip.appendChild(clipCircle);
    g.appendChild(clip);

    const img = document.createElementNS(SVG_NS, "image");
    img.setAttribute("href", pos.avatar);
    img.setAttribute("x", String(px - radius));
    img.setAttribute("y", String(py - radius));
    img.setAttribute("width", String(radius * 2));
    img.setAttribute("height", String(radius * 2));
    img.setAttribute("clip-path", `url(#${clipId})`);
    img.setAttribute("preserveAspectRatio", "xMidYMid slice");
    g.appendChild(img);

    const ring = document.createElementNS(SVG_NS, "circle");
    ring.setAttribute("cx", String(px));
    ring.setAttribute("cy", String(py));
    ring.setAttribute("r", String(radius));
    ring.setAttribute("class", cls.join(" "));
    ring.setAttribute("fill", "none");
    g.appendChild(ring);
  } else {
    const circle = document.createElementNS(SVG_NS, "circle");
    circle.setAttribute("cx", String(px));
    circle.setAttribute("cy", String(py));
    circle.setAttribute("r", String(radius));
    circle.setAttribute("class", cls.join(" "));
    circle.setAttribute("fill", "#1a5fd0");
    g.appendChild(circle);
  }

  const title = document.createElementNS(SVG_NS, "title");
  title.textContent = pos.displayName || pos.handle || pos.did || "";
  g.appendChild(title);

  markerLayer(svg).appendChild(g);
  return g;
}
