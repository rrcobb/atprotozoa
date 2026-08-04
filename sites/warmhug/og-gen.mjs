// Generates public/og.png — the Open Graph preview card for warmhug.
// Drawn blob-people, not emoji: the bundled mono font has no color-emoji
// glyphs and resvg would render a tofu box instead (same reasoning as
// sites/gratitude-garden/og-gen.mjs and sites/cluckstonks/og-gen.mjs).
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

const BG1 = "#201230", BG2 = "#150b22";
const INK = "#fff6ee", DIM = "#cdbdd8";
const CORAL = "#ff8a65", ROSE = "#ff8fab", LAVENDER = "#b39ddb", GOLD = "#ffd97a", HEART = "#ff5a7a";
const SKIN_A = "#ffcaa8", SKIN_B = "#ffd9c2";

// A single hugging blob-pair, centered at (cx, cy), scaled by `s`.
function blobPair(cx, cy, s) {
  const t = (x, y) => `${(cx + x * s).toFixed(1)},${(cy + y * s).toFixed(1)}`;
  return `
  <g>
    <path d="M ${t(-56, -6)} Q ${t(-6, -32)} ${t(14, 4)}" stroke="${ROSE}" stroke-width="${20 * s}" fill="none" stroke-linecap="round"/>
    <ellipse cx="${cx - 72 * s}" cy="${cy + 6 * s}" rx="${40 * s}" ry="${48 * s}" fill="${ROSE}"/>
    <circle cx="${cx - 72 * s}" cy="${cy - 62 * s}" r="${30 * s}" fill="${SKIN_A}"/>
    <circle cx="${cx - 82 * s}" cy="${cy - 64 * s}" r="${3.4 * s}" fill="#3a2440"/>
    <circle cx="${cx - 62 * s}" cy="${cy - 64 * s}" r="${3.4 * s}" fill="#3a2440"/>
    <path d="M ${t(-81, -56)} Q ${t(-72, -49)} ${t(-63, -56)}" stroke="#3a2440" stroke-width="${2.6 * s}" fill="none" stroke-linecap="round"/>
    <ellipse cx="${cx - 88 * s}" cy="${cy - 58 * s}" rx="${6 * s}" ry="${3.4 * s}" fill="${CORAL}" opacity="0.55"/>
    <ellipse cx="${cx - 56 * s}" cy="${cy - 58 * s}" rx="${6 * s}" ry="${3.4 * s}" fill="${CORAL}" opacity="0.55"/>

    <path d="M ${t(56, -6)} Q ${t(6, -32)} ${t(-14, 4)}" stroke="${LAVENDER}" stroke-width="${20 * s}" fill="none" stroke-linecap="round"/>
    <ellipse cx="${cx + 72 * s}" cy="${cy + 6 * s}" rx="${40 * s}" ry="${48 * s}" fill="${LAVENDER}"/>
    <circle cx="${cx + 72 * s}" cy="${cy - 62 * s}" r="${30 * s}" fill="${SKIN_B}"/>
    <circle cx="${cx + 62 * s}" cy="${cy - 64 * s}" r="${3.4 * s}" fill="#3a2440"/>
    <circle cx="${cx + 82 * s}" cy="${cy - 64 * s}" r="${3.4 * s}" fill="#3a2440"/>
    <path d="M ${t(63, -56)} Q ${t(72, -49)} ${t(81, -56)}" stroke="#3a2440" stroke-width="${2.6 * s}" fill="none" stroke-linecap="round"/>
    <ellipse cx="${cx + 56 * s}" cy="${cy - 58 * s}" rx="${6 * s}" ry="${3.4 * s}" fill="${CORAL}" opacity="0.55"/>
    <ellipse cx="${cx + 88 * s}" cy="${cy - 58 * s}" rx="${6 * s}" ry="${3.4 * s}" fill="${CORAL}" opacity="0.55"/>

    <path d="M ${t(0, 36)} C ${t(-16, 20)} ${t(-40, 28)} ${t(-40, 48)} C ${t(-40, 66)} ${t(-18, 78)} ${t(0, 96)} C ${t(18, 78)} ${t(40, 66)} ${t(40, 48)} C ${t(40, 28)} ${t(16, 20)} ${t(0, 36)} Z" fill="${HEART}"/>
  </g>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="base" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${BG1}"/>
      <stop offset="1" stop-color="${BG2}"/>
    </linearGradient>
    <radialGradient id="glow1" cx="14%" cy="-10%" r="55%">
      <stop offset="0" stop-color="${CORAL}" stop-opacity="0.30"/>
      <stop offset="1" stop-color="${CORAL}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="88%" cy="5%" r="50%">
      <stop offset="0" stop-color="${LAVENDER}" stop-opacity="0.26"/>
      <stop offset="1" stop-color="${LAVENDER}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${CORAL}"/>
      <stop offset="0.55" stop-color="${ROSE}"/>
      <stop offset="1" stop-color="${LAVENDER}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#base)"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <text x="64" y="150" font-family="JetBrains Mono" font-weight="800" font-size="64" fill="url(#title)">warmhug</text>
  <text x="66" y="196" font-family="JetBrains Mono" font-size="21" fill="${DIM}">wrap someone a hug</text>

  <text x="66" y="270" font-family="JetBrains Mono" font-size="18" fill="${DIM}">Pick who it's from and who it's</text>
  <text x="66" y="298" font-family="JetBrains Mono" font-size="18" fill="${DIM}">for. Get a cozy personalized</text>
  <text x="66" y="326" font-family="JetBrains Mono" font-size="18" fill="${DIM}">message, a glowing hug</text>
  <text x="66" y="354" font-family="JetBrains Mono" font-size="18" fill="${DIM}">animation, gentle synthesized</text>
  <text x="66" y="382" font-family="JetBrains Mono" font-size="18" fill="${DIM}">ambience, and a card to send.</text>

  <text x="66" y="560" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${GOLD}">warmhug.bisks.net</text>

  ${blobPair(870, 330, 2.15)}
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
