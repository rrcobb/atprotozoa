// Generates public/og.png — the Open Graph preview card for mirrormode, so a
// shared link auto-renders a picture of the bit (a distorted wide-angle face
// vs. a flattened mirror-focal-length face) in Bluesky / other unfurlers.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium needed — this box has no
// fontconfig/system fonts either, so the font is bundled in ./fonts and
// loaded explicitly). Copied from sites/didscope/og-gen.mjs and reworked.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// This is a static, generic illustration — not a real user's photo. Per-user
// results are rendered live, client-side, in public/index.html.
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";

const W = 1200, H = 630;

const BG = "#150d0a", FG = "#fbeee0", DIM = "#c9a888";
const ACCENT = "#ffb37a", ACCENT2 = "#ff8fae", CARD = "#20140f", BORDER = "#3d2a1f";

// Two abstract "face" glyphs: a wide-angle-distorted one (big bulged nose,
// squashed head) and a mirror-flattened one (normal proportions).
function faceSvg(cx, cy, { headRx, headRy, noseR, eyeDx, eyeDy, eyeR, mouthW }) {
  return `
    <ellipse cx="${cx}" cy="${cy}" rx="${headRx}" ry="${headRy}" fill="none" stroke="${FG}" stroke-width="3" opacity="0.9"/>
    <circle cx="${cx - eyeDx}" cy="${cy - eyeDy}" r="${eyeR}" fill="${FG}" opacity="0.85"/>
    <circle cx="${cx + eyeDx}" cy="${cy - eyeDy}" r="${eyeR}" fill="${FG}" opacity="0.85"/>
    <circle cx="${cx}" cy="${cy + headRy * 0.05}" r="${noseR}" fill="${ACCENT2}" opacity="0.9"/>
    <path d="M ${cx - mouthW} ${cy + headRy * 0.5} Q ${cx} ${cy + headRy * 0.62} ${cx + mouthW} ${cy + headRy * 0.5}"
          fill="none" stroke="${FG}" stroke-width="3" stroke-linecap="round" opacity="0.9"/>
  `;
}

const wideFace = faceSvg(880, 300, {
  headRx: 78, headRy: 92, noseR: 26, eyeDx: 30, eyeDy: 14, eyeR: 7, mouthW: 26,
});
const flatFace = faceSvg(1050, 300, {
  headRx: 72, headRy: 96, noseR: 11, eyeDx: 26, eyeDy: 16, eyeR: 7, mouthW: 24,
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="15%" cy="-10%" r="60%">
      <stop offset="0" stop-color="#4a2c14"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="92%" cy="15%" r="55%">
      <stop offset="0" stop-color="#3a1420"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${ACCENT}"/>
      <stop offset="1" stop-color="${ACCENT2}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <text x="64" y="140" font-family="JetBrains Mono" font-weight="800" font-size="64" fill="url(#title)">mirrormode</text>
  <text x="64" y="188" font-family="JetBrains Mono" font-size="21" fill="${DIM}">your phone shoots <tspan fill="${ACCENT2}">wide</tspan>, held close.</text>
  <text x="64" y="216" font-family="JetBrains Mono" font-size="21" fill="${DIM}">your mirror doesn't.</text>

  <text x="64" y="290" font-family="JetBrains Mono" font-size="17" fill="${DIM}">drag a photo in, drag the focal</text>
  <text x="64" y="316" font-family="JetBrains Mono" font-size="17" fill="${DIM}">length toward the mirror end, get</text>
  <text x="64" y="342" font-family="JetBrains Mono" font-size="17" fill="${DIM}">your reflection back.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT2}">bisks.net/mirrormode</text>

  <rect x="720" y="140" width="440" height="330" rx="18" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>

  ${wideFace}
  ${flatFace}

  <text x="880" y="430" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${DIM}">24mm</text>
  <text x="1050" y="430" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT}">135mm</text>

  <line x1="800" y1="405" x2="1130" y2="405" stroke="${BORDER}" stroke-width="3" stroke-linecap="round"/>
  <circle cx="1050" cy="405" r="9" fill="${ACCENT}"/>
  <text x="965" y="460" text-anchor="middle" font-family="JetBrains Mono" font-size="14" fill="${DIM}">focal length →</text>
</svg>`;

const fontPath = new URL("./fonts/JetBrainsMono.ttf", import.meta.url).pathname;
const r = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
});
const png = r.render().asPng();
const out = new URL("./public/og.png", import.meta.url).pathname;
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");
