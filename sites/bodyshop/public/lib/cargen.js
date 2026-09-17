// cargen.js — turns a carbuilder.js "build" object into a low-poly SVG car.
// Every body style is a hand-placed point list in {x, dy} form where dy is
// height above the chassis bottom edge (not an absolute y) so ride-height
// kits (slammed/lifted) can shift the whole car by changing one number.
// Points flagged `true` as a 3rd array element are the roofline/cabin run;
// windowPolygon() turns whichever of those exist into a glass band, so a
// 2-point convertible windshield and a 5-point sedan roof both fall out of
// the same code path.

import { mulberry32 } from "./carbuilder.js";

const BOTTOM_BASE = 176;

const OUTLINES = {
  sedan: [
    [30, 0], [30, 16], [65, 55], [115, 95, true], [150, 140, true],
    [255, 140, true], [300, 95, true], [350, 45], [410, 16], [410, 0],
  ],
  coupe: [
    [30, 0], [30, 16], [70, 58], [120, 100, true], [155, 128, true],
    [225, 128, true], [270, 85, true], [330, 40], [410, 16], [410, 0],
  ],
  wagon: [
    [30, 0], [30, 16], [65, 55], [115, 95, true], [150, 140, true],
    [320, 140, true], [365, 100, true], [400, 55], [410, 30], [410, 0],
  ],
  hatch: [
    [30, 0], [30, 16], [70, 58], [120, 98, true], [155, 132, true],
    [270, 132, true], [320, 55, true], [340, 20], [410, 16], [410, 0],
  ],
  pickup: [
    [30, 0], [30, 16], [65, 55], [110, 95, true], [145, 140, true],
    [205, 140, true], [235, 95, true], [237, 55], [385, 55], [410, 30], [410, 0],
  ],
  van: [
    [25, 0], [25, 20], [40, 150, true], [70, 165, true], [380, 165, true],
    [405, 20, true], [415, 20], [415, 0],
  ],
  kei: [
    [90, 0], [90, 16], [105, 110, true], [125, 125, true], [230, 125, true],
    [250, 60, true], [252, 40], [330, 40], [350, 16], [350, 0],
  ],
  muscle: [
    [30, 0], [30, 16], [100, 60], [145, 100, true], [175, 130, true],
    [230, 130, true], [265, 90, true], [330, 45], [410, 16], [410, 0],
  ],
  lowrider: [
    [30, 0], [30, 14], [75, 45], [130, 80, true], [170, 105, true],
    [290, 105, true], [335, 80, true], [385, 40], [410, 14], [410, 0],
  ],
  convertible: [
    [30, 0], [30, 16], [70, 58], [120, 98, true], [150, 112, true],
    [230, 70, true], [270, 50], [330, 40], [410, 16], [410, 0],
  ],
};

const WHEEL_POS = {
  sedan: { front: 110, rear: 330, r: 34 },
  coupe: { front: 115, rear: 325, r: 34 },
  wagon: { front: 110, rear: 345, r: 33 },
  hatch: { front: 115, rear: 335, r: 33 },
  pickup: { front: 110, rear: 345, r: 34 },
  van: { front: 95, rear: 360, r: 32 },
  kei: { front: 130, rear: 310, r: 26 },
  muscle: { front: 125, rear: 335, r: 36 },
  lowrider: { front: 115, rear: 330, r: 30 },
  convertible: { front: 115, rear: 325, r: 33 },
};

const RIDE_HEIGHT_DY = { stock: 0, widebody: 0, bosozoku: 0, drift: 0, slammed: -16, lifted: 22 };
const STANCE_WIDEN = { widebody: 8, bosozoku: 10, drift: 6 };

function outlinePath(points, bottom) {
  const d = points.map(([x, dy], i) => `${i === 0 ? "M" : "L"}${x},${(bottom - dy).toFixed(1)}`);
  return d.join(" ") + " Z";
}

function windowPolygon(points, bottom) {
  const cab = points.filter((p) => p[2]);
  if (cab.length < 2) return null;
  const tops = cab.map(([x, dy]) => [x, bottom - (dy - 8)]);
  const bottoms = cab.map(([x, dy]) => [x, bottom - Math.max(dy - 34, 6)]);
  return [...tops, ...bottoms.reverse()].map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
}

function finishFill(build, uid) {
  const hue = build.hue;
  const base = `hsl(${hue} 62% 46%)`;
  switch (build.finish.id) {
    case "matte":
      return `hsl(${hue} 30% 38%)`;
    case "patina":
      return `url(#patina-${uid})`;
    case "chrome":
      return `url(#chrome-${uid})`;
    case "pearl":
    case "metallic":
      return `url(#sheen-${uid})`;
    default:
      return base;
  }
}

