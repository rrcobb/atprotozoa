// Generates public/og.png — the Open Graph preview card for postcid. Hand-
// drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js (pure
// native module, no system Chromium/fontconfig needed — font is bundled in
// ./fonts and loaded explicitly). Copied from didscope/og-gen.mjs.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#0d0d10", FG = "#f1f0ec", DIM = "#8a8890";
const ACCENT = "#4d8dff", ACCENT2 = "#4dd6c0", CARD = "#1b1a1f", BORDER = "#3a3940";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="10%" cy="0%" r="55%">
      <stop offset="0" stop-color="#132242"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="95%" cy="100%" r="55%">
      <stop offset="0" stop-color="#0f2e28"/>
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

  <text x="64" y="140" font-family="JetBrains Mono" font-weight="800" font-size="68" fill="url(#title)">postcid</text>
  <text x="64" y="188" font-family="JetBrains Mono" font-size="22" fill="${DIM}">a full-featured Bluesky post <tspan fill="${ACCENT2}">composer</tspan></text>
  <text x="64" y="216" font-family="JetBrains Mono" font-size="22" fill="${DIM}">that shows the record CID as you type.</text>

  <text x="64" y="290" font-family="JetBrains Mono" font-size="17" fill="${DIM}">langs, hashtags, mentions, link cards,</text>
  <text x="64" y="316" font-family="JetBrains Mono" font-size="17" fill="${DIM}">quote posts, images — dag-cbor + sha2-256,</text>
  <text x="64" y="342" font-family="JetBrains Mono" font-size="17" fill="${DIM}">computed live, no login, nothing posted.</text>

  <rect x="62" y="404" width="720" height="86" rx="10" fill="${CARD}" stroke="${BORDER}" stroke-width="2"/>
  <text x="86" y="436" font-family="JetBrains Mono" font-size="14" fill="${DIM}">app.bsky.feed.post →</text>
  <text x="86" y="466" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT2}">bafyreiepdeookek7je3j45ocuvu2rjolq6t5macgnyzixoq</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT2}">postcid.bisks.net</text>
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
