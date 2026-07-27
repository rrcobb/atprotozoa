// Generates public/og.png — the Open Graph preview card for sepcheck.
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
const INK = "#ecebe6", DIM = "#8b93a3", GOLD = "#d7b56d", TEAL = "#6fb7c9", GOOD = "#6fcf97";

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const views = ["phenomenal consciousness", "access consciousness", "higher-order theory", "integrated information theory"];
let viewRows = "";
views.forEach((v, i) => {
  const y = 300 + i * 46;
  const picked = i === 2;
  viewRows += `
    <rect x="640" y="${y - 30}" width="500" height="38" rx="8" fill="${picked ? "rgba(215,181,109,0.14)" : "rgba(255,255,255,0.03)"}" stroke="${picked ? GOLD : LINE}" stroke-width="1.5"/>
    <text x="660" y="${y - 5}" font-family="JetBrains Mono" font-weight="700" font-size="18" fill="${picked ? GOLD : INK}">${picked ? "[x]" : "[ ]"}  ${esc(v)}</text>
  `;
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect x="0" y="0" width="${W}" height="6" fill="${GOLD}"/>
  <rect x="0" y="${H - 6}" width="${W}" height="6" fill="${TEAL}"/>

  <text x="60" y="120" font-family="JetBrains Mono" font-weight="800" font-size="60" fill="${INK}"><tspan fill="${GOLD}">sep</tspan><tspan fill="${TEAL}">check</tspan></text>
  <text x="60" y="160" font-family="JetBrains Mono" font-size="22" fill="${DIM}">bisks.net/sepcheck</text>

  <text x="60" y="240" font-family="JetBrains Mono" font-size="26" fill="${INK}">you used "consciousness."</text>
  <text x="60" y="278" font-family="JetBrains Mono" font-size="26" fill="${INK}">which do you mean?</text>

  ${viewRows}

  <rect x="60" y="500" width="1080" height="1" fill="${LINE}"/>
  <text x="60" y="550" font-family="JetBrains Mono" font-size="22" fill="${DIM}">pick a sense, pass a 2-question quiz on the objections,</text>
  <text x="60" y="580" font-family="JetBrains Mono" font-size="22" fill="${GOOD}">then post — a demo of the SEP-gated post idea.</text>
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
