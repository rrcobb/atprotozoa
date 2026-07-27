// Generates public/og.png — the Open Graph preview card for desertbus, so a
// shared link auto-renders a picture of the game in Bluesky / other unfurlers.
//
// Hand-drawn SVG "screenshot" of the live scene: the dusk-desert sky, dunes,
// the road with the car on it, and a mock Grace popup in the corner so the
// joke reads before anyone even clicks through. Same palette as index.html.
// Rasterised with @resvg/resvg-js (pure native module, no system
// Chromium/fontconfig needed — font bundled in ./fonts).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// No live data, no network — deterministic so the card is stable across
// builds. House style: self-contained, copy-don't-abstract. Adapted from
// sites/mootrider/og-gen.mjs.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const INK = "#f3e6cf", MUTED = "#c9a97f", AMBER = "#ffb454", WARN = "#ff5d5d";
const HORIZON = 300;

// ── dunes: two layers of gentle scalloped humps ─────────────────────────
function duneLayer(baseY, amp, wave) {
  let d = `M -20 ${baseY}`;
  for (let x = -60; x <= W + 60; x += 24) {
    const y = baseY - Math.abs(Math.sin(x * wave)) * amp;
    d += ` L ${x} ${y.toFixed(1)}`;
  }
  d += ` L ${W + 20} ${baseY} L ${W + 20} ${H} L -20 ${H} Z`;
  return d;
}

// ── road: trapezoid widening toward the camera, with a dashed centerline ──
const roadTopL = W * 0.45, roadTopR = W * 0.55;
const roadBotL = W * 0.14, roadBotR = W * 0.86;
const roadPath = `M ${roadTopL} ${HORIZON} L ${roadTopR} ${HORIZON} L ${roadBotR} ${H} L ${roadBotL} ${H} Z`;

// ── the car, sitting on the road near the bottom ────────────────────────
const carX = W * 0.5, carY = 440;
const car = `
<g transform="translate(${carX} ${carY})">
  <ellipse cx="0" cy="40" rx="46" ry="11" fill="rgba(0,0,0,0.25)"/>
  <path d="M -40 32 L -46 8 L -27 -19 L 27 -19 L 46 8 L 40 32 Z" fill="#2d5b6b"/>
  <path d="M -19 -16 L -13 -35 L 13 -35 L 19 -16 Z" fill="#dfeff2"/>
  <rect x="-40" y="19" width="8" height="11" fill="${AMBER}"/>
  <rect x="32" y="19" width="8" height="11" fill="${AMBER}"/>
  <rect x="-48" y="0" width="10" height="21" fill="#1a1512"/>
  <rect x="38" y="0" width="10" height="21" fill="#1a1512"/>
</g>`;

// ── a mock Grace popup, cascaded top-right, selling the joke at a glance ──
function popup(x, y, text) {
  return `
<g transform="translate(${x} ${y})">
  <rect width="340" height="150" rx="7" fill="#ece7dd" stroke="#8a8578" stroke-width="1.5"/>
  <rect width="340" height="30" rx="7" fill="#3a6a92"/>
  <rect width="340" height="16" y="14" fill="#3a6a92"/>
  <circle cx="20" cy="15" r="9" fill="${AMBER}"/>
  <text x="20" y="19" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="12" fill="#241f1c">G</text>
  <text x="38" y="20" font-family="JetBrains Mono" font-weight="700" font-size="13" fill="#ffffff">Grace — fuel system</text>
  <rect x="310" y="7" width="18" height="18" rx="3" fill="#d9dde2" stroke="#8a8578"/>
  <text x="319" y="20" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="11" fill="#1c1a17">x</text>
  <text font-family="JetBrains Mono" font-size="13.5" fill="#1c1a17">
    ${wrapText(text, 16, 62, 40)}
  </text>
</g>`;
}

function wrapText(text, x, y, maxChars) {
  const words = text.split(" ");
  const lines = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > maxChars) {
      lines.push(cur.trim());
      cur = w;
    } else {
      cur = (cur + " " + w).trim();
    }
  }
  if (cur) lines.push(cur);
  return lines
    .map((line, i) => `<tspan x="${x}" y="${y + i * 19}">${escapeXml(line)}</tspan>`)
    .join("\n    ");
}

function escapeXml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffb37a"/>
      <stop offset="1" stop-color="#ffdca8"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#sky)"/>
  <circle cx="${W * 0.82}" cy="120" r="46" fill="rgba(255,255,255,0.8)"/>

  <path d="${duneLayer(HORIZON, 34, 0.006)}" fill="#e0a868"/>
  <path d="${duneLayer(HORIZON + 16, 46, 0.011)}" fill="#c98a4f"/>

  <rect x="0" y="${HORIZON + 10}" width="${W}" height="${H - HORIZON - 10}" fill="#c98a4f"/>

  <path d="${roadPath}" fill="#4a4238"/>
  <line x1="${roadTopL}" y1="${HORIZON}" x2="${roadBotL}" y2="${H}" stroke="#f4e6c9" stroke-width="4"/>
  <line x1="${roadTopR}" y1="${HORIZON}" x2="${roadBotR}" y2="${H}" stroke="#f4e6c9" stroke-width="4"/>
  <line x1="${W / 2}" y1="${HORIZON}" x2="${W / 2}" y2="${H}" stroke="#f4e6c9" stroke-width="6" stroke-dasharray="22 20"/>

  ${car}
  ${popup(W - 372, 40, "We've detected that your vehicle's fuel level is low. Exactly.")}

  <rect x="0" y="${H - 128}" width="${W}" height="128" fill="rgba(26,21,18,0.78)"/>
  <text x="46" y="${H - 74}" font-family="JetBrains Mono" font-weight="800" font-size="52" fill="${INK}">desert bus <tspan fill="${AMBER}" font-size="30">(abridged)</tspan></text>
  <text x="46" y="${H - 36}" font-family="JetBrains Mono" font-size="20" fill="${MUTED}">30 seconds of fuel. speed drops with it.</text>

  <text x="${W - 46}" y="${H - 36}" text-anchor="end" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${AMBER}">bisks.net/games/desertbus</text>
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
