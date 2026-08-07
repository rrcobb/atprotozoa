// Generates public/og.png — the Open Graph preview card for quotebucket.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium or fontconfig needed — the font
// is bundled in ./fonts and loaded explicitly). Copied pattern from
// sites/didscope/og-gen.mjs (copy, don't abstract).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// Re-run this by hand if you change the artwork.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#0d1016", BG2 = "#1a2038", INK = "#eef0f6", DIM = "#9aa3b8";
const GOLD = "#e8b854", PANEL = "#1a2030", BORDER = "#2b3348";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function bisk(x, y, w = 30, h = 22, rot = 0) {
  return `<g transform="translate(${x},${y}) rotate(${rot})">
    <rect x="0" y="0" width="${w}" height="${h}" rx="4" fill="#f3e6c8" stroke="#c9b585" stroke-width="1.5"/>
    <rect x="${w * 0.17}" y="${h * 0.32}" width="${w * 0.66}" height="2" fill="#b9a878"/>
    <rect x="${w * 0.17}" y="${h * 0.55}" width="${w * 0.4}" height="2" fill="#b9a878"/>
  </g>`;
}

const floaters = [
  bisk(760, 90, 34, 25, -8),
  bisk(880, 60, 30, 22, 6),
  bisk(980, 140, 32, 23, -4),
  bisk(830, 190, 28, 20, 10),
  bisk(1060, 80, 30, 22, -6),
];

const pile = [
  bisk(886, 496, 22, 16, -3),
  bisk(908, 492, 22, 16, 4),
  bisk(896, 508, 22, 16, -2),
  bisk(918, 506, 22, 16, 6),
];

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="sky" cx="65%" cy="10%" r="75%">
      <stop offset="0" stop-color="${BG2}"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="1"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect x="640" width="${W - 640}" height="${H}" fill="url(#sky)"/>

  <!-- left: wordmark + pitch -->
  <text x="64" y="150" font-family="JetBrains Mono" font-weight="800" font-size="66" fill="${INK}">quote<tspan fill="${GOLD}">bucket</tspan></text>
  <text x="64" y="200" font-family="JetBrains Mono" font-size="21" fill="${DIM}">a crow sorts</text>
  <text x="64" y="228" font-family="JetBrains Mono" font-size="21" fill="${GOLD}">@norvid-studies.bsky.social's</text>
  <text x="64" y="256" font-family="JetBrains Mono" font-size="21" fill="${DIM}">quote-posts into a bucket.</text>

  <text x="64" y="330" font-family="JetBrains Mono" font-size="17" fill="${DIM}">Every quote, the crow flies up and</text>
  <text x="64" y="356" font-family="JetBrains Mono" font-size="17" fill="${DIM}">drops a bisk in. Every 24 hours,</text>
  <text x="64" y="382" font-family="JetBrains Mono" font-size="17" fill="${DIM}">with a countdown, it tips over.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${GOLD}">quotebucket.bisks.net</text>

  <!-- right: the scene -->
  <rect x="672" y="60" width="466" height="510" rx="18" fill="${PANEL}" stroke="${BORDER}" stroke-width="1.5"/>

  ${floaters.join("\n  ")}

  <!-- crow: simple vector silhouette, no font glyph needed for rasterizing -->
  <g transform="translate(730,430)">
    <ellipse cx="30" cy="35" rx="34" ry="24" fill="#23283a"/>
    <circle cx="60" cy="16" r="15" fill="#23283a"/>
    <polygon points="72,14 92,20 72,26" fill="#3a4260"/>
    <circle cx="64" cy="12" r="2.4" fill="#e8b854"/>
    <path d="M4,32 Q-16,26 -10,10 Q2,20 12,28 Z" fill="#1a1e2c"/>
    <path d="M6,50 L2,66 M14,52 L14,68 M22,50 L26,66" stroke="#1a1e2c" stroke-width="3" stroke-linecap="round"/>
  </g>

  <!-- bucket -->
  <g transform="translate(870,470)">
    <path d="M6,20 L78,20 L68,110 L16,110 Z" fill="#2b3348" stroke="#e8b854" stroke-width="2.5"/>
    <ellipse cx="42" cy="20" rx="36" ry="9" fill="#1a2030" stroke="#e8b854" stroke-width="2.5"/>
    <path d="M14,16 Q42,-14 70,16" fill="none" stroke="#e8b854" stroke-width="3" stroke-linecap="round"/>
  </g>
  ${pile.join("\n  ")}
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
