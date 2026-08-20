// Generates public/og.png — the Open Graph preview card for captain-randoblock.
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

const YELLOW = "#ffd23f", RED = "#d81e2c", NAVY = "#0a2a6b", BLUE = "#1185fe", INK = "#111111", PAPER = "#f2e9d8";

// same hero, drawn once, reused at OG scale
const hero = `
  <path d="M75,86 C18,110 4,192 34,236 C55,206 63,150 79,116 Z" fill="${RED}" stroke="#8f0f1a" stroke-width="3"/>
  <path d="M125,86 C182,110 196,192 166,236 C145,206 137,150 121,116 Z" fill="${RED}" stroke="#8f0f1a" stroke-width="3"/>
  <path d="M79,206 L73,238 L93,238 L89,206 Z" fill="${NAVY}"/>
  <path d="M121,206 L127,238 L107,238 L111,206 Z" fill="${NAVY}"/>
  <path d="M72,110 C72,88 128,88 128,110 L135,210 C112,224 88,224 65,210 Z" fill="${BLUE}" stroke="${NAVY}" stroke-width="3"/>
  <rect x="60" y="170" width="80" height="16" rx="6" fill="${YELLOW}" stroke="${INK}" stroke-width="2.5"/>
  <path d="M79,103 C54,94 38,74 44,58" stroke="${BLUE}" stroke-width="21" fill="none" stroke-linecap="round"/>
  <circle cx="43" cy="55" r="14" fill="${NAVY}" stroke="${INK}" stroke-width="2.5"/>
  <path d="M121,103 C140,116 140,148 121,158" stroke="${BLUE}" stroke-width="21" fill="none" stroke-linecap="round"/>
  <circle cx="119" cy="160" r="14" fill="${NAVY}" stroke="${INK}" stroke-width="2.5"/>
  <circle cx="100" cy="136" r="25" fill="#fff" stroke="${INK}" stroke-width="3"/>
  <path d="M87,127 h26 a6 6 0 0 1 6 6 v8 a6 6 0 0 1 -6 6 h-10 l-8 7 v-7 h-8 a6 6 0 0 1 -6 -6 v-8 a6 6 0 0 1 6 -6 Z" fill="${BLUE}"/>
  <line x1="83" y1="119" x2="117" y2="153" stroke="${RED}" stroke-width="7" stroke-linecap="round"/>
  <circle cx="100" cy="70" r="35" fill="#f0c090" stroke="#a9784a" stroke-width="2"/>
  <path d="M82,42 L92,20 L96,44 Z" fill="${NAVY}"/>
  <path d="M100,40 L108,16 L112,42 Z" fill="${NAVY}"/>
  <path d="M118,42 L124,20 L130,44 Z" fill="${NAVY}"/>
  <path d="M70,60 Q100,46 130,60 Q128,80 100,82 Q72,80 70,60 Z" fill="${NAVY}"/>
  <ellipse cx="84" cy="66" rx="7" ry="6" fill="#fff"/>
  <ellipse cx="116" cy="66" rx="7" ry="6" fill="#fff"/>
  <circle cx="85" cy="67" r="3" fill="${INK}"/>
  <circle cx="117" cy="67" r="3" fill="${INK}"/>
  <path d="M62,52 Q76,40 90,50" stroke="#5a3a1c" stroke-width="3" fill="none" stroke-linecap="round"/>
  <path d="M110,50 Q124,40 138,52" stroke="#5a3a1c" stroke-width="3" fill="none" stroke-linecap="round"/>
  <ellipse cx="100" cy="93" rx="11" ry="9" fill="#7a2a1a" stroke="${INK}" stroke-width="2"/>
  <path d="M91,89 h18" stroke="#fff" stroke-width="2.5"/>
`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="50%" cy="35%" r="70%">
      <stop offset="0" stop-color="#ffe9a8"/>
      <stop offset="0.45" stop-color="${YELLOW}"/>
      <stop offset="1" stop-color="${PAPER}"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${PAPER}"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <circle cx="0" cy="0" r="0" fill="none"/>

  <!-- halftone dots, cheap -->
  <g opacity="0.12">
    ${Array.from({length: 18}).map((_,r)=>
      Array.from({length: 34}).map((_,c)=>
        `<circle cx="${c*36+10}" cy="${r*36+10}" r="3" fill="${INK}"/>`
      ).join("")
    ).join("")}
  </g>

  <!-- burst behind title -->
  <g transform="translate(330,300)">
    ${Array.from({length: 16}).map((_,i)=>{
      const a = (i/16)*Math.PI*2;
      const x = Math.cos(a)*260, y = Math.sin(a)*260;
      return `<line x1="0" y1="0" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${RED}" stroke-width="14" opacity="0.14"/>`;
    }).join("")}
  </g>

  <!-- hero, stage right -->
  <g transform="translate(870,160) scale(1.7)">${hero}</g>

  <!-- BLOK burst -->
  <g transform="translate(1015,475) rotate(-8)">
    <polygon points="0,-92 22,-40 68,-64 58,-14 108,0 58,14 68,64 22,40 0,92 -22,40 -68,64 -58,14 -108,0 -58,-14 -68,-64 -22,-40"
      fill="${RED}" stroke="${INK}" stroke-width="4"/>
    <text x="0" y="16" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="34" fill="#fff">BLOK!!</text>
  </g>

  <!-- title block -->
  <text x="64" y="120" font-family="JetBrains Mono" font-weight="800" font-size="26" fill="${NAVY}" letter-spacing="3">ISSUE #1 · THE INSTA-BLOCK PROTOCOL</text>
  <text x="60" y="216" font-family="JetBrains Mono" font-weight="800" font-size="86" fill="${RED}" stroke="${INK}" stroke-width="2">CAPTAIN</text>
  <text x="60" y="312" font-family="JetBrains Mono" font-weight="800" font-size="86" fill="${RED}" stroke="${INK}" stroke-width="2">RANDOBLOCK</text>

  <text x="64" y="368" font-family="JetBrains Mono" font-size="20" fill="${INK}">He reads six words. He feels the whole post.</text>
  <text x="64" y="398" font-family="JetBrains Mono" font-size="20" fill="${INK}">He is never, ever right.</text>
  <text x="64" y="436" font-family="JetBrains Mono" font-size="19" fill="#4a4a4a">Ten issues of the quintessential Bluesky experience, drawn.</text>

  <text x="64" y="580" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${NAVY}">captain-randoblock.bisks.net</text>
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
