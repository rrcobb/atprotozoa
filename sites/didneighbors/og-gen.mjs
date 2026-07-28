// Generates public/og.png — the static Open Graph preview card for the bare
// /didneighbors link (per-result share cards are drawn live, client-side, in
// public/index.html's buildShareCard). Same approach as sites/didscope:
// hand-drawn SVG rasterised with @resvg/resvg-js (no system Chromium needed),
// font bundled in ./fonts since this box has no system fonts either.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#0a0e14", FG = "#e8ecf4", DIM = "#7c8aa5";
const ACCENT = "#5fd1c9", ACCENT2 = "#ff9f5f", CARD = "#131a26", BORDER = "#263247", GOOD = "#6fe3a3";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function cardSvg(cx, cy, cw, ch, label, color, handle, shared) {
  return `
  <rect x="${cx}" y="${cy}" width="${cw}" height="${ch}" rx="16" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>
  <text x="${cx + cw / 2}" y="${cy + 42}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="15" fill="${color}">${esc(label)}</text>
  <circle cx="${cx + cw / 2}" cy="${cy + 118}" r="44" fill="${BG}" stroke="${BORDER}" stroke-width="1.5"/>
  <text x="${cx + cw / 2}" y="${cy + 130}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="34" fill="${DIM}">?</text>
  <text x="${cx + cw / 2}" y="${cy + 202}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${FG}">${esc(handle)}</text>
  <text x="${cx + cw / 2}" y="${cy + 232}" text-anchor="middle" font-family="JetBrains Mono" font-size="15" fill="${DIM}">shares ${shared} chars</text>
  <text x="${cx + cw / 2}" y="${cy + 255}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="13" fill="${GOOD}">OF THE HASH</text>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="12%" cy="-10%" r="55%">
      <stop offset="0" stop-color="#123430"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="95%" cy="5%" r="50%">
      <stop offset="0" stop-color="#2a1b12"/>
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

  <text x="56" y="92" font-family="JetBrains Mono" font-weight="800" font-size="50" fill="url(#title)">didneighbors</text>
  <text x="56" y="130" font-family="JetBrains Mono" font-size="19" fill="${DIM}">find your closest DIDs on Bluesky</text>

  <text x="56" y="185" font-family="JetBrains Mono" font-size="16" fill="${DIM}">Enter a handle. Meet whoever's did:plc sits</text>
  <text x="56" y="209" font-family="JetBrains Mono" font-size="16" fill="${DIM}">closest to yours, alphabetically. A hash has</text>
  <text x="56" y="233" font-family="JetBrains Mono" font-size="16" fill="${DIM}">no neighbors. That's exactly the joke.</text>

  ${cardSvg(56, 270, 330, 260, "← PREDECESSOR", ACCENT, "@stranger.bsky.social", 2)}
  ${cardSvg(814, 270, 330, 260, "SUCCESSOR →", ACCENT2, "@somebody.else", 1)}

  <text x="600" y="565" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="17" fill="${FG}">total strangers. alphabetically adjacent.</text>

  <text x="56" y="608" font-family="JetBrains Mono" font-weight="700" font-size="19" fill="${ACCENT}">bisks.net/didneighbors</text>
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
