// Generates public/og.png — the Open Graph preview card for listrank.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium needed — this box has no
// fontconfig/system fonts either, so the font is bundled in ./fonts and
// loaded explicitly). Copied and adapted from sites/listcheck/og-gen.mjs
// (copy, don't abstract).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// A generic card, not tied to any real handle or a real ranking — the
// interesting output is per-handle and the site never generates a per-result
// share card (a plain compose-intent link covers "share this" instead), so
// this static image is the only og:image the site ever serves.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#0d1613", FG = "#eaf7ee", DIM = "#8fb59d";
const ACCENT = "#5adf9c", ACCENT2 = "#9df0c4", BAD = "#ff8a6b";
const CARD = "#182a20", BORDER = "#25392c", PANEL2 = "#1f342a";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="15%" cy="-10%" r="60%">
      <stop offset="0" stop-color="#1e4630"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${ACCENT}"/>
      <stop offset="1" stop-color="${ACCENT2}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>

  <text x="64" y="150" font-family="JetBrains Mono" font-weight="800" font-size="60" fill="url(#title)">listrank</text>
  <text x="64" y="196" font-family="JetBrains Mono" font-size="21" fill="${DIM}">every blocklist your blocks are</text>
  <text x="64" y="224" font-family="JetBrains Mono" font-size="21" fill="${DIM}">on, ranked by most-blocks vs.</text>
  <text x="64" y="252" font-family="JetBrains Mono" font-size="21" fill="${DIM}">fewest-follows caught in it.</text>

  <text x="64" y="330" font-family="JetBrains Mono" font-size="17" fill="${DIM}">Plus each list's share of default</text>
  <text x="64" y="356" font-family="JetBrains Mono" font-size="17" fill="${DIM}">.bsky.social handles.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT}">listrank.bisks.net</text>

  <rect x="640" y="90" width="500" height="450" rx="18" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>

  <rect x="680" y="130" width="420" height="82" rx="12" fill="${PANEL2}" stroke="${BORDER}" stroke-width="1.5"/>
  <text x="700" y="168" font-family="JetBrains Mono" font-weight="800" font-size="20" fill="${FG}">1  "some blocklist"</text>
  <text x="700" y="195" font-family="JetBrains Mono" font-size="15" fill="${BAD}">🚫 61% of your blocks · 👀 2 follows</text>

  <rect x="680" y="226" width="420" height="82" rx="12" fill="${PANEL2}" stroke="${BORDER}" stroke-width="1.5"/>
  <text x="700" y="264" font-family="JetBrains Mono" font-weight="800" font-size="20" fill="${FG}">2  "another list"</text>
  <text x="700" y="291" font-family="JetBrains Mono" font-size="15" fill="${DIM}">🚫 34% of your blocks · 👀 9 follows</text>

  <rect x="680" y="322" width="420" height="82" rx="12" fill="${PANEL2}" stroke="${BORDER}" stroke-width="1.5"/>
  <text x="700" y="360" font-family="JetBrains Mono" font-weight="800" font-size="20" fill="${FG}">3  "a third list"</text>
  <text x="700" y="387" font-family="JetBrains Mono" font-size="15" fill="${DIM}">🚫 22% of your blocks · 👀 14 follows</text>

  <text x="700" y="446" font-family="JetBrains Mono" font-size="16" fill="${DIM}">~71% .bsky.social · ~48% .bsky.social</text>
  <text x="700" y="470" font-family="JetBrains Mono" font-size="16" fill="${DIM}">~30% .bsky.social</text>
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
