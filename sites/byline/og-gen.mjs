// Generates public/og.png — the Open Graph preview card for byline.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js.
// Same recipe as sites/footfall/og-gen.mjs.
//
//   node og-gen.mjs   # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#0a0d12";
const FG = "#eef1f6", DIM = "#8b93a3";
const ACCENT = "#6ee7b7", ACCENT2 = "#7cb3ff";
const CARD = "#12161d", BORDER = "#232a35";

const bars = [
  { label: "norvid-studies.bsky.social", w: 460 },
  { label: "bisks.net", w: 380 },
  { label: "fromthewestmeadow.com", w: 320 },
  { label: "theme-box", w: 260 },
  { label: "you?", w: 140 },
];

const cardX = 64, cardY = 300, barH = 28, rowH = 52;
const barRows = bars
  .map((b, i) => {
    const y = cardY + i * rowH;
    return `
    <text x="${cardX}" y="${y}" font-family="JetBrains Mono" font-size="17" fill="${DIM}">${b.label}</text>
    <rect x="${cardX}" y="${y + 12}" width="${520}" height="${barH}" rx="6" fill="${CARD}" stroke="${BORDER}"/>
    <rect x="${cardX}" y="${y + 12}" width="${b.w}" height="${barH}" rx="6" fill="url(#bar)"/>`;
  })
  .join("\n");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="90%" cy="0%" r="60%">
      <stop offset="0" stop-color="#123024"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${ACCENT}"/>
      <stop offset="1" stop-color="${ACCENT2}"/>
    </linearGradient>
    <linearGradient id="bar" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${ACCENT}"/>
      <stop offset="1" stop-color="${ACCENT2}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>

  <text x="64" y="130" font-family="JetBrains Mono" font-weight="800" font-size="72" fill="url(#title)">byline</text>
  <text x="64" y="172" font-family="JetBrains Mono" font-size="24" fill="${DIM}">a leaderboard that's actually allowed to stay live</text>

  <text x="64" y="230" font-family="JetBrains Mono" font-size="19" fill="${FG}">ranked by sites built, not visits — regenerated every time one ships.</text>
  <text x="64" y="258" font-family="JetBrains Mono" font-size="19" fill="${DIM}">no beacon, no shared backend, nothing to freeze.</text>

  ${barRows}

  <text x="64" y="612" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${ACCENT}">byline.bisks.net</text>
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
