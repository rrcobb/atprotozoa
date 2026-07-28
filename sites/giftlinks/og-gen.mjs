// Generates public/og.png — the Open Graph preview card for giftlinks.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium/fontconfig needed — font bundled
// in ./fonts and loaded explicitly). Re-run by hand if the artwork changes.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#0d0f14", PANEL = "#171a22", LINE = "#2a2f3a";
const INK = "#ecebe6", DIM = "#8b93a3", GOLD = "#d7b56d", TEAL = "#6fb7c9";

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const cards = [
  { source: "THE NEW YORK TIMES", title: "Why everyone is suddenly talking about ...", color: GOLD },
  { source: "THE WASHINGTON POST", title: "The inside story of how it actually happened", color: TEAL },
  { source: "THE WALL STREET JOURNAL", title: "What the data really shows about ...", color: "#c98fd7" },
];

let cardRows = "";
cards.forEach((c, i) => {
  const y = 250 + i * 108;
  cardRows += `
    <rect x="60" y="${y}" width="1080" height="90" rx="12" fill="${PANEL}" stroke="${LINE}" stroke-width="1.5"/>
    <rect x="60" y="${y}" width="6" height="90" rx="3" fill="${c.color}"/>
    <text x="92" y="${y + 34}" font-family="JetBrains Mono" font-weight="700" font-size="16" letter-spacing="1" fill="${c.color}">${esc(c.source)}</text>
    <text x="92" y="${y + 64}" font-family="JetBrains Mono" font-size="22" fill="${INK}">${esc(c.title)}</text>
  `;
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect x="0" y="0" width="${W}" height="6" fill="${GOLD}"/>
  <rect x="0" y="${H - 6}" width="${W}" height="6" fill="${TEAL}"/>

  <text x="60" y="110" font-family="JetBrains Mono" font-weight="800" font-size="56" fill="${INK}"><tspan fill="${GOLD}">gift</tspan><tspan fill="${TEAL}">links</tspan></text>
  <text x="60" y="148" font-family="JetBrains Mono" font-size="22" fill="${DIM}">bisks.net/giftlinks — free reads, spotted on atproto</text>

  ${cardRows}

  <rect x="60" y="600" width="1080" height="1" fill="${LINE}"/>
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
