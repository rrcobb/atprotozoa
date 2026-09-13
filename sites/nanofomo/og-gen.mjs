// Generates public/og.png — the Open Graph preview card for nanofomo.
//
// Hand-draws a "global foom tracker" gauge holding near zero as an SVG at
// the canonical OG size, then rasterises it with @resvg/resvg-js (pure
// native module, no system Chromium needed — this box has no
// fontconfig/system fonts either, so the font is bundled in ./fonts and
// loaded explicitly).
// Copied from dial-a-mutual/og-gen.mjs (copy, don't abstract).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// No live data, no network — deterministic so the card is stable across
// builds.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const W = 1200, H = 630;
const BG = "#0b0d10";
const PANEL = "#12151a";
const FAINT = "#22262d";
const INK = "#e9edf1";
const MUTED = "#8b96a3";
const ACCENT = "#37e08a";

const meterW = 640, meterH = 34;
const fillW = meterW * 0.006; // 0.6%, matches the page's resting state

const svg = `
<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${W}" height="${H}" fill="${BG}"/>

  <text x="70" y="150" font-family="JetBrains Mono" font-weight="700" font-size="46" fill="${INK}">NaNoFoMo</text>
  <text x="70" y="196" font-family="JetBrains Mono" font-weight="400" font-size="22" fill="${MUTED}">National No Foom Month, a/k/a No Foom November</text>

  <text x="70" y="270" font-family="JetBrains Mono" font-weight="400" font-size="20" fill="${INK}">every November, thousands of people try to write</text>
  <text x="70" y="300" font-family="JetBrains Mono" font-weight="400" font-size="20" fill="${INK}">50,000 words. this November, just don't foom —</text>
  <text x="70" y="330" font-family="JetBrains Mono" font-weight="400" font-size="20" fill="${INK}">no recursive self-improvement, no intelligence</text>
  <text x="70" y="360" font-family="JetBrains Mono" font-weight="400" font-size="20" fill="${INK}">explosion. take the pledge below.</text>

  <text x="70" y="420" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${MUTED}">GLOBAL FOOM TRACKER</text>
  <rect x="70" y="440" width="${meterW}" height="${meterH}" rx="17" fill="${PANEL}" stroke="${FAINT}" stroke-width="2"/>
  <rect x="70" y="440" width="${Math.max(fillW, 6).toFixed(1)}" height="${meterH}" rx="17" fill="${ACCENT}"/>
  <text x="${70 + meterW + 24}" y="465" font-family="JetBrains Mono" font-weight="700" font-size="26" fill="${ACCENT}">0.6%</text>

  <text x="70" y="590" font-family="JetBrains Mono" font-weight="400" font-size="18" fill="${MUTED}">nanofomo.bisks.net</text>

  <text x="1130" y="590" text-anchor="end" font-family="JetBrains Mono" font-weight="400" font-size="48" fill="${INK}">🧯🚫💥</text>
</svg>`;

const resvg = new Resvg(svg, {
  font: {
    fontFiles: [join(__dirname, "fonts/JetBrainsMono.ttf")],
    loadSystemFonts: false,
    defaultFontFamily: "JetBrains Mono",
  },
  background: BG,
});
const png = resvg.render().asPng();
writeFileSync(join(__dirname, "public/og.png"), png);
console.log(`wrote public/og.png (${png.length} bytes)`);
