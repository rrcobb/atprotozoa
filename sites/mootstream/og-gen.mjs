// Generates public/og.png — the Open Graph preview card, so a shared link
// auto-renders a picture of the wind globe in Bluesky / other unfurlers.
// Hand-drawn SVG at the canonical OG size, matching the live page's dark
// cold/hot palette, rasterised with @resvg/resvg-js (pure native module, no
// system Chromium needed — this box has no fontconfig/system fonts either,
// so the font is bundled in ./fonts and loaded explicitly). Copied from
// sites/didscope's og-gen.mjs recipe — house style: copy, don't abstract.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200,
  H = 630;

const BG = "#050a10";
const FG = "#eaf3f6";
const DIM = "#7d8f96";
const COLD = "#2f7fae";
const HOT = "#e8913c";
const HOT2 = "#c23b2c";
const LAND_COLD = "#6fc7ff";
const LAND_HOT = "#ff8a5c";

// A small equirectangular-ish scatter of "hot/cold spot" blobs + streak lines
// standing in for the wind trails, purely decorative for the static card.
const blobs = [
  { cx: 180, cy: 210, r: 90, c: COLD },
  { cx: 340, cy: 320, r: 60, c: LAND_HOT },
  { cx: 620, cy: 160, r: 110, c: HOT2 },
  { cx: 860, cy: 300, r: 70, c: LAND_COLD },
  { cx: 1020, cy: 460, r: 130, c: HOT },
  { cx: 480, cy: 470, r: 50, c: COLD },
];

function streak(x1, y1, x2, y2, w, o) {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${FG}" stroke-width="${w}" stroke-linecap="round" opacity="${o}"/>`;
}

let streaks = "";
const rand = (seed) => {
  // deterministic PRNG so re-runs are reproducible
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
};
const r = rand(42);
for (let i = 0; i < 140; i++) {
  const x = r() * W;
  const y = r() * H;
  const len = 14 + r() * 34;
  const ang = r() * Math.PI * 2;
  const x2 = x + Math.cos(ang) * len;
  const y2 = y + Math.sin(ang) * len;
  streaks += streak(x, y, x2, y2, 1 + r() * 1.5, 0.12 + r() * 0.28);
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="g1" cx="15%" cy="20%" r="55%">
      <stop offset="0" stop-color="${COLD}" stop-opacity="0.55"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="g2" cx="85%" cy="70%" r="55%">
      <stop offset="0" stop-color="${HOT}" stop-opacity="0.5"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#9be8ff"/>
      <stop offset="1" stop-color="${LAND_HOT}"/>
    </linearGradient>
    <filter id="blur1"><feGaussianBlur stdDeviation="40"/></filter>
    <filter id="blur2"><feGaussianBlur stdDeviation="55"/></filter>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#g1)"/>
  <rect width="${W}" height="${H}" fill="url(#g2)"/>

  <g filter="url(#blur1)" opacity="0.65">
    ${blobs.map((b) => `<circle cx="${b.cx}" cy="${b.cy}" r="${b.r}" fill="${b.c}"/>`).join("\n    ")}
  </g>

  <g opacity="0.9">${streaks}</g>

  <rect x="0" y="0" width="${W}" height="${H}" fill="${BG}" opacity="0.28"/>

  <text x="64" y="150" font-family="JetBrains Mono" font-weight="800" font-size="72" fill="url(#title)">mootstream</text>
  <text x="66" y="196" font-family="JetBrains Mono" font-size="24" fill="${DIM}">wind currents from Bluesky's pulse</text>

  <text x="66" y="260" font-family="JetBrains Mono" font-size="19" fill="${FG}">Ocean = today's normal sea temperature.</text>
  <text x="66" y="292" font-family="JetBrains Mono" font-size="19" fill="${FG}">Land = a live z-score of posting activity per region.</text>
  <text x="66" y="324" font-family="JetBrains Mono" font-size="19" fill="${FG}">Hot and cold spots drive the wind — on a WebGL globe.</text>

  <text x="66" y="570" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="#9be8ff">bisks.net/mootstream</text>
</svg>`;

const fontPath = fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url));
const resvg = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
});
const png = resvg.render().asPng();
const out = new URL("./public/og.png", import.meta.url).pathname;
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");
