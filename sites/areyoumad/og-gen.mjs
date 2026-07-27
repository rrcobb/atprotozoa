// Generates public/og.png — the Open Graph preview card for areyoumad, so a
// shared link auto-renders a picture of the thing in Bluesky / other
// unfurlers.
//
// Hand-draws a representative "screenshot": the wordmark, a blurb, and a
// mock flagged-moot card (avatar circle, crossed-out heart, an "ask if
// they're mad" button) as an SVG at the canonical OG size, then rasterises it
// with @resvg/resvg-js (pure native module, no system Chromium needed — this
// box has no fontconfig/system fonts either, so the font is bundled in
// ./fonts and loaded explicitly). Copied from dial-a-mutual/og-gen.mjs
// (copy, don't abstract).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#fbf9f7", INK = "#16130f", MUTED = "#726b60", ACCENT = "#b5471f";
const CARD = "#ffffff", FAINT = "#e9e2d8", AVATAR = "#d8a583";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ── mock flagged-moot card, right side ─────────────────────────────────────
const cardX = 660, cardY = 210, cardW = 470, cardH = 190;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>

  <!-- wordmark -->
  <text x="64" y="110" font-family="JetBrains Mono" font-weight="700"
    font-size="52" fill="${INK}">areyoumad</text>
  <text x="64" y="150" font-family="JetBrains Mono" font-size="20"
    fill="${MUTED}">who ghosted your courtesy-like today</text>

  <!-- blurb, left -->
  <text x="64" y="240" font-family="JetBrains Mono" font-size="18" fill="${INK}">Finds every reply you</text>
  <text x="64" y="272" font-family="JetBrains Mono" font-size="18" fill="${INK}">posted today, checks who</text>
  <text x="64" y="304" font-family="JetBrains Mono" font-size="18" fill="${INK}">didn't like you back, and</text>
  <text x="64" y="336" font-family="JetBrains Mono" font-size="18" fill="${INK}">hands you a button to ask</text>
  <text x="64" y="368" font-family="JetBrains Mono" font-size="18" fill="${INK}">if they're mad at you.</text>

  <text x="64" y="440" font-family="JetBrains Mono" font-size="16" fill="${ACCENT}" font-weight="700">petty, automated, atproto-native.</text>

  <!-- the flagged-moot card -->
  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="14"
    fill="${CARD}" stroke="${FAINT}" stroke-width="2"/>

  <circle cx="${cardX + 46}" cy="${cardY + 46}" r="26" fill="${AVATAR}"/>
  <text x="${cardX + 46}" y="${cardY + 54}" text-anchor="middle" font-family="JetBrains Mono"
    font-weight="700" font-size="20" fill="rgba(255,255,255,.92)">MO</text>

  <text x="${cardX + 88}" y="${cardY + 40}" font-family="JetBrains Mono" font-weight="700"
    font-size="19" fill="${INK}">a moot</text>
  <text x="${cardX + 88}" y="${cardY + 62}" font-family="JetBrains Mono" font-size="15"
    fill="${MUTED}">@amoot.bsky.social</text>

  <text x="${cardX + 24}" y="${cardY + 100}" font-family="JetBrains Mono" font-size="14"
    fill="${MUTED}">no courtesy-like on your reply today.</text>

  <!-- crossed-out heart -->
  <g transform="translate(${cardX + 380} ${cardY + 50})">
    <path d="M0,10 C-14,-4 -30,4 -30,18 C-30,32 -10,44 0,52 C10,44 30,32 30,18 C30,4 14,-4 0,10 Z"
      fill="none" stroke="${MUTED}" stroke-width="3" opacity="0.55"/>
    <line x1="-30" y1="-6" x2="30" y2="58" stroke="${ACCENT}" stroke-width="4" stroke-linecap="round"/>
  </g>

  <rect x="${cardX + 24}" y="${cardY + 128}" width="200" height="38" rx="8" fill="${INK}"/>
  <text x="${cardX + 124}" y="${cardY + 152}" text-anchor="middle" font-family="JetBrains Mono"
    font-weight="700" font-size="14" fill="${BG}">ask if they're mad</text>

  <!-- footer strip -->
  <text x="64" y="600" font-family="JetBrains Mono" font-size="16"
    fill="${MUTED}">type a handle · get today's silent moots</text>
  <text x="${W - 64}" y="600" text-anchor="end" font-family="JetBrains Mono"
    font-size="16" fill="${ACCENT}">bisks.net/areyoumad</text>
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
