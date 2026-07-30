// Generates public/og.png — the Open Graph preview card for chironhell.
// Hand-drawn SVG echoing the live page (black background, screen-blended
// text banners crossing at odd angles), rasterised with @resvg/resvg-js
// (pure native module, no system Chromium needed — this box has no
// fontconfig/system fonts either, so the font is bundled in ./fonts and
// loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract (cousin of
// sites/sisyphus/og-gen.mjs and sites/didscope/og-gen.mjs). Re-run by hand if
// the artwork or palette changes.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#05050a";

// A handful of angled, screen-blended chirons echoing the live page, plus
// the wordmark sitting still in the middle like the eye of the storm.
const LINES = [
  { text: "MAXIMALIST POETICO-CHAOTIC CHIRON COLLAGE", x: -60, y: 90, size: 30, rot: -8, color: "#5fd0ff", op: 0.85 },
  { text: "every size every direction layered forever", x: -20, y: 190, size: 46, rot: 5, color: "#ff2fb0", op: 0.8 },
  { text: "the bluesky firehose, live, as text alone", x: -80, y: 300, size: 26, rot: -3, color: "#7cffb2", op: 0.8 },
  { text: "chirons above chirons above chirons above", x: -40, y: 420, size: 60, rot: 4, color: "#ffef5c", op: 0.55 },
  { text: "going every way at once going every way at once", x: -100, y: 520, size: 24, rot: -6, color: "#c792ff", op: 0.8 },
  { text: "ONLY TEXT ONLY TEXT ONLY TEXT ONLY TEXT", x: -60, y: 600, size: 30, rot: 3, color: "#ff6b4a", op: 0.75 },
];

const lineSvg = LINES.map(
  (l) =>
    `<text x="${l.x}" y="${l.y}" transform="rotate(${l.rot} ${l.x + 300} ${l.y})" font-family="JetBrains Mono" font-weight="700" font-size="${l.size}" fill="${l.color}" fill-opacity="${l.op}" style="mix-blend-mode:screen">${l.text}</text>`,
).join("\n  ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>
  ${lineSvg}
  <rect x="0" y="${H - 108}" width="${W}" height="108" fill="#05050a" fill-opacity="0.55"/>
  <text x="72" y="${H - 56}" font-family="JetBrains Mono" font-weight="700" font-size="58" fill="#ffffff">chironhell</text>
  <rect x="74" y="${H - 34}" width="14" height="14" fill="#ff2fb0"/>
  <text x="98" y="${H - 22}" font-family="JetBrains Mono" font-weight="700" font-size="21" fill="#ff2fb0">bisks.net/chironhell</text>
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
