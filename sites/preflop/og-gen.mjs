// Generates public/og.png — the Open Graph preview card for preflop.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#0b1f16", FG = "#eef7f0", DIM = "#9fc3ac";
const ACCENT = "#4fd68c", ACCENT2 = "#ffd24e";

// Resvg only has the JetBrains Mono file we hand it (loadSystemFonts is off,
// deliberately — see notes below), and that font has no ♠/♥ glyphs, so suit
// pips are drawn as vector paths rather than Unicode text characters.
const HEART_LOBE = "M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z";

function suitPip(kind, cx, cy, size, color) {
  const s = size / 24;
  const heart = `<path d="${HEART_LOBE}" fill="${color}"/>`;
  const inner = kind === "heart"
    ? heart
    : `<g transform="translate(24,24) rotate(180)">${heart}</g><path d="M9 19 L12 13.5 L15 19 Z" fill="${color}"/>`;
  return `<g transform="translate(${cx - size / 2},${cy - size / 2}) scale(${s})">${inner}</g>`;
}

function card(x, y, rank, kind, color) {
  return `
    <g transform="translate(${x},${y})">
      <rect width="150" height="212" rx="16" fill="#f4f1e8" stroke="#d8d2bd" stroke-width="1.5"/>
      <text x="16" y="34" font-family="JetBrains Mono" font-weight="800" font-size="28" fill="${color}">${rank}</text>
      ${suitPip(kind, 75, 132, 76, color)}
    </g>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="10%" cy="0%" r="55%">
      <stop offset="0" stop-color="#163f2a"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="95%" cy="100%" r="60%">
      <stop offset="0" stop-color="#0f2a1e"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${ACCENT}"/>
      <stop offset="1" stop-color="${ACCENT2}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <text x="64" y="150" font-family="JetBrains Mono" font-weight="800" font-size="72" fill="url(#title)">preflop</text>
  <text x="64" y="196" font-family="JetBrains Mono" font-size="22" fill="${DIM}">just the first hold'em decision, on repeat</text>

  <text x="64" y="290" font-family="JetBrains Mono" font-size="17" fill="${DIM}">Two random hole cards. Stay in, or fold?</text>
  <text x="64" y="316" font-family="JetBrains Mono" font-size="17" fill="${DIM}">Instant feedback on whether that was the</text>
  <text x="64" y="342" font-family="JetBrains Mono" font-size="17" fill="${DIM}">right call. No flop, no opponents — just</text>
  <text x="64" y="368" font-family="JetBrains Mono" font-size="17" fill="${DIM}">the one decision, isolated.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT2}">preflop.bisks.net</text>

  ${card(830, 90, "A", "spade", "#1a1a1a")}
  ${card(1000, 90, "K", "heart", "#c0392b")}
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
