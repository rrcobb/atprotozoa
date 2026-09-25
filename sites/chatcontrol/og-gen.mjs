// Generates public/og.png — the static Open Graph preview card for
// chatcontrol.bisks.net. Hand-drawn SVG, rasterised with @resvg/resvg-js and
// skyclone's bundled JetBrains Mono font (no system Chromium/fontconfig
// needed). Same recipe as sites/lesslong/og-gen.mjs.
//
//   node og-gen.mjs   # writes ./public/og.png (borrows resvg + the font
//                      # from sites/skyclone — build-time only, not a
//                      # runtime dependency of this site)

import { Resvg } from "../skyclone/node_modules/@resvg/resvg-js/index.js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const fontPath = fileURLToPath(new URL("../skyclone/fonts/JetBrainsMono.ttf", import.meta.url));

const W = 1200, H = 630;
const BG = "#f6f3ee", PAPER = "#fffdf9", INK = "#24211f", MUTED = "#6d675e", FAINT = "#e3dccf", ACCENT = "#8f2a1e";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>

  <text x="64" y="112" font-family="JetBrains Mono" font-weight="800" font-size="58" fill="${ACCENT}">Chat Control</text>
  <text x="64" y="150" font-family="JetBrains Mono" font-size="19" fill="${MUTED}">the EU proposal to scan your private messages</text>

  <line x1="64" y1="184" x2="${W - 64}" y2="184" stroke="${INK}" stroke-width="2"/>

  <g>
    <rect x="64" y="216" width="${W - 128}" height="94" rx="8" fill="${PAPER}" stroke="${FAINT}" stroke-width="1.5"/>
    <text x="88" y="250" font-family="JetBrains Mono" font-weight="700" font-size="17" fill="${INK}">What it does</text>
    <text x="88" y="276" font-family="Georgia, serif" font-size="16" fill="${MUTED}">"Detection orders" that could make apps scan messages</text>
    <text x="88" y="298" font-family="Georgia, serif" font-size="16" fill="${MUTED}">on your device, before encryption is even applied.</text>
  </g>

  <g>
    <rect x="64" y="328" width="${W - 128}" height="94" rx="8" fill="${PAPER}" stroke="${FAINT}" stroke-width="1.5"/>
    <text x="88" y="362" font-family="JetBrains Mono" font-weight="700" font-size="17" fill="${INK}">Where it stands</text>
    <text x="88" y="388" font-family="Georgia, serif" font-size="16" fill="${MUTED}">Temporary voluntary scanning is already law until 2028.</text>
    <text x="88" y="410" font-family="Georgia, serif" font-size="16" fill="${MUTED}">The permanent version is still being negotiated.</text>
  </g>

  <g>
    <rect x="64" y="440" width="${W - 128}" height="94" rx="8" fill="${PAPER}" stroke="${FAINT}" stroke-width="1.5"/>
    <text x="88" y="474" font-family="JetBrains Mono" font-weight="700" font-size="17" fill="${INK}">What's next</text>
    <text x="88" y="500" font-family="Georgia, serif" font-size="16" fill="${MUTED}">A sixth round of closed-door trilogue talks, scheduled</text>
    <text x="88" y="522" font-family="Georgia, serif" font-size="16" fill="${MUTED}">for September 29, 2026.</text>
  </g>

  <text x="64" y="588" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT}">chatcontrol.bisks.net</text>
  <text x="64" y="612" font-family="JetBrains Mono" font-size="14" fill="${MUTED}">what it is, why it matters, and what you can do</text>
</svg>`;

const resvg = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
});
const png = resvg.render().asPng();
const out = fileURLToPath(new URL("./public/og.png", import.meta.url));
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");
