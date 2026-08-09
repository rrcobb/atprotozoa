// Generates public/og.png — the Open Graph preview card for jaccuse.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium/fontconfig needed on this box —
// the font is bundled in ./fonts and loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run by hand if the
// artwork changes.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const WOOD = "#241109", WOOD2 = "#3a1c14", GOLD = "#e0b24a", PAPER = "#f3e6c8";
const RED = "#a1231f", DIM = "#c9a97a";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="50%" cy="0%" r="70%">
      <stop offset="0" stop-color="${WOOD2}"/>
      <stop offset="1" stop-color="${WOOD}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${WOOD}"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>

  <!-- manul, prosecutor's robe, stage right -->
  <g transform="translate(900,120) scale(1.65)">
    <ellipse cx="100" cy="150" rx="88" ry="16" fill="#000" opacity=".28"/>
    <path d="M28 168 C 28 100 45 78 100 78 C 155 78 172 100 172 168 Z" fill="#161022" stroke="${GOLD}" stroke-width="3"/>
    <path d="M46 46 L34 12 L66 34 Z" fill="#b9a582" stroke="#6b5a3f" stroke-width="2"/>
    <path d="M154 46 L166 12 L134 34 Z" fill="#b9a582" stroke="#6b5a3f" stroke-width="2"/>
    <ellipse cx="100" cy="70" rx="62" ry="48" fill="#c9b691" stroke="#6b5a3f" stroke-width="2.5"/>
    <ellipse cx="52" cy="86" rx="20" ry="26" fill="#dcccA8"/>
    <ellipse cx="148" cy="86" rx="20" ry="26" fill="#dcccA8"/>
    <circle cx="74" cy="66" r="12" fill="#2a1a10"/>
    <circle cx="126" cy="66" r="12" fill="#2a1a10"/>
    <circle cx="77" cy="62" r="3" fill="#fff"/>
    <circle cx="129" cy="62" r="3" fill="#fff"/>
    <path d="M62 50 Q74 44 86 50" stroke="#6b5a3f" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M114 50 Q126 44 138 50" stroke="#6b5a3f" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M92 88 Q100 96 108 88" stroke="#2a1a10" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    <g transform="translate(150,120) rotate(24)">
      <rect x="-4" y="-30" width="8" height="34" rx="3" fill="#8a5a2a"/>
      <rect x="-16" y="-40" width="32" height="14" rx="4" fill="#5a3a1c" stroke="${GOLD}" stroke-width="1.5"/>
    </g>
  </g>

  <!-- title block -->
  <text x="64" y="130" font-family="JetBrains Mono" font-weight="800" font-size="30" fill="${DIM}" letter-spacing="3">IN THE COURT OF PUBLIC OPINION</text>
  <text x="60" y="240" font-family="JetBrains Mono" font-weight="800" font-size="108" fill="${GOLD}">J'ACCUSE!</text>
  <text x="64" y="292" font-family="JetBrains Mono" font-size="24" fill="${PAPER}">The People <tspan font-style="italic" fill="${DIM}">vs.</tspan> @norvid-studies.bsky.social</text>

  <text x="64" y="356" font-family="JetBrains Mono" font-size="19" fill="${DIM}">One manul. Seven exhibits. Zero real proof.</text>
  <text x="64" y="386" font-family="JetBrains Mono" font-size="19" fill="${DIM}">The em dash did not do it.</text>

  <!-- stamp -->
  <g transform="translate(210,520) rotate(-7)">
    <rect x="-150" y="-42" width="300" height="84" rx="10" fill="none" stroke="${RED}" stroke-width="7"/>
    <text x="0" y="14" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="44" fill="${RED}" letter-spacing="2">DISMISSED</text>
  </g>

  <text x="64" y="580" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${GOLD}">jaccuse.bisks.net</text>
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
