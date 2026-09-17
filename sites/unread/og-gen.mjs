// Generates public/og.png — the Open Graph preview card for unread.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium/fontconfig needed — font is
// bundled in ./fonts and loaded explicitly). Copied from sites/nextbigthing/og-gen.mjs.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// The background mosaic is generated with the exact same recursive-bisection
// idea as the live site (public/app.js) — split the biggest rect, give the
// smaller half a fresh color — just run once at build time instead of live
// off the firehose. Re-run this by hand if you change the artwork.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const INK = "#0b1017", PAPER = "#f4f1ea", ACCENT = "#ff5d5d", ACCENT2 = "#5ddcff";

function splitMosaic(count) {
  const rects = [{ x: 0, y: 0, w: W, h: H }];
  for (let i = 0; i < count; i++) {
    rects.sort((a, b) => b.w * b.h - a.w * a.h);
    const node = rects.shift();
    const vertical = node.w >= node.h;
    const ratio = 0.35 + Math.random() * 0.3;
    if (vertical) {
      const wa = Math.max(8, node.w * ratio);
      rects.push({ x: node.x, y: node.y, w: wa, h: node.h });
      rects.push({ x: node.x + wa, y: node.y, w: node.w - wa, h: node.h });
    } else {
      const ha = Math.max(8, node.h * ratio);
      rects.push({ x: node.x, y: node.y, w: node.w, h: ha });
      rects.push({ x: node.x, y: node.y + ha, w: node.w, h: node.h - ha });
    }
  }
  return rects;
}

const rects = splitMosaic(90);
const tiles = rects
  .map((r) => {
    const hue = Math.floor(Math.random() * 360);
    return `<rect x="${r.x.toFixed(1)}" y="${r.y.toFixed(1)}" width="${r.w.toFixed(1)}" height="${r.h.toFixed(1)}" fill="hsl(${hue},58%,40%)" stroke="rgba(11,16,23,0.6)" stroke-width="1"/>`;
  })
  .join("\n  ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${INK}"/>
  ${tiles}

  <rect x="0" y="${H - 190}" width="${W}" height="190" fill="rgba(11,16,23,0.88)"/>
  <text x="56" y="${H - 128}" font-family="JetBrains Mono" font-weight="800" font-size="64" fill="${ACCENT}">unread</text>
  <text x="56" y="${H - 84}" font-family="JetBrains Mono" font-size="24" fill="${PAPER}">a space-filling stream of information you'll never read,</text>
  <text x="56" y="${H - 52}" font-family="JetBrains Mono" font-size="24" fill="${PAPER}">endlessly expanding beyond anyone's capacity to comprehend it.</text>
  <text x="56" y="${H - 18}" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT2}">unread.bisks.net</text>
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
