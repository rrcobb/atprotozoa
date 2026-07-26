// Generates public/breed/og.png — the Open Graph preview card for CluckBreed
// (bisks.net/cluckstonks/breed), the "spend your stock gains breeding
// vacation chickens" page. Same rendering approach as og-gen.mjs: a static
// SVG scene rasterised with @resvg/resvg-js, no browser needed.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen-breed.mjs                   # writes ./public/breed/og.png
//
// House style: self-contained, copy-don't-abstract. Adapted from ./og-gen.mjs.
// Re-run by hand if you change the artwork.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#060807", INK = "#eaf5ea", MUTED = "#7f9482", SEA = "#5ec8ff", ACCENT = "#ffd166", UP = "#29f19c";

// chicken wearing sunglasses — no emoji (bundled mono font has no color-emoji
// glyphs, resvg would render tofu boxes)
function chillChicken(cx, cy, s) {
  return `
    <g transform="translate(${cx},${cy}) scale(${s})">
      <ellipse cx="0" cy="4" rx="17" ry="13" fill="${INK}"/>
      <circle cx="15" cy="-8" r="9" fill="${INK}"/>
      <path d="M22,-9 L32,-6 L22,-3 Z" fill="${ACCENT}"/>
      <path d="M13,-16 Q15,-21 18,-16 Q16,-14 14,-14 Z" fill="#ff6b6b"/>
      <rect x="8" y="-11" width="16" height="6" rx="2.5" fill="#0c100d"/>
      <rect x="8" y="-11" width="7" height="6" rx="2.5" fill="#0c100d" stroke="${SEA}" stroke-width="0.8"/>
      <rect x="17" y="-11" width="7" height="6" rx="2.5" fill="#0c100d" stroke="${SEA}" stroke-width="0.8"/>
      <path d="M-4,16 L-8,24 M6,16 L2,24" stroke="${ACCENT}" stroke-width="2.5" stroke-linecap="round"/>
    </g>`;
}

function meter(x0, y0, w, h, pct, color) {
  return `
    <rect x="${x0}" y="${y0}" width="${w}" height="${h}" rx="${h / 2}" fill="#1c241d"/>
    <rect x="${x0}" y="${y0}" width="${(w * pct) / 100}" height="${h}" rx="${h / 2}" fill="${color}"/>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="12%" cy="0%" r="65%">
      <stop offset="0" stop-color="rgba(94,200,255,0.16)"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="100%" cy="10%" r="55%">
      <stop offset="0" stop-color="rgba(255,209,102,0.10)"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>
  <rect x="0" y="0" width="${W}" height="${H}" fill="none" stroke="#1c241d" stroke-width="2"/>

  ${chillChicken(98, 100, 1.35)}
  <text x="150" y="118" font-family="JetBrains Mono" font-weight="800" font-size="46" fill="${INK}">CluckBreed</text>
  <text x="150" y="150" font-family="JetBrains Mono" font-size="20" fill="${MUTED}">Vacation Genetics Division</text>

  <text x="80" y="240" font-family="JetBrains Mono" font-weight="800" font-size="52" fill="${INK}">Spend your gains.</text>
  <text x="80" y="298" font-family="JetBrains Mono" font-weight="800" font-size="52" fill="${SEA}">Breed the chill.</text>

  <text x="80" y="350" font-family="JetBrains Mono" font-size="22" fill="${MUTED}">genes decide fitness at one job: Mediterranean vacationing</text>

  <text x="80" y="418" font-family="JetBrains Mono" font-size="21" fill="${MUTED}">Chill</text>
  ${meter(80, 430, 460, 14, 86, UP)}
  <text x="80" y="472" font-family="JetBrains Mono" font-size="21" fill="${MUTED}">Ferry Legs</text>
  ${meter(80, 484, 460, 14, 54, SEA)}
  <text x="80" y="526" font-family="JetBrains Mono" font-size="21" fill="${MUTED}">Tapas Appetite</text>
  ${meter(80, 538, 460, 14, 70, ACCENT)}

  <text x="820" y="440" font-family="JetBrains Mono" font-weight="700" font-size="30" fill="${ACCENT}">612 / 700 fitness</text>
  <text x="820" y="480" font-family="JetBrains Mono" font-size="22" fill="${MUTED}">gen 3 · Silkie-Sebright</text>

  <text x="80" y="600" font-family="JetBrains Mono" font-weight="700" font-size="26" fill="${SEA}">bisks.net/cluckstonks/breed</text>
</svg>`;

const fontPath = fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url));
const r = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
});
const png = r.render().asPng();
mkdirSync(new URL("./public/breed", import.meta.url), { recursive: true });
const out = new URL("./public/breed/og.png", import.meta.url).pathname;
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");
