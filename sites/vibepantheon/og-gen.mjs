// Generates public/og.png — the Open Graph preview card for vibepantheon,
// so a shared link auto-renders a picture of the idea in Bluesky / other
// unfurlers. Hand-drawn SVG at the canonical OG size, rasterised with
// @resvg/resvg-js (pure native module, no system Chromium/fontconfig needed
// — the font is bundled in ./fonts and loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork. Adapted from sites/leanmath/og-gen.mjs.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#100c17", PANEL = "#18122a", PANEL2 = "#1f1836";
const INK = "#f3ecff", MUTED = "#ab9dcf", GOLD = "#f0c674", GOLDDIM = "#b6934f", LINE = "#382c53";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const cardX = 64, cardY = 300, cardW = 1072, cardH = 250;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="bg" cx="50%" cy="-5%" r="65%">
      <stop offset="0" stop-color="#2c2050"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>

  <text x="64" y="118" font-family="JetBrains Mono" font-weight="800" font-size="56" fill="${GOLD}">the pantheon of vibes</text>
  <text x="64" y="164" font-family="JetBrains Mono" font-size="22" fill="${MUTED}">scanning the Bluesky firehose, live</text>

  <text x="64" y="222" font-family="JetBrains Mono" font-size="18" fill="${MUTED}">Every "the vibes are ___" gets tallied. The most-sworn-to</text>
  <text x="64" y="250" font-family="JetBrains Mono" font-size="18" fill="${MUTED}">answer stands at the top of the pantheon.</text>

  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="16" fill="${PANEL2}" stroke="${GOLDDIM}" stroke-width="1.5"/>

  <text x="${cardX + 32}" y="${cardY + 46}" font-family="JetBrains Mono" font-weight="700" font-size="14" letter-spacing="2" fill="${GOLD}">REIGNING VIBE</text>

  <text x="${cardX + 32}" y="${cardY + 108}" font-family="JetBrains Mono" font-size="26" fill="${MUTED}">&#8220;the vibes are</text>
  <text x="${cardX + 32}" y="${cardY + 150}" font-family="JetBrains Mono" font-weight="800" font-size="40" fill="${INK}">immaculate&#8221;</text>

  <line x1="${cardX + 32}" y1="${cardY + cardH - 60}" x2="${cardX + cardW - 32}" y2="${cardY + cardH - 60}" stroke="${LINE}" stroke-width="1" stroke-dasharray="4,5"/>

  <text x="${cardX + 32}" y="${cardY + cardH - 24}" font-family="JetBrains Mono" font-size="18" fill="${GOLD}">427 believers and counting</text>

  <text x="64" y="${H - 48}" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${GOLD}">vibepantheon.bisks.net</text>
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
