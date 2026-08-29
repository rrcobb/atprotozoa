// Generates public/og.png — the Open Graph preview card for nounlab.
//
// Rasterised with @resvg/resvg-js (pure native module, no system
// Chromium/fontconfig needed — the font is bundled in ./fonts).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// Adapted from sites/robotword/og-gen.mjs.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#f4f1ea", INK = "#1f2318", MUTED = "#6b6a5c", ACCENT = "#3a6b4f", HL = "#f4c95d", HL_INK = "#4a3a08";

const switches = [
  "countability", "number", "definiteness", "case", "animacy",
  "properness", "concreteness", "genericity", "collectivity",
];
const ROW1 = switches.slice(0, 5);
const ROW2 = switches.slice(5);

function switchRow(labels, y) {
  return labels.map((label, i) => {
    const x = 70 + i * 190;
    return `<g>
      <rect x="${x}" y="${y}" width="150" height="26" rx="13" fill="#dbe9df" stroke="#ddd7c4"/>
      <circle cx="${x + 90}" cy="${y + 13}" r="10" fill="${ACCENT}"/>
      <text x="${x}" y="${y + 46}" font-family="JetBrains Mono" font-size="13" fill="${MUTED}">${label}</text>
    </g>`;
  }).join("\n  ");
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect x="0" y="0" width="10" height="${H}" fill="${ACCENT}"/>

  <text x="70" y="100" font-family="JetBrains Mono" font-weight="700" font-size="16" letter-spacing="3" fill="${ACCENT}">A LITTLE LINGUISTICS PAGE</text>
  <text x="70" y="180" font-family="JetBrains Mono" font-weight="800" font-size="76" fill="${INK}">nounlab</text>

  <text x="70" y="228" font-family="JetBrains Mono" font-size="18" fill="${MUTED}">pick a noun, flip a switch, watch the sentence change</text>

  ${switchRow(ROW1, 268)}
  ${switchRow(ROW2, 328)}

  <rect x="70" y="430" width="720" height="80" rx="8" fill="#fffdf8" stroke="#ddd7c4"/>
  <text x="94" y="465" font-family="JetBrains Mono" font-size="24" fill="${INK}">we must build <tspan fill="${HL_INK}" font-weight="700">more website</tspan>.</text>
  <text x="94" y="492" font-family="JetBrains Mono" font-size="14" fill="${MUTED}">countability, toggled to "mass"</text>

  <text x="70" y="565" font-family="JetBrains Mono" font-weight="700" font-size="18" fill="${ACCENT}">nounlab.bisks.net</text>
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
