// Generates public/og.png — the Open Graph preview card for switchboard.
//
// A static impression of the panel: a lever, two rotary dials, three toggle
// switches, a fader, and a glowing LCD readout with a sample code.
// Rasterised with @resvg/resvg-js (pure native module, no system
// Chromium/fontconfig needed — the font is bundled in ./fonts).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork. Adapted from sites/cantilever/og-gen.mjs.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG_TOP = "#24262b", BG_BOT = "#0c0d0f";
const PANEL = "#1b1d21", PANEL2 = "#232529";
const INK = "#e9ecef", MUTED = "#8b9099";
const LCD_BG = "#0e1b12", LCD_INK = "#6dffa0";
const ACCENT = "#ff5240", BRASS = "#c9a24b";

const px = 520, py = 90, pw = 610, ph = 460;

function dial(cx, cy, angleDeg) {
  const r = 34;
  let ticks = "";
  for (let i = 0; i < 8; i++) {
    const a = (i * 45 * Math.PI) / 180;
    const x1 = cx + Math.sin(a) * (r - 8), y1 = cy - Math.cos(a) * (r - 8);
    const x2 = cx + Math.sin(a) * r, y2 = cy - Math.cos(a) * r;
    ticks += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#46494f" stroke-width="3"/>`;
  }
  const a = (angleDeg * Math.PI) / 180;
  const px2 = cx + Math.sin(a) * (r - 4), py2 = cy - Math.cos(a) * (r - 4);
  return `
    <circle cx="${cx}" cy="${cy}" r="${r + 10}" fill="${PANEL2}" stroke="#000" stroke-width="1.5"/>
    ${ticks}
    <line x1="${cx}" y1="${cy}" x2="${px2.toFixed(1)}" y2="${py2.toFixed(1)}" stroke="${BRASS}" stroke-width="4" stroke-linecap="round"/>
  `;
}

function toggle(cx, cy, on) {
  const w = 46, h = 24;
  const kx = on ? cx + w / 2 - 15 : cx - w / 2 + 3;
  return `
    <rect x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="${h}" rx="12" fill="#0e0f11" stroke="#000"/>
    <rect x="${kx}" y="${cy - h / 2 + 3}" width="18" height="18" rx="5" fill="${on ? "#5fd98a" : "#9a9ea5"}"/>
  `;
}

const dialsSvg = dial(px + 200, py + 150, 45) + dial(px + 320, py + 150, 135);

const leverSvg = `
  <rect x="${px + 70}" y="${py + 90}" width="30" height="120" rx="10" fill="#101114" stroke="#000"/>
  <circle cx="${px + 85}" cy="${py + 190}" r="15" fill="${ACCENT}"/>
`;

const switchesSvg = [0, 1, 2]
  .map((i) => toggle(px + 460, py + 100 + i * 40, i !== 1))
  .join("");

const faderY = py + 300;
const faderSvg = `
  <rect x="${px + 40}" y="${faderY}" width="${pw - 80}" height="8" rx="4" fill="#0e0f11" stroke="#000"/>
  <rect x="${px + 40 + (pw - 80) * 0.62 - 12}" y="${faderY - 10}" width="24" height="28" rx="6" fill="#dfe3e8"/>
`;

const readoutY = py + 360;
const readoutSvg = `
  <rect x="${px + 40}" y="${readoutY}" width="${pw - 80}" height="60" rx="8" fill="${LCD_BG}" stroke="#000"/>
  <text x="${px + pw / 2}" y="${readoutY + 40}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="30" letter-spacing="6" fill="${LCD_INK}">SB-7WFA</text>
`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="bg" cx="50%" cy="-10%" r="90%">
      <stop offset="0" stop-color="${BG_TOP}"/>
      <stop offset="1" stop-color="${BG_BOT}"/>
    </radialGradient>
    <linearGradient id="panelGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${PANEL2}"/>
      <stop offset="1" stop-color="${PANEL}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>

  <rect x="${px}" y="${py}" width="${pw}" height="${ph}" rx="24" fill="url(#panelGrad)" stroke="#000" stroke-width="1.5"/>
  ${leverSvg}
  ${dialsSvg}
  ${switchesSvg}
  ${faderSvg}
  ${readoutSvg}

  <text x="64" y="180" font-family="JetBrains Mono" font-weight="800" font-size="72" fill="${INK}">switchboard</text>
  <text x="64" y="228" font-family="JetBrains Mono" font-size="21" fill="${MUTED}">no legend. nothing is labeled.</text>

  <text x="64" y="310" font-family="JetBrains Mono" font-size="21" fill="${LCD_INK}">every position encodes to one</text>
  <text x="64" y="340" font-family="JetBrains Mono" font-size="21" fill="${LCD_INK}">deterministic code — no explanation.</text>

  <text x="64" y="410" font-family="JetBrains Mono" font-size="20" fill="${ACCENT}">transmit it to @buildthis.bisks.net</text>
  <text x="64" y="440" font-family="JetBrains Mono" font-size="20" fill="${ACCENT}">and find out what it meant.</text>

  <text x="64" y="576" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${BRASS}">switchboard.bisks.net</text>
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
