// Generates public/og.png — the Open Graph preview card for rotcast, so a
// shared link auto-renders a picture of the show instead of a bare title.
// Hand-drawn SVG at the canonical OG size, matching the live page's toxic
// green/orange "rot" look, rasterised with @resvg/resvg-js (pure native
// module, no system Chromium needed — this box has no fontconfig/system
// fonts either, so the font is bundled in ./fonts and loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// A generic cover (no real episode data — that's generated live, per
// episode, client-side in public/index.html's buildShareCard).
//
// House style: self-contained, copy-don't-abstract, copied from
// sites/didscope/og-gen.mjs. Re-run this by hand if you change the artwork.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#0b0f08", FG = "#eafbdc", DIM = "#9db98a";
const ACCENT = "#b6ff3c", ACCENT2 = "#ff6b3c", CARD = "#151f0f", BORDER = "#2c3d21";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const cardX = 60, cardY = 350, cardW = W - 120, cardH = H - 410;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="15%" cy="-10%" r="60%">
      <stop offset="0" stop-color="#234312"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="90%" cy="5%" r="55%">
      <stop offset="0" stop-color="#3a1c08"/>
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

  <text x="60" y="110" font-family="JetBrains Mono" font-weight="800" font-size="66" fill="url(#title)">SHUT UP NERD</text>
  <text x="60" y="150" font-family="JetBrains Mono" font-size="20" fill="${DIM}">a rotcast episode generator</text>

  <text x="60" y="230" font-family="JetBrains Mono" font-size="19" fill="${DIM}">alias &amp; Dr. From The West Meadow co-host.</text>
  <text x="60" y="258" font-family="JetBrains Mono" font-size="19" fill="${DIM}">a surprise guest gets kidnapped live off</text>
  <text x="60" y="286" font-family="JetBrains Mono" font-size="19" fill="${DIM}">the firehose, every single episode.</text>

  <circle cx="100" cy="${cardY - 60}" r="34" fill="${CARD}" stroke="${BORDER}" stroke-width="2"/>
  <circle cx="180" cy="${cardY - 60}" r="34" fill="${CARD}" stroke="${BORDER}" stroke-width="2"/>
  <circle cx="260" cy="${cardY - 60}" r="34" fill="${CARD}" stroke="${ACCENT2}" stroke-width="2" stroke-dasharray="4,4"/>
  <text x="260" y="${cardY - 55}" text-anchor="middle" font-family="JetBrains Mono" font-size="26" fill="${ACCENT2}">?</text>

  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="16" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>
  <text x="${cardX + 32}" y="${cardY + 40}" font-family="JetBrains Mono" font-weight="700" font-size="14" fill="${ACCENT2}">SURPRISE GUEST SAID</text>
  <text x="${cardX + 32}" y="${cardY + 78}" font-family="JetBrains Mono" font-style="italic" font-size="22" fill="${FG}">"generate an episode to find out."</text>

  <text x="60" y="${H - 40}" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT}">rotcast.bisks.net</text>
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
