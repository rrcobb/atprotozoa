// Generates public/og.png — tacocounter's default Open Graph preview card.
// Hand-drawn SVG (warm taqueria palette, no external assets), rasterised
// with @resvg/resvg-js. Same recipe as sites/shelfguessr/og-gen.mjs.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const PAPER = "#fdf1dd", PAPER_DARK = "#f5e0b8", SALSA = "#c1442d", SALSA_DARK = "#8f2f1d";
const AVOCADO = "#4c7a3a", GOLD = "#e8a33d", INK = "#3a2418", CARD = "#fffaf0";

// A simple taco: a folded shell (arc) with filling peeking out the top.
function taco(cx, cy, scale, rot) {
  const s = scale;
  return `
    <g transform="translate(${cx} ${cy}) rotate(${rot}) scale(${s})">
      <path d="M -90 20 A 90 90 0 0 1 90 20 L 90 34 A 90 78 0 0 1 -90 34 Z" fill="#e8c15c" stroke="${SALSA_DARK}" stroke-width="4"/>
      <path d="M -78 12 Q -40 -34 0 -30 Q 40 -34 78 12 L 66 22 Q 40 -12 0 -10 Q -40 -12 -66 22 Z" fill="${AVOCADO}"/>
      <path d="M -58 8 Q -20 -14 0 -12 Q 20 -14 58 8 L 50 18 Q 20 0 0 0 Q -20 0 -50 18 Z" fill="#e05a3d"/>
      <circle cx="-30" cy="4" r="5" fill="#fff6d9"/>
      <circle cx="10" cy="0" r="5" fill="#fff6d9"/>
      <circle cx="40" cy="6" r="5" fill="#fff6d9"/>
    </g>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${PAPER}"/>
      <stop offset="1" stop-color="${PAPER_DARK}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#bg)"/>

  <rect x="660" y="150" width="460" height="380" rx="14" fill="${SALSA}" opacity="0.06"/>
  ${taco(870, 260, 1.35, -8)}
  ${taco(960, 400, 1.1, 14)}
  ${taco(770, 420, 0.9, -18)}

  <text x="80" y="220" font-family="JetBrains Mono" font-weight="800" font-size="80" fill="${SALSA_DARK}">taco</text>
  <text x="80" y="298" font-family="JetBrains Mono" font-weight="800" font-size="80" fill="${GOLD}">counter</text>
  <text x="84" y="348" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${INK}">count every taco you eat.</text>
  <text x="84" y="382" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${INK}">race your friends on a private board.</text>

  <rect x="80" y="430" width="500" height="140" rx="16" fill="${CARD}" stroke="${SALSA}" stroke-width="3" stroke-dasharray="2,6"/>
  <text x="106" y="472" font-family="JetBrains Mono" font-size="20" fill="${INK}">sign in with Bluesky</text>
  <text x="106" y="504" font-family="JetBrains Mono" font-size="20" fill="${INK}">log tacos to your own PDS</text>
  <text x="106" y="536" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${SALSA}">create or join a leaderboard</text>

  <text x="84" y="600" font-family="JetBrains Mono" font-weight="800" font-size="24" fill="${SALSA_DARK}">tacocounter.bisks.net</text>
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
