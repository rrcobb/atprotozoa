// Generates public/og.png — the Open Graph preview card for logitlens, so a
// shared link auto-renders a picture of a skewed next-token distribution.
// Hand-drawn SVG at the canonical OG size, matching the live page's look,
// rasterised with @resvg/resvg-js (pure native module, no system Chromium
// needed — this box has no fontconfig/system fonts either, so the font is
// bundled in ./fonts and loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// A static sample distribution (not a live model run) — the live page always
// computes the real thing client-side. See sites/cursekind/og-gen.mjs, this
// is the same recipe.
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#070a10", FG = "#e9f3f5", DIM = "#7d93a0", DIM2 = "#526270";
const ACCENT = "#5eead4", ACCENT2 = "#2dd4bf", BAR = "#133029", BORDER = "#1c2733";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// A sample distribution — deliberately skewed, the way a model mid-way
// through repeating text verbatim actually looks.
const BARS = [
  { tok: "·dog", pct: 91.2 },
  { tok: ".", pct: 3.8 },
  { tok: "·pack", pct: 1.1 },
  { tok: "·cat", pct: 0.6 },
  { tok: "·fence", pct: 0.4 },
  { tok: "·yard", pct: 0.3 },
];

const cardX = 470, cardY = 90, cardW = 668, cardH = 450;
const barX = cardX + 40, barTop = cardY + 92, barW = cardW - 80, rowH = 52, barH = 26;

const barsSvg = BARS.map((b, i) => {
  const y = barTop + i * rowH;
  const w = Math.max(6, (b.pct / 100) * barW);
  return `
  <rect x="${barX}" y="${y}" width="${barW}" height="${barH}" rx="6" fill="#0b1219" stroke="${BORDER}"/>
  <rect x="${barX}" y="${y}" width="${w}" height="${barH}" rx="6" fill="url(#barGrad)"/>
  <text x="${barX + 12}" y="${y + barH / 2 + 6}" font-family="JetBrains Mono" font-size="17" fill="${FG}">${esc(b.tok)}</text>
  <text x="${barX + barW - 12}" y="${y + barH / 2 + 6}" text-anchor="end" font-family="JetBrains Mono" font-weight="700" font-size="15" fill="${i === 0 ? ACCENT : DIM}">${b.pct}%</text>`;
}).join("\n");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="10%" cy="-10%" r="55%">
      <stop offset="0" stop-color="#0d2b28"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="95%" cy="5%" r="50%">
      <stop offset="0" stop-color="#1a2038"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="barGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${BAR}"/>
      <stop offset="1" stop-color="${ACCENT2}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <!-- left: wordmark + pitch -->
  <text x="64" y="140" font-family="JetBrains Mono" font-weight="800" font-size="58" fill="${FG}">logit<tspan fill="${ACCENT}">lens</tspan></text>
  <text x="64" y="188" font-family="JetBrains Mono" font-size="21" fill="${DIM}">what's the very next</text>
  <text x="64" y="216" font-family="JetBrains Mono" font-size="21" fill="${DIM}">token, <tspan fill="${ACCENT}">really</tspan>?</text>

  <text x="64" y="290" font-family="JetBrains Mono" font-size="17" fill="${DIM}">Type a prompt, pick a small model,</text>
  <text x="64" y="316" font-family="JetBrains Mono" font-size="17" fill="${DIM}">and see its real next-token logit</text>
  <text x="64" y="342" font-family="JetBrains Mono" font-size="17" fill="${DIM}">distribution — live, in your browser,</text>
  <text x="64" y="368" font-family="JetBrains Mono" font-size="17" fill="${DIM}">via transformers.js.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT}">logitlens.bisks.net</text>

  <!-- right: sample distribution card -->
  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="18" fill="#0e141c" stroke="${BORDER}" stroke-width="1.5"/>
  <text x="${cardX + cardW / 2}" y="${cardY + 46}" text-anchor="middle" font-family="JetBrains Mono" font-size="14" fill="${DIM2}">"...jumps over the lazy" →</text>
  ${barsSvg}
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
