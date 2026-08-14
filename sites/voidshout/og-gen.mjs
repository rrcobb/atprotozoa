// Generates public/og.png — the Open Graph preview card, so a shared link
// auto-renders a picture of the Void instead of a blank unfurl. Hand-drawn
// SVG at the canonical OG size, matching the live "Bluesky-like" light
// palette (same hex values as public/lib/chrome.css), rasterised with
// @resvg/resvg-js (pure native module, no system Chromium/fontconfig needed
// on this box — the font is bundled in ./fonts and loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract (same shape as
// sites/didscope/og-gen.mjs). Re-run this by hand if you change the artwork.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#ffffff", FG = "#0f1419", DIM = "#536471";
const ACCENT = "#1185fe", ACCENT2 = "#0a7aff", GOOD = "#00ba7c", CARD = "#f7f9fa", BORDER = "#e1e8ed";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// No emoji font is bundled (this box has no fontconfig/system fonts, and
// resvg needs an explicit font file per glyph) — Places are drawn as glowing
// map pins instead of emoji, same "map-forward" read without relying on a
// glyph resvg can't rasterise (they came out as tofu boxes on the first try).
const PINS = [
  { x: 560, y: 120, c: ACCENT }, { x: 700, y: 90, c: ACCENT2 }, { x: 850, y: 150, c: GOOD },
  { x: 980, y: 100, c: ACCENT }, { x: 630, y: 230, c: ACCENT2 }, { x: 780, y: 260, c: GOOD },
  { x: 920, y: 220, c: ACCENT }, { x: 550, y: 340, c: ACCENT2 }, { x: 1050, y: 300, c: GOOD },
];

const pinsSvg = PINS.map(
  (p) => `<circle cx="${p.x}" cy="${p.y}" r="9" fill="${p.c}" opacity="0.25"/>
  <circle cx="${p.x}" cy="${p.y}" r="5" fill="${p.c}"/>
  <circle cx="${p.x}" cy="${p.y}" r="5" fill="none" stroke="${FG}" stroke-opacity="0.25" stroke-width="1"/>`,
).join("\n  ");

const routes = `
  <path d="M560,120 Q650,160 700,90" stroke="${ACCENT}" stroke-width="1.5" fill="none" opacity="0.55" stroke-dasharray="4,5"/>
  <path d="M700,90 Q800,120 850,150" stroke="${ACCENT2}" stroke-width="1.5" fill="none" opacity="0.55" stroke-dasharray="4,5"/>
  <path d="M630,230 Q700,250 780,260" stroke="${GOOD}" stroke-width="1.5" fill="none" opacity="0.5" stroke-dasharray="4,5"/>
  <path d="M850,150 Q900,180 920,220" stroke="${ACCENT}" stroke-width="1.5" fill="none" opacity="0.5" stroke-dasharray="4,5"/>
`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="15%" cy="0%" r="65%">
      <stop offset="0" stop-color="#e8f3ff"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${ACCENT}"/>
      <stop offset="1" stop-color="${ACCENT2}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>

  <text x="64" y="132" font-family="JetBrains Mono" font-weight="800" font-size="46" fill="${FG}">Shout Into</text>
  <text x="64" y="188" font-family="JetBrains Mono" font-weight="800" font-size="46" fill="${FG}">the <tspan fill="url(#title)">Void</tspan></text>

  <text x="64" y="244" font-family="JetBrains Mono" font-size="17" fill="${DIM}">Put a joke somewhere on the map.</text>
  <text x="64" y="270" font-family="JetBrains Mono" font-size="17" fill="${DIM}">Let strangers carry it. Watch it</text>
  <text x="64" y="296" font-family="JetBrains Mono" font-size="17" fill="${DIM}">get voted into oblivion or</text>
  <text x="64" y="322" font-family="JetBrains Mono" font-size="17" fill="${DIM}">immortality.</text>

  <rect x="64" y="360" width="330" height="1" fill="${BORDER}"/>
  <text x="64" y="396" font-family="JetBrains Mono" font-size="14" fill="${ACCENT2}">real OAuth · real PDS records</text>
  <text x="64" y="420" font-family="JetBrains Mono" font-size="14" fill="${ACCENT2}">live Jetstream-built map</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${GOOD}">voidshout.bisks.net</text>

  <rect x="470" y="60" width="668" height="510" rx="18" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>
  ${routes}
  ${pinsSvg}
  <text x="804" y="500" text-anchor="middle" font-family="JetBrains Mono" font-size="14" fill="${DIM}">no GPS. curated Places only.</text>
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
