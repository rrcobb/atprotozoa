// Generates public/og.png — the Open Graph preview card for capitalingo.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200,
  H = 630;

const BG = "#faf7f0",
  INK = "#241b12",
  DIM = "#7a6f5d",
  ACCENT = "#1f7a4d",
  RED = "#b3261e",
  BORDER = "#e5dcc7",
  GOLD = "#c9a227";

// The same cartoon portraits app.js draws inline, scaled up for the card.
function portrait(cx, cy, r, teacher) {
  const s = r / 50; // path data is authored on a 100x100 grid
  const t = `translate(${cx - 50 * s}, ${cy - 50 * s}) scale(${s})`;
  const body =
    teacher === "marx"
      ? `<circle cx="50" cy="52" r="27" fill="#e8c19c"/>
         <path d="M19,44 Q16,9 50,9 Q84,9 81,44 Q80,29 50,27 Q20,29 19,44 Z" fill="#232323"/>
         <path d="M15,50 Q11,92 50,97 Q89,92 85,50 Q80,74 50,76 Q20,74 15,50 Z" fill="#3a3a3a"/>
         <path d="M28,56 Q50,70 72,56 Q66,64 50,65 Q34,64 28,56 Z" fill="#4a4a4a"/>
         <path d="M4,100 Q50,76 96,100 Z" fill="#171717"/>
         <path d="M45,88 L55,88 L59,100 L41,100 Z" fill="${RED}"/>
         <path d="M33,40 Q40,35 47,40" stroke="#111" stroke-width="1.8" fill="none" stroke-linecap="round"/>
         <path d="M53,40 Q60,35 67,40" stroke="#111" stroke-width="1.8" fill="none" stroke-linecap="round"/>
         <circle cx="40" cy="47" r="2.1" fill="#111"/>
         <circle cx="60" cy="47" r="2.1" fill="#111"/>`
      : `<circle cx="50" cy="54" r="27" fill="#f0c8a0"/>
         <path d="M18,52 Q13,14 50,12 Q87,14 82,52 Q84,34 68,28 Q74,44 63,40 Q66,53 54,46 Q57,16 50,16 Q43,16 46,46 Q34,53 37,40 Q26,44 32,28 Q16,34 18,52 Z" fill="#f5f0e6" stroke="#d8cfb8" stroke-width="1"/>
         <circle cx="16" cy="58" r="9" fill="#f5f0e6" stroke="#d8cfb8" stroke-width="1"/>
         <circle cx="84" cy="58" r="9" fill="#f5f0e6" stroke="#d8cfb8" stroke-width="1"/>
         <path d="M6,100 Q50,74 94,100 Z" fill="${ACCENT}"/>
         <path d="M40,82 L60,82 L53,99 L47,99 Z" fill="#fdfaf2"/>
         <path d="M35,44 Q41,40 47,44" stroke="${INK}" stroke-width="1.8" fill="none" stroke-linecap="round"/>
         <path d="M53,44 Q59,40 65,44" stroke="${INK}" stroke-width="1.8" fill="none" stroke-linecap="round"/>
         <circle cx="41" cy="51" r="2.1" fill="${INK}"/>
         <circle cx="59" cy="51" r="2.1" fill="${INK}"/>
         <path d="M42,66 Q50,71 58,66" stroke="${INK}" stroke-width="2" fill="none" stroke-linecap="round"/>`;
  return (
    `<circle cx="${cx}" cy="${cy}" r="${r + 6}" fill="#f1ead9" stroke="${BORDER}" stroke-width="3"/>` +
    `<g transform="${t}">${body}</g>`
  );
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="split" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#e6f2ea"/>
      <stop offset="0.48" stop-color="${BG}"/>
      <stop offset="0.52" stop-color="${BG}"/>
      <stop offset="1" stop-color="#fbe7e5"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#split)"/>
  <rect x="24" y="24" width="${W - 48}" height="${H - 48}" fill="none" stroke="${INK}" stroke-width="3" opacity="0.15"/>

  <text x="70" y="118" font-family="JetBrains Mono" font-weight="800" font-size="58" fill="${INK}">capitalingo</text>
  <text x="70" y="158" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${DIM}">duolingo for economics</text>

  <g font-family="JetBrains Mono" font-weight="700" font-size="21">
    <text x="70" y="210" fill="${ACCENT}">Adam Smith teaches the basics.</text>
    <text x="70" y="238" fill="${RED}">Halfway through, Karl Marx takes over.</text>
  </g>

  ${portrait(340, 380, 90, "smith")}
  ${portrait(600, 380, 90, "marx")}
  <text x="470" y="388" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="30" fill="${DIM}">→</text>

  <rect x="750" y="290" width="${W - 750 - 70}" height="180" rx="14" fill="#ffffff" stroke="${BORDER}" stroke-width="2"/>
  <text x="778" y="326" font-family="JetBrains Mono" font-size="16" fill="${DIM}" letter-spacing="1">WHICH CONCEPT IS THIS?</text>
  <g font-family="JetBrains Mono" font-weight="700" font-size="18" fill="${INK}">
    <text x="778" y="362">“He is led by an invisible hand</text>
    <text x="778" y="386">to promote an end which was</text>
    <text x="778" y="410">no part of his intention.”</text>
  </g>
  <text x="778" y="444" font-family="JetBrains Mono" font-size="14" fill="${DIM}">— Wealth of Nations, Bk. IV, Ch. 2 (1776)</text>

  <g font-family="JetBrains Mono" font-weight="700" font-size="22">
    <text x="70" y="520" fill="${ACCENT}">❤️ ❤️ ❤️</text>
    <text x="230" y="520" fill="${DIM}">3 hearts</text>
    <text x="400" y="520" fill="#ff9500">🔥 9</text>
    <text x="510" y="520" fill="${DIM}">day streak</text>
    <text x="650" y="520" fill="${GOLD}">✦ 480 IP</text>
  </g>

  <text x="70" y="575" font-family="JetBrains Mono" font-weight="700" font-size="26" fill="${INK}">capitalingo.bisks.net</text>
</svg>`;

const fontPaths = [fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url))];

const r = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: fontPaths, loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
});
const png = r.render().asPng();
const out = new URL("./public/og.png", import.meta.url).pathname;
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");
