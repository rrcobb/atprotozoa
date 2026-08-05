// Generates public/og.png — the Open Graph preview card for hype up buddy.
//
// Hand-drawn SVG "screenshot": a ragdoll dummy standing on a base with
// confetti falling around it, a speech bubble with a warm line, and a row
// of tool-initial badges along the bottom (no emoji — resvg has no emoji
// font loaded, only the bundled JetBrains Mono, so emoji glyphs rasterize
// as tofu boxes).
// Rasterised with @resvg/resvg-js (pure native module, no system
// Chromium/fontconfig needed — font bundled in ./fonts).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// No live data, no network — deterministic so the card is stable across
// builds. Adapted from sites/mootkombat/og-gen.mjs.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const INK = "#f4f7fb", MUTED = "#9aa6c2", GOLD = "#ffcf4d", GREEN = "#5ee6a8", PINK = "#ff6ec7";
const DUMMY = "#caa06a", DUMMY_STROKE = "#8a6a42", STITCH = "#5c4326";

// dummy stands on the right side of the card, clear of both the headline
// text (left) and the tool-badge footer strip (bottom) — a static reference
// to the same standing pose as the live game, not a literal replay of its
// floor math.
const anchorX = 970;
const cardFloorY = 500;
const legW = 26, legH = 66;
const legY = cardFloorY - 10 - legH / 2;
const torsoW = 58, torsoH = 104, torsoY = legY - legH / 2 - torsoH / 2 + 4;
const armW = 22, armH = 58;
const headR = 40, headY = torsoY - headR - 56;

function limb(x, y, w, h, angle) {
  return `<g transform="translate(${x} ${y}) rotate(${angle})">
    <rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="${Math.min(w, h) * 0.35}" fill="${DUMMY}" stroke="${DUMMY_STROKE}" stroke-width="2.5"/>
    <line x1="0" y1="${-h / 2 + 6}" x2="0" y2="${h / 2 - 6}" stroke="${STITCH}" stroke-width="1.5" stroke-dasharray="4 4"/>
  </g>`;
}

const dummy = `
  <ellipse cx="${anchorX}" cy="${cardFloorY - 4}" rx="58" ry="17" fill="#1a2130" stroke="#2c3752" stroke-width="3"/>
  ${limb(anchorX - 20, legY, legW, legH, -6)}
  ${limb(anchorX + 18, legY, legW, legH, 8)}
  <g transform="translate(${anchorX} ${torsoY})">
    <rect x="${-torsoW / 2}" y="${-torsoH / 2}" width="${torsoW}" height="${torsoH}" rx="18" fill="#9b7a4a" stroke="#6a4e2c" stroke-width="3"/>
    <line x1="0" y1="${-torsoH / 2 + 8}" x2="0" y2="${torsoH / 2 - 8}" stroke="${STITCH}" stroke-width="2" stroke-dasharray="5 5"/>
  </g>
  ${limb(anchorX - torsoW / 2 - armW / 2 + 6, torsoY - torsoH / 2 + armH / 2 - 10, armW, armH, -50)}
  ${limb(anchorX + torsoW / 2 + armW / 2 - 6, torsoY - torsoH / 2 + armH / 2 - 10, armW, armH, 50)}
  <g transform="translate(${anchorX} ${headY})">
    <circle r="${headR}" fill="#3a3a5b"/>
    <circle r="${headR}" fill="none" stroke="${STITCH}" stroke-width="4" stroke-dasharray="6 6"/>
    <text x="0" y="8" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="30" fill="${INK}">M</text>
  </g>
  <g fill="${INK}" opacity="0.9">
    <text x="0" y="0" font-size="1"> </text>
  </g>`;

// confetti bits scattered around the dummy — plain rects, no emoji needed.
const CONFETTI_COLORS = [GOLD, GREEN, PINK, "#7fbfff", INK];
let confetti = "";
const seedPositions = [
  [780, 120, 24], [830, 260, -18], [720, 340, 40], [1080, 180, -30],
  [1120, 340, 15], [860, 90, 60], [990, 60, -12], [750, 460, 20],
  [1060, 460, -40], [700, 210, 8], [1140, 260, -55], [810, 400, 33],
];
seedPositions.forEach(([x, y, rot], i) => {
  const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
  confetti += `<rect x="${x}" y="${y}" width="14" height="8" rx="2" fill="${color}" transform="rotate(${rot} ${x + 7} ${y + 4})"/>`;
});

const bubbleX = anchorX - 190, bubbleY = headY - 46;
const bubble = `
  <g>
    <rect x="${bubbleX - 140}" y="${bubbleY - 54}" width="280" height="74" rx="14" fill="#fff8ec" stroke="#2c3752" stroke-width="2.5"/>
    <path d="M ${bubbleX + 90} ${bubbleY + 20} L ${bubbleX + 70} ${bubbleY + 20} L ${bubbleX + 94} ${bubbleY + 44} Z" fill="#fff8ec" stroke="#2c3752" stroke-width="2.5"/>
    <text x="${bubbleX}" y="${bubbleY - 20}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="18" fill="#1a1a2e">"okay i love</text>
    <text x="${bubbleX}" y="${bubbleY + 4}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="18" fill="#1a1a2e">this actually"</text>
  </g>`;

// tool row: initial badges instead of emoji (no emoji glyphs in the bundled
// font, and resvg has no system-font fallback to borrow one from)
const TOOLS = [
  ["CONF", GOLD],
  ["POP", GREEN],
  ["HORN", PINK],
  ["CROWN", GOLD],
  ["TRPHY", GREEN],
  ["HEART", PINK],
];
let toolRow = "";
TOOLS.forEach(([label, color], i) => {
  const x = 60 + i * 122;
  const y = H - 66;
  toolRow += `<rect x="${x}" y="${y - 24}" width="104" height="48" rx="10" fill="#1a2130" stroke="#2c3752" stroke-width="2"/>
    <text x="${x + 52}" y="${y + 7}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="19" fill="${color}">${label}</text>`;
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="0.35" cy="0.05" r="0.9">
      <stop offset="0" stop-color="#2a2242"/>
      <stop offset="1" stop-color="#12151c"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect y="${H - 110}" width="${W}" height="110" fill="#171b26"/>
  <line x1="0" y1="${H - 110}" x2="${W}" y2="${H - 110}" stroke="#2c3752" stroke-width="2"/>

  ${confetti}
  ${dummy}
  ${bubble}

  <text x="60" y="450" font-family="JetBrains Mono" font-weight="800" font-size="58" fill="${INK}">HYPE UP <tspan fill="${GOLD}">BUDDY</tspan></text>
  <text x="60" y="494" font-family="JetBrains Mono" font-size="24" fill="${GREEN}">@mfzx.net, but everyone's cheering for them</text>
  <text x="60" y="524" font-family="JetBrains Mono" font-size="19" fill="${MUTED}">real face, real confetti — they light up on every hit.</text>

  ${toolRow}
  <text x="${W - 60}" y="${H - 42}" text-anchor="end" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${GOLD}">beatupbuddy.bisks.net</text>
</svg>`;

const fontPath = fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url));
const r = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
});
const png = r.render().asPng();
const out = new URL("./public/og.png", import.meta.url).pathname;
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");
