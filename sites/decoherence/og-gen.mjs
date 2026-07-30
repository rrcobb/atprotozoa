// Generates public/og.png — the Open Graph preview card for decoherence.
// Hand-drawn SVG (a static echo of the live page's sunburst-into-noise look),
// rasterised with @resvg/resvg-js (pure native module, no system Chromium
// needed — this box has no fontconfig/system fonts either, so the font is
// bundled in ./fonts and loaded explicitly).
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

const CREAM = "#f2e6c9";
const INK = "#201319";
const ORANGE = "#e2622c";
const MUSTARD = "#e3a72f";
const TEAL = "#1f8a7c";
const PINK = "#d6437f";

function sunburstRays(cx, cy, r0, r1, rays, rot) {
  let out = "";
  for (let i = 0; i < rays; i++) {
    const a0 = (i / rays) * Math.PI * 2 + rot;
    const a1 = ((i + 1) / rays) * Math.PI * 2 + rot;
    const x1 = cx + Math.cos(a0) * r1, y1 = cy + Math.sin(a0) * r1;
    const x2 = cx + Math.cos(a1) * r1, y2 = cy + Math.sin(a1) * r1;
    const fill = i % 2 === 0 ? ORANGE : MUSTARD;
    out += `<path d="M ${cx} ${cy} L ${x1.toFixed(1)} ${y1.toFixed(1)} L ${x2.toFixed(1)} ${y2.toFixed(1)} Z" fill="${fill}"/>\n    `;
  }
  return out;
}

// A little "coming apart into noise" scatter on the right third of the card.
function noiseSpecks(x0, x1, y0, y1, count, seed) {
  let s = seed;
  const rnd = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  let out = "";
  const cols = [ORANGE, MUSTARD, TEAL, PINK, INK];
  for (let i = 0; i < count; i++) {
    const x = x0 + rnd() * (x1 - x0);
    const y = y0 + rnd() * (y1 - y0);
    const size = 2 + rnd() * 10;
    const c = cols[Math.floor(rnd() * cols.length)];
    const op = (0.25 + rnd() * 0.6).toFixed(2);
    out += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${size.toFixed(1)}" height="${size.toFixed(1)}" fill="${c}" opacity="${op}"/>\n    `;
  }
  return out;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${CREAM}"/>

  <!-- left: a coherent sunburst -->
  <g>
    ${sunburstRays(330, 330, 0, 300, 20, 0.15)}
    <circle cx="330" cy="330" r="52" fill="${TEAL}" stroke="${INK}" stroke-width="6"/>
  </g>

  <!-- right: the same idea, coming apart -->
  <g>
    ${sunburstRays(900, 330, 0, 190, 14, 0.6)}
    ${noiseSpecks(760, 1160, 90, 570, 140, 42)}
  </g>

  <rect x="0" y="0" width="${W}" height="${H}" fill="none" stroke="${INK}" stroke-width="14"/>

  <!-- title card -->
  <rect x="70" y="430" width="620" height="150" fill="${CREAM}" stroke="${INK}" stroke-width="5" />
  <rect x="82" y="442" width="620" height="150" fill="none"/>
  <text x="104" y="500" font-family="JetBrains Mono" font-weight="800" font-size="52" fill="${INK}">decoherence</text>
  <text x="104" y="540" font-family="JetBrains Mono" font-size="19" fill="${INK}">a small space about looking at things —</text>
  <text x="104" y="566" font-family="JetBrains Mono" font-size="19" fill="${INK}">coherent, until it isn't.</text>

  <text x="104" y="610" font-family="JetBrains Mono" font-weight="700" font-size="18" letter-spacing="1" fill="${PINK}">bisks.net/decoherence</text>
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