function defsFor(build, uid) {
  const hue = build.hue;
  const rng = mulberry32((build.seed >>> 0) ^ 0x9e3779b9);
  const spots = build.finish.id === "patina"
    ? Array.from({ length: 10 }, () => `<circle cx="${(30 + rng() * 380).toFixed(0)}" cy="${(20 + rng() * 130).toFixed(0)}" r="${(4 + rng() * 10).toFixed(0)}" fill="hsl(20 45% 32%)" opacity="${(0.3 + rng() * 0.4).toFixed(2)}" />`).join("")
    : "";
  return `
    <linearGradient id="sheen-${uid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="hsl(${hue} 70% 68%)" />
      <stop offset="0.5" stop-color="hsl(${hue} 62% 46%)" />
      <stop offset="1" stop-color="hsl(${hue} 55% 32%)" />
    </linearGradient>
    <linearGradient id="chrome-${uid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f4f6f8" />
      <stop offset="0.35" stop-color="#9aa4ad" />
      <stop offset="0.6" stop-color="#e8ecef" />
      <stop offset="1" stop-color="#6b7480" />
    </linearGradient>
    <pattern id="patina-${uid}" width="440" height="176" patternUnits="userSpaceOnUse">
      <rect width="440" height="176" fill="hsl(${hue} 25% 34%)" />
      ${spots}
    </pattern>
    <radialGradient id="glow-${uid}" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="hsl(${hue} 90% 60%)" stop-opacity="0.85" />
      <stop offset="1" stop-color="hsl(${hue} 90% 60%)" stop-opacity="0" />
    </radialGradient>
  `;
}

function wheel(cx, bottom, r, style) {
  const cy = bottom;
  const spokes = Array.from({ length: style.spokes }, (_, i) => {
    const a = (i / style.spokes) * Math.PI * 2;
    const x2 = cx + Math.cos(a) * r * 0.62;
    const y2 = cy + Math.sin(a) * r * 0.62;
    return `<line x1="${cx}" y1="${cy}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#cfd4da" stroke-width="2.5" />`;
  }).join("");
  const rimColor = style.id === "forged" ? "#e7c37a" : style.id === "spinners" ? "#ffd24e" : "#c7ccd2";
  const tread = style.id === "offroad"
    ? Array.from({ length: 10 }, (_, i) => {
        const a = (i / 10) * Math.PI * 2;
        const x1 = cx + Math.cos(a) * (r - 2), y1 = cy + Math.sin(a) * (r - 2);
        const x2 = cx + Math.cos(a) * (r + 4), y2 = cy + Math.sin(a) * (r + 4);
        return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#111" stroke-width="3" />`;
      }).join("")
    : "";
  const rimR = style.id === "deepdish" ? r * 0.72 : r * 0.55;
  return `
    <g>
      ${tread}
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="#161616" stroke="#000" stroke-width="1.5" />
      <circle cx="${cx}" cy="${cy}" r="${rimR}" fill="${rimColor}" stroke="#8a8f96" stroke-width="1.5" />
      ${spokes}
      <circle cx="${cx}" cy="${cy}" r="${style.id === "spinners" ? r * 0.22 : r * 0.14}" fill="#3a3f45" />
    </g>
  `;
}

function spoiler(build, points, bottom, uid) {
  const cab = points.filter((p) => p[2]);
  if (!cab.length || build.spoiler.id === "none") return "";
  const tailX = points[points.length - 3][0];
  const tailDy = 45;
  const fill = `url(#sheen-${uid})`;
  if (build.spoiler.id === "ducktail") {
    return `<path d="M${tailX - 20},${bottom - tailDy} L${tailX + 20},${bottom - tailDy} L${tailX + 12},${bottom - tailDy - 8} L${tailX - 12},${bottom - tailDy - 8} Z" fill="${fill}" stroke="#0006" />`;
  }
  const big = build.spoiler.id === "gtwing";
  const h = big ? 34 : 22, w = big ? 70 : 50;
  const baseY = bottom - tailDy - 6;
  return `
    <line x1="${tailX - w / 2}" y1="${baseY}" x2="${tailX - w / 2 + 4}" y2="${baseY - h}" stroke="#333" stroke-width="4" />
    <line x1="${tailX + w / 2}" y1="${baseY}" x2="${tailX + w / 2 - 4}" y2="${baseY - h}" stroke="#333" stroke-width="4" />
    <rect x="${tailX - w / 2 - 6}" y="${baseY - h - 8}" width="${w + 12}" height="10" rx="2" fill="${fill}" stroke="#0006" />
  `;
}

function glowLayer(build, bottom, uid) {
  if (!build.extras.some((e) => e.id === "underglow")) return "";
  return `<ellipse cx="220" cy="${bottom + 6}" rx="200" ry="16" fill="url(#glow-${uid})" />`;
}

