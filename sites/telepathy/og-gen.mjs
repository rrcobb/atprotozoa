// Generates public/og.png — the Open Graph preview card for telepathy, so a
// shared link unfurls into a picture instead of a bare URL. Hand-drawn SVG at
// the canonical OG size, rasterised with @resvg/resvg-js (pure native
// module, no system Chromium/fontconfig on this box — the font is bundled in
// ./fonts and loaded explicitly). Same recipe as sites/homoskeeter/og-gen.mjs.
//
// Deliberately does NOT show the target card or any suit/rank feedback —
// the preview should tease the test, not spoil it for anyone who only sees
// the unfurl card.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const VOID = "#0a0714";
const CYAN = "#6be3ff";
const MAGENTA = "#ff4de3";
const VIOLET = "#9b6bff";
const TEXT = "#eae6ff";
const DIM = "#948dbf";
const RED = "#ff6b7a";
const BLACK = "#cfc9ec";

// Four card backs fanned out behind the title, one per suit, face down —
// visually establishes "pick a card" without giving anything away. Suit
// pips are drawn as plain vector shapes rather than ♠♥♦♣ text glyphs —
// JetBrains Mono (the only font bundled/loaded here) doesn't carry those
// codepoints and they rasterised as blank tofu boxes.
const SUIT_ICON = {
  spade: "M0,-34 C24,-10 30,10 14,24 C7,30 2,28 0,20 C-2,28 -7,30 -14,24 C-30,10 -24,-10 0,-34 Z M-7,26 L7,26 L11,40 L-11,40 Z",
  heart: "M0,34 C-30,10 -30,-16 -12,-26 C-2,-32 6,-28 0,-14 C-6,-28 2,-32 12,-26 C30,-16 30,10 0,34 Z",
  diamond: "M0,-34 L22,0 L0,34 L-22,0 Z",
  club: "M0,-8 C0,-22 -22,-22 -22,-8 C-22,4 -10,8 -3,4 C-8,14 -14,18 -20,20 L20,20 C14,18 8,14 3,4 C10,8 22,4 22,-8 C22,-22 0,-22 0,-8 Z",
};

function cardBack(x, y, rot, suitShape, color) {
  return `
  <g transform="translate(${x} ${y}) rotate(${rot})">
    <rect x="-70" y="-96" width="140" height="192" rx="14" fill="#150f28" stroke="${color}" stroke-width="3" opacity="0.9"/>
    <rect x="-54" y="-80" width="108" height="160" rx="8" fill="none" stroke="${color}" stroke-width="1.5" opacity="0.5"/>
    <path d="${SUIT_ICON[suitShape]}" fill="${color}" opacity="0.85"/>
  </g>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="10%" cy="0%" r="55%">
      <stop offset="0" stop-color="#241a3d"/>
      <stop offset="1" stop-color="${VOID}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="92%" cy="8%" r="55%">
      <stop offset="0" stop-color="#3a1733"/>
      <stop offset="1" stop-color="${VOID}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow3" cx="50%" cy="112%" r="65%">
      <stop offset="0" stop-color="#17233a"/>
      <stop offset="1" stop-color="${VOID}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="titleGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${CYAN}"/>
      <stop offset="0.55" stop-color="${VIOLET}"/>
      <stop offset="1" stop-color="${MAGENTA}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${VOID}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>
  <rect width="${W}" height="${H}" fill="url(#glow3)"/>

  ${cardBack(920, 430, -16, "spade", BLACK)}
  ${cardBack(1030, 380, 10, "heart", RED)}
  ${cardBack(980, 300, -4, "diamond", RED)}
  ${cardBack(1080, 300, 20, "club", BLACK)}

  <g font-family="JetBrains Mono" font-size="18" font-weight="700">
    <rect x="90" y="86" width="230" height="38" rx="19" fill="none" stroke="${CYAN}" stroke-width="2"/>
    <text x="205" y="111" text-anchor="middle" fill="${CYAN}">52 CARD DECK</text>

    <rect x="334" y="86" width="240" height="38" rx="19" fill="none" stroke="${MAGENTA}" stroke-width="2"/>
    <text x="454" y="111" text-anchor="middle" fill="${MAGENTA}">ZERO SERVER STATE</text>
  </g>

  <text x="88" y="260" font-family="JetBrains Mono" font-weight="800" font-size="96" fill="url(#titleGrad)">telepathy</text>
  <text x="88" y="330" font-family="JetBrains Mono" font-weight="800" font-size="52" fill="${TEXT}">test</text>

  <text x="90" y="410" font-family="JetBrains Mono" font-size="25" fill="${TEXT}">someone is thinking very hard about one card.</text>
  <text x="90" y="448" font-family="JetBrains Mono" font-size="25" fill="${TEXT}">clear your mind. pick the one you sense.</text>

  <text x="90" y="600" font-family="JetBrains Mono" font-weight="700" font-size="26" fill="${CYAN}">telepathy.bisks.net</text>
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
