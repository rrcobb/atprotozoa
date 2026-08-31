// Generates public/og.png — the static Open Graph preview card. Hand-drawn
// SVG sketch of the pond diagram (sun, producer, storage, consumer, heat
// sinks), rasterised with @resvg/resvg-js and meowsphere's bundled JetBrains
// Mono font (no system Chromium/fontconfig needed).
//
//   node og-gen.mjs   # writes ./public/og.png

import { Resvg } from "../meowsphere/node_modules/@resvg/resvg-js/index.js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const fontPath = fileURLToPath(new URL("../meowsphere/fonts/JetBrainsMono.ttf", import.meta.url));

const W = 1200, H = 630;
const BG = "#061418", INK = "#eaf6f2", MUTED = "#86aca6";
const SUN = "#ffcf5c", PRODUCER = "#4caf7d", STORAGE = "#38a6c4", CONSUMER = "#e8935a", HEAT = "#ff5d4a";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="bgglow" cx="18%" cy="15%" r="60%">
      <stop offset="0" stop-color="#10323a"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="sunGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="${SUN}" stop-opacity="0.9"/>
      <stop offset="1" stop-color="${SUN}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#bgglow)"/>

  <!-- sun -->
  <g transform="translate(150,150)">
    <circle r="80" fill="url(#sunGlow)"/>
    ${Array.from({ length: 12 }, (_, i) => {
      const a = (Math.PI * 2 * i) / 12;
      const r0 = 34, r1 = 58;
      return `<line x1="${(Math.cos(a) * r0).toFixed(1)}" y1="${(Math.sin(a) * r0).toFixed(1)}" x2="${(Math.cos(a) * r1).toFixed(1)}" y2="${(Math.sin(a) * r1).toFixed(1)}" stroke="${SUN}" stroke-width="4" stroke-linecap="round"/>`;
    }).join("")}
    <circle r="28" fill="${SUN}"/>
  </g>

  <!-- producer bullet -->
  <g transform="translate(330,340)">
    <path d="M-42,-32 Q-42,-36 -38,-36 L-6,-36 Q40,-36 40,0 Q40,36 -6,36 L-38,36 Q-42,36 -42,32 Z" fill="#234a37" stroke="${PRODUCER}" stroke-width="3"/>
  </g>

  <!-- storage tank -->
  <g transform="translate(500,340)">
    <path d="M-36,-50 Q-43,-50 -43,-43 L-43,43 Q-43,50 -36,50 L36,50 Q43,50 43,43 L43,-43 Q43,-50 36,-50 Z" fill="#08181c" stroke="${STORAGE}" stroke-width="3"/>
    <rect x="-43" y="0" width="86" height="46" fill="${STORAGE}" opacity="0.7" clip-path="inset(0)"/>
  </g>

  <!-- consumer hexagon -->
  <g transform="translate(670,340)">
    <polygon points="34,0 17,29 -17,29 -34,0 -17,-29 17,-29" fill="#4a3222" stroke="${CONSUMER}" stroke-width="3"/>
  </g>

  <!-- heat sinks -->
  <g transform="translate(330,470)">
    <line x1="0" y1="-16" x2="0" y2="0" stroke="${HEAT}" stroke-width="3"/>
    <line x1="-16" y1="4" x2="16" y2="4" stroke="${HEAT}" stroke-width="3"/>
    <line x1="-10" y1="12" x2="10" y2="12" stroke="${HEAT}" stroke-width="3"/>
  </g>
  <g transform="translate(670,470)">
    <line x1="0" y1="-16" x2="0" y2="0" stroke="${HEAT}" stroke-width="3"/>
    <line x1="-16" y1="4" x2="16" y2="4" stroke="${HEAT}" stroke-width="3"/>
    <line x1="-10" y1="12" x2="10" y2="12" stroke="${HEAT}" stroke-width="3"/>
  </g>

  <!-- flow lines -->
  <path d="M210,180 C260,220 280,260 300,300" fill="none" stroke="${SUN}" stroke-width="3"/>
  <path d="M330,376 L330,450" fill="none" stroke="${HEAT}" stroke-width="3"/>
  <path d="M372,340 L457,340" fill="none" stroke="${PRODUCER}" stroke-width="3"/>
  <path d="M543,340 L636,340" fill="none" stroke="${STORAGE}" stroke-width="3"/>
  <path d="M670,376 L670,450" fill="none" stroke="${HEAT}" stroke-width="3"/>

  <text x="72" y="90" font-family="JetBrains Mono" font-weight="800" font-size="46" fill="${INK}">emergypond</text>
  <text x="72" y="122" font-family="JetBrains Mono" font-size="18" fill="${MUTED}">a living Howard Odum energy systems diagram</text>

  <text x="72" y="560" font-family="JetBrains Mono" font-size="18" fill="${MUTED}">sun · producer · consumer · storage · heat sink</text>
  <text x="72" y="592" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${SUN}">emergypond.bisks.net</text>
</svg>`;

const resvg = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
});
const png = resvg.render().asPng();
const out = fileURLToPath(new URL("./public/og.png", import.meta.url));
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");
