// Generates public/og.png — the Open Graph preview card for warmtrail, so a
// shared link auto-renders a little walked path in Bluesky / other
// unfurlers. Hand-drawn SVG at the canonical OG size, matching the live
// page's warm/teal look, rasterised with @resvg/resvg-js (pure native
// module, no system Chromium needed — this box has no fontconfig/system
// fonts either, so the font is bundled in ./fonts and loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract, adapted from
// sites/warmward/og-gen.mjs.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#171410", FG = "#f2ede0", DIM = "#b3a890";
const ACCENT = "#ef7b4a", ACCENT2 = "#5fc4cd", CARD = "#211d16", BORDER = "#3a3325";

// An illustrative walked path, not tied to any real query — a jittery line
// wandering toward the upper right, dots marking each step.
const originX = 720, originY = 480;
const steps = [
  [720, 480], [758, 452], [780, 400], [830, 378], [862, 330],
  [910, 316], [922, 262], [966, 240], [980, 190],
];
const pathD = steps.map((p, i) => (i === 0 ? "M" : "L") + p[0] + "," + p[1]).join(" ");
const dots = steps
  .map(([x, y], i) => {
    const isEnd = i === steps.length - 1;
    const isStart = i === 0;
    const r = isEnd ? 9 : isStart ? 6 : 4;
    const fill = isEnd ? ACCENT : isStart ? FG : ACCENT2;
    return `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/>`;
  })
  .join("\n  ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="15%" cy="0%" r="55%">
      <stop offset="0" stop-color="#3a2414"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="95%" cy="15%" r="55%">
      <stop offset="0" stop-color="#123a3d"/>
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

  <text x="64" y="150" font-family="JetBrains Mono" font-weight="800" font-size="66" fill="url(#title)">warmtrail</text>
  <text x="64" y="200" font-family="JetBrains Mono" font-size="22" fill="${DIM}">tune a heat sensor's range</text>
  <text x="64" y="230" font-family="JetBrains Mono" font-size="22" fill="${DIM}">and gain, drop it somewhere,</text>
  <text x="64" y="260" font-family="JetBrains Mono" font-size="22" fill="${ACCENT2}">and watch it walk toward warmth.</text>

  <text x="64" y="340" font-family="JetBrains Mono" font-size="17" fill="${DIM}">it samples a ring of directions,</text>
  <text x="64" y="366" font-family="JetBrains Mono" font-size="17" fill="${DIM}">turns to face the warmest one,</text>
  <text x="64" y="392" font-family="JetBrains Mono" font-size="17" fill="${DIM}">steps, and repeats — real weather data.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT2}">warmtrail.bisks.net</text>

  <!-- walked path card -->
  <rect x="600" y="120" width="480" height="420" rx="18" fill="${CARD}" stroke="${BORDER}" stroke-width="2"/>
  <path d="${pathD}" fill="none" stroke="${ACCENT2}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>
  ${dots}
  <text x="${originX}" y="${originY + 26}" text-anchor="middle" font-family="JetBrains Mono" font-size="16" fill="${DIM}">start</text>
</svg>`;

const fontPath = fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url));
const r2 = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
});
const png = r2.render().asPng();
const out = new URL("./public/og.png", import.meta.url).pathname;
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");
