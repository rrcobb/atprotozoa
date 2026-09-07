// Generates public/og.png — the Open Graph preview card for shelfspace.
// Draws a row of book spines with the same deterministic hash-color logic
// the live 3D scene uses (see public/util.js), so the card actually looks
// like the app rather than a generic mockup.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Adapted from
// sites/turtle-garden/og-gen.mjs.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const INK = "#f3ead4", MUTED = "#c9b696", ACCENT = "#e2a24a", BG = "#241b13";

function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}
function hashColor(str) {
  const h = hashString(str) % 360;
  return `hsl(${h}, 45%, 42%)`;
}

const TITLES = [
  "The Fifth Season", "Piranesi", "A Wizard of Earthsea", "Kindred",
  "The Left Hand of Darkness", "Small Gods", "Station Eleven",
  "The Goblin Emperor", "Jonathan Strange", "Gideon the Ninth",
  "The Hobbit", "Circe", "Annihilation", "The Dispossessed",
];

const panelX = 90, panelY = 520, shelfW = 1020, bookH = 190;
let x = panelX;
const spines = TITLES.map((t) => {
  const w = 46 + (hashString(t) % 40);
  const s = { x, w, color: hashColor(t) };
  x += w + 3;
  return s;
}).filter((s) => s.x + s.w < panelX + shelfW);

const spineRects = spines
  .map(
    (s) =>
      `<rect x="${s.x}" y="${panelY - bookH}" width="${s.w}" height="${bookH}" rx="2" fill="${s.color}" stroke="rgba(0,0,0,0.25)"/>`,
  )
  .join("\n  ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>

  <text x="66" y="130" font-family="JetBrains Mono" font-weight="800" font-size="72" fill="${INK}">shelf<tspan fill="${ACCENT}">space</tspan></text>
  <text x="68" y="192" font-family="JetBrains Mono" font-size="24" fill="${MUTED}">drop a CSV reading log, get a 3D library built from exactly those books</text>
  <text x="68" y="228" font-family="JetBrains Mono" font-size="20" fill="${MUTED}">real covers where they resolve, deterministic spines where they don't</text>

  <rect x="${panelX - 20}" y="${panelY}" width="${shelfW + 40}" height="18" rx="3" fill="#5b3f2a"/>
  ${spineRects}
  <rect x="${panelX - 20}" y="${panelY - bookH - 14}" width="${shelfW + 40}" height="14" rx="3" fill="#3a2a1c"/>

  <text x="68" y="580" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${ACCENT}">shelfspace.bisks.net</text>
</svg>`;

const fontPath = fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url));
const r_ = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
});
const png = r_.render().asPng();
const out = new URL("./public/og.png", import.meta.url).pathname;
writeFileSync(out, png);
console.log("wrote", out, `(${spines.length} spines)`);
