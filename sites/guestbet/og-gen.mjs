// Generates public/og.png — the Open Graph preview card for guestbet, so a
// shared link auto-renders a picture of the odds board in Bluesky / other
// unfurlers.
//
// Hand-drawn SVG at the canonical OG size: wordmark + pitch on the left, a
// sample odds card on the right (generic placeholder names/odds, not real
// bets — the real market is rendered live, client-side, in
// public/index.html). Rasterised with @resvg/resvg-js (pure native module,
// no system Chromium/fontconfig needed — the font is bundled in ./fonts and
// loaded explicitly).
//
//   node og-gen.mjs   # writes ./public/og.png (node_modules copied in from
//                      # sites/mootree, which already has @resvg/resvg-js)
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork. Adapted from sites/simcluster-guests/og-gen.mjs.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#0a0e14", INK = "#eef2f7", MUTED = "#8b98a8";
const ACCENT = "#4da3ff", GOLD = "#ffd166", GOOD = "#59d38c";
const CARD = "#10151d", BORDER = "rgba(238,242,247,0.14)";

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

const cardX = 660, cardY = 130, cardW = 480, cardH = 370;
const rows = [
  { name: "a guest, maybe", odds: "1.8x" },
  { name: "your favorite mutual", odds: "3.4x" },
  { name: "someone with takes", odds: "6.1x" },
];

let rowsSvg = "";
rows.forEach((r, i) => {
  const y = cardY + 88 + i * 92;
  rowsSvg += `
    <text x="${cardX + 40}" y="${y}" font-family="JetBrains Mono" font-weight="700" font-size="15" fill="${MUTED}">${i + 1}</text>
    <text x="${cardX + 68}" y="${y}" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${INK}">${esc(r.name)}</text>
    <rect x="${cardX + 40}" y="${y + 18}" width="${cardW - 80}" height="1" fill="${BORDER}"/>
    <text x="${cardX + cardW - 40}" y="${y}" text-anchor="end" font-family="JetBrains Mono" font-weight="800" font-size="22" fill="${GOOD}">${r.odds}</text>`;
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="12%" cy="0%" r="60%">
      <stop offset="0" stop-color="#12304f"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>

  <!-- simple coin/diamond stake glyph -->
  <path d="M 79 62 L 112 100 L 79 150 L 46 100 Z" fill="none" stroke="${GOLD}" stroke-width="4" stroke-linejoin="round"/>
  <line x1="46" y1="100" x2="112" y2="100" stroke="${GOLD}" stroke-width="3" opacity="0.7"/>

  <text x="64" y="228" font-family="JetBrains Mono" font-weight="800" font-size="52" fill="${INK}">guest<tspan fill="${GOLD}">bet</tspan></text>
  <text x="64" y="266" font-family="JetBrains Mono" font-size="20" fill="${MUTED}">odds on the Simcluster podcast guest vote</text>

  <text x="64" y="336" font-family="JetBrains Mono" font-size="17" fill="${MUTED}">Bet play money on who's leading the</text>
  <text x="64" y="362" font-family="JetBrains Mono" font-size="17" fill="${MUTED}">simcluster-guests board. Odds move live.</text>
  <text x="64" y="388" font-family="JetBrains Mono" font-size="17" fill="${MUTED}">No account needed.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT}">guestbet.bisks.net</text>

  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="18" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>
  <text x="${cardX + 40}" y="${cardY + 42}" font-family="JetBrains Mono" font-weight="700" font-size="13" letter-spacing="2" fill="${GOLD}">LIVE ODDS</text>
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
