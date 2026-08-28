// Generates public/og.png — the Open Graph preview card for floppydash.
// Same recipe as sites/receipts/og-gen.mjs: hand-drawn SVG at the canonical
// OG size, rasterised with @resvg/resvg-js (no system Chromium needed).
// No emoji here — this sandbox has zero system fonts (no fontconfig), so
// resvg can only render glyphs from the bundled JetBrainsMono.ttf, which has
// no emoji; unrendered emoji show up as tofu boxes (see sites/annoyotron/og.png
// for the cautionary example). Icons are hand-drawn vectors instead.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#0b0e12", FG = "#e8f1ea", DIM = "#7d8b96";
const ACCENT = "#59e88f", ACCENT2 = "#ffcb47", DANGER = "#ff5d5d";
const MONO = "JetBrains Mono";

function floppy(x, y, s) {
  return `
  <g transform="translate(${x} ${y}) scale(${s})">
    <rect x="-46" y="-46" width="92" height="92" rx="9" fill="#2b6fd6"/>
    <rect x="-46" y="-46" width="92" height="24" fill="${BG}"/>
    <rect x="-24" y="-46" width="30" height="20" fill="#dfe8f5"/>
    <rect x="-30" y="-6" width="60" height="46" rx="6" fill="#f2f5fa"/>
  </g>`;
}

const tables = [
  { x: 890, y: 130, label: "CAT BLOG", color: ACCENT },
  { x: 1040, y: 230, label: "PIZZA", color: ACCENT2 },
  { x: 900, y: 340, label: "FLORAL", color: "#ff8fd6" },
];

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="10%" cy="0%" r="60%">
      <stop offset="0" stop-color="#123326"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="95%" cy="100%" r="55%">
      <stop offset="0" stop-color="#2a1830"/>
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

  ${floppy(112, 100, 0.62)}
  <text x="164" y="128" font-family="${MONO}" font-weight="800" font-size="72" fill="url(#title)">floppydash</text>
  <text x="66" y="196" font-family="${MONO}" font-size="26" fill="${DIM}">the coders write your site to a floppy disk.</text>
  <text x="66" y="230" font-family="${MONO}" font-size="26" fill="${DIM}">you run it to the customer before they walk.</text>

  <rect x="64" y="290" width="560" height="1" fill="#2a323d"/>

  <text x="64" y="340" font-family="${MONO}" font-size="22" fill="${FG}">WASD / arrows to move</text>
  <text x="64" y="378" font-family="${MONO}" font-size="22" fill="${FG}">space to take orders, grab floppies, deliver</text>
  <text x="64" y="416" font-family="${MONO}" font-size="22" fill="${DANGER}">3 walkouts and the shop closes</text>

  <text x="64" y="500" font-family="${MONO}" font-weight="700" font-size="24" fill="${ACCENT}">floppydash.bisks.net</text>
  <text x="64" y="536" font-family="${MONO}" font-size="18" fill="${DIM}">built by @buildthis.bisks.net for @thebadcode.com</text>

  ${tables.map((t) => `
  <ellipse cx="${t.x}" cy="${t.y + 34}" rx="70" ry="18" fill="#20293380"/>
  <ellipse cx="${t.x}" cy="${t.y + 16}" rx="62" ry="24" fill="#3a2b1f" stroke="#5a4530" stroke-width="3"/>
  <rect x="${t.x - 54}" y="${t.y - 6}" width="108" height="30" rx="15" fill="${BG}" stroke="${t.color}" stroke-width="2"/>
  <text x="${t.x}" y="${t.y + 15}" text-anchor="middle" font-family="${MONO}" font-weight="700" font-size="15" fill="${t.color}">${t.label}</text>
  `).join("\n")}

  ${floppy(1080, 500, 1.15)}
</svg>`;

const fontPath = fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url));
const resvg = new Resvg(svg, {
  font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: MONO },
});
const png = resvg.render().asPng();
writeFileSync(new URL("./public/og.png", import.meta.url), png);
console.log("wrote public/og.png", png.length, "bytes");
