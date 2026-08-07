// Generates public/og.png — the Open Graph preview card for couplequiz.
// A tabloid front-page mock: masthead, a "BREAKING" headline with a sample
// couple name, and the archetype line. Drawn shapes + mono/serif text, not
// emoji (the bundled font has no color-emoji glyphs and resvg would render
// tofu — same reasoning as sites/shipname/og-gen.mjs). Rasterised with
// @resvg/resvg-js (pure native module, no system Chromium needed).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG1 = "#1c1012", BG2 = "#120b0c";
const INK = "#f6efe2", DIM = "#cbb79f";
const RED = "#e3402f", GOLD = "#e8b13c";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="base" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${BG1}"/>
      <stop offset="1" stop-color="${BG2}"/>
    </linearGradient>
    <radialGradient id="glow1" cx="15%" cy="-10%" r="55%">
      <stop offset="0" stop-color="${RED}" stop-opacity="0.24"/>
      <stop offset="1" stop-color="${RED}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="90%" cy="0%" r="50%">
      <stop offset="0" stop-color="${GOLD}" stop-opacity="0.16"/>
      <stop offset="1" stop-color="${GOLD}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#base)"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <text x="64" y="90" font-family="JetBrains Mono" font-weight="800" font-size="18" letter-spacing="4" fill="${RED}">THE DAILY</text>
  <text x="64" y="152" font-family="JetBrains Mono" font-weight="800" font-size="66" fill="${INK}">couplequiz</text>
  <line x1="64" y1="180" x2="720" y2="180" stroke="${GOLD}" stroke-width="3"/>

  <text x="64" y="240" font-family="JetBrains Mono" font-size="20" fill="${DIM}">Type two names, answer five extremely</text>
  <text x="64" y="268" font-family="JetBrains Mono" font-size="20" fill="${DIM}">serious questions, and get your official</text>
  <text x="64" y="296" font-family="JetBrains Mono" font-size="20" fill="${DIM}">tabloid couple name + archetype.</text>

  <text x="64" y="574" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${GOLD}">couplequiz.bisks.net</text>

  <rect x="640" y="86" width="500" height="460" rx="18" fill="rgba(255,255,255,0.05)" stroke="rgba(244,234,212,0.18)" stroke-width="1.5"/>
  <text x="890" y="146" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="18" fill="${RED}">BREAKING NEWS</text>
  <line x1="800" y1="164" x2="980" y2="164" stroke="${GOLD}" stroke-width="2"/>

  <text x="890" y="252" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="58" fill="${INK}">"Alory"</text>
  <text x="890" y="292" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="21" fill="${GOLD}">the red-carpet power couple</text>

  <text x="890" y="346" text-anchor="middle" font-family="JetBrains Mono" font-size="19" fill="${DIM}">Alex + Rory  ·  87% tabloid compatible</text>

  <text x="890" y="410" text-anchor="middle" font-family="JetBrains Mono" font-size="17" fill="${RED}">insiders confirm this is not a phase —</text>
  <text x="890" y="434" text-anchor="middle" font-family="JetBrains Mono" font-size="17" fill="${RED}">flashbulbs, dramatic entrances, and a</text>
  <text x="890" y="458" text-anchor="middle" font-family="JetBrains Mono" font-size="17" fill="${RED}">situationship that graduated with honors.</text>
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
