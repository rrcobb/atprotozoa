// Generates public/og.png — the Open Graph preview card for kevinmoot, so a
// shared link auto-renders a picture of a chain of pins in Bluesky / other
// unfurlers. Hand-drawn SVG at the canonical OG size, matching the live
// page's case-file/corkboard look, rasterised with @resvg/resvg-js (pure
// native module, no system Chromium needed — this box has no
// fontconfig/system fonts either, so the font is bundled in ./fonts and
// loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// A generic sample chain (not tied to any real accounts) — this is the
// static fallback card for the bare link. Per-pair share cards are generated
// live, client-side, in public/index.html (buildShareCard).
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#14100a", FG = "#f2e6d4", DIM = "#a99a80";
const ACCENT = "#ffb347", ACCENT2 = "#ff5f5f", CARD = "#241a0f", BORDER = "#4a3a22";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const pins = ["A", "?", "?", "B"];
const rowY = 530, r = 34, spacing = 170;
const startX = W / 2 - (spacing * (pins.length - 1)) / 2;

const stringLine = `<line x1="${startX}" y1="${rowY}" x2="${startX + spacing * (pins.length - 1)}" y2="${rowY}" stroke="${ACCENT2}" stroke-width="3" stroke-dasharray="2,9"/>`;

const pinsSvg = pins
  .map((label, i) => {
    const x = startX + spacing * i;
    return `
    <circle cx="${x}" cy="${rowY}" r="${r}" fill="${CARD}" stroke="${ACCENT}" stroke-width="3"/>
    <text x="${x}" y="${rowY + 8}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="26" fill="${FG}">${esc(label)}</text>`;
  })
  .join("\n");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="15%" cy="-10%" r="60%">
      <stop offset="0" stop-color="#3a2410"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="90%" cy="5%" r="55%">
      <stop offset="0" stop-color="#2a1030"/>
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

  <text x="64" y="112" font-family="JetBrains Mono" font-weight="800" font-size="60" fill="url(#title)">kevinmoot</text>
  <text x="64" y="150" font-family="JetBrains Mono" font-size="20" fill="${DIM}">case file: mutual-follow division</text>

  <text x="64" y="240" font-family="JetBrains Mono" font-size="22" fill="${DIM}">Pick two accounts. We trace the shortest</text>
  <text x="64" y="270" font-family="JetBrains Mono" font-size="22" fill="${DIM}">chain of <tspan fill="${ACCENT2}">moots</tspan> (mutual follows) between them —</text>
  <text x="64" y="300" font-family="JetBrains Mono" font-size="22" fill="${DIM}">six degrees of Kevin Bacon, follow-back edition.</text>

  <text x="64" y="${H - 40}" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT2}">kevinmoot.bisks.net</text>

  ${stringLine}
  ${pinsSvg}
  <text x="${W / 2}" y="${rowY + 92}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${FG}">how many degrees apart are you?</text>
</svg>`;

const fontPath = fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url));
const r_ = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
});
const png = r_.render().asPng();
const out = new URL("./public/og.png", import.meta.url).pathname;
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");
