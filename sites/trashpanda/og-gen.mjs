// Generates public/og.png — the Open Graph preview card for trashpanda, so a
// shared link auto-renders a picture of the idea in Bluesky / other
// unfurlers.
//
// Hand-drawn SVG: a raccoon peeking out of a trash can under a night sky,
// with a "free idea" scrap of paper in one paw. Rasterised with
// @resvg/resvg-js (pure native module, no system Chromium/fontconfig
// needed — the font is bundled in ./fonts and loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork. Adapted from sites/windchimes/og-gen.mjs.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#0d0f0b", PANEL = "#171a13", INK = "#eef0e6", MUTED = "#93a086";
const ACCENT = "#f4b942";
const BORDER = "rgba(238,240,230,0.14)";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0a0d08"/>
      <stop offset="1" stop-color="${BG}"/>
    </linearGradient>
    <radialGradient id="moon-glow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#efe6d3" stop-opacity="0.35"/>
      <stop offset="1" stop-color="#efe6d3" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="canbody" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#3a4030"/>
      <stop offset="1" stop-color="#20241a"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#sky)"/>

  <!-- moon -->
  <circle cx="1030" cy="120" r="140" fill="url(#moon-glow)"/>
  <circle cx="1030" cy="120" r="52" fill="#efe6d3" opacity="0.92"/>

  <!-- stars -->
  <g fill="#efe6d3" opacity="0.6">
    <circle cx="120" cy="70" r="2"/>
    <circle cx="220" cy="140" r="1.6"/>
    <circle cx="360" cy="60" r="1.6"/>
    <circle cx="700" cy="90" r="2"/>
    <circle cx="850" cy="50" r="1.6"/>
    <circle cx="60" cy="210" r="1.6"/>
  </g>

  <!-- distant fence silhouette -->
  <g fill="#171a13">
    <rect x="0" y="330" width="1200" height="10"/>
    <rect x="40" y="300" width="10" height="40"/>
    <rect x="160" y="300" width="10" height="40"/>
    <rect x="960" y="300" width="10" height="40"/>
    <rect x="1120" y="300" width="10" height="40"/>
  </g>

  <!-- second trash can, smaller, knocked lid -->
  <g transform="translate(870,300)">
    <ellipse cx="60" cy="230" rx="80" ry="14" fill="#05070a" opacity="0.5"/>
    <rect x="10" y="60" width="100" height="170" rx="10" fill="url(#canbody)" stroke="#0e120c" stroke-width="3"/>
    <ellipse cx="60" cy="60" rx="50" ry="12" fill="#454c38"/>
    <ellipse cx="130" cy="40" rx="46" ry="10" fill="#454c38" stroke="#0e120c" stroke-width="3" transform="rotate(-18 130 40)"/>
  </g>

  <!-- main trash can with raccoon peeking out -->
  <g transform="translate(160,240)">
    <ellipse cx="140" cy="330" rx="170" ry="22" fill="#05070a" opacity="0.55"/>
    <rect x="30" y="120" width="220" height="220" rx="16" fill="url(#canbody)" stroke="#0e120c" stroke-width="4"/>
    <rect x="30" y="120" width="220" height="220" rx="16" fill="none" stroke="${ACCENT}" stroke-width="1" opacity="0.12"/>
    <line x1="60" y1="150" x2="60" y2="330" stroke="#0e120c" stroke-width="3" opacity="0.5"/>
    <line x1="220" y1="150" x2="220" y2="330" stroke="#0e120c" stroke-width="3" opacity="0.5"/>
    <ellipse cx="140" cy="120" rx="110" ry="24" fill="#4a523a"/>

    <!-- raccoon body peeking out of the can -->
    <ellipse cx="140" cy="118" rx="82" ry="66" fill="#6b6250"/>
    <!-- ears -->
    <ellipse cx="82" cy="42" rx="20" ry="26" fill="#4a4335" transform="rotate(-22 82 42)"/>
    <ellipse cx="198" cy="42" rx="20" ry="26" fill="#4a4335" transform="rotate(22 198 42)"/>
    <ellipse cx="83" cy="45" rx="10" ry="14" fill="#efe6d3" transform="rotate(-22 83 45)"/>
    <ellipse cx="197" cy="45" rx="10" ry="14" fill="#efe6d3" transform="rotate(22 197 45)"/>
    <!-- face patch -->
    <path d="M50 80 Q140 20 230 80 Q215 45 140 40 Q65 45 50 80Z" fill="#8a806a"/>
    <path d="M70 108 Q140 168 210 108 Q200 150 140 168 Q80 150 70 108Z" fill="#efe6d3"/>
    <!-- mask -->
    <path d="M58 74 Q90 48 122 74 Q90 96 58 74Z" fill="#2b2620"/>
    <path d="M158 74 Q190 48 222 74 Q190 96 158 74Z" fill="#2b2620"/>
    <circle cx="90" cy="74" r="8" fill="#efe6d3"/>
    <circle cx="190" cy="74" r="8" fill="#efe6d3"/>
    <circle cx="90" cy="74" r="3.6" fill="#111"/>
    <circle cx="190" cy="74" r="3.6" fill="#111"/>
    <ellipse cx="140" cy="102" rx="11" ry="8" fill="#2b2620"/>

    <!-- paw holding a scrap of paper -->
    <ellipse cx="235" cy="150" rx="16" ry="12" fill="#6b6250" transform="rotate(20 235 150)"/>
    <g transform="translate(238,110) rotate(14)">
      <rect x="0" y="0" width="76" height="52" rx="4" fill="#efe6d3" stroke="#c9bfa2" stroke-width="2"/>
      <text x="8" y="22" font-family="JetBrains Mono" font-weight="800" font-size="15" fill="#2b2620">FREE</text>
      <text x="8" y="42" font-family="JetBrains Mono" font-weight="800" font-size="15" fill="#2b2620">IDEA</text>
    </g>
  </g>

  <!-- scattered trash bits at the can's feet -->
  <g fill="#454c38" opacity="0.7">
    <ellipse cx="120" cy="565" rx="20" ry="7"/>
    <rect x="330" y="552" width="26" height="18" rx="3" transform="rotate(-8 330 552)"/>
    <circle cx="410" cy="560" r="10"/>
  </g>

  <text x="60" y="470" font-family="JetBrains Mono" font-weight="800" font-size="66" fill="${INK}">trash<tspan fill="${ACCENT}">panda</tspan></text>
  <text x="60" y="512" font-family="JetBrains Mono" font-size="23" fill="${MUTED}">a raccoon on the live atproto firehose</text>

  <rect x="60" y="540" width="700" height="52" rx="12" fill="${PANEL}" stroke="${BORDER}" stroke-width="1.5"/>
  <text x="84" y="574" font-family="JetBrains Mono" font-size="19" fill="${ACCENT}">digging up every "free idea" post it can find</text>

  <text x="820" y="590" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT}">trashpanda.bisks.net</text>
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
