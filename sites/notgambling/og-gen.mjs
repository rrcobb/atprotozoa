// Generates public/og.png — the Open Graph preview card for notgambling.
//
// Hand-drawn SVG at the canonical OG size: wordmark + pitch on the left, a
// mock slot-reel card on the right (fixed placeholder symbols, not a real
// spin — the real machine is client-side in public/index.html). Rasterised
// with @resvg/resvg-js (pure native module, no system Chromium/fontconfig
// needed — the font is bundled in ./fonts and loaded explicitly).
//
//   node og-gen.mjs   # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork. Adapted from sites/guestbet/og-gen.mjs.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#0a0d0a", INK = "#eafbe6", MUTED = "#8fa385";
const GOLD = "#f4c542", GOLD_DIM = "#a8863a";
const CARD = "#131a13", BORDER = "rgba(234,251,230,0.14)";

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

const cardX = 660, cardY = 130, cardW = 480, cardH = 370;
const reelSize = 116;
const reelGap = 28;
const reelsW = reelSize * 3 + reelGap * 2;
const reelsX = cardX + (cardW - reelsW) / 2;
const reelsY = cardY + 120;
// Emoji glyphs don't rasterise through JetBrains Mono (no color-emoji table,
// and loadSystemFonts is off), so the reels use hand-drawn/text symbols
// instead — three 7s, the classic jackpot line, in ASCII the font can render.
let reelsSvg = "";
for (let i = 0; i < 3; i++) {
  const x = reelsX + i * (reelSize + reelGap);
  reelsSvg += `
    <rect x="${x}" y="${reelsY}" width="${reelSize}" height="${reelSize}" rx="12" fill="${BG}" stroke="${BORDER}" stroke-width="1.5"/>
    <text x="${x + reelSize / 2}" y="${reelsY + reelSize / 2 + 24}" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="64" fill="${GOLD}">7</text>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="12%" cy="0%" r="60%">
      <stop offset="0" stop-color="#1a2e18"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>

  <text x="64" y="228" font-family="JetBrains Mono" font-weight="800" font-size="52" fill="${MUTED}">not<tspan fill="${GOLD}">gambling</tspan></text>
  <text x="64" y="266" font-family="JetBrains Mono" font-size="20" fill="${MUTED}">a slot machine that pays out in nothing</text>

  <text x="64" y="336" font-family="JetBrains Mono" font-size="17" fill="${MUTED}">Spin the reels, flip the coin, bet chips</text>
  <text x="64" y="362" font-family="JetBrains Mono" font-size="17" fill="${MUTED}">that are worth exactly nothing. No login,</text>
  <text x="64" y="388" font-family="JetBrains Mono" font-size="17" fill="${MUTED}">no real money, no way in or out.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${GOLD}">notgambling.bisks.net</text>

  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="18" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>
  <text x="${cardX + cardW / 2}" y="${cardY + 56}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="13" letter-spacing="2" fill="${GOLD}">JACKPOT (WORTHLESS)</text>
  ${reelsSvg}
  <text x="${cardX + cardW / 2}" y="${cardY + cardH - 40}" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="20" fill="${GOLD_DIM}">500 chips, still worth nothing</text>
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
