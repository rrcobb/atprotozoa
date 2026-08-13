// Generates public/og.png — the Open Graph preview card for runway.
//
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium/fontconfig needed — the font is
// bundled in ./fonts and loaded explicitly). Pattern copied from
// sites/norvidaward/og-gen.mjs. House style: self-contained, copy-don't-abstract.
//
//   node og-gen.mjs   # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const NAVY1 = "#0a0e1a", NAVY2 = "#111a2e", AMBER = "#ffb000", AMBER_DIM = "#7a5600", FG = "#e8ecf4", DIM = "#7d8aa3";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${NAVY2}"/>
      <stop offset="1" stop-color="${NAVY1}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#sky)"/>
  <rect x="0" y="0" width="${W}" height="${H}" fill="none" stroke="${AMBER_DIM}" stroke-width="10"/>

  <text x="80" y="120" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${DIM}" letter-spacing="4">DEPARTURES / SELF-REMINDERS</text>

  <text x="80" y="230" font-family="JetBrains Mono" font-weight="800" font-size="96" fill="${FG}">runway<tspan fill="${AMBER}"> !</tspan></text>

  <text x="80" y="292" font-family="JetBrains Mono" font-size="30" fill="${AMBER}">a !remindme macro generator</text>

  <rect x="80" y="340" width="1040" height="1.5" fill="${AMBER_DIM}"/>

  <text x="80" y="400" font-family="JetBrains Mono" font-size="24" fill="${DIM}">next time buildthis runs out of runway, it was told to try this.</text>
  <text x="80" y="436" font-family="JetBrains Mono" font-size="24" fill="${DIM}">pick a duration, write a message, get the exact line to post.</text>

  <text x="80" y="520" font-family="JetBrains Mono" font-weight="700" font-size="30" fill="${FG}">● BOARDING</text>
  <text x="330" y="520" font-family="JetBrains Mono" font-size="24" fill="${DIM}">GATE RUNWAY-1</text>

  <text x="80" y="${H - 60}" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${AMBER_DIM}">runway.bisks.net</text>
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
