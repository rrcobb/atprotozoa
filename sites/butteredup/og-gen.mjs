// Generates public/og.png — the Open Graph preview card for butteredup.
//
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium/fontconfig needed — the font is
// bundled in ./fonts and loaded explicitly). node_modules + fonts copied in
// from sites/canvass, which already vendors this. House style:
// self-contained, copy-don't-abstract.
//
//   node og-gen.mjs   # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#ffffff", INK = "#111111", MUTED = "#6b6b6b";
const ACCENT = "#1a5fd0", GOOD = "#1f8a4c";
const CARD = "#f6f6f6", BORDER = "#e4e4e4";

const data = JSON.parse(readFileSync(new URL("./public/fan-data.json", import.meta.url)));
const s = data.subject;
const topLikes = data.topPosts[0]?.likes ?? 0;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>

  <text x="64" y="130" font-family="JetBrains Mono" font-weight="800" font-size="52" fill="${INK}">butteredup</text>
  <text x="64" y="172" font-family="JetBrains Mono" font-size="20" fill="${MUTED}">an unofficial fan page for @${s.handle}</text>

  <text x="64" y="260" font-family="JetBrains Mono" font-size="18" fill="${MUTED}">His best tweets, ranked by the crowd —</text>
  <text x="64" y="288" font-family="JetBrains Mono" font-size="18" fill="${MUTED}">every image he's posted, in one gallery.</text>
  <text x="64" y="316" font-family="JetBrains Mono" font-size="18" fill="${MUTED}">${data.scanned} posts read, real numbers only.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT}">butteredup.bisks.net</text>

  <rect x="660" y="150" width="480" height="330" rx="18" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>
  <circle cx="900" cy="255" r="56" fill="#e8d5a8" stroke="${BORDER}" stroke-width="2"/>
  <text x="900" y="270" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="42" fill="${INK}">C</text>
  <text x="900" y="345" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="24" fill="${INK}">${s.displayName}</text>
  <text x="900" y="374" text-anchor="middle" font-family="JetBrains Mono" font-size="15" fill="${MUTED}">@${s.handle}</text>
  <text x="900" y="430" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="15" fill="${GOOD}">top post: ${topLikes} likes</text>
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
