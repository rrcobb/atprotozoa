// Generates public/moscow-file/og.png — the Open Graph preview card for the
// /moscow-file/ exhibit. Same recipe as og-gen.mjs: hand-drawn SVG at the
// canonical OG size, rasterised with @resvg/resvg-js.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node moscow-file-og-gen.mjs             # writes ./public/moscow-file/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#0e0d0a", INK = "#d8cfb8", DIM = "#948a72", AMBER = "#c98a2c", RED = "#a33b2e";

// three pins on a schematic route — echoes the map on the live page.
const pins = [
  { x: 130, y: 460, label: "US" },
  { x: 340, y: 510, label: "MEXICO CITY" },
  { x: 980, y: 410, label: "MOSCOW" },
  { x: 860, y: 450, label: "MINSK" },
];

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect x="1" y="1" width="${W - 2}" height="${H - 2}" fill="none" stroke="#3a3426" stroke-width="2"/>

  <rect x="40" y="40" width="230" height="34" fill="none" stroke="${RED}" stroke-width="2"/>
  <text x="55" y="63" font-family="JetBrains Mono" font-weight="700" font-size="15" letter-spacing="2" fill="${RED}">DECLASSIFIED</text>

  <text x="40" y="150" font-family="JetBrains Mono" font-weight="800" font-size="58" fill="${INK}">the moscow file</text>
  <text x="40" y="190" font-family="JetBrains Mono" font-size="19" fill="${DIM}">Oswald's Eastern Bloc timeline, mapped</text>

  <text x="40" y="240" font-family="JetBrains Mono" font-size="16" fill="${DIM}">every documented date in the Eastern Bloc, or</text>
  <text x="40" y="266" font-family="JetBrains Mono" font-size="16" fill="${DIM}">in contact with Soviet officials — 1959 to 1963,</text>
  <text x="40" y="292" font-family="JetBrains Mono" font-size="16" fill="${DIM}">scrubbable, sourced, and mapped.</text>

  <line x1="${pins[0].x}" y1="${pins[0].y}" x2="${pins[1].x}" y2="${pins[1].y}" stroke="${AMBER}" stroke-width="1.5" stroke-dasharray="6,5" opacity="0.6"/>
  <line x1="${pins[2].x}" y1="${pins[2].y}" x2="${pins[3].x}" y2="${pins[3].y}" stroke="${AMBER}" stroke-width="1.5" stroke-dasharray="6,5" opacity="0.6"/>
  <line x1="${pins[1].x}" y1="${pins[1].y}" x2="${pins[3].x}" y2="${pins[3].y}" stroke="${DIM}" stroke-width="1.5" stroke-dasharray="3,4" opacity="0.4"/>

  ${pins.map((p, i) => `
  <circle cx="${p.x}" cy="${p.y}" r="9" fill="${i === 2 ? RED : AMBER}"/>
  <text x="${p.x}" y="${p.y - 18}" font-family="JetBrains Mono" font-size="13" fill="${INK}" text-anchor="middle">${p.label}</text>`).join("")}

  <text x="40" y="580" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${AMBER}">singlebullet.bisks.net/moscow-file</text>
</svg>`;

const fontPath = fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url));
const r = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
});
const png = r.render().asPng();
const out = new URL("./public/moscow-file/og.png", import.meta.url).pathname;
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");
