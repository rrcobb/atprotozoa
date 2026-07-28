// Generates public/og.png — the static Open Graph preview card for
// /fieldguide. Hand-drawn SVG, rasterised with @resvg/resvg-js and
// skyclone's bundled JetBrains Mono font (no system Chromium/fontconfig
// needed). Same recipe as sites/wentviral/og-gen.mjs and sites/didscope/og-gen.mjs.
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

function entry(x, y, w, name, tag) {
  return `
  <g>
    <rect x="${x}" y="${y}" width="${w}" height="70" fill="none" stroke="${FAINT}" stroke-width="2"/>
    <text x="${x + 24}" y="${y + 32}" font-family="JetBrains Mono" font-weight="700" font-size="19" fill="${INK}">${esc(name)}</text>
    <text x="${x + 24}" y="${y + 54}" font-family="JetBrains Mono" font-size="14" fill="${MUTED}">${esc(tag)}</text>
  </g>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>

  <text x="64" y="112" font-family="JetBrains Mono" font-weight="800" font-size="60" fill="${INK}">field guide</text>
  <text x="64" y="156" font-family="JetBrains Mono" font-size="22" fill="${MUTED}">a little tour of what's growing around atproto</text>

  <line x1="64" y1="196" x2="${W - 64}" y2="196" stroke="${INK}" stroke-width="2"/>

  ${entry(64, 224, 512, "Leaflet", "publishing, leaflet.pub")}
  ${entry(624, 224, 512, "Tangled", "code forge, tangled.org")}
  ${entry(64, 306, 512, "lexidraw", "drawing, lexidraw.app")}
  ${entry(624, 306, 512, "Smoke Signal", "events, smokesignal.events")}
  ${entry(64, 388, 512, "Frontpage", "links, frontpage.fyi")}
  ${entry(624, 388, 512, "PDSls", "record browser, pdsls.dev")}

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT}">bisks.net/fieldguide</text>
  <text x="64" y="588" font-family="JetBrains Mono" font-size="15" fill="${MUTED}">clients, publishing tools, dev infra — beyond bluesky itself</text>
</svg>`;

const resvg = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
});
const png = resvg.render().asPng();
const out = fileURLToPath(new URL("./public/og.png", import.meta.url));
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");
