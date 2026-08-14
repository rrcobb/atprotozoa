// Generates public/og.png — the Open Graph preview card, so a shared link
// unfurls a picture instead of a bare URL. Hand-drawn SVG at the canonical
// OG size, rasterised with @resvg/resvg-js (pure native module, no system
// Chromium/fontconfig needed — font is bundled in ./fonts and loaded
// explicitly). Copied from sites/simcluster-samesame/og-gen.mjs.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// Static, generic card (an illustrative S7 badge, not tied to a real
// handle) — the real per-handle badge is generated live, client-side, in
// public/app.js (drawCard).

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#f4efe4", PAPER = "#fffdf7", INK = "#1c1a14", DIM = "#6b6455";
const ORANGE = "#d9731a", NAVY = "#1a2b4a", GOLD = "#ffd24e";

const barColors = ["#9aa0ad", "#9aa0ad", "#4ea1ff", "#4ea1ff", "#7dd6c0", "#7dd6c0", "#c084fc", "#c084fc", "#ffd24e", "#ffd24e"];
const barHeights = [18, 26, 34, 40, 48, 54, 62, 58, 46, 30]; // a plausible decile distribution, S1..S10

let bars = "";
const hx0 = 750, hw = 32, hgap = 6, hy0 = 470;
for (let i = 0; i < 10; i++) {
  const h = barHeights[i];
  const x = hx0 + i * (hw + hgap);
  bars += `<rect x="${x}" y="${hy0 - h}" width="${hw}" height="${h}" rx="4" fill="${barColors[i]}"${i === 6 ? ` stroke="${NAVY}" stroke-width="3"` : ""}/>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="100%" cy="0%" r="70%">
      <stop offset="0" stop-color="${ORANGE}" stop-opacity="0.16"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>

  <rect x="60" y="60" width="1080" height="510" rx="22" fill="${PAPER}" stroke="#d8cfb8" stroke-width="2"/>

  <text x="100" y="140" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${ORANGE}">S-NUMBER LEVELING REVIEW</text>
  <text x="100" y="210" font-family="JetBrains Mono" font-weight="800" font-size="46" fill="${INK}">what's your S-number?</text>
  <text x="100" y="250" font-family="JetBrains Mono" font-size="20" fill="${DIM}">an Amazon-leveling-system parody for your</text>
  <text x="100" y="280" font-family="JetBrains Mono" font-size="20" fill="${DIM}">Bluesky SimCluster. real followersCount, ranked</text>
  <text x="100" y="310" font-family="JetBrains Mono" font-size="20" fill="${DIM}">against your own mutuals, S1 to S10.</text>
  <text x="100" y="360" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${NAVY}">simcluster-levels.bisks.net</text>

  <!-- illustrative badge -->
  <rect x="880" y="120" width="180" height="120" rx="16" fill="${GOLD}"/>
  <text x="970" y="205" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="66" fill="${INK}">S7</text>
  <text x="970" y="262" text-anchor="middle" font-family="JetBrains Mono" font-size="15" fill="${DIM}">Principal, By Vibes</text>

  ${bars}
  <text x="${hx0 + 5 * (hw + hgap)}" y="${hy0 + 30}" text-anchor="middle" font-family="JetBrains Mono" font-size="14" fill="${DIM}">S1 → S10</text>
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
