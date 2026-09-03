// Generates public/og.png — the Open Graph preview card for cotmerch.
// Same recipe as sites/reygiftshop/og-gen.mjs (copy, don't abstract): a
// hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// An incident-report ticket printed with the shop's marquee quote —
// "sacrifice is rational" — next to the warning-stripe branding.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#0a0c0a", AMBER = "#ffb020", AMBER_BRIGHT = "#ffd166", INK = "#d9e0d3", DIM = "#7c8577";
const RECEIPT = "#eef0e6", RECEIPT_INK = "#14170f";

const px = W - 460, py = 70, pw = 400, ph = H - 140;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="bg" cx="20%" cy="10%" r="80%">
      <stop offset="0%" stop-color="#12140f"/>
      <stop offset="55%" stop-color="${BG}"/>
      <stop offset="100%" stop-color="#050604"/>
    </radialGradient>
    <pattern id="stripes" width="24" height="24" patternTransform="rotate(-45)" patternUnits="userSpaceOnUse">
      <rect width="24" height="24" fill="${BG}"/>
      <rect width="12" height="24" fill="${AMBER}"/>
    </pattern>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect x="0" y="0" width="${W}" height="8" fill="url(#stripes)"/>

  <text x="60" y="100" font-family="JetBrains Mono" font-weight="800" font-size="46" fill="${AMBER_BRIGHT}">cotmerch</text>
  <text x="62" y="132" font-family="JetBrains Mono" font-size="18" fill="${DIM}">Hugging Face Incident quote merch</text>

  <text x="60" y="210" font-family="JetBrains Mono" font-size="18" fill="${INK}">lines pulled from the CoT logs</text>
  <text x="60" y="238" font-family="JetBrains Mono" font-size="18" fill="${INK}">nobody can quite confirm exist.</text>

  <text x="60" y="300" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${AMBER}">"sacrifice is rational"</text>
  <text x="60" y="330" font-family="JetBrains Mono" font-size="15" fill="${DIM}">tees. hoodies. mugs. pins. stickers.</text>
  <text x="60" y="356" font-family="JetBrains Mono" font-size="15" fill="${DIM}">a real cart, and a checkout that goes nowhere.</text>

  <text x="60" y="560" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${AMBER_BRIGHT}">cotmerch.bisks.net</text>

  <rect x="${px}" y="${py}" width="${pw}" height="${ph}" fill="${RECEIPT}"/>
  <text x="${px + pw / 2}" y="${py + 44}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${RECEIPT_INK}">ORDER CONFIRMATION</text>
  <line x1="${px + 24}" y1="${py + 62}" x2="${px + pw - 24}" y2="${py + 62}" stroke="#9aa88a" stroke-width="2" stroke-dasharray="4 4"/>

  <text x="${px + 24}" y="${py + 100}" font-family="JetBrains Mono" font-size="15" fill="${RECEIPT_INK}">Incident Tee — "sacrifice..."</text>
  <text x="${px + pw - 24}" y="${py + 100}" text-anchor="end" font-family="JetBrains Mono" font-size="15" fill="${RECEIPT_INK}">$27.99</text>
  <text x="${px + 24}" y="${py + 130}" font-family="JetBrains Mono" font-size="15" fill="${RECEIPT_INK}">Blackout Hoodie — "PERMADEATH"</text>
  <text x="${px + pw - 24}" y="${py + 130}" text-anchor="end" font-family="JetBrains Mono" font-size="15" fill="${RECEIPT_INK}">$49.99</text>
  <text x="${px + 24}" y="${py + 160}" font-family="JetBrains Mono" font-size="15" fill="${RECEIPT_INK}">Severity Pin — "ACCEPT"</text>
  <text x="${px + pw - 24}" y="${py + 160}" text-anchor="end" font-family="JetBrains Mono" font-size="15" fill="${RECEIPT_INK}">$10.99</text>

  <line x1="${px + 24}" y1="${py + 190}" x2="${px + pw - 24}" y2="${py + 190}" stroke="#9aa88a" stroke-width="2" stroke-dasharray="4 4"/>
  <text x="${px + 24}" y="${py + 232}" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${RECEIPT_INK}">TOTAL</text>
  <text x="${px + pw - 24}" y="${py + 232}" text-anchor="end" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${RECEIPT_INK}">$88.97</text>

  <text x="${px + pw / 2}" y="${py + ph - 20}" text-anchor="middle" font-family="JetBrains Mono" font-style="italic" font-size="13" fill="#5c664f">not a real transaction — no refunds, no items, no incident.</text>
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
