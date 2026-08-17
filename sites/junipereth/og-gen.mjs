// Generates public/og.png — the Open Graph preview card for junipereth, so a
// shared link renders as a real card in Bluesky / other unfurlers. There's
// only one subject on this whole site (Juniper), so unlike didscope's
// per-handle share this is one static card, hand-drawn as SVG and rasterised
// with @resvg/resvg-js (pure native module, no system Chromium needed — this
// box has no fontconfig/system fonts either, so the font is bundled in
// ./fonts and loaded explicitly).
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

const BG = "#050a08", FG = "#eafff0", DIM = "#7fa08e";
const ACCENT = "#39ff88", ACCENT2 = "#ffd166", CARD = "#0c1712", BORDER = "#1e3a2c";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const cardX = 60, cardY = 210, cardW = W - 120, cardH = H - 270;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="15%" cy="-10%" r="60%">
      <stop offset="0" stop-color="#0f2e1c"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="90%" cy="5%" r="55%">
      <stop offset="0" stop-color="#2a2410"/>
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

  <text x="64" y="100" font-family="JetBrains Mono" font-weight="800" font-size="60" fill="url(#title)">junipereth</text>
  <text x="64" y="140" font-family="JetBrains Mono" font-size="19" fill="${DIM}">a fake ETH wallet with exactly one</text>
  <text x="64" y="166" font-family="JetBrains Mono" font-size="19" fill="${DIM}">accountholder</text>

  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="18" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>

  <text x="${W / 2}" y="${cardY + 58}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="15" letter-spacing="2" fill="${DIM}">HOW TO MINT</text>
  <text x="${W / 2}" y="${cardY + 108}" text-anchor="middle" font-family="JetBrains Mono" font-style="italic" font-weight="700" font-size="30" fill="${ACCENT}">"IP is fake but my ETH is real"</text>
  <text x="${W / 2}" y="${cardY + 146}" text-anchor="middle" font-family="JetBrains Mono" font-size="18" fill="${DIM}">quote-repost it &#8212; +2.000000 jETH each time</text>

  <line x1="${cardX + 48}" y1="${cardY + 186}" x2="${cardX + cardW - 48}" y2="${cardY + 186}" stroke="${BORDER}" stroke-width="1" stroke-dasharray="3,4"/>

  <text x="${W / 2}" y="${cardY + 222}" text-anchor="middle" font-family="JetBrains Mono" font-size="17" fill="${FG}">only <tspan fill="${ACCENT2}" font-weight="700">@juniperbevensee.bsky.social</tspan> mints.</text>
  <text x="${W / 2}" y="${cardY + 250}" text-anchor="middle" font-family="JetBrains Mono" font-size="17" fill="${FG}">nobody else's account is ever scanned.</text>

  <text x="64" y="${H - 40}" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT}">junipereth.bisks.net</text>
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
