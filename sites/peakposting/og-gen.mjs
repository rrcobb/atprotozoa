// Generates public/og.png — the Open Graph preview card for peakposting.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium / fontconfig needed — the font is
// bundled in ./fonts and loaded explicitly). Same recipe as
// sites/didscope/og-gen.mjs.
//
//   node og-gen.mjs   # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run by hand if the
// artwork changes.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#0c0a06", FG = "#fbf3e2", DIM = "#b7a985";
const ACCENT = "#f5b942", ACCENT2 = "#ff7a45";
const CARD = "#1c1509", BORDER = "#3d2f13";
const LIKES = "#ff6b8a", REPOSTS = "#57e0a6", REPLIES = "#6fb2ff";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const rows = [
  { label: "MOST LIKED", value: "3,481", color: LIKES },
  { label: "MOST REPOSTED", value: "912", color: REPOSTS },
  { label: "MOST REPLIED", value: "607", color: REPLIES },
];

const cardX = 470, cardY = 60, cardW = 668, cardH = 510;
let y = cardY + 70;
const rowH = 148;

const rowsSvg = rows
  .map((r, i) => {
    const ry = y + i * rowH;
    return `
    <text x="${cardX + 48}" y="${ry}" font-family="JetBrains Mono" font-weight="800" font-size="17" letter-spacing="2" fill="${r.color}">${r.label}</text>
    <text x="${cardX + 48}" y="${ry + 58}" font-family="JetBrains Mono" font-weight="800" font-size="52" fill="${FG}">${r.value}</text>
    <line x1="${cardX + 48}" y1="${ry + 88}" x2="${cardX + cardW - 48}" y2="${ry + 88}" stroke="${BORDER}" stroke-width="1" stroke-dasharray="3,4"/>`;
  })
  .join("\n");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="15%" cy="-10%" r="60%">
      <stop offset="0" stop-color="#4a2f06"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="90%" cy="0%" r="55%">
      <stop offset="0" stop-color="#2a1a3a"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${ACCENT}"/>
      <stop offset="1" stop-color="${ACCENT2}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <text x="64" y="140" font-family="JetBrains Mono" font-weight="800" font-size="60" fill="url(#title)">peakposting</text>
  <text x="64" y="188" font-family="JetBrains Mono" font-size="21" fill="${DIM}">find any account's <tspan fill="${ACCENT2}">biggest post</tspan></text>
  <text x="64" y="216" font-family="JetBrains Mono" font-size="21" fill="${DIM}">ever, and put it on the board.</text>

  <text x="64" y="290" font-family="JetBrains Mono" font-size="17" fill="${DIM}">We page through the whole account,</text>
  <text x="64" y="316" font-family="JetBrains Mono" font-size="17" fill="${DIM}">find the top post by likes, reposts,</text>
  <text x="64" y="342" font-family="JetBrains Mono" font-size="17" fill="${DIM}">and replies, then verify and bank</text>
  <text x="64" y="368" font-family="JetBrains Mono" font-size="17" fill="${DIM}">your bests on a shared leaderboard.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT2}">peakposting.bisks.net</text>

  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="18" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>
  <text x="${cardX + 48}" y="${cardY + 44}" font-family="JetBrains Mono" font-weight="800" font-size="16" letter-spacing="2" fill="${DIM}">@example.bsky.social</text>
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
