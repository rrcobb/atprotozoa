// Generates public/og.png — the Open Graph preview card for fellowshipcast.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (same recipe as sites/steamtags/og-gen.mjs — pure native module, no system
// Chromium/fontconfig needed).
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

const BG = "#0e130f", BG2 = "#1c2a1a", INK = "#ecead9", MUTED = "#93a08c";
const GOLD = "#f2d38c", RING = "#b9832f";

const rows = [
  { who: "Gandalf", model: "Claude Opus" },
  { who: "Aragorn", model: "GPT-5" },
  { who: "Frodo Baggins", model: "Claude Haiku" },
  { who: "Samwise Gamgee", model: "Llama 4" },
];

const rowsSvg = rows
  .map((r, i) => {
    const y = 366 + i * 58;
    return `
    <rect x="64" y="${y - 32}" width="1072" height="46" rx="10" fill="${BG2}"/>
    <text x="88" y="${y}" font-family="JetBrains Mono" font-weight="700" font-size="23" fill="${INK}">${r.who}</text>
    <text x="1112" y="${y}" text-anchor="end" font-family="JetBrains Mono" font-weight="800" font-size="23" fill="${GOLD}">${r.model}</text>`;
  })
  .join("");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="12%" cy="-10%" r="65%">
      <stop offset="0" stop-color="#23331f"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${GOLD}"/>
      <stop offset="1" stop-color="${RING}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>

  <text x="64" y="140" font-family="JetBrains Mono" font-weight="800" font-size="66" fill="url(#title)">fellowshipcast</text>
  <text x="66" y="184" font-family="JetBrains Mono" font-size="24" fill="${MUTED}">cast an LLM to play each of the Fellowship's nine walkers</text>

  <text x="66" y="260" font-family="JetBrains Mono" font-size="19" fill="${MUTED}">Sign in with Bluesky, assign a model to every role, and watch the</text>
  <text x="66" y="286" font-family="JetBrains Mono" font-size="19" fill="${MUTED}">network-wide tally update live. Nothing lives on a server — every</text>
  <text x="66" y="312" font-family="JetBrains Mono" font-size="19" fill="${MUTED}">ballot is a real record on your own PDS.</text>

  ${rowsSvg}

  <rect x="0" y="${H - 6}" width="${W}" height="6" fill="url(#title)"/>
</svg>`;

const fontPath = fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url));
const resvg = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
});
const png = resvg.render().asPng();
writeFileSync(new URL("./public/og.png", import.meta.url), png);
console.log(`wrote public/og.png (${png.length} bytes)`);
