// Generates public/og.png — the static Open Graph preview card for
// /rolodex. Hand-drawn SVG, rasterised with @resvg/resvg-js and skyclone's
// bundled JetBrains Mono font (no system Chromium/fontconfig needed). Same
// recipe as sites/fieldguide/og-gen.mjs and sites/wentviral/og-gen.mjs.
//
//   node og-gen.mjs   # writes ./public/og.png (borrows resvg + the font
//                      # from sites/skyclone — build-time only, not a
//                      # runtime dependency of this site)

import { Resvg } from "../skyclone/node_modules/@resvg/resvg-js/index.js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const fontPath = fileURLToPath(new URL("../skyclone/fonts/JetBrainsMono.ttf", import.meta.url));

const W = 1200, H = 630;
const BG = "#ffffff", INK = "#111111", MUTED = "#6b6b6b", FAINT = "#e4e4e4", ACCENT = "#1a5fd0";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function card(x, y, w, name, tag) {
  return `
  <g>
    <rect x="${x}" y="${y}" width="${w}" height="70" fill="none" stroke="${FAINT}" stroke-width="2"/>
    <text x="${x + 24}" y="${y + 32}" font-family="JetBrains Mono" font-weight="700" font-size="19" fill="${INK}">${esc(name)}</text>
    <text x="${x + 24}" y="${y + 54}" font-family="JetBrains Mono" font-size="14" fill="${MUTED}">${esc(tag)}</text>
  </g>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>

  <text x="64" y="112" font-family="JetBrains Mono" font-weight="800" font-size="60" fill="${INK}">rolodex</text>
  <text x="64" y="156" font-family="JetBrains Mono" font-size="22" fill="${MUTED}">type a handle, get a profile — an index of the sites that do that</text>

  <line x1="64" y1="196" x2="${W - 64}" y2="196" stroke="${INK}" stroke-width="2"/>

  ${card(64, 224, 512, "portfolio", "posts by topic, portfolio.bisks.net")}
  ${card(624, 224, 512, "bisksipedia", "wiki entry, wiki.bisks.net")}
  ${card(64, 306, 512, "favstar", "greatest hits, favstar.bisks.net")}
  ${card(624, 306, 512, "immortals", "monument card, immortals.bisks.net")}
  ${card(64, 388, 512, "mechpilot", "trading card, mechpilot.bisks.net")}
  ${card(624, 388, 512, "didscope", "DID horoscope, didscope.bisks.net")}

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT}">bisks.net/rolodex</text>
  <text x="64" y="588" font-family="JetBrains Mono" font-size="15" fill="${MUTED}">a curated card index of buildthis's profile viewers and portfolios</text>
</svg>`;

const resvg = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
});
const png = resvg.render().asPng();
const out = fileURLToPath(new URL("./public/og.png", import.meta.url));
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");
