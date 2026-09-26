// tubergen.js — turns a tuberbuilder.js "build" object into an SVG tuber.
// Body outline is a closed smooth-blob path: POINTS angular samples around an
// ellipse, each scaled by a seeded bump multiplier (see tuberbuilder.js's
// rollBumps), stitched together with quadratic curves through midpoints — the
// standard "smooth blob" trick, so a knobby potato and a round one fall out
// of the same code path with different bump amplitude.

import { POINTS } from "./tuberbuilder.js";

const CX = 150;
const CY = 178;

function escapeXml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function bodyPoints(build) {
  const { rx, ry } = build.shape;
  const pts = [];
  for (let i = 0; i < POINTS; i++) {
    const a = (i / POINTS) * Math.PI * 2 - Math.PI / 2;
    const m = build.bumps[i];
    pts.push([CX + Math.cos(a) * rx * m, CY + Math.sin(a) * ry * m, a]);
  }
  return pts;
}

function smoothBlobPath(pts) {
  const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  const n = pts.length;
  const start = mid(pts[n - 1], pts[0]);
  let d = `M${start[0].toFixed(1)},${start[1].toFixed(1)} `;
  for (let i = 0; i < n; i++) {
    const next = pts[(i + 1) % n];
    const m = mid(pts[i], next);
    d += `Q${pts[i][0].toFixed(1)},${pts[i][1].toFixed(1)} ${m[0].toFixed(1)},${m[1].toFixed(1)} `;
  }
  return d + "Z";
}

function spudLayer(build, pts) {
  const { rx, ry } = build.shape;
  return build.spuds
    .map((s) => {
      const x = CX + Math.cos(s.a) * rx * s.r;
      const y = CY + Math.sin(s.a) * ry * s.r * 0.85;
      return `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="${s.size.toFixed(1)}" ry="${(s.size * 0.7).toFixed(1)}" fill="${build.variety.shade}" opacity="0.55" />`;
    })
    .join("");
}

function eyesLayer(build) {
  const eyeY = CY - build.shape.ry * 0.18;
  const spacing = 30;
  const xs =
    build.eyeCount === 1 ? [0] : build.eyeCount === 2 ? [-spacing / 2, spacing / 2] : [-spacing, 0, spacing];
  return xs
    .map((dx) => {
      const x = CX + dx;
      return `
        <circle cx="${x}" cy="${eyeY}" r="13" fill="#fdf6e8" stroke="#00000022" />
        <circle cx="${x - 3}" cy="${(eyeY - 2).toFixed(1)}" r="7" fill="#241a12" />
        <circle cx="${(x - 5).toFixed(1)}" cy="${(eyeY - 4).toFixed(1)}" r="2.1" fill="#fff" />
      `;
    })
    .join("");
}

function sproutLayer(build, pts) {
  const top = pts[0]; // angle -PI/2, the topmost sample
  const x = top[0], y = top[1];
  switch (build.sprout.id) {
    case "single":
      return `<path d="M${x},${y} q-3,-16 4,-24" fill="none" stroke="#8fae63" stroke-width="4" stroke-linecap="round" />
              <circle cx="${(x + 4).toFixed(1)}" cy="${(y - 24).toFixed(1)}" r="4" fill="#c7d98f" />`;
    case "leafy":
      return `<path d="M${x},${y} q-2,-20 2,-30" fill="none" stroke="#6b9e4a" stroke-width="4" stroke-linecap="round" />
              <path d="M${x},${y - 18} q-16,-6 -20,6 q14,4 20,-2 Z" fill="#7fb85a" />
              <path d="M${(x + 2).toFixed(1)},${y - 24} q16,-8 22,4 q-14,6 -22,-1 Z" fill="#8fc96a" />`;
    case "roots": {
      const bottom = pts[Math.floor(POINTS / 2)];
      return `<path d="M${(bottom[0] - 10).toFixed(1)},${bottom[1]} q-4,10 -8,18" fill="none" stroke="#c9ab7c" stroke-width="2.5" stroke-linecap="round" />
              <path d="M${bottom[0]},${bottom[1]} q0,12 2,20" fill="none" stroke="#c9ab7c" stroke-width="2.5" stroke-linecap="round" />
              <path d="M${(bottom[0] + 10).toFixed(1)},${bottom[1]} q5,10 10,17" fill="none" stroke="#c9ab7c" stroke-width="2.5" stroke-linecap="round" />`;
    }
    default:
      return "";
  }
}

