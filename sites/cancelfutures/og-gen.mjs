// Generates public/og.png — the Open Graph preview card for cancelfutures.
//
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium/fontconfig needed). Adapted from
// sites/guestbet/og-gen.mjs.
//
//   node og-gen.mjs   # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#0a0e14", INK = "#eef2f7", MUTED = "#8b98a8";
const ACCENT = "#4da3ff", GOLD = "#ffd166", GOOD = "#59d38c";
const CARD = "#10151d", BORDER = "rgba(238,242,247,0.14)";

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

const cardX = 640, cardY = 118, cardW = 500, cardH = 394;
const rows = [
  { name: "a tradwife influencer who found bluesky", offense: "starts a 40-reply subtweet chain about wordle", odds: "2.10x" },
  { name: "a crypto bro who “discovered” atproto", offense: "goes feral over pineapple pizza discourse", odds: "3.80x" },
  { name: "your mutual who unfollows and refollows", offense: "issues a 12-part apology thread", odds: "6.40x" },
];

let rowsSvg = "";
rows.forEach((r, i) => {
  const y = cardY + 78 + i * 118;
  rowsSvg += `
    <text x="${cardX + 36}" y="${y}" font-family="JetBrains Mono" font-weight="700" font-size="18" fill="${INK}">${esc(r.name)}</text>
    <text x="${cardX + 36}" y="${y + 26}" font-family="JetBrains Mono" font-size="15" fill="${MUTED}">${esc(r.offense)}</text>
    <rect x="${cardX + 36}" y="${y + 46}" width="${cardW - 72}" height="1" fill="${BORDER}"/>
    <text x="${cardX + cardW - 36}" y="${y}" text-anchor="end" font-family="JetBrains Mono" font-weight="800" font-size="22" fill="${GOOD}">${r.odds}</text>`;
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="12%" cy="0%" r="60%">
      <stop offset="0" stop-color="#2f1830"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>

  <path d="M 79 62 L 112 100 L 79 150 L 46 100 Z" fill="none" stroke="${GOLD}" stroke-width="4" stroke-linejoin="round"/>
  <line x1="46" y1="100" x2="112" y2="100" stroke="${GOLD}" stroke-width="3" opacity="0.7"/>

  <text x="64" y="228" font-family="JetBrains Mono" font-weight="800" font-size="48" fill="${INK}">cancel<tspan fill="${GOLD}">futures</tspan></text>
  <text x="64" y="266" font-family="JetBrains Mono" font-size="20" fill="${MUTED}">odds on the next fake discourse cycle</text>

  <text x="64" y="336" font-family="JetBrains Mono" font-size="17" fill="${MUTED}">Generated archetypes, not real people.</text>
  <text x="64" y="362" font-family="JetBrains Mono" font-size="17" fill="${MUTED}">Bet play money. Odds move on their own.</text>
  <text x="64" y="388" font-family="JetBrains Mono" font-size="17" fill="${MUTED}">No account needed. No real money, ever.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT}">cancelfutures.bisks.net</text>

  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="18" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>
  <text x="${cardX + 36}" y="${cardY + 40}" font-family="JetBrains Mono" font-weight="700" font-size="13" letter-spacing="2" fill="${GOLD}">LIVE ODDS (SIMULATED)</text>
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
