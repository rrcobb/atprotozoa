// Generates public/og.png — the Open Graph preview card for uuidfountain.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium/fontconfig needed — the font is
// bundled in ./fonts and loaded explicitly).
//
//   node og-gen.mjs   # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract (see sites/didscope).
// Re-run by hand if the artwork changes.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const W = 1200, H = 630;

const BG = "#05060c", FG = "#eaf3ff", DIM = "#7c8bab";
const CYAN = "#5ce1e6", MAGENTA = "#ff3d81", AMBER = "#ffb347", CARD = "#0d1224", BORDER = "#232c4a";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// A handful of real UUIDs, sprayed as the "fountain" behind the wordmark.
const drops = Array.from({ length: 14 }, () => randomUUID());
const dropColors = [CYAN, MAGENTA, AMBER, "#8b7bff"];

function drop(i) {
  const id = drops[i];
  const x = 90 + ((i * 401) % 1040);
  const y = 40 + ((i * 233) % 560);
  const rot = ((i * 47) % 30) - 15;
  const color = dropColors[i % dropColors.length];
  const size = 13 + (i % 3) * 2;
  return `<text x="0" y="0" transform="translate(${x} ${y}) rotate(${rot})" font-family="JetBrains Mono" font-size="${size}" fill="${color}" opacity="0.5">${esc(id)}</text>`;
}

const dropsSvg = drops.map((_, i) => drop(i)).join("\n  ");

const cardX = 150, cardY = 190, cardW = 900, cardH = 260;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${CYAN}"/>
      <stop offset="1" stop-color="${MAGENTA}"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="0%" r="75%">
      <stop offset="0" stop-color="#12203f"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>

  ${dropsSvg}

  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="20" fill="${CARD}" opacity="0.92" stroke="${BORDER}" stroke-width="1.5"/>

  <text x="${W / 2}" y="${cardY + 92}" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="72" fill="url(#title)">uuidfountain</text>
  <text x="${W / 2}" y="${cardY + 140}" text-anchor="middle" font-family="JetBrains Mono" font-size="21" fill="${FG}">consumes v4 UUIDs at an extreme rate and sprays them into the void</text>
  <text x="${W / 2}" y="${cardY + 172}" text-anchor="middle" font-family="JetBrains Mono" font-size="17" fill="${DIM}">a real three.js particle fountain — drag to orbit, watch the scarcity counter climb</text>
  <text x="${W / 2}" y="${cardY + 224}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${CYAN}">uuidfountain.bisks.net</text>
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
