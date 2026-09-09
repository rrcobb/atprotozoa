// Generates public/og.png — the Open Graph preview card for listenheimer.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium/fontconfig needed — font is
// bundled in ./fonts and loaded explicitly). Copied from
// sites/mootfluence/og-gen.mjs.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#fffdf8", INK = "#14171a", MUTED = "#6b6b6b", FAINT = "#e2ddd0";
const ACCENT = "#1083fe";

// A grid of mock liker avatars (plain colored circles, no real handles)
// flowing into a small "list" card on the right — reads as "likers → list"
// without drawing on any real account's data.
const gridX = 660, gridY = 130, dotR = 15, gap = 46, cols = 8, rows = 4;
let dots = "";
const dotColors = [ACCENT, "#7c5cff", "#00ba7c", "#f91880", "#b8860b"];
for (let i = 0; i < cols * rows; i++) {
  const col = i % cols, row = Math.floor(i / cols);
  const cx = gridX + col * gap, cy = gridY + row * gap;
  const color = dotColors[i % dotColors.length];
  dots += `<circle cx="${cx}" cy="${cy}" r="${dotR}" fill="${color}" opacity="0.85"/>`;
}

const listCardX = 660, listCardY = 350, listCardW = cols * gap - (gap - dotR * 2), listCardH = 150;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>

  <text x="64" y="130" font-family="JetBrains Mono" font-weight="800" font-size="52" fill="${INK}">listenheimer</text>
  <text x="64" y="172" font-family="JetBrains Mono" font-size="20" fill="${MUTED}">paste a post, <tspan fill="${ACCENT}">list who liked it</tspan></text>

  <text x="64" y="240" font-family="JetBrains Mono" font-size="17" fill="${MUTED}">reads every public liker of a post,</text>
  <text x="64" y="266" font-family="JetBrains Mono" font-size="17" fill="${MUTED}">then writes them straight into a real</text>
  <text x="64" y="292" font-family="JetBrains Mono" font-size="17" fill="${MUTED}">moderation list on your own PDS.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT}">listenheimer.bisks.net</text>

  ${dots}

  <text x="${gridX}" y="${gridY + rows * gap + 20}" font-family="JetBrains Mono" font-size="16" fill="${MUTED}">↓</text>

  <rect x="${listCardX}" y="${listCardY}" width="${listCardW}" height="${listCardH}" rx="16" fill="#ffffff" stroke="${FAINT}" stroke-width="2"/>
  <text x="${listCardX + 24}" y="${listCardY + 44}" font-family="JetBrains Mono" font-weight="800" font-size="22" fill="${INK}">moderation list</text>
  <text x="${listCardX + 24}" y="${listCardY + 76}" font-family="JetBrains Mono" font-size="17" fill="${MUTED}">${cols * rows} accounts</text>
  <rect x="${listCardX + 24}" y="${listCardY + 96}" width="${listCardW - 48}" height="10" rx="5" fill="${FAINT}"/>
  <rect x="${listCardX + 24}" y="${listCardY + 96}" width="${(listCardW - 48) * 0.8}" height="10" rx="5" fill="${ACCENT}"/>
  <text x="${listCardX + 24}" y="${listCardY + 130}" font-family="JetBrains Mono" font-size="15" fill="${MUTED}">ready to mute or block</text>
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
