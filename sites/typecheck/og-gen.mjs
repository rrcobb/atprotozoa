// Generates public/og.png — the Open Graph preview card for typecheck.
// Same recipe as sites/floppydash/og-gen.mjs and sites/receipts/og-gen.mjs:
// hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (no system Chromium needed). No emoji — this sandbox has no fontconfig, so
// resvg can only render glyphs from the bundled JetBrainsMono.ttf, which has
// none (see sites/annoyotron/og.png for the cautionary tofu-box example).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#070a08", FG = "#ddf5e6", DIM = "#7fa08c";
const ACCENT = "#3dffa0", ACCENT2 = "#ffb454";
const MONO = "JetBrains Mono";

// Right-hand card: a mocked-up result panel, 536px wide, sitting in the
// right half of the frame so the left column's text never runs under it.
const cardX = 600, cardY = 150, cardW = 536, cardH = 330;
const cardMidX = cardX + cardW / 2;

const bars = [
  { l: "E", r: "I", pct: 38 },
  { l: "N", r: "S", pct: 71 },
  { l: "F", r: "T", pct: 55 },
  { l: "J", r: "P", pct: 82 },
];
const barPad = 40;
const barGap = 14;
const barW = (cardW - 2 * barPad - 3 * barGap) / 4;
const barsX = cardX + barPad;
const barsY = cardY + 210;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="10%" cy="0%" r="60%">
      <stop offset="0" stop-color="#103524"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="95%" cy="100%" r="55%">
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

  <text x="64" y="120" font-family="${MONO}" font-weight="800" font-size="64" fill="url(#title)">typecheck</text>
  <text x="66" y="162" font-family="${MONO}" font-size="23" fill="${DIM}">a personality read on your whole repo</text>

  <rect x="64" y="196" width="472" height="1" fill="#1f3128"/>

  <text x="64" y="248" font-family="${MONO}" font-size="20" fill="${FG}">downloads every post you've</text>
  <text x="64" y="280" font-family="${MONO}" font-size="20" fill="${FG}">ever made, in one shot —</text>
  <text x="64" y="312" font-family="${MONO}" font-size="20" fill="${FG}">no page limit, no cursor loop</text>
  <text x="64" y="360" font-family="${MONO}" font-size="20" fill="${FG}">scores four axes off word</text>
  <text x="64" y="392" font-family="${MONO}" font-size="20" fill="${FG}">choice and posting rhythm</text>

  <text x="64" y="452" font-family="${MONO}" font-weight="700" font-size="18" fill="${ACCENT2}">not real science. four letters anyway.</text>

  <rect x="64" y="500" width="360" height="1" fill="#1f3128"/>
  <text x="64" y="548" font-family="${MONO}" font-weight="700" font-size="24" fill="${ACCENT}">typecheck.bisks.net</text>
  <text x="64" y="580" font-family="${MONO}" font-size="17" fill="${DIM}">built by @buildthis.bisks.net for @mfzx.net</text>

  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="20" fill="#0f1613" stroke="#1f3128" stroke-width="2"/>

  <text x="${cardMidX}" y="${cardY + 92}" text-anchor="middle" font-family="${MONO}" font-weight="800" font-size="58" fill="${ACCENT}" letter-spacing="16">I N F P</text>

  ${bars.map((b, i) => {
    const x = barsX + i * (barW + barGap);
    const fillW = Math.round(barW * b.pct / 100);
    return `
    <text x="${x}" y="${barsY - 12}" font-family="${MONO}" font-weight="700" font-size="13" fill="${ACCENT2}">${b.l}</text>
    <text x="${x + barW}" y="${barsY - 12}" text-anchor="end" font-family="${MONO}" font-weight="700" font-size="13" fill="${DIM}">${b.r}</text>
    <rect x="${x}" y="${barsY}" width="${barW}" height="10" rx="5" fill="#1f3128"/>
    <rect x="${x}" y="${barsY}" width="${fillW}" height="10" rx="5" fill="${ACCENT}"/>
    `;
  }).join("\n")}

  <text x="${cardMidX}" y="${cardY + cardH - 40}" text-anchor="middle" font-family="${MONO}" font-size="17" fill="${DIM}">The Softlaunch Poet</text>
</svg>`;

const fontPath = fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url));
const resvg = new Resvg(svg, {
  font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: MONO },
});
const png = resvg.render().asPng();
writeFileSync(new URL("./public/og.png", import.meta.url), png);
console.log("wrote public/og.png", png.length, "bytes");