function extrasLayer(build, points, bottom, uid) {
  const has = (id) => build.extras.some((e) => e.id === id);
  const parts = [];
  if (has("flames")) {
    parts.push(`<path d="M70,${bottom - 10} q18,-30 6,-50 q22,10 20,34 q16,-14 8,-32 q20,16 8,44 Z" fill="#ff7a1a" opacity="0.9" stroke="#b33" stroke-width="1.5" />`);
  }
  if (has("stripe")) {
    const cab = points.filter((p) => p[2]);
    const midDy = cab.length ? cab[0][1] : 100;
    parts.push(`<rect x="140" y="${(bottom - midDy - 40).toFixed(1)}" width="10" height="${(midDy + 40).toFixed(1)}" fill="#fff" opacity="0.85" />`);
    parts.push(`<rect x="156" y="${(bottom - midDy - 40).toFixed(1)}" width="6" height="${(midDy + 40).toFixed(1)}" fill="#fff" opacity="0.6" />`);
  }
  if (has("roofrack")) {
    const cab = points.filter((p) => p[2]);
    if (cab.length >= 2) {
      const [x1] = cab[0], [x2] = cab[cab.length - 1];
      const y = bottom - Math.max(...cab.map((p) => p[1])) - 6;
      parts.push(`<line x1="${x1 + 10}" y1="${y}" x2="${x1 + 10}" y2="${y - 8}" stroke="#222" stroke-width="3" />`);
      parts.push(`<line x1="${x2 - 10}" y1="${y}" x2="${x2 - 10}" y2="${y - 8}" stroke="#222" stroke-width="3" />`);
      parts.push(`<line x1="${x1 + 4}" y1="${y - 8}" x2="${x2 - 4}" y2="${y - 8}" stroke="#222" stroke-width="4" />`);
    }
  }
  if (has("nitrous")) {
    parts.push(`<rect x="345" y="${bottom - 30}" width="10" height="22" rx="3" fill="#7ec9f2" stroke="#2a6f9e" />`);
    parts.push(`<rect x="347" y="${bottom - 34}" width="6" height="6" fill="#2a6f9e" />`);
  }
  if (has("plate") && build.plate) {
    parts.push(`<rect x="392" y="${bottom - 14}" width="24" height="12" rx="1.5" fill="#eee" stroke="#333" stroke-width="1" />`);
    parts.push(`<text x="404" y="${bottom - 5.5}" font-size="5" text-anchor="middle" font-family="ui-monospace,monospace" fill="#222">${escapeXml(build.plate).slice(0, 9)}</text>`);
  }
  return parts.join("");
}

function escapeXml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

let uidCounter = 0;

export function carSVG(build) {
  const uid = `c${uidCounter++}`;
  const outline = OUTLINES[build.body.id] || OUTLINES.sedan;
  const wp = WHEEL_POS[build.body.id] || WHEEL_POS.sedan;
  const bottom = BOTTOM_BASE - (RIDE_HEIGHT_DY[build.kit.id] || 0);
  const widen = STANCE_WIDEN[build.kit.id] || 0;
  const frontX = wp.front - widen, rearX = wp.rear + widen;
  const wheelR = wp.r + (build.wheels.id === "offroad" ? 4 : 0) + (build.kit.id === "lifted" ? 4 : 0);

  const bodyFill = finishFill(build, uid);
  const win = windowPolygon(outline, bottom);
  const winFill = build.extras.some((e) => e.id === "tint") ? "#1a2230" : "#bfe3f5";

  const fenders = widen
    ? `<circle cx="${frontX}" cy="${bottom - 8}" r="${wheelR + 10}" fill="${bodyFill}" opacity="0.9" />
       <circle cx="${rearX}" cy="${bottom - 8}" r="${wheelR + 10}" fill="${bodyFill}" opacity="0.9" />`
    : "";

  return `
<svg viewBox="0 0 440 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escapeXml(build.year + " " + build.body.label)}">
  <defs>${defsFor(build, uid)}</defs>
  <line x1="10" y1="${bottom + wheelR + 2}" x2="430" y2="${bottom + wheelR + 2}" stroke="#00000022" stroke-width="4" />
  ${glowLayer(build, bottom, uid)}
  ${fenders}
  ${wheel(frontX, bottom - 4, wheelR, build.wheels)}
  ${wheel(rearX, bottom - 4, wheelR, build.wheels)}
  <path d="${outlinePath(outline, bottom)}" fill="${bodyFill}" stroke="#00000055" stroke-width="2" stroke-linejoin="round" />
  ${win ? `<polygon points="${win}" fill="${winFill}" opacity="0.92" />` : ""}
  ${spoiler(build, outline, bottom, uid)}
  ${extrasLayer(build, outline, bottom, uid)}
</svg>`;
}
