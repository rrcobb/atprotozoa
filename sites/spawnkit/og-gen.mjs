// Generates public/og.png — the Open Graph preview card for spawnkit.
// Same recipe as sites/receipts/og-gen.mjs: hand-drawn SVG at the canonical
// OG size, rasterised with @resvg/resvg-js (no system Chromium needed).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200,
  H = 630;
const BG = "#0d0a06",
  INK = "#e8dcc8",
  MUTED = "#9c8f78",
  ACCENT = "#c8922e",
  CARD = "#17130c",
  BORDER = "#2a2317";

const files = [".env.example", "watcher.mjs", "build-loop.sh", "BUILD_PROMPT.md", "reply.mjs"];
const filesSvg = files
  .map((f, i) => {
    const y = 250 + i * 56;
    return `
    <rect x="640" y="${y - 30}" width="500" height="42" rx="8" fill="${CARD}" stroke="${BORDER}"/>
    <circle cx="668" cy="${y - 9}" r="4" fill="${ACCENT}"/>
    <text x="686" y="${y - 3}" font-family="JetBrains Mono" font-size="20" fill="${INK}">${f}</text>`;
  })
  .join("\n");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="30%" cy="0%" r="70%">
      <stop offset="0" stop-color="#241b0e"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>

  <text x="64" y="150" font-family="JetBrains Mono" font-weight="800" font-size="66" fill="${ACCENT}">spawnkit</text>
  <text x="64" y="200" font-family="JetBrains Mono" font-size="22" fill="${MUTED}">generate a starter kit for a</text>
  <text x="64" y="228" font-family="JetBrains Mono" font-size="22" fill="${MUTED}">tag-it-and-it-builds bot</text>

  <text x="64" y="290" font-family="JetBrains Mono" font-size="21" fill="${INK}">fill in a form —</text>
  <text x="64" y="326" font-family="JetBrains Mono" font-size="21" fill="${INK}">get a watcher, a build loop,</text>
  <text x="64" y="362" font-family="JetBrains Mono" font-size="21" fill="${INK}">a prompt template, a reply script.</text>
  <text x="64" y="414" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${MUTED}">you host it. you own it.</text>

  ${filesSvg}

  <text x="64" y="570" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${MUTED}">spawnkit.bisks.net</text>
</svg>`;

const fontPath = fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url));
const png = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
}).render().asPng();
writeFileSync(new URL("./public/og.png", import.meta.url), png);
console.log("wrote sites/spawnkit/public/og.png");
