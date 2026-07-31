// Generates public/og.png — the Open Graph preview card for derivatives, so
// a shared link auto-renders a picture of the odds board in Bluesky / other
// unfurlers.
//
// Hand-drawn SVG at the canonical OG size: wordmark + pitch on the left, a
// sample odds card on the right (generic placeholder sites/odds, not real
// bets — the real market is rendered live, client-side, in
// public/index.html). Rasterised with @resvg/resvg-js (pure native module,
// no system Chromium/fontconfig needed — the font is bundled in ./fonts and
// loaded explicitly).
//
//   node og-gen.mjs   # writes ./public/og.png (node_modules copied in from
//                      # sites/guestbet, which already has @resvg/resvg-js)
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork. Adapted from sites/guestbet/og-gen.mjs.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#0a0e14", INK = "#eef2f7", MUTED = "#8b98a8";
const ACCENT = "#4da3ff", GOLD = "#ffd166", GOOD = "#59d38c", BAD = "#ff6b6b";
const CARD = "#10151d", BORDER = "rgba(238,242,247,0.14)";

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

const cardX = 640, cardY = 120, cardW = 500, cardH = 390;
const rows = [
  { name: "some site, maybe", pct: "62%" },
  { name: "your favorite toy", pct: "34%" },
  { name: "a game nobody plays", pct: "8%" },
];

let rowsSvg = "";
rows.forEach((r, i) => {
  const y = cardY + 92 + i * 96;
  rowsSvg += `
    <text x="${cardX + 40}" y="${y}" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${INK}">${esc(r.name)}</text>
    <rect x="${cardX + 40}" y="${y + 18}" width="${cardW - 80}" height="1" fill="${BORDER}"/>
    <text x="${cardX + cardW - 40}" y="${y}" text-anchor="end" font-family="JetBrains Mono" font-weight="800" font-size="24" fill="${GOOD}">${r.pct}</text>`;
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

  <!-- simple forking-arrow glyph, standing in for "spinoff" -->
  <path d="M 60 100 L 100 100 L 100 70 L 130 110 L 100 150 L 100 120 L 60 120 Z" fill="none" stroke="${GOLD}" stroke-width="4" stroke-linejoin="round"/>

  <text x="64" y="228" font-family="JetBrains Mono" font-weight="800" font-size="52" fill="${INK}">deriv<tspan fill="${GOLD}">atives</tspan></text>
  <text x="64" y="266" font-family="JetBrains Mono" font-size="20" fill="${MUTED}">a market on which bisks site gets a market next</text>

  <text x="64" y="336" font-family="JetBrains Mono" font-size="17" fill="${MUTED}">Bet play money on whether a given site</text>
  <text x="64" y="362" font-family="JetBrains Mono" font-size="17" fill="${MUTED}">gets its own guestbet-style spinoff.</text>
  <text x="64" y="388" font-family="JetBrains Mono" font-size="17" fill="${MUTED}">Odds move live. No account needed.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT}">derivatives.bisks.net</text>

  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="18" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>
  <text x="${cardX + 40}" y="${cardY + 42}" font-family="JetBrains Mono" font-weight="700" font-size="13" letter-spacing="2" fill="${GOLD}">CHANCE OF "YES"</text>
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