function accessoryLayer(build, pts) {
  const top = pts[0];
  const eyeY = CY - build.shape.ry * 0.18;
  const spacing = 30;
  const rightEyeX = CX + (build.eyeCount === 1 ? 0 : spacing / (build.eyeCount === 2 ? 2 : 1));
  switch (build.accessory.id) {
    case "bandana": {
      const x = top[0], y = top[1] + 18;
      return `
        <path d="M${(x - 50).toFixed(1)},${y.toFixed(1)} Q${(x - 50).toFixed(1)},${(y - 36).toFixed(1)} ${x},${(y - 42).toFixed(1)} Q${(x + 50).toFixed(1)},${(y - 36).toFixed(1)} ${(x + 50).toFixed(1)},${y.toFixed(1)} Z" fill="#d9473f" stroke="#00000033" stroke-width="1.5" />
        <path d="M${(x + 42).toFixed(1)},${(y - 4).toFixed(1)} q16,16 10,36 q-13,-5 -17,-22 Z" fill="#c23b34" />
        <path d="M${(x + 50).toFixed(1)},${(y - 10).toFixed(1)} q18,20 10,42 q-15,-6 -19,-24 Z" fill="#d9473f" />
      `;
    }
    case "mustache": {
      const y = eyeY + 25;
      return `<path d="M${CX - 30},${y} Q${CX - 15},${y - 15} ${CX},${y - 4} Q${CX + 15},${y - 15} ${CX + 30},${y} Q${CX + 15},${y + 10} ${CX},${y + 2} Q${CX - 15},${y + 10} ${CX - 30},${y} Z" fill="#3a2a1a" />`;
    }
    case "monocle":
      return `
        <circle cx="${rightEyeX}" cy="${eyeY}" r="16" fill="none" stroke="#d9b45a" stroke-width="2.5" />
        <path d="M${rightEyeX + 15},${eyeY + 10} q10,20 -4,30" fill="none" stroke="#d9b45a" stroke-width="2" />
      `;
    case "eyepatchL":
    case "eyepatchR": {
      const x = build.accessory.id === "eyepatchL" ? CX - (build.eyeCount === 1 ? 0 : spacing / (build.eyeCount === 2 ? 2 : 1)) : rightEyeX;
      return `
        <ellipse cx="${x}" cy="${eyeY}" rx="15" ry="16" fill="#181210" />
        <path d="M${x - 30},${eyeY - 12} L${x + 26},${eyeY - 20}" stroke="#181210" stroke-width="5" stroke-linecap="round" />
      `;
    }
    case "tophat":
      return `
        <rect x="${top[0] - 30}" y="${top[1] - 6}" width="60" height="8" rx="2" fill="#181210" />
        <rect x="${top[0] - 20}" y="${top[1] - 46}" width="40" height="42" rx="2" fill="#241a12" />
        <rect x="${top[0] - 20}" y="${top[1] - 12}" width="40" height="8" fill="#3a2a1a" />
      `;
    case "katana": {
      const bx = CX + build.shape.rx + 4, by = CY + 10;
      return `
        <g transform="rotate(-32 ${bx} ${by})">
          <rect x="${bx - 3}" y="${by - 70}" width="6" height="72" fill="#dfe6ec" stroke="#0003" />
          <rect x="${bx - 10}" y="${by - 2}" width="20" height="6" rx="2" fill="#c7a24a" />
          <rect x="${bx - 4}" y="${by + 4}" width="8" height="26" rx="2" fill="#3a2a1a" />
        </g>
      `;
    }
    case "wrench": {
      const bx = CX + build.shape.rx - 6, by = CY + build.shape.ry - 6;
      return `
        <g transform="rotate(18 ${bx} ${by})">
          <rect x="${bx - 4}" y="${by - 18}" width="8" height="30" rx="3" fill="#9aa4ad" stroke="#5b6478" />
          <path d="M${bx - 9},${by - 24} q9,-9 18,0 q-2,7 -9,7 q-7,0 -9,-7 Z" fill="#9aa4ad" stroke="#5b6478" />
        </g>
      `;
    }
    default:
      return "";
  }
}

let uidCounter = 0;

export function tuberSVG(build) {
  const uid = `t${uidCounter++}`;
  const pts = bodyPoints(build);
  const path = smoothBlobPath(pts);
  const v = build.variety;

  return `
<svg viewBox="0 0 300 300" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escapeXml(build.tier.label + " " + build.variety.label + " tubersona")}">
  <defs>
    <radialGradient id="shine-${uid}" cx="0.32" cy="0.28" r="0.75">
      <stop offset="0" stop-color="${v.highlight}" stop-opacity="0.9" />
      <stop offset="0.55" stop-color="${v.skin}" stop-opacity="0" />
    </radialGradient>
  </defs>
  <ellipse cx="150" cy="${(CY + build.shape.ry + 6).toFixed(1)}" rx="${(build.shape.rx * 0.85).toFixed(1)}" ry="10" fill="#00000022" />
  <path d="${path}" fill="${v.skin}" stroke="${v.shade}" stroke-width="2.5" stroke-linejoin="round" />
  <path d="${path}" fill="url(#shine-${uid})" />
  ${spudLayer(build, pts)}
  ${eyesLayer(build)}
  ${sproutLayer(build, pts)}
  ${accessoryLayer(build, pts)}
</svg>`;
}
