// Generates public/og.png — the Open Graph preview card for
// simcluster-shadow.bisks.net. Same recipe as sites/receipts/og-gen.mjs:
// hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#0a0710", FG = "#e9e2ff", DIM = "#9c8fc2";
const ACCENT = "#b18aff", ACCENT2 = "#6ee7c8", CARD = "#1b1530", BORDER = "#322850";

const noise = Array.from({ length: 260 }, () => {
  const x = Math.round(Math.random() * W);
  const y = Math.round(Math.random() * H);
  const r = Math.random() < 0.8 ? 1 : 2;
  const o = (0.05 + Math.random() * 0.2).toFixed(2);
  return `<circle cx="${x}" cy="${y}" r="${r}" fill="${ACCENT}" opacity="${o}"/>`;
}).join("");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="18%" cy="0%" r="65%">
      <stop offset="0" stop-color="#241a3d"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${ACCENT}"/>
      <stop offset="1" stop-color="${ACCENT2}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  ${noise}

  <text x="64" y="150" font-family="JetBrains Mono" font-weight="800" font-size="58" fill="url(#title)">Shadow Simcluster</text>
  <text x="64" y="196" font-family="JetBrains Mono" font-size="21" fill="${DIM}">encrypt a message. hide it in text or an</text>
  <text x="64" y="226" font-family="JetBrains Mono" font-size="21" fill="${DIM}">image. post it to Bluesky. only the</text>
  <text x="64" y="256" font-family="JetBrains Mono" font-size="21" fill="${DIM}">passphrase unlocks it.</text>

  <text x="64" y="330" font-family="JetBrains Mono" font-size="16" fill="${ACCENT2}">#shadowsimcluster</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT2}">simcluster-shadow.bisks.net</text>

  <rect x="740" y="90" width="400" height="400" rx="20" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>
  <g stroke="url(#title)" stroke-width="10" stroke-linecap="round" fill="none">
    <rect x="820" y="190" width="90" height="70" rx="16"/>
    <rect x="970" y="190" width="90" height="70" rx="16"/>
    <line x1="910" y1="210" x2="970" y2="210"/>
    <line x1="820" y1="215" x2="770" y2="195"/>
    <line x1="1060" y1="215" x2="1110" y2="195"/>
  </g>
  <text x="940" y="360" font-family="JetBrains Mono" font-size="16" fill="${DIM}" text-anchor="middle">only visible to</text>
  <text x="940" y="384" font-family="JetBrains Mono" font-size="16" fill="${DIM}" text-anchor="middle">those who know</text>
  <text x="940" y="408" font-family="JetBrains Mono" font-size="16" fill="${DIM}" text-anchor="middle">the passphrase</text>
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
