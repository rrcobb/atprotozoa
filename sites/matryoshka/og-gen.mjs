// Generates public/og.png — the Open Graph preview card for matryoshka.
// Four nested painted dolls, each smaller than the last, matching the live
// app's "peek inside" rendering. Rasterised with @resvg/resvg-js (pure native
// module, no system Chromium needed).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork. Adapted from sites/foomtree/og-gen.mjs.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#201014";
const MUTED = "#b98a7a";
const ACCENT = "#ffb143";

function bodyPathD(cx, cy, s) {
  const p = (x, y) => `${(cx + x * s).toFixed(1)},${(cy + y * s).toFixed(1)}`;
  return (
    `M ${p(0, -0.5)} ` +
    `C ${p(0.16, -0.5)} ${p(0.24, -0.4)} ${p(0.24, -0.29)} ` +
    `C ${p(0.24, -0.24)} ${p(0.2, -0.22)} ${p(0.19, -0.18)} ` +
    `C ${p(0.32, -0.1)} ${p(0.34, 0.05)} ${p(0.3, 0.16)} ` +
    `C ${p(0.27, 0.28)} ${p(0.24, 0.38)} ${p(0.2, 0.46)} ` +
    `C ${p(0.19, 0.49)} ${p(0.16, 0.5)} ${p(0.12, 0.5)} ` +
    `L ${p(-0.12, 0.5)} ` +
    `C ${p(-0.16, 0.5)} ${p(-0.19, 0.49)} ${p(-0.2, 0.46)} ` +
    `C ${p(-0.24, 0.38)} ${p(-0.27, 0.28)} ${p(-0.3, 0.16)} ` +
    `C ${p(-0.34, 0.05)} ${p(-0.32, -0.1)} ${p(-0.19, -0.18)} ` +
    `C ${p(-0.2, -0.22)} ${p(-0.24, -0.24)} ${p(-0.24, -0.29)} ` +
    `C ${p(-0.24, -0.4)} ${p(-0.16, -0.5)} ${p(0, -0.5)} Z`
  );
}

function scarfPathD(cx, cy, s) {
  const p = (x, y) => `${(cx + x * s).toFixed(1)},${(cy + y * s).toFixed(1)}`;
  return (
    `M ${p(-0.24, -0.29)} ` +
    `C ${p(-0.24, -0.4)} ${p(-0.16, -0.5)} ${p(0, -0.5)} ` +
    `C ${p(0.16, -0.5)} ${p(0.24, -0.4)} ${p(0.24, -0.29)} ` +
    `C ${p(0.24, -0.24)} ${p(0.2, -0.22)} ${p(0.19, -0.18)} ` +
    `L ${p(-0.19, -0.18)} ` +
    `C ${p(-0.2, -0.22)} ${p(-0.24, -0.24)} ${p(-0.24, -0.29)} Z`
  );
}

// A handful of fixed, hand-picked "dolls" so the static card is stable across
// re-runs — not derived from the live seeded generator (that's the app's job).
const DOLLS = [
  { cx: 300, cy: 470, s: 520, hue: 8, scarf: -40 },
  { cx: 300, cy: 545, s: 320, hue: 42, scarf: 55 },
  { cx: 300, cy: 585, s: 175, hue: 190, scarf: -60 },
  { cx: 300, cy: 610, s: 85, hue: 300, scarf: 40 },
];

function hsl(h, s, l) {
  return `hsl(${((h % 360) + 360) % 360},${s}%,${l}%)`;
}

const dollShapes = DOLLS.map((d) => {
  const base = hsl(d.hue, 55, 46);
  const scarf = hsl(d.hue + d.scarf, 60, 32);
  const outline = hsl(d.hue, 35, 18);
  return `
  <path d="${bodyPathD(d.cx, d.cy, d.s)}" fill="${base}" stroke="${outline}" stroke-width="${(d.s * 0.012).toFixed(1)}"/>
  <path d="${scarfPathD(d.cx, d.cy, d.s)}" fill="${scarf}"/>
  <circle cx="${d.cx - d.s * 0.055}" cy="${d.cy - d.s * 0.32}" r="${(d.s * 0.017).toFixed(1)}" fill="#1e0e0a"/>
  <circle cx="${d.cx + d.s * 0.055}" cy="${d.cy - d.s * 0.32}" r="${(d.s * 0.017).toFixed(1)}" fill="#1e0e0a"/>
  <circle cx="${d.cx - d.s * 0.1}" cy="${d.cy - d.s * 0.275}" r="${(d.s * 0.022).toFixed(1)}" fill="rgba(230,120,110,0.55)"/>
  <circle cx="${d.cx + d.s * 0.1}" cy="${d.cy - d.s * 0.275}" r="${(d.s * 0.022).toFixed(1)}" fill="rgba(230,120,110,0.55)"/>`;
}).join("\n  ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>
  ${dollShapes}

  <text x="640" y="220" font-family="JetBrains Mono" font-weight="800" font-size="72" fill="${ACCENT}">matryoshka</text>
  <text x="642" y="270" font-family="JetBrains Mono" font-size="21" fill="${MUTED}">more of this thing, making more.</text>
  <text x="642" y="298" font-family="JetBrains Mono" font-size="21" fill="${MUTED}">open it: a smaller one is inside,</text>
  <text x="642" y="326" font-family="JetBrains Mono" font-size="21" fill="${MUTED}">painted fresh. it never runs out.</text>
  <text x="642" y="580" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${ACCENT}">matryoshka.bisks.net</text>
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
