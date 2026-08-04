// Generates public/og.png — the Open Graph preview card for fortunejar.
// Drawn shapes, not emoji: the bundled mono font has no color-emoji glyphs
// and resvg would render a tofu box instead (same reasoning as
// sites/warmhug/og-gen.mjs and sites/gratitude-garden/og-gen.mjs).
// Rasterised with @resvg/resvg-js (pure native module, no system
// Chromium/fontconfig needed).
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

const BG1 = "#fff6e8", BG2 = "#ffeacf";
const INK = "#4a2f22", DIM = "#8a6a54";
const GOLD = "#d98e3c", ROSE = "#e8637a", COOKIE = "#c68958", COOKIE2 = "#a5723f";

// A cracked fortune cookie: two curved halves pulled apart, a paper slip
// rising between them.
function cookie(cx, cy, s) {
  const t = (x, y) => `${(cx + x * s).toFixed(1)},${(cy + y * s).toFixed(1)}`;
  return `
  <g>
    <g transform="translate(${(-34 * s).toFixed(1)},${(6 * s).toFixed(1)}) rotate(-16 ${cx} ${cy})">
      <path d="M ${t(-70, -10)} Q ${t(-92, 30)} ${t(-60, 62)} Q ${t(-20, 70)} ${t(-6, 40)} Q ${t(-8, 4)} ${t(-70, -10)} Z" fill="${COOKIE}" stroke="${COOKIE2}" stroke-width="${3 * s}"/>
    </g>
    <g transform="translate(${(34 * s).toFixed(1)},${(6 * s).toFixed(1)}) rotate(16 ${cx} ${cy})">
      <path d="M ${t(70, -10)} Q ${t(92, 30)} ${t(60, 62)} Q ${t(20, 70)} ${t(6, 40)} Q ${t(8, 4)} ${t(70, -10)} Z" fill="${COOKIE}" stroke="${COOKIE2}" stroke-width="${3 * s}"/>
    </g>
    <rect x="${(cx - 46 * s).toFixed(1)}" y="${(cy - 46 * s).toFixed(1)}" width="${(92 * s).toFixed(1)}" height="${(58 * s).toFixed(1)}" rx="${4 * s}" fill="#fffaf0" stroke="${DIM}" stroke-width="${1.5 * s}" transform="rotate(-4 ${cx} ${cy})"/>
  </g>`;
}

// A little glass jar of paper slips, sitting beside the cookie.
function jar(cx, cy, s) {
  const slip = (dx, dy, rot, color) =>
    `<rect x="${(cx + dx - 16 * s).toFixed(1)}" y="${(cy + dy - 22 * s).toFixed(1)}" width="${(32 * s).toFixed(1)}" height="${(20 * s).toFixed(1)}" rx="${3 * s}" fill="${color}" transform="rotate(${rot} ${(cx + dx).toFixed(1)} ${(cy + dy).toFixed(1)})"/>`;
  return `
  <g>
    <path d="M ${(cx - 58 * s).toFixed(1)} ${(cy - 30 * s).toFixed(1)} L ${(cx - 66 * s).toFixed(1)} ${(cy + 90 * s).toFixed(1)} Q ${(cx - 66 * s).toFixed(1)} ${(cy + 112 * s).toFixed(1)} ${(cx - 44 * s).toFixed(1)} ${(cy + 112 * s).toFixed(1)} L ${(cx + 44 * s).toFixed(1)} ${(cy + 112 * s).toFixed(1)} Q ${(cx + 66 * s).toFixed(1)} ${(cy + 112 * s).toFixed(1)} ${(cx + 66 * s).toFixed(1)} ${(cy + 90 * s).toFixed(1)} L ${(cx + 58 * s).toFixed(1)} ${(cy - 30 * s).toFixed(1)} Z"
      fill="rgba(255,255,255,0.35)" stroke="${DIM}" stroke-width="${2.5 * s}"/>
    <rect x="${(cx - 62 * s).toFixed(1)}" y="${(cy - 44 * s).toFixed(1)}" width="${(124 * s).toFixed(1)}" height="${(18 * s).toFixed(1)}" rx="${5 * s}" fill="${GOLD}"/>
    ${slip(-20, 40, -8, "#fffaf0")}
    ${slip(6, 30, 10, "#fdeee0")}
    ${slip(-4, 62, 4, "#fffaf0")}
    ${slip(24, 55, -12, "#fdeee0")}
  </g>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="base" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${BG1}"/>
      <stop offset="1" stop-color="${BG2}"/>
    </linearGradient>
    <radialGradient id="glow1" cx="10%" cy="-10%" r="55%">
      <stop offset="0" stop-color="${ROSE}" stop-opacity="0.16"/>
      <stop offset="1" stop-color="${ROSE}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${GOLD}"/>
      <stop offset="1" stop-color="${ROSE}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#base)"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>

  <text x="64" y="150" font-family="JetBrains Mono" font-weight="800" font-size="60" fill="url(#title)">fortunejar</text>
  <text x="66" y="196" font-family="JetBrains Mono" font-size="21" fill="${DIM}">crack open today's fortune</text>

  <text x="66" y="270" font-family="JetBrains Mono" font-size="18" fill="${INK}">A digital fortune cookie jar.</text>
  <text x="66" y="298" font-family="JetBrains Mono" font-size="18" fill="${INK}">Crack one for a sweet message,</text>
  <text x="66" y="326" font-family="JetBrains Mono" font-size="18" fill="${INK}">lucky numbers, and a small</text>
  <text x="66" y="354" font-family="JetBrains Mono" font-size="18" fill="${INK}">thing to do about it. Keep</text>
  <text x="66" y="382" font-family="JetBrains Mono" font-size="18" fill="${INK}">every fortune you've cracked.</text>

  <text x="66" y="560" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${GOLD}">fortunejar.bisks.net</text>

  ${jar(760, 320, 1.7)}
  ${cookie(980, 380, 1.9)}
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
