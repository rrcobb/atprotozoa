// Generates public/og.png — the Open Graph preview card for penrose-maze.
// Draws a real small Penrose patch (reusing public/penrose.js's own
// deflation algorithm, loaded and eval'd the same way the browser does)
// behind the title, rasterised with @resvg/resvg-js (no system Chromium
// needed on this box). Same recipe as sites/beesky/og-gen.mjs.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#080810", FG = "#eef0ff", DIM = "#9aa0c0", GOLD = "#ffe66d";
const THIN = "#6f8fe8", FAT = "#e88fc0";

globalThis.window = globalThis;
const penroseSrc = readFileSync(new URL("./public/penrose.js", import.meta.url), "utf8");
(0, eval)(penroseSrc);
const maze = globalThis.PenroseMaze.generate({ seed: 777, generations: 4, radiusFrac: 0.85 });

const scale = 210;
const originX = 840, originY = 300;
let rhombi = "";
maze.rhombi.forEach((r) => {
  const pts = [r.p1, r.p2, r.p3, r.p4]
    .map((p) => [originX + p.x * scale, originY - p.y * scale])
    .map((p) => p.join(","))
    .join(" ");
  const fill = r.color === 0 ? THIN : FAT;
  rhombi += `<polygon points="${pts}" fill="${fill}" fill-opacity="0.28" stroke="${fill}" stroke-opacity="0.55" stroke-width="1.5"/>`;
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="20%" cy="30%" r="65%">
      <stop offset="0" stop-color="#181b34"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title1" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${THIN}"/>
      <stop offset="1" stop-color="#9db2f0"/>
    </linearGradient>
    <linearGradient id="title2" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${FAT}"/>
      <stop offset="1" stop-color="#f0b8d8"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect x="480" width="${W - 480}" height="${H}" fill="${BG}" fill-opacity="0.35"/>

  ${rhombi}

  <text x="64" y="150" font-family="JetBrains Mono" font-weight="800" font-size="66" fill="url(#title1)">penrose</text>
  <text x="64" y="216" font-family="JetBrains Mono" font-weight="800" font-size="66" fill="url(#title2)">-maze</text>

  <text x="66" y="290" font-family="JetBrains Mono" font-size="19" fill="${DIM}">a first-person maze carved into a real</text>
  <text x="66" y="317" font-family="JetBrains Mono" font-size="19" fill="${DIM}">Penrose tiling. every room you stand in</text>
  <text x="66" y="344" font-family="JetBrains Mono" font-size="19" fill="${DIM}">still looks like an ordinary square —</text>
  <text x="66" y="371" font-family="JetBrains Mono" font-size="19" fill="${DIM}">the aperiodic geometry never shows.</text>

  <text x="66" y="560" font-family="JetBrains Mono" font-weight="700" font-size="21" fill="${GOLD}">penrose-maze.bisks.net</text>
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
