// Generates public/og.png — the Open Graph preview card for zettelkasten.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium/fontconfig needed — font bundled
// in ./fonts and loaded explicitly). Re-run by hand if the artwork changes.
//
//   node og-gen.mjs   # writes ./public/og.png (uses @resvg/resvg-js from the repo root)

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const INK = "#eee3c8", DIM = "#a89a7c", GOLD = "#c9a227", LINE = "#3c3226";
const CARD = "#f3ead4", CARD_INK = "#2b2418", RED = "#c0574a";

function card(x, y, w, h, rot) {
  return `<g transform="translate(${x},${y}) rotate(${rot})">
    <rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="6" fill="${CARD}" stroke="#d9c9a0" stroke-width="2"/>
  </g>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#221a10"/>
      <stop offset="100%" stop-color="#0f0d09"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect x="36" y="36" width="${W - 72}" height="${H - 72}" fill="none" stroke="${LINE}" stroke-width="2"/>

  <!-- scattered index cards + red string, right side -->
  <line x1="900" y1="150" x2="1020" y2="260" stroke="${RED}" stroke-width="3"/>
  <line x1="1020" y1="260" x2="950" y2="400" stroke="${RED}" stroke-width="3"/>
  <line x1="950" y1="400" x2="1080" y2="470" stroke="${RED}" stroke-width="3"/>
  <line x1="900" y1="150" x2="1080" y2="470" stroke="${RED}" stroke-width="2" stroke-opacity="0.5"/>
  ${card(900, 150, 150, 90, -6)}
  ${card(1020, 260, 150, 90, 8)}
  ${card(950, 400, 150, 90, -4)}
  ${card(1080, 470, 150, 90, 10)}
  <circle cx="900" cy="150" r="6" fill="${GOLD}"/>
  <circle cx="1020" cy="260" r="6" fill="${GOLD}"/>
  <circle cx="950" cy="400" r="6" fill="${GOLD}"/>
  <circle cx="1080" cy="470" r="6" fill="${GOLD}"/>

  <text x="72" y="140" font-family="JetBrains Mono" font-weight="700" font-size="66" fill="${GOLD}">🗃️ zettelkasten</text>
  <text x="76" y="196" font-family="JetBrains Mono" font-size="26" fill="${DIM}">a slip-box for atomic, linked notes</text>

  <text x="72" y="330" font-family="JetBrains Mono" font-size="30" fill="${INK}">one idea per note, connected by [[wikilinks]]</text>
  <text x="72" y="372" font-family="JetBrains Mono" font-size="30" fill="${INK}">instead of folders. watch structure emerge.</text>

  <text x="72" y="460" font-family="JetBrains Mono" font-size="22" fill="${DIM}">notes, backlinks, tags, and a live link graph —</text>
  <text x="72" y="492" font-family="JetBrains Mono" font-size="22" fill="${DIM}">everything stays in your browser.</text>

  <text x="${W - 72}" y="${H - 60}" text-anchor="end" font-family="JetBrains Mono" font-weight="700" font-size="26" fill="${GOLD}">zettelkasten.bisks.net</text>
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
