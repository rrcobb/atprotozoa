// Generates public/og.png — the static Open Graph preview card for
// commonweal, so a shared link unfurls as a real picture instead of a bare
// URL. Hand-drawn SVG at the canonical OG size, rasterised with
// @resvg/resvg-js (pure native module, no system Chromium/fontconfig needed
// — font is bundled in ./fonts and loaded explicitly, same pattern as
// sites/didscope). This is the generic fallback card for the bare link;
// per-round share cards are generated live, client-side, in
// public/app.js (drawShareCard).
//
//   node og-gen.mjs   # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run by hand if the
// artwork changes.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#0e1410", FG = "#eef3ea", DIM = "#9fb3a4";
const GOLD = "#d9b35c", GOOD = "#3f9e6d", CARD = "#16211a", BORDER = "#2c3d30";

const cardX = 660, cardY = 70, cardW = 470, cardH = 490;
const seats = ["alice.bsky.social", "bob.bsky.social", "carol.bsky.social", "dev.bsky.social", "Concord · AI"];
const facilitator = "carol.bsky.social";

let y = cardY + 56;
const rowH = 62;
const rowsSvg = seats
  .map((name, i) => {
    const isFac = name === facilitator;
    const ry = cardY + 56 + i * rowH;
    return `
    <rect x="${cardX + 30}" y="${ry - 30}" width="${cardW - 60}" height="44" rx="7"
      fill="${isFac ? GOOD : "#0d1410"}" fill-opacity="${isFac ? 0.22 : 1}"
      stroke="${isFac ? GOLD : BORDER}" stroke-width="1.5"/>
    <text x="${cardX + 48}" y="${ry - 3}" font-family="JetBrains Mono" font-size="18" fill="${isFac ? GOLD : FG}">${name}</text>
    ${isFac ? `<text x="${cardX + cardW - 48}" y="${ry - 3}" text-anchor="end" font-family="JetBrains Mono" font-weight="700" font-size="13" fill="${GOLD}">FACILITATOR</text>` : ""}
  `;
  })
  .join("\n");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="15%" cy="-10%" r="60%">
      <stop offset="0" stop-color="#1c3324"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="90%" cy="0%" r="55%">
      <stop offset="0" stop-color="#2a2712"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <text x="64" y="130" font-family="JetBrains Mono" font-weight="800" font-size="58" fill="${GOLD}">commonweal</text>
  <text x="64" y="180" font-family="JetBrains Mono" font-size="21" fill="${DIM}">governance that scales from</text>
  <text x="64" y="208" font-family="JetBrains Mono" font-size="21" fill="${FG}">3 people to 200</text>

  <text x="64" y="280" font-family="JetBrains Mono" font-size="17" fill="${DIM}">Sortition draws a fresh council</text>
  <text x="64" y="306" font-family="JetBrains Mono" font-size="17" fill="${DIM}">every round. A doge-style lot-and-</text>
  <text x="64" y="332" font-family="JetBrains Mono" font-size="17" fill="${DIM}">ballot draw picks who facilitates.</text>
  <text x="64" y="358" font-family="JetBrains Mono" font-size="17" fill="${DIM}">An AI delegate always has a seat —</text>
  <text x="64" y="384" font-family="JetBrains Mono" font-size="17" fill="${DIM}">heuristic, not a model call.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${GOOD}">commonweal.bisks.net</text>

  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="16" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>
  <text x="${cardX + 30}" y="${cardY + 34}" font-family="JetBrains Mono" font-weight="700" font-size="15" letter-spacing="2" fill="${DIM}">SORTITION COUNCIL</text>
  ${rowsSvg}
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
