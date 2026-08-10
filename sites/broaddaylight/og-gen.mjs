// Generates public/og.png — the static Open Graph card for the bare link.
// Hand-drawn SVG, rasterised with @resvg/resvg-js (no system fonts/Chromium
// on this box, so the font is bundled in ./fonts and loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#0b0d10", FG = "#eef0f2", DIM = "#8b93a1", TAPE = "#ffcc00", RED = "#ff9d9d";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// diagonal caution-tape stripe, clipped to a 16px band along the top
let stripes = "";
for (let x = -40; x < W + 40; x += 36) {
  const fill = Math.floor(x / 36) % 2 === 0 ? TAPE : "#1a1a1a";
  stripes += `<polygon points="${x},56 ${x + 40},-24 ${x + 58},-24 ${x + 18},56" fill="${fill}"/>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <clipPath id="tapeclip"><rect x="0" y="0" width="${W}" height="16"/></clipPath>
  <g clip-path="url(#tapeclip)">${stripes}</g>

  <text x="64" y="90" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${DIM}">EXPERIMENTAL CRIMINOLOGY UNIT</text>
  <text x="60" y="168" font-family="JetBrains Mono" font-weight="800" font-size="66" fill="${FG}">broad daylight</text>

  <text x="64" y="230" font-family="JetBrains Mono" font-size="24" fill="${TAPE}" font-weight="700">a daylight-breadth analyzer &amp;</text>
  <text x="64" y="264" font-family="JetBrains Mono" font-size="24" fill="${TAPE}" font-weight="700">predictive crime coefficient</text>

  <text x="64" y="330" font-family="JetBrains Mono" font-size="21" fill="${DIM}">Real sun-elevation math. A fake crime score.</text>
  <text x="64" y="360" font-family="JetBrains Mono" font-size="21" fill="${DIM}">Exactly as scientific as the real predictive-</text>
  <text x="64" y="390" font-family="JetBrains Mono" font-size="21" fill="${DIM}">policing tools it's making fun of: not at all.</text>

  <rect x="64" y="440" width="1072" height="118" rx="12" fill="none" stroke="${RED}" stroke-width="2" stroke-dasharray="6,6"/>
  <text x="90" y="480" font-family="JetBrains Mono" font-size="19" fill="${RED}" font-weight="700">DISCLAIMER</text>
  <text x="90" y="510" font-family="JetBrains Mono" font-size="18" fill="${RED}">This is satire. Do not use it, or anything like it, to justify</text>
  <text x="90" y="536" font-family="JetBrains Mono" font-size="18" fill="${RED}">action against a real person or place.</text>

  <text x="64" y="596" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${TAPE}">broaddaylight.bisks.net</text>
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
