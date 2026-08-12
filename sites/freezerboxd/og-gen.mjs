// Generates public/og.png — the Open Graph preview card for freezerboxd.
// A shelf card: title, a row of frost-covered containers as flat spines,
// and an ice-crystal motif. Rasterised with @resvg/resvg-js.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG_TOP = "#eef7fb", BG_BOT = "#c3d8e3";
const INK = "#12293a", MUTED = "#54718a", ACCENT = "#2f6690";

const FINDS = [
  { title: "Mystery Meat", grad: ["#3a5b6f", "#1c3648"], frost: 5 },
  { title: "Last Popsicle", grad: ["#5c9fc7", "#2f6690"], frost: 2 },
  { title: "Grandma's Chili", grad: ["#a9784f", "#6e4d30"], frost: 4 },
  { title: "Wedding Cake", grad: ["#bfe1f2", "#7fb8d9"], frost: 1 },
];

let defs = "";
let spines = "";
const spineW = 78, spineGap = 18, baseX = 90, baseY = 500, spineH = 300;
FINDS.forEach((b, i) => {
  const x = baseX + i * (spineW + spineGap);
  const gid = "g" + i;
  defs += `<linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${b.grad[0]}"/>
    <stop offset="1" stop-color="${b.grad[1]}"/>
  </linearGradient>`;
  spines += `<rect x="${x}" y="${baseY - spineH}" width="${spineW}" height="${spineH}" rx="4" fill="url(#${gid})"/>`;
  // frost crystal marks down the spine
  for (let d = 0; d < b.frost; d++) {
    spines += `<circle cx="${x + spineW / 2}" cy="${baseY - spineH + 34 + d * 26}" r="6" fill="#eef7fb" opacity="0.8"/>`;
  }
  // frost drip
  spines += `<path d="M${x + 20} ${baseY} q4 24 -3 42" stroke="${b.grad[0]}" stroke-width="7" fill="none" stroke-linecap="round" opacity="0.85"/>`;
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${BG_TOP}"/>
      <stop offset="1" stop-color="${BG_BOT}"/>
    </linearGradient>
    ${defs}
  </defs>
  <rect width="${W}" height="${H}" fill="url(#sky)"/>
  <circle cx="1030" cy="120" r="150" fill="${ACCENT}" opacity="0.12"/>
  <circle cx="950" cy="260" r="70" fill="${ACCENT}" opacity="0.12"/>

  <text x="90" y="150" font-family="JetBrains Mono" font-weight="800" font-size="80" fill="${INK}">freezerboxd</text>
  <text x="92" y="192" font-family="JetBrains Mono" font-size="24" fill="${MUTED}">a letterboxd for the back of your freezer</text>

  ${spines}

  <text x="90" y="590" font-family="JetBrains Mono" font-weight="700" font-size="26" fill="${ACCENT}">freezerboxd.bisks.net</text>
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
