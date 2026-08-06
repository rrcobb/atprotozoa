// Generates public/og.png — the Open Graph preview card for duohaunt.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium / fontconfig needed — the font is
// bundled in ./fonts and loaded explicitly). Same recipe as
// sites/hyperobject/og-gen.mjs / sites/didscope/og-gen.mjs.
//
//   node og-gen.mjs   # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run by hand if the
// artwork changes.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#0a0e0a", DIM = "#8a9a86";
const GREEN = "#58cc02", GREEN2 = "#7fe33a";
const CARD = "#161d15", BORDER = "#2a3627";
const GHOST = "#b39ddb";

const cardX = 470, cardY = 60, cardW = 668, cardH = 510;
const cx = cardX + cardW / 2;

// five climbing bars — the shame-tier ladder — getting taller and more
// ghost-colored toward the top, "escalates whether you show up or not."
const bars = [];
{
  const n = 5, gap = 26, barW = 64;
  const totalW = n * barW + (n - 1) * gap;
  const startX = cx - totalW / 2;
  const baseY = cardY + cardH - 70;
  for (let i = 0; i < n; i++) {
    const h = 40 + i * 34;
    const x = startX + i * (barW + gap);
    const y = baseY - h;
    const t = i / (n - 1);
    const r = Math.round(88 + (179 - 88) * t);
    const g = Math.round(204 + (157 - 204) * t);
    const b = Math.round(2 + (219 - 2) * t);
    bars.push(`<rect x="${x}" y="${y}" width="${barW}" height="${h}" rx="8" fill="rgb(${r},${g},${b})" opacity="${0.55 + t * 0.4}"/>`);
  }
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="15%" cy="-10%" r="60%">
      <stop offset="0" stop-color="#132a08"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="90%" cy="0%" r="55%">
      <stop offset="0" stop-color="#241a33"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${GREEN}"/>
      <stop offset="1" stop-color="${GREEN2}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <text x="64" y="130" font-family="JetBrains Mono" font-weight="800" font-size="56" fill="url(#title)">duohaunt</text>
  <text x="64" y="176" font-family="JetBrains Mono" font-size="19" fill="${DIM}">the irreversible anki bot that</text>
  <text x="64" y="202" font-family="JetBrains Mono" font-size="19" fill="${DIM}">follows you around.</text>

  <text x="64" y="270" font-family="JetBrains Mono" font-size="16" fill="${DIM}">Build a deck. Review it, or don't —</text>
  <text x="64" y="296" font-family="JetBrains Mono" font-size="16" fill="${DIM}">your shame tier climbs a public wall</text>
  <text x="64" y="322" font-family="JetBrains Mono" font-size="16" fill="${DIM}">on its own timer either way.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${GREEN}">duohaunt.bisks.net</text>

  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="18" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>

  <path d="M ${cx - 44} ${cardY + 110}
           L ${cx - 44} ${cardY + 58}
           A 44 44 0 0 1 ${cx + 44} ${cardY + 58}
           L ${cx + 44} ${cardY + 110}
           L ${cx + 27} ${cardY + 96}
           L ${cx + 9} ${cardY + 110}
           L ${cx - 9} ${cardY + 96}
           L ${cx - 27} ${cardY + 110}
           Z" fill="${BG}" stroke="${GHOST}" stroke-width="3" stroke-linejoin="round"/>
  <circle cx="${cx - 16}" cy="${cardY + 76}" r="4.5" fill="${GHOST}"/>
  <circle cx="${cx + 16}" cy="${cardY + 76}" r="4.5" fill="${GHOST}"/>
  <text x="${cx}" y="${cardY + 168}" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="19" fill="${GHOST}">CLEAR &#8594; HAUNTED &#8594; RESTLESS &#8594; LOST</text>
  <text x="${cx}" y="${cardY + 194}" text-anchor="middle" font-family="JetBrains Mono" font-size="13" letter-spacing="1.5" fill="${DIM}">THE SHAME TIER, CLIMBING</text>

  ${bars.join("\n  ")}
  <text x="${cx}" y="${cardY + cardH - 34}" text-anchor="middle" font-family="JetBrains Mono" font-size="14" fill="${DIM}">no delete button.</text>
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
