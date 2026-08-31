// Generates public/og.png — the Open Graph preview card for skymash. Hand-
// drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js (pure
// native module, no system Chromium/fontconfig needed — font is bundled in
// ./fonts and loaded explicitly). Copied from sites/quadrants/og-gen.mjs.
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
const BG = "#fffdf8", INK = "#14171a", MUTED = "#6b6b6b", FAINT = "#e2ddd0";
const ACCENT = "#1a5fd0", ACCENT2 = "#d0461a";

// Two beveled "matchup card" silhouettes facing off, echoing the vote screen.
const cardW = 190, cardH = 240, cardY = 210;
const leftX = 700, rightX = 940;

function card(x, accentColor) {
  return `
  <g>
    <rect x="${x}" y="${cardY}" width="${cardW}" height="${cardH}" rx="6" fill="#ffffff" stroke="${INK}" stroke-width="4"/>
    <rect x="${x + 6}" y="${cardY + 6}" width="${cardW - 12}" height="${cardW - 12}" fill="${FAINT}"/>
    <circle cx="${x + cardW / 2}" cy="${cardY + (cardW - 12) / 2 + 6}" r="46" fill="${accentColor}" opacity="0.85"/>
    <rect x="${x + 16}" y="${cardY + cardW + 6}" width="${cardW - 32}" height="10" rx="5" fill="${MUTED}" opacity="0.5"/>
    <rect x="${x + 16}" y="${cardY + cardW + 26}" width="${cardW - 60}" height="8" rx="4" fill="${FAINT}"/>
  </g>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>

  <text x="64" y="140" font-family="JetBrains Mono" font-weight="800" font-size="66" fill="${INK}">skymash</text>
  <text x="64" y="188" font-family="JetBrains Mono" font-size="22" fill="${MUTED}">hot-or-not for Bluesky, but <tspan fill="${ACCENT}">earned</tspan></text>

  <text x="64" y="270" font-family="JetBrains Mono" font-size="17" fill="${MUTED}">two profiles, latest posts and all.</text>
  <text x="64" y="296" font-family="JetBrains Mono" font-size="17" fill="${MUTED}">click the one you like more.</text>
  <text x="64" y="322" font-family="JetBrains Mono" font-size="17" fill="${MUTED}">rankings are pure Elo from head-to-head votes —</text>
  <text x="64" y="348" font-family="JetBrains Mono" font-size="17" fill="${MUTED}">no follower counts, no engagement metrics.</text>
  <text x="64" y="380" font-family="JetBrains Mono" font-size="14" fill="${MUTED}" opacity="0.75">same trick Zuckerberg ran on Harvard in 2003, minus the felony charges.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT}">skymash.bisks.net</text>

  ${card(leftX, ACCENT)}
  <text x="${(leftX + cardW + rightX) / 2}" y="${cardY + cardW / 2 + 6}" font-family="JetBrains Mono" font-weight="800" font-size="26" fill="${INK}" text-anchor="middle">VS</text>
  ${card(rightX, ACCENT2)}
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
