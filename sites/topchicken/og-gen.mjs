// Generates public/og.png — the static Open Graph preview card for the bare
// topchicken link. Hand-drawn SVG, rasterised with @resvg/resvg-js and
// skyclone's bundled JetBrains Mono font (no system Chromium/fontconfig
// needed). Same recipe as sites/wentviral/og-gen.mjs and
// sites/didscope/og-gen.mjs.
//
//   node og-gen.mjs   # writes ./public/og.png (borrows resvg + the font
//                      # from sites/skyclone — build-time only, not a
//                      # runtime dependency of this site)

import { Resvg } from "../skyclone/node_modules/@resvg/resvg-js/index.js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const fontPath = fileURLToPath(new URL("../skyclone/fonts/JetBrainsMono.ttf", import.meta.url));

const W = 1200, H = 630;
const BG = "#15100a", INK = "#f7f0e2", MUTED = "#a8967d";
const ACCENT = "#f4b400", ACCENT2 = "#e2571f", LIKE = "#ff5c6c";
const CARD = "#1f1810", BORDER = "#33271a";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function row(x, y, w, name, handle, likes, color) {
  return `
  <g>
    <rect x="${x}" y="${y}" width="${w}" height="72" rx="12" fill="${CARD}" stroke="${BORDER}"/>
    <circle cx="${x + 34}" cy="${y + 36}" r="17" fill="${color}"/>
    <text x="${x + 34}" y="${y + 42}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="14" fill="${BG}">${esc(name[0])}</text>
    <text x="${x + 62}" y="${y + 32}" font-family="JetBrains Mono" font-weight="700" font-size="15" fill="${INK}">${esc(name)}</text>
    <text x="${x + 62}" y="${y + 50}" font-family="JetBrains Mono" font-size="12" fill="${MUTED}">${esc(handle)}</text>
    <text x="${x + w - 20}" y="${y + 42}" text-anchor="end" font-family="JetBrains Mono" font-weight="700" font-size="15" fill="${LIKE}">♥ ${likes}</text>
  </g>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="50%" cy="-5%" r="60%">
      <stop offset="0" stop-color="#3a2810"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>

  <text x="60" y="118" font-family="JetBrains Mono" font-weight="800" font-size="64" fill="${ACCENT}">🐔 top chicken</text>
  <text x="64" y="164" font-family="JetBrains Mono" font-size="22" fill="${MUTED}">who in your network won yesterday</text>

  <rect x="64" y="200" width="1072" height="1" fill="${BORDER}"/>

  ${row(64, 236, 512, "Local Goblin", "@localgoblin.example", "812", ACCENT)}
  ${row(624, 236, 512, "Feral Shrimp", "@feralshrimp.example", "540", ACCENT2)}
  ${row(64, 322, 512, "Unhinged Moth", "@moth.example", "301", "#6fc3ff")}
  ${row(624, 322, 512, "You, probably", "@you.example", "204", "#7ee787")}

  <text x="64" y="470" font-family="JetBrains Mono" font-size="20" fill="${INK}">Enter a handle → we pull their followers + who they follow →</text>
  <text x="64" y="500" font-family="JetBrains Mono" font-size="20" fill="${INK}">scan every post that network made yesterday (00:00–23:59 UTC) →</text>
  <text x="64" y="530" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT}">crown whoever got the most likes.</text>

  <text x="64" y="588" font-family="JetBrains Mono" font-size="16" fill="${MUTED}">bisks.net/topchicken</text>
</svg>`;

const resvg = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
});
const png = resvg.render().asPng();
const out = fileURLToPath(new URL("./public/og.png", import.meta.url));
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");
