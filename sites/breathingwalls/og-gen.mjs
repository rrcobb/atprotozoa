// Generates public/og.png — the Open Graph preview card for breathing walls,
// so a shared link auto-renders a picture of the piece in Bluesky / other
// unfurlers.
//
// A static snapshot of the live canvas: concentric rings of glowing,
// color-cycling petal shapes radiating from a center point on a near-black
// background, same palette as the live page. Rasterised with @resvg/resvg-js
// (pure native module, no system Chromium/fontconfig needed — the font is
// bundled in ./fonts and loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork. Adapted from sites/lavalamp/og-gen.mjs.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#060309", INK = "#f5eefc", MUTED = "#b6a6c9";
const ACCENT = "#ff6ad5", ACCENT2 = "#6ae0ff";

// tiny seeded RNG so the layout is identical every run
let seed = 7;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

const cx = 400, cy = 315;
const RINGS = 6;
const PETALS_BASE = 8;

let gid = 0;
function petal(x, y, size, hue) {
  const id = "p" + gid++;
  const wobble = 1 + (rnd() * 0.36 - 0.18);
  return `
  <defs>
    <radialGradient id="grad-${id}" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="hsl(${hue.toFixed(0)},95%,72%)" stop-opacity="0.92"/>
      <stop offset="1" stop-color="hsl(${((hue + 40) % 360).toFixed(0)},90%,55%)" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="${(size * wobble).toFixed(1)}" ry="${(size * (2 - wobble)).toFixed(1)}" fill="url(#grad-${id})"/>`;
}

let petalsSvg = "";
let baseHue = 210;
for (let ring = 0; ring < RINGS; ring++) {
  const ringT = ring / RINGS;
  const baseR = 30 + ringT * 300;
  const petals = PETALS_BASE + ring;
  for (let p = 0; p < petals; p++) {
    const ang = (p / petals) * Math.PI * 2 + ring * 0.35;
    const r = baseR + Math.sin(ring * 1.3 + p * 0.5) * (10 + ringT * 28);
    const size = (9 + ringT * 30);
    const x = cx + Math.cos(ang) * r;
    const y = cy + Math.sin(ang) * r;
    const hue = (baseHue + ring * 24 + p * (360 / petals)) % 360;
    petalsSvg += petal(x, y, size, hue);
  }
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="backglow" cx="33%" cy="50%" r="75%">
      <stop offset="0" stop-color="#2a1030"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#backglow)"/>
  <g style="mix-blend-mode: screen">
    ${petalsSvg}
  </g>

  <text x="640" y="250" font-family="JetBrains Mono" font-weight="800" font-size="72" fill="${INK}">breathing</text>
  <text x="640" y="330" font-family="JetBrains Mono" font-weight="800" font-size="72" fill="${INK}">walls</text>
  <text x="640" y="386" font-family="JetBrains Mono" font-size="22" fill="${MUTED}">a generative visual + sound piece</text>

  <text x="640" y="470" font-family="JetBrains Mono" font-size="20" fill="${ACCENT}">move your mouse, turn up the intensity</text>
  <text x="640" y="502" font-family="JetBrains Mono" font-size="20" fill="${ACCENT2}">art, not a how-to</text>

  <text x="640" y="576" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${ACCENT}">breathingwalls.bisks.net</text>
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
