// Generates public/og.png — the Open Graph preview card for Tweetdown.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium needed — this box has no
// fontconfig/system fonts either, so the font is bundled in ./fonts and
// loaded explicitly). Copied and trimmed from sites/bankbrawl/og-gen.mjs.
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

const PAPER = "#101018", INK = "#f2f0ff", MUTED = "#948fc2";
const A = "#ff5da2", B = "#4fd8ff", GOLD = "#ffe066", CARD = "#191933";

const cardX = 90, cardY = 100, cardW = 1020, cardH = 400;
const midX = cardX + cardW / 2;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${PAPER}"/>
  <defs>
    <pattern id="dots" width="16" height="16" patternUnits="userSpaceOnUse">
      <circle cx="2" cy="2" r="1.4" fill="#17172a"/>
    </pattern>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#dots)"/>

  <text x="${W / 2}" y="70" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="52" fill="${GOLD}" stroke="${A}" stroke-width="2">TWEETDOWN</text>

  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="18" fill="${CARD}" stroke="${INK}" stroke-width="4"/>

  <g transform="translate(${cardX + 210},${cardY + 170})">
    <circle r="52" fill="${A}" opacity="0.16"/>
    <text x="0" y="30" text-anchor="middle" font-size="88">\u{1F426}</text>
  </g>
  <text x="${cardX + 210}" y="${cardY + 250}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${A}">@bird_facts_guy</text>
  <text x="${cardX + 210}" y="${cardY + 282}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${INK}">3 / 6 categories</text>

  <text x="${midX}" y="${cardY + 150}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="44" fill="${GOLD}" stroke="${A}" stroke-width="2">VS</text>

  <g transform="translate(${cardX + cardW - 210},${cardY + 170})">
    <circle r="52" fill="${B}" opacity="0.16"/>
    <text x="0" y="30" text-anchor="middle" font-size="88">\u{1F99C}</text>
  </g>
  <text x="${cardX + cardW - 210}" y="${cardY + 250}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${B}">@your_ex</text>
  <text x="${cardX + cardW - 210}" y="${cardY + 282}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${INK}">2 / 6 categories</text>

  <text x="${midX}" y="${cardY + 340}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="26" fill="${INK}">two usernames, one totally made-up showdown</text>
  <text x="${midX}" y="${cardY + 374}" text-anchor="middle" font-family="JetBrains Mono" font-size="20" fill="${MUTED}">best cat joke, reply-guy stamina, and three more categories decide it</text>

  <text x="${W / 2}" y="${H - 40}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${A}">tweetdown.bisks.net</text>
</svg>`;

const fontPath = fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url));

const resvg = new Resvg(svg, {
  font: {
    fontFiles: [fontPath],
    loadSystemFonts: false,
    defaultFontFamily: "JetBrains Mono",
  },
  background: PAPER,
});
const png = resvg.render().asPng();
writeFileSync(fileURLToPath(new URL("./public/og.png", import.meta.url)), png);
console.log("wrote public/og.png");
