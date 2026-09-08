// Generates public/og.png — the Open Graph preview card for snubbed, so a
// shared link auto-renders a picture of the result in Bluesky / other
// unfurlers. Hand-drawn SVG at the canonical OG size, rasterised with
// @resvg/resvg-js (pure native module, no system Chromium needed — this box
// has no fontconfig/system fonts either, so the font is bundled in ./fonts
// and loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// A generic sample count (not tied to any real posts) — this is the static
// fallback card for the bare link. Per-pair share cards are generated live,
// client-side, in public/index.html (buildShareCard); per-pair share links
// get their own personalized og:title/og:description via src/index.ts.
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork. Adapted from sites/favoritism/og-gen.mjs.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#0a0910", FG = "#f3eefc", DIM = "#9a90b0";
const ACCENT = "#ff4d8d", ACCENT2 = "#ffb84c", CARD = "#14111d", BORDER = "#2a2438";

const snubCount = 7;

const cardX = 470, cardY = 60, cardW = 668, cardH = 510;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="12%" cy="-10%" r="60%">
      <stop offset="0" stop-color="#2a0d3a"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="92%" cy="0%" r="55%">
      <stop offset="0" stop-color="#0d1f3a"/>
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

  <text x="64" y="140" font-family="JetBrains Mono" font-weight="800" font-size="58" fill="url(#title)">snubbed</text>
  <text x="64" y="188" font-family="JetBrains Mono" font-size="20" fill="${DIM}">who liked the reply but not you?</text>

  <text x="64" y="270" font-family="JetBrains Mono" font-size="17" fill="${DIM}">Two Bluesky post links in. Every</text>
  <text x="64" y="296" font-family="JetBrains Mono" font-size="17" fill="${DIM}">liker of both, pulled in full, no</text>
  <text x="64" y="322" font-family="JetBrains Mono" font-size="17" fill="${DIM}">page cap — who liked the second</text>
  <text x="64" y="348" font-family="JetBrains Mono" font-size="17" fill="${DIM}">post but skipped the first.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT}">snubbed.bisks.net</text>

  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="18" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>

  <text x="${cardX + cardW / 2}" y="${cardY + 220}" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="170" fill="${ACCENT}">${snubCount}</text>
  <text x="${cardX + cardW / 2}" y="${cardY + 270}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${FG}">PEOPLE SNUBBED YOU</text>

  <circle cx="${cardX + cardW * 0.28}" cy="${cardY + 380}" r="30" fill="${BG}" stroke="${ACCENT}" stroke-width="2.5"/>
  <circle cx="${cardX + cardW * 0.40}" cy="${cardY + 380}" r="30" fill="${BG}" stroke="${ACCENT}" stroke-width="2.5"/>
  <circle cx="${cardX + cardW * 0.52}" cy="${cardY + 380}" r="30" fill="${BG}" stroke="${ACCENT}" stroke-width="2.5"/>
  <text x="${cardX + cardW * 0.28}" y="${cardY + 389}" text-anchor="middle" font-family="JetBrains Mono" font-size="22" fill="${DIM}">?</text>
  <text x="${cardX + cardW * 0.40}" y="${cardY + 389}" text-anchor="middle" font-family="JetBrains Mono" font-size="22" fill="${DIM}">?</text>
  <text x="${cardX + cardW * 0.52}" y="${cardY + 389}" text-anchor="middle" font-family="JetBrains Mono" font-size="22" fill="${DIM}">?</text>
  <text x="${cardX + cardW * 0.66}" y="${cardY + 389}" text-anchor="middle" font-family="JetBrains Mono" font-size="22" fill="${DIM}">+ more</text>

  <text x="${cardX + cardW / 2}" y="${cardY + 460}" text-anchor="middle" font-family="JetBrains Mono" font-style="italic" font-size="19" fill="${FG}">liked their reply, skipped your post</text>
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
