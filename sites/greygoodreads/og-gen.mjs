// Generates public/og.png — the Open Graph preview card for goo·dreads.
// A shelf card: title, a stack of the four Drexler covers as flat blobby
// spines, and a grey-goo drip motif. Rasterised with @resvg/resvg-js.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG_TOP = "#eef0e6", BG_BOT = "#d3d0c4";
const INK = "#20231f", MUTED = "#5c6058", ACCENT = "#5b6b3f";

const BOOKS = [
  { title: "Engines of Creation", grad: ["#3a4a33", "#20291c"], dread: 5 },
  { title: "Nanosystems", grad: ["#4a5044", "#2b2f26"], dread: 3 },
  { title: "Unbounding the Future", grad: ["#5b6b3f", "#333c22"], dread: 2 },
  { title: "Radical Abundance", grad: ["#6f7a58", "#3a4230"], dread: 1 },
];

let defs = "";
let spines = "";
const spineW = 78, spineGap = 18, baseX = 90, baseY = 500, spineH = 300;
BOOKS.forEach((b, i) => {
  const x = baseX + i * (spineW + spineGap);
  const gid = "g" + i;
  defs += `<linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${b.grad[0]}"/>
    <stop offset="1" stop-color="${b.grad[1]}"/>
  </linearGradient>`;
  spines += `<rect x="${x}" y="${baseY - spineH}" width="${spineW}" height="${spineH}" rx="4" fill="url(#${gid})"/>`;
  // dread blobs down the spine
  for (let d = 0; d < b.dread; d++) {
    spines += `<circle cx="${x + spineW / 2}" cy="${baseY - spineH + 34 + d * 26}" r="6" fill="#f4f2ea" opacity="0.75"/>`;
  }
  // drip
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

  <text x="90" y="150" font-family="JetBrains Mono" font-weight="800" font-size="80" fill="${INK}">goo&#183;dreads</text>
  <text x="92" y="192" font-family="JetBrains Mono" font-size="24" fill="${MUTED}">shelving Eric Drexler, rated in dreads not stars</text>

  ${spines}

  <text x="90" y="590" font-family="JetBrains Mono" font-weight="700" font-size="26" fill="${ACCENT}">greygoodreads.bisks.net</text>
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
