// Generates public/og.png — the Open Graph preview card for poastclock.
// Same recipe as sites/followtide/og-gen.mjs (itself following
// sites/receipts): hand-drawn SVG at the canonical OG size, rasterised with
// @resvg/resvg-js (no system fontconfig needed).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// Illustrative bar lengths, not live data — same tradeoff birdflow/mootflow
// make: the card just needs to look like the real chart.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#0d0d0d", SURFACE = "#1a1a19", INK = "#ffffff", DIM = "#c3c2b7", MUTED = "#898781";
const ACCENT = "#ff6b81";
const BAR = "#5b6f99";

const rows = [
  { label: "@jamellebouie.net", days: 349 },
  { label: "@aendra.com", days: 284 },
  { label: "@indyfromspace.bsky.social", days: 247 },
  { label: "@paleofuture.bsky.social", days: 571 },
];
const maxDays = Math.max(...rows.map((r) => r.days));

const chartX = 300, chartW = 680, rowH = 56, chartTop = 300;
let bars = "";
rows.forEach((r, i) => {
  const y = chartTop + i * rowH;
  const w = (r.days / maxDays) * chartW;
  bars += `<text x="${chartX - 16}" y="${y + 22}" text-anchor="end" font-family="JetBrains Mono" font-size="18" fill="${DIM}">${r.label}</text>
    <rect x="${chartX}" y="${y + 6}" width="${w}" height="26" rx="6" fill="${BAR}"/>
    <text x="${chartX + w + 14}" y="${y + 24}" font-family="JetBrains Mono" font-size="16" fill="${MUTED}">${r.days}d</text>`;
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="8%" cy="-10%" r="55%">
      <stop offset="0" stop-color="#331018"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>

  <text x="64" y="110" font-family="JetBrains Mono" font-weight="800" font-size="58" fill="${ACCENT}">poastclock</text>
  <text x="64" y="150" font-family="JetBrains Mono" font-size="20" fill="${DIM}">last "poaster's madness" post &#8594; blue check</text>
  <text x="64" y="178" font-family="JetBrains Mono" font-size="16" fill="${MUTED}">every account bsky.app has verified, cross-referenced against real posts</text>

  ${bars}

  <text x="64" y="${H - 44}" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT}">poastclock.bisks.net</text>
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
