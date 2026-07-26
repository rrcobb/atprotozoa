// Generates public/og.png — the Open Graph preview card for lost-highway, so
// a shared link auto-renders a picture instead of a blank card in Bluesky /
// other unfurlers. A rushing black highway with the Mystery Man's face
// double-exposed over it, like the in-game jumpscare. Hand-drawn SVG at the
// canonical OG size, rasterised with @resvg/resvg-js (pure native module, no
// system Chromium — this box has no fontconfig/system fonts either, so the
// font is bundled in ./fonts and loaded explicitly). Copied from
// war/og-gen.mjs (same repo).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const VOID = "#000000", ROAD = "#0a0a0a", LINE = "#f2f0e6";
const SHOULDER = "#8a8578", INK = "#f2f0e6", MUTED = "#9a968a";
const RED = "#b3122a", AMBER = "#e8b23a", FACE = "#ece7d8";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function wrapLines(text, maxChars) {
  const words = text.split(" ");
  const lines = [];
  let line = "";
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (line && test.length > maxChars) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// Vanishing point for the road perspective.
const VX = 760, VY = 170;

// Center dashed lane line, rushing toward the vanishing point — wide and
// blurred-looking near the bottom, thin and tight near the horizon.
function laneDashes() {
  const steps = 6;
  let out = "";
  for (let i = 0; i < steps; i++) {
    const t0 = i / steps, t1 = (i + 0.55) / steps;
    const y0 = H + 40 - t0 * (H + 40 - VY);
    const y1 = H + 40 - t1 * (H + 40 - VY);
    const w0 = 30 * (1 - t0) + 3;
    const w1 = 30 * (1 - t1) + 3;
    const cx = VX - 10;
    out += `<polygon points="${cx - w0 / 2},${y0} ${cx + w0 / 2},${y0} ${cx + w1 / 2},${y1} ${cx - w1 / 2},${y1}" fill="${LINE}" opacity="${0.55 + 0.35 * (1 - t0)}"/>\n`;
  }
  return out;
}

function headlight(cx, cy, r, color) {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#hl)"/><circle cx="${cx}" cy="${cy}" r="${r * 0.22}" fill="${color}"/>`;
}

// The Mystery Man's face, double-exposed over the highway — pale, stark,
// unblinking, and translucent so the road and lane line show through him,
// like the in-game screen flash. Built from plain shapes (no filters) to
// match the house style.
function mysteryMan(cx, cy, scale) {
  const s = scale;
  return `
  <g transform="translate(${cx} ${cy}) scale(${s})">
    <ellipse cx="0" cy="0" rx="260" ry="320" fill="url(#faceFlash)"/>
    <path d="M -150 -170 C -150 -300 150 -300 150 -170 L 150 -40 C 150 130 60 250 0 260 C -60 250 -150 130 -150 -40 Z" fill="url(#faceGrad)" opacity="0.58"/>
    <path d="M -152 -172 C -150 -270 -110 -300 0 -304 C 110 -300 150 -270 152 -172 C 152 -230 60 -252 0 -254 C -60 -252 -152 -230 -152 -172 Z" fill="#0a0906" opacity="0.9"/>
    <path d="M -128 -70 Q -80 -96 -34 -74" stroke="#151210" stroke-width="9" fill="none" stroke-linecap="round" opacity="0.85"/>
    <path d="M 128 -70 Q 80 -96 34 -74" stroke="#151210" stroke-width="9" fill="none" stroke-linecap="round" opacity="0.85"/>
    <ellipse cx="-72" cy="-30" rx="34" ry="22" fill="#0c0b09" opacity="0.92"/>
    <ellipse cx="72" cy="-30" rx="34" ry="22" fill="#0c0b09" opacity="0.92"/>
    <circle cx="-64" cy="-34" r="5" fill="${AMBER}" opacity="0.9"/>
    <circle cx="80" cy="-34" r="5" fill="${AMBER}" opacity="0.9"/>
    <path d="M -50 100 Q 0 118 50 100" stroke="${RED}" stroke-width="6" fill="none" stroke-linecap="round" opacity="0.8"/>
    <path d="M -158 -60 Q -170 40 -110 160" stroke="#050403" stroke-width="34" fill="none" stroke-linecap="round" opacity="0.75"/>
    <path d="M 158 -60 Q 170 40 110 160" stroke="#050403" stroke-width="34" fill="none" stroke-linecap="round" opacity="0.75"/>
  </g>`;
}

const tagline = wrapLines(
  "Dodge oncoming headlights and the Mystery Man standing dead in your lane. Grab the stray VHS tapes. Try not to notice you keep changing names.",
  38,
);

const taglineSvg = tagline
  .map((l, i) => `<text x="64" y="${430 + i * 28}" font-family="JetBrains Mono" font-size="18" fill="${MUTED}">${esc(l)}</text>`)
  .join("\n    ");

// Cheap glow: stacked, lightly offset copies of the title in red beneath the
// main ink-colored text, in place of a blur filter.
const glowTitle = [3, 2, 1].map(
  (o) => `<text x="${64 - o}" y="${228 + o}" font-family="JetBrains Mono" font-weight="800" font-size="76" letter-spacing="4" fill="${RED}" opacity="0.35">LOST HIGHWAY</text>`
).join("\n  ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="${VX / W}" cy="${VY / H}" r="55%">
      <stop offset="0" stop-color="#2a0d12"/>
      <stop offset="0.5" stop-color="#0d0505"/>
      <stop offset="1" stop-color="${VOID}"/>
    </radialGradient>
    <radialGradient id="hl" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="${AMBER}" stop-opacity="0.55"/>
      <stop offset="1" stop-color="${AMBER}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="faceFlash" cx="50%" cy="46%" r="50%">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.55"/>
      <stop offset="0.6" stop-color="#ffffff" stop-opacity="0.12"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="faceGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="1" stop-color="${FACE}"/>
    </linearGradient>
    <linearGradient id="roadGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#060605"/>
      <stop offset="1" stop-color="#2c2720"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${VOID}"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>

  <!-- highway, converging to a vanishing point -->
  <polygon points="${VX - 55},${VY} ${VX + 55},${VY} ${W + 60},${H} -60,${H}" fill="url(#roadGrad)"/>
  <circle cx="${VX}" cy="${VY}" r="7" fill="${LINE}" opacity="0.75"/>
  <polygon points="${VX - 56},${VY} ${VX - 50},${VY} -60,${H} -110,${H}" fill="${SHOULDER}" opacity="0.8"/>
  <polygon points="${VX + 50},${VY} ${VX + 56},${VY} ${W + 110},${H} ${W + 60},${H}" fill="${SHOULDER}" opacity="0.8"/>
  ${laneDashes()}

  ${headlight(650, 560, 40, "#fff8e6")}
  ${headlight(1060, 460, 58, "#fff8e6")}

  <!-- the Mystery Man, flashing over the road -->
  ${mysteryMan(840, 330, 0.86)}

  <rect width="${W}" height="${H}" fill="${VOID}" opacity="0.08"/>

  ${glowTitle}
  <text x="64" y="228" font-family="JetBrains Mono" font-weight="800" font-size="76" letter-spacing="4" fill="${INK}">LOST HIGHWAY</text>
  <text x="66" y="264" font-family="JetBrains Mono" font-size="18" letter-spacing="3" fill="${RED}">A NIGHT DRIVE, AFTER DAVID LYNCH</text>
  <text x="66" y="312" font-family="JetBrains Mono" font-weight="700" font-size="21" fill="${AMBER}">bisks.net/games/lost-highway</text>
  ${taglineSvg}
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
