// Generates public/og.png — the Open Graph preview card for junkyard, so a
// shared link auto-renders a picture of the idea in Bluesky / other
// unfurlers.
//
// Hand-drawn SVG: a scrapyard robot arm welding a browser-window mockup
// together out of scrap, under a rusty crane silhouette. Rasterised with
// @resvg/resvg-js (pure native module, no system Chromium/fontconfig
// needed — the font is bundled in ./fonts and loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Adapted from
// sites/trashpanda/og-gen.mjs.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#100e0c", PANEL = "#1b1613", INK = "#f1ece3", MUTED = "#a99d8c";
const ACCENT = "#d9762f", ACCENT2 = "#e8b23d", WARN = "#f4d03f";
const BORDER = "rgba(241,236,227,0.14)";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0b0908"/>
      <stop offset="1" stop-color="${BG}"/>
    </linearGradient>
    <linearGradient id="metal" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#5a4a36"/>
      <stop offset="1" stop-color="#33291f"/>
    </linearGradient>
    <linearGradient id="ctaGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${ACCENT}"/>
      <stop offset="1" stop-color="${ACCENT2}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#sky)"/>

  <!-- warning-tape stripe along the top -->
  <g opacity="0.5">
    <rect x="0" y="0" width="${W}" height="14" fill="#1b1613"/>
    <rect x="0" y="0" width="${W}" height="14" fill="url(#hatch)"/>
  </g>
  <defs>
    <pattern id="hatch" width="28" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
      <rect width="14" height="14" fill="${WARN}" opacity="0.55"/>
    </pattern>
  </defs>

  <!-- distant crane silhouette -->
  <g stroke="#221b14" stroke-width="6" fill="none" opacity="0.6">
    <line x1="1000" y1="560" x2="1000" y2="140"/>
    <line x1="1000" y1="150" x2="1150" y2="150"/>
    <line x1="1000" y1="180" x2="1120" y2="150"/>
    <line x1="1120" y1="150" x2="1120" y2="230"/>
  </g>

  <!-- scrap pile bottom-left -->
  <g fill="#2a2119" opacity="0.85">
    <rect x="30" y="500" width="120" height="70" rx="6" transform="rotate(-6 90 535)"/>
    <rect x="120" y="520" width="90" height="60" rx="6" transform="rotate(8 165 550)"/>
    <circle cx="70" cy="560" r="30"/>
  </g>

  <!-- robot arm base -->
  <g transform="translate(90,300)">
    <rect x="-30" y="230" width="220" height="24" rx="6" fill="#221b14"/>
    <rect x="40" y="60" width="34" height="176" rx="8" fill="url(#metal)" stroke="#221b14" stroke-width="3"/>
    <!-- upper arm -->
    <g transform="rotate(-24 57 90)">
      <rect x="20" y="70" width="180" height="30" rx="10" fill="url(#metal)" stroke="#221b14" stroke-width="3"/>
    </g>
    <!-- forearm reaching toward the mockup -->
    <g transform="translate(150,10) rotate(18 0 40)">
      <rect x="0" y="30" width="160" height="24" rx="9" fill="url(#metal)" stroke="#221b14" stroke-width="3"/>
      <!-- claw -->
      <path d="M150 20 L190 0 L182 26 Z" fill="${ACCENT}" stroke="#221b14" stroke-width="2"/>
      <path d="M150 56 L190 78 L182 50 Z" fill="${ACCENT}" stroke="#221b14" stroke-width="2"/>
    </g>
    <circle cx="57" cy="70" r="16" fill="#221b14"/>
    <circle cx="57" cy="70" r="7" fill="${ACCENT2}"/>
  </g>

  <!-- welding sparks -->
  <g fill="${WARN}">
    <circle cx="470" cy="330" r="4"/>
    <circle cx="486" cy="308" r="3"/>
    <circle cx="500" cy="345" r="3.5"/>
    <circle cx="455" cy="300" r="2.5"/>
    <circle cx="510" cy="320" r="2.5"/>
  </g>

  <!-- the fake browser-window mockup being welded -->
  <g transform="translate(430,220)">
    <rect x="0" y="0" width="380" height="230" rx="12" fill="${PANEL}" stroke="${BORDER}" stroke-width="2"/>
    <rect x="0" y="0" width="380" height="34" rx="12" fill="#171310"/>
    <rect x="0" y="20" width="380" height="14" fill="#171310"/>
    <circle cx="20" cy="17" r="5" fill="#e0574a"/>
    <circle cx="38" cy="17" r="5" fill="${WARN}"/>
    <circle cx="56" cy="17" r="5" fill="#5ab55a"/>
    <rect x="80" y="9" width="240" height="16" rx="5" fill="#0c0a08"/>
    <text x="90" y="21" font-family="JetBrains Mono" font-weight="700" font-size="12" fill="${MUTED}">petsitterco.zip</text>
    <text x="24" y="80" font-family="JetBrains Mono" font-weight="800" font-size="26" fill="${INK}">Pet Sitter Co</text>
    <rect x="24" y="98" width="260" height="10" rx="5" fill="#33291f"/>
    <rect x="24" y="116" width="200" height="10" rx="5" fill="#33291f"/>
    <rect x="24" y="150" width="140" height="34" rx="17" fill="url(#ctaGrad)"/>
    <text x="94" y="172" font-family="JetBrains Mono" font-weight="700" font-size="13" fill="#1b1310" text-anchor="middle">Get Started</text>
  </g>

  <text x="60" y="470" font-family="JetBrains Mono" font-weight="800" font-size="66" fill="${INK}">junk<tspan fill="${ACCENT}">yard</tspan></text>
  <text x="60" y="512" font-family="JetBrains Mono" font-size="23" fill="${MUTED}">a robot arm on the live atproto firehose</text>

  <rect x="60" y="540" width="760" height="52" rx="12" fill="${PANEL}" stroke="${BORDER}" stroke-width="1.5"/>
  <text x="84" y="574" font-family="JetBrains Mono" font-size="19" fill="${ACCENT}">welding every "free idea" post into a fake website</text>

  <text x="900" y="590" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT}">junkyard.bisks.net</text>
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
