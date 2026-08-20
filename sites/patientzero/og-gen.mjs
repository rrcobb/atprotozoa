// Generates public/og.png — the Open Graph preview card for patientzero, so
// a shared link auto-renders a hazard-striped "outbreak report" card in
// Bluesky / other unfurlers. Hand-drawn SVG at the canonical OG size,
// rasterised with @resvg/resvg-js (pure native module, no system Chromium
// needed — this box has no fontconfig/system fonts either, so the font is
// bundled in ./fonts and loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// A generic sample card (no real phrase/handle) — mirrors the hazard-stripe
// + patient-card look of the client-side hype video (public/lib/video.js),
// as a static fallback for the bare link. Real per-search results are drawn
// live, client-side, on canvas.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200,
  H = 630;

const BG = "#0a0b0e";
const FG = "#f4f2f7";
const DIM = "#9b98a8";
const HAZARD = "#e34948";
const HAZARD_DIM = "#5a2323";
const PANEL = "#15141b";
const BORDER = "#2a2833";

let stripes = "";
for (let x = -200; x < W + 200; x += 90) {
  stripes += `<polygon points="${x},${H} ${x + 45},${H} ${x + 45 + H},0 ${x + H},0" fill="${HAZARD}" opacity="0.05"/>`;
}

const cardX = 700,
  cardY = 90,
  cardW = 430,
  cardH = 400;

const card = `
  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="18" fill="${PANEL}" stroke="${HAZARD_DIM}" stroke-width="2"/>
  <text x="${cardX + cardW / 2}" y="${cardY + 48}" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="17" fill="${HAZARD}">GLOBAL PATIENT ZERO</text>
  <circle cx="${cardX + 70}" cy="${cardY + 118}" r="34" fill="#2a2833" stroke="${HAZARD}" stroke-width="3"/>
  <rect x="${cardX + 118}" y="${cardY + 96}" width="180" height="16" rx="6" fill="#3a3844"/>
  <rect x="${cardX + 118}" y="${cardY + 120}" width="120" height="12" rx="5" fill="#2a2833"/>
  <rect x="${cardX + 32}" y="${cardY + 172}" width="${cardW - 64}" height="12" rx="5" fill="#232028"/>
  <rect x="${cardX + 32}" y="${cardY + 196}" width="${cardW - 130}" height="12" rx="5" fill="#232028"/>
  <rect x="${cardX + 32}" y="${cardY + 220}" width="${cardW - 200}" height="12" rx="5" fill="#232028"/>
  <text x="${cardX + 32}" y="${cardY + cardH - 30}" font-family="JetBrains Mono" font-weight="700" font-size="14" fill="${DIM}">CASE #1 · patient zero found</text>
`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>
  ${stripes}

  <text x="64" y="140" font-family="JetBrains Mono" font-weight="800" font-size="30" fill="${HAZARD}">OUTBREAK TRACKER</text>
  <text x="64" y="220" font-family="JetBrains Mono" font-weight="800" font-size="70" fill="${FG}">patient zero</text>

  <text x="64" y="290" font-family="JetBrains Mono" font-size="19" fill="${DIM}">Paste the weird phrase everyone's</text>
  <text x="64" y="318" font-family="JetBrains Mono" font-size="19" fill="${DIM}">suddenly saying. Get the global</text>
  <text x="64" y="346" font-family="JetBrains Mono" font-size="19" fill="${DIM}">patient zero, your local patient</text>
  <text x="64" y="374" font-family="JetBrains Mono" font-size="19" fill="${DIM}">zero, a full case timeline, and</text>
  <text x="64" y="402" font-family="JetBrains Mono" font-size="19" fill="${DIM}">a hype video about the spread.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${HAZARD}">patientzero.bisks.net</text>

  ${card}
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
