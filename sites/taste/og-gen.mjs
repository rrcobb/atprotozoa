// Generates public/og.png — the Open Graph preview card for taste.bisks.net.
// A gold certificate card matching the live site's look, showing the
// leaderboard's #1 handle and score so the unfurl is a real snapshot, not a
// generic logo card. Rasterised with @resvg/resvg-js (pure native module).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # reads public/data.json, writes public/og.png

import { Resvg } from "@resvg/resvg-js";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#100e0a";
const GLOW = "#2a220f";
const INK = "#f2ead9";
const MUTED = "#b3a48a";
const GOLD = "#d4af37";
const GOLD_BRIGHT = "#f0cd5c";

const data = JSON.parse(readFileSync(new URL("./public/data.json", import.meta.url)));
const top = data.board[0];

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="20%" cy="0%" r="60%">
      <stop offset="0%" stop-color="${GLOW}"/>
      <stop offset="100%" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect x="34" y="34" width="${W - 68}" height="${H - 68}" fill="none" stroke="${GOLD}" stroke-width="4"/>
  <rect x="46" y="46" width="${W - 92}" height="${H - 92}" fill="none" stroke="${GOLD}" stroke-width="1"/>

  <text x="${W / 2}" y="115" text-anchor="middle" font-family="JetBrains Mono" font-size="24" letter-spacing="3" fill="${MUTED}">BISKS.NET &#183; PROVENANCE OFFICE</text>

  <text x="${W / 2}" y="200" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="70" fill="${INK}">taste</text>
  <text x="${W / 2}" y="250" text-anchor="middle" font-family="JetBrains Mono" font-size="26" fill="${MUTED}">a real Taste Score for every bisks.net requester</text>

  <text x="${W / 2}" y="340" text-anchor="middle" font-family="JetBrains Mono" font-size="22" fill="${MUTED}">currently leading:</text>
  <text x="${W / 2}" y="405" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="48" fill="${GOLD_BRIGHT}">@${esc(top ? top.handle : "?")}</text>
  <text x="${W / 2}" y="450" text-anchor="middle" font-family="JetBrains Mono" font-size="24" fill="${INK}">Taste Score ${top ? top.tasteScore : 0} &#183; ${top ? top.ownBuilds.length : 0} own &#183; ${top ? top.borrowedBy.length : 0} used by others</text>

  <text x="${W / 2}" y="560" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="26" fill="${GOLD}">taste.bisks.net</text>
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
