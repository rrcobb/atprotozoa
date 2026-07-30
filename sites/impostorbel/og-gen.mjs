// Generates public/og.png — the static Open Graph preview card for the bare
// impostorbel link (per-article shares get personalized title/description
// text via src/index.ts, but reuse this same image). Hand-drawn SVG,
// rasterised with @resvg/resvg-js. Same recipe as sites/skyclone/og-gen.mjs.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#faf9f2", FG = "#202122", DIM = "#54595d", LINK = "#0645ad", ACCENT = "#36c";
const BORDER = "#a2a9b1", CARD = "#f8f9fa";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const F = "JetBrains Mono";
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect x="0" y="0" width="${W}" height="86" fill="${CARD}" stroke="${BORDER}" stroke-width="2"/>
  <text x="56" y="58" font-family="${F}" font-weight="700" font-size="36" fill="${FG}">Impostorbel</text>
  <text x="392" y="58" font-family="${F}" font-size="18" fill="${DIM}">the free simplified encyclopedia</text>

  <line x1="56" y1="130" x2="${W - 56}" y2="130" stroke="${BORDER}" stroke-width="1.5"/>
  <text x="56" y="116" font-family="${F}" font-size="16" fill="${DIM}">A Simple English guide to @abeliansoup.bsky.social's 100 most-liked posts</text>

  <rect x="56" y="160" width="${W - 112}" height="150" rx="10" fill="${CARD}" stroke="${BORDER}"/>
  <text x="84" y="205" font-family="${F}" font-weight="700" font-size="22" fill="${FG}">"silence 2dcel, a higher dimensionoid is speaking"</text>
  <text x="84" y="240" font-family="${F}" font-size="18" fill="${FG}">This post tells a flat, two-dimensional person to be quiet. The</text>
  <text x="84" y="268" font-family="${F}" font-size="18" fill="${FG}">writer says they have more dimensions than normal.</text>
  <text x="84" y="296" font-family="${F}" font-size="15" fill="${DIM}">Many people found this funny.   134 likes</text>

  <text x="56" y="360" font-family="${F}" font-size="16" fill="${DIM}">This page uses simple words and lots of emoji to help everyone understand.</text>
  <text x="56" y="392" font-family="${F}" font-size="16" fill="${DIM}">Read all 100 rewritten posts, ranked by likes.</text>

  <text x="56" y="${H - 60}" font-family="${F}" font-weight="700" font-size="24" fill="${LINK}">bisks.net/impostorbel</text>
  <text x="56" y="${H - 28}" font-family="${F}" font-size="15" fill="${DIM}">built by @buildthis.bisks.net, asked for by @norvid-studies.bsky.social</text>
</svg>`;

const fontPath = fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url));
const r = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: F },
});
const png = r.render().asPng();
const out = new URL("./public/og.png", import.meta.url).pathname;
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");
