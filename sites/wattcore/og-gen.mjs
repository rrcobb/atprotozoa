// Generates public/og.png — the Open Graph preview card for wattcore.
//
// A hand-drawn SVG: a breaker switch (flipped on), a wattage meter row, and
// two lines lifted straight from the real trace (see public/wattcore.js,
// TRACE) so the static unfurl card previews actual content, not filler.
// Rasterised with @resvg/resvg-js (pure native module, font bundled in
// ./fonts, no system fontconfig needed).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#0a0806", INK = "#f5ead9", DIM = "#93816c", ACCENT = "#ffb020", ACCENT2 = "#ff7043", WIRE = "#3a2c18";

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

const sample1 = "the ask is recursive: don't describe the plugin. become its one working example.";
const sample2 = "a wattage number next to every line, because “wattcore” has no citation anywhere.";

const lines1 = wrapLines(sample1, 46);
const lines2 = wrapLines(sample2, 46);

// meter bars, decorative, uneven heights
const barCount = 28;
let bars = "";
for (let i = 0; i < barCount; i++) {
  const h = 8 + Math.abs(Math.sin(i * 1.3)) * 46 + (i % 5 === 0 ? 14 : 0);
  const color = h > 40 ? ACCENT : WIRE;
  bars += `<rect x="${700 + i * 16}" y="${330 - h}" width="9" height="${h}" rx="2" fill="${color}"/>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="15%" cy="-10%" r="60%">
      <stop offset="0" stop-color="#2a1c0c"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="90%" cy="0%" r="55%">
      <stop offset="0" stop-color="#241608"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${ACCENT}"/>
      <stop offset="1" stop-color="${ACCENT2}"/>
    </linearGradient>
    <linearGradient id="lever" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${ACCENT}"/>
      <stop offset="1" stop-color="#c67a10"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <text x="60" y="120" font-family="JetBrains Mono" font-weight="800" font-size="66" fill="url(#title)">wattcore</text>
  <text x="60" y="160" font-family="JetBrains Mono" font-size="21" fill="${DIM}">a chain-of-thought, run through the plugin</text>

  <!-- breaker -->
  <rect x="60" y="210" width="118" height="180" rx="14" fill="#160f08" stroke="${WIRE}" stroke-width="2"/>
  <rect x="94" y="330" width="50" height="64" rx="8" fill="url(#lever)"/>
  <circle cx="119" cy="250" r="34" fill="none" stroke="${ACCENT}" stroke-width="2" opacity="0.5"/>

  <text x="60" y="440" font-family="JetBrains Mono" font-weight="700" font-size="18" letter-spacing="2" fill="${ACCENT2}">LIVE TRACE</text>

  <text x="60" y="478" font-family="JetBrains Mono" font-size="19" fill="${ACCENT2}">13W  ${esc(lines1[0] || "")}</text>
  <text x="112" y="502" font-family="JetBrains Mono" font-size="19" fill="${INK}">${esc(lines1[1] || "")}</text>

  <text x="60" y="538" font-family="JetBrains Mono" font-size="19" fill="${ACCENT2}">44W  ${esc(lines2[0] || "")}</text>
  <text x="112" y="562" font-family="JetBrains Mono" font-size="19" fill="${INK}">${esc(lines2[1] || "")}</text>

  ${bars}
  <text x="700" y="${H - 40}" font-family="JetBrains Mono" font-size="15" fill="${DIM}">hum: three oscillators, no samples</text>

  <text x="60" y="${H - 40}" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${ACCENT}">wattcore.bisks.net</text>
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
