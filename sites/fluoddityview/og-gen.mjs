// Generates public/og.png — the Open Graph preview card for fluoddityview.
// Same recipe as sites/important-art/og-gen.mjs: hand-drawn SVG at the
// canonical OG size, rasterised with @resvg/resvg-js (no system Chromium
// needed).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#05040a", INK = "#f0ecff", DIM = "#a79fc4";
const CARD1 = "#1a1430", CARD2 = "#120e1e", BORDER = "#34294f";
const DOTS = ["#ff5c8a", "#ffd166", "#4ecdc4", "#8c7bff", "#38bdf8", "#9dffb0"];

function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}
const rand = seeded(7);

let dots = "";
for (let i = 0; i < 220; i++) {
  const x = Math.round(rand() * W);
  const y = Math.round(rand() * H);
  const c = DOTS[i % DOTS.length];
  const r = 1.4 + rand() * 2.4;
  dots += `<circle cx="${x}" cy="${y}" r="${r.toFixed(2)}" fill="${c}" opacity="${(0.3 + rand() * 0.5).toFixed(2)}"/>`;
}

const cardX = 90, cardY = 110, cardW = 1020, cardH = 410;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="card" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${CARD1}"/>
      <stop offset="0.6" stop-color="${CARD2}"/>
    </linearGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#b3a6ff"/>
      <stop offset="1" stop-color="#4ecdc4"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  ${dots}
  <rect width="${W}" height="${H}" fill="${BG}" opacity="0.3"/>

  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="10" fill="url(#card)" stroke="${BORDER}" stroke-width="2"/>

  <text x="${W / 2}" y="${cardY + 64}" text-anchor="middle" font-family="JetBrains Mono" font-size="15" letter-spacing="3" fill="${DIM}">A BLUESKY APP VIEW</text>

  <text x="${W / 2}" y="${cardY + 150}" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="52" fill="url(#title)">fluoddityview</text>

  <text x="${W / 2}" y="${cardY + 206}" text-anchor="middle" font-family="JetBrains Mono" font-size="19" fill="${INK}">every handle, post, and context line is a living</text>
  <text x="${W / 2}" y="${cardY + 234}" text-anchor="middle" font-family="JetBrains Mono" font-size="19" fill="${INK}">swarm of leashed fluoddity particles</text>

  <text x="${W / 2}" y="${cardY + 296}" text-anchor="middle" font-family="JetBrains Mono" font-style="italic" font-size="16" fill="${DIM}">real posts, pulled live from bluesky's public feed</text>

  <text x="${W / 2}" y="${cardY + cardH - 32}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="#b3a6ff">fluoddityview.bisks.net</text>
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
