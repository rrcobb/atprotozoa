// Generates public/og.png — the Open Graph preview card for cantilever.
//
// A static impression of the live piece: a dark, foggy tower silhouette of
// cantilevered slabs overhanging a central spine, moss-green drips, a dim
// gold bell-toll glow. Rasterised with @resvg/resvg-js (pure native module,
// no system Chromium/fontconfig needed — the font is bundled in ./fonts).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork. Adapted from sites/breathingwalls/og-gen.mjs.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG_TOP = "#0c1013", BG_BOT = "#06070a";
const INK = "#e8ece7", MUTED = "#93a08f";
const STONE = "#9a9c93", STONE_DARK = "#46484a";
const MOSS = "#3c5c40", MOSS_BRIGHT = "#86b978";
const GOLD = "#c9a869";

// tiny seeded RNG so the layout is identical every run
let seed = 42;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

const spineX = 300;
const baseY = 610;
const spineW = 30;
const slabH = 20, slabGap = 4;

let slabsSvg = "";
let y = baseY;
let mossLevel = 0;
const N = 26;
for (let i = 0; i < N; i++) {
  y -= slabH;
  mossLevel = Math.min(1, i / 16);
  const side = rnd() < 0.1 ? 0 : rnd() < 0.5 ? 1 : -1;
  const taper = Math.max(0.3, 1 - i * 0.02);
  const reach = (40 + rnd() * 90) * taper;
  const thick = slabH - slabGap;
  const drawArm = (sign, r) => {
    const x0 = spineX + sign * (spineW / 2);
    const x1 = spineX + sign * (spineW / 2 + r);
    const xa = Math.min(x0, x1), xb = Math.max(x0, x1);
    const fill = mossLevel > 0.5 ? MOSS : STONE_DARK;
    slabsSvg += `<rect x="${xa.toFixed(1)}" y="${(y - thick / 2).toFixed(1)}" width="${(xb - xa).toFixed(1)}" height="${thick}" fill="${fill}" opacity="0.94"/>`;
    if (mossLevel > 0.2) {
      slabsSvg += `<rect x="${xa.toFixed(1)}" y="${(y - thick / 2).toFixed(1)}" width="${(xb - xa).toFixed(1)}" height="${(3 + mossLevel * 6).toFixed(1)}" fill="${MOSS_BRIGHT}" opacity="${(0.5 * mossLevel).toFixed(2)}"/>`;
      const dripLen = 18 + rnd() * 30;
      const dx = (xa + xb) / 2 + (rnd() - 0.5) * (xb - xa) * 0.4;
      slabsSvg += `<path d="M${dx.toFixed(1)} ${(y + thick / 2).toFixed(1)} q ${(rnd() * 8 - 4).toFixed(1)} ${(dripLen * 0.6).toFixed(1)} ${(rnd() * 10 - 5).toFixed(1)} ${dripLen.toFixed(1)}" stroke="${MOSS_BRIGHT}" stroke-width="1.4" fill="none" opacity="${(0.4 * mossLevel).toFixed(2)}"/>`;
    }
  };
  if (side === 0) { drawArm(1, reach * 0.7); drawArm(-1, reach * 0.7); }
  else drawArm(side, reach);
}

const topY = y - 10;
const spineSvg = `<rect x="${spineX - spineW / 2}" y="${topY}" width="${spineW}" height="${baseY - topY}" fill="${STONE}"/>
<rect x="${spineX - spineW / 2}" y="${(topY + baseY) / 2}" width="${spineW}" height="${(baseY - topY) / 2}" fill="${MOSS}" opacity="0.55"/>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${BG_TOP}"/>
      <stop offset="1" stop-color="${BG_BOT}"/>
    </linearGradient>
    <linearGradient id="fog" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${BG_BOT}" stop-opacity="0"/>
      <stop offset="1" stop-color="${BG_BOT}" stop-opacity="1"/>
    </linearGradient>
    <radialGradient id="tollglow" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="${GOLD}" stop-opacity="0.35"/>
      <stop offset="1" stop-color="${GOLD}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#sky)"/>
  <circle cx="${spineX}" cy="${topY + 20}" r="140" fill="url(#tollglow)"/>
  ${spineSvg}
  ${slabsSvg}
  <rect x="0" y="${H - 150}" width="${W}" height="150" fill="url(#fog)"/>

  <text x="660" y="250" font-family="JetBrains Mono" font-weight="800" font-size="76" fill="${INK}">cantilever</text>
  <text x="660" y="300" font-family="JetBrains Mono" font-size="22" fill="${MUTED}">a generative tower, one slab per century</text>

  <text x="660" y="380" font-family="JetBrains Mono" font-size="21" fill="${MOSS_BRIGHT}">cantilevered and dripping</text>
  <text x="660" y="410" font-family="JetBrains Mono" font-size="21" fill="${MOSS_BRIGHT}">with the moss of ages</text>
  <text x="660" y="460" font-family="JetBrains Mono" font-size="21" fill="${GOLD}">a bell tolls on every passing century</text>

  <text x="660" y="576" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${GOLD}">cantilever.bisks.net</text>
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
