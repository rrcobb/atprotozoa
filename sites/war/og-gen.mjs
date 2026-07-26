// Generates public/og.png — the Open Graph preview card for war.bisks.net, so
// a shared link auto-renders a picture instead of a blank card in Bluesky /
// other unfurlers. Hand-drawn SVG at the canonical OG size, rasterised with
// @resvg/resvg-js (pure native module, no system Chromium — this box has no
// fontconfig/system fonts either, so the font is bundled in ./fonts and
// loaded explicitly). Copied from didscope/og-gen.mjs (same repo).
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

const FELT = "#0b3d24", FELT2 = "#0f4d2c", INK = "#eafff0", DIM = "#8fc9a6";
const GOLD = "#e0b23c", RED = "#c0392b", CARD_BG = "#fbf8f0", LINE = "#12200f";

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

// The bundled JetBrains Mono subset has no ♠/♥ glyphs (renders as tofu boxes
// under resvg's font-restricted rendering — confirmed by hand), so suits are
// drawn as vector shapes rather than text. A spade is just a heart, flipped,
// with a stem triangle.
function heartPath(cx, cy, size, color) {
  const s = size / 20;
  return `<path transform="translate(${cx - 12 * s} ${cy - 11.5 * s}) scale(${s})" fill="${color}" d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>`;
}
function spadePath(cx, cy, size, color) {
  const s = size / 20;
  return `<g>
    <path transform="translate(${cx - 12 * s} ${cy + 6.5 * s}) scale(${s} ${-s})" fill="${color}" d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
    <path fill="${color}" d="M ${cx - 4 * s} ${cy + 3 * s} L ${cx + 4 * s} ${cy + 3 * s} L ${cx} ${cy + 10 * s} Z"/>
  </g>`;
}
const suitPath = { "♠": spadePath, "♥": heartPath };

function card(x, y, rot, rank, suit, color) {
  const w = 220, h = 310, rx = 18;
  return `
  <g transform="translate(${x} ${y}) rotate(${rot})">
    <rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="${rx}" fill="${CARD_BG}" stroke="${LINE}" stroke-width="3"/>
    <text x="${-w / 2 + 22}" y="${-h / 2 + 46}" font-family="JetBrains Mono" font-weight="800" font-size="36" fill="${color}">${rank}</text>
    ${suitPath[suit](-w / 2 + 34, -h / 2 + 76, 34, color)}
    ${suitPath[suit](0, 24, 130, color)}
    <g transform="rotate(180)">
      <text x="${-w / 2 + 22}" y="${-h / 2 + 46}" font-family="JetBrains Mono" font-weight="800" font-size="36" fill="${color}">${rank}</text>
      ${suitPath[suit](-w / 2 + 34, -h / 2 + 76, 34, color)}
    </g>
  </g>`;
}

const tagline = wrapLines(
  "Single-player WAR, atproto-native. Buildthis-eligible players can change the house rules — score and game state live in your own PDS.",
  34,
);

const taglineSvg = tagline
  .map((l, i) => `<text x="64" y="${300 + i * 30}" font-family="JetBrains Mono" font-size="20" fill="${DIM}">${esc(l)}</text>`)
  .join("\n    ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="felt" cx="30%" cy="20%" r="80%">
      <stop offset="0" stop-color="${FELT2}"/>
      <stop offset="1" stop-color="${FELT}"/>
    </radialGradient>
    <radialGradient id="burst" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="${GOLD}"/>
      <stop offset="1" stop-color="${GOLD}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#felt)"/>
  <rect width="${W}" height="${H}" fill="none" stroke="${LINE}" stroke-width="14"/>

  <text x="64" y="150" font-family="JetBrains Mono" font-weight="800" font-size="88" fill="${INK}">war</text>
  <text x="64" y="196" font-family="JetBrains Mono" font-size="22" fill="${GOLD}">war.bisks.net</text>
  ${taglineSvg}

  <circle cx="800" cy="300" r="130" fill="url(#burst)" opacity="0.5"/>
  ${card(740, 300, -10, "K", "♠", "#1a1a1a")}
  ${card(940, 320, 9, "A", "♥", RED)}
  <text x="840" y="140" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="34" fill="${GOLD}" transform="rotate(-6 840 140)">WAR!</text>
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
