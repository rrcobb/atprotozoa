// Generates public/og.png — the Open Graph preview card for enshittify.
// A clean left half (the recipe as it starts) crumbling into a cluttered,
// crooked right half (the recipe as it ends up), split by a crack. Hand-drawn
// SVG at the canonical OG size, rasterised with @resvg/resvg-js (pure native
// module, no system Chromium needed — this box has no fontconfig/system
// fonts either, so the font is bundled in ./fonts and loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork. Adapted from sites/didscope/og-gen.mjs.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const SPLIT = 560;

const PAPER = "#fbf8f1", INK = "#1c1b17", MUTED = "#6b6558", ACCENT = "#8a5a2b";

function banner(x, y, w, h, rot, c1, c2, label) {
  return `<g transform="rotate(${rot} ${x + w / 2} ${y + h / 2})">
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="url(#g-${c1}${c2})"/>
    <text x="${x + w / 2}" y="${y + h / 2 + 5}" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="15" fill="#fff">${label}</text>
  </g>`;
}

const grads = [
  ["ff6a3d", "ffb703"],
  ["0072ff", "00c6ff"],
  ["8e2de2", "b24592"],
  ["ff0844", "ffb199"],
  ["11998e", "38ef7d"],
];

const gradDefs = grads
  .map(
    ([a, b]) =>
      `<linearGradient id="g-${a}${b}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#${a}"/><stop offset="1" stop-color="#${b}"/></linearGradient>`
  )
  .join("\n    ");

const banners = [
  banner(SPLIT + 40, 70, 210, 46, -6, "ff6a3d", "ffb703", "40% OFF NOW"),
  banner(SPLIT + 260, 130, 180, 44, 8, "0072ff", "00c6ff", "SUBSCRIBE!!"),
  banner(SPLIT + 30, 190, 190, 44, 5, "8e2de2", "b24592", "YOU WON $$$"),
  banner(SPLIT + 250, 260, 200, 44, -9, "ff0844", "ffb199", "CLICK HERE"),
  banner(SPLIT + 60, 320, 170, 44, 7, "11998e", "38ef7d", "3 VIRUSES!"),
  banner(SPLIT + 280, 380, 190, 44, -5, "ff6a3d", "ffb703", "WOW AMAZING"),
  banner(SPLIT + 40, 440, 210, 44, 9, "0072ff", "00c6ff", "1,000,000TH VISITOR"),
  banner(SPLIT + 270, 500, 180, 44, -7, "8e2de2", "b24592", "SIGN UP FREE"),
];

const chaosDots = Array.from({ length: 26 }, (_, i) => {
  const x = SPLIT + 30 + ((i * 137) % (W - SPLIT - 60));
  const y = 40 + ((i * 211) % (H - 80));
  const r = 4 + (i % 5);
  const c = grads[i % grads.length][0];
  return `<circle cx="${x}" cy="${y}" r="${r}" fill="#${c}" opacity="0.55"/>`;
}).join("\n    ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    ${gradDefs}
    <linearGradient id="crack" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1c1b17"/>
      <stop offset="1" stop-color="#1c1b17"/>
    </linearGradient>
  </defs>

  <!-- left: the clean page -->
  <rect width="${W}" height="${H}" fill="${PAPER}"/>
  <!-- right: the hellscape backdrop -->
  <rect x="${SPLIT}" width="${W - SPLIT}" height="${H}" fill="#12100c"/>
  ${chaosDots}
  ${banners}

  <!-- jagged crack down the middle -->
  <polygon points="${SPLIT - 10},0 ${SPLIT + 14},0 ${SPLIT - 6},70 ${SPLIT + 22},140 ${SPLIT - 14},210 ${SPLIT + 10},290 ${SPLIT - 20},360 ${SPLIT + 6},430 ${SPLIT - 8},500 ${SPLIT + 16},570 ${SPLIT - 4},${H} ${SPLIT - 28},${H}"
    fill="${PAPER}" opacity="0.9"/>

  <!-- left copy -->
  <text x="64" y="150" font-family="JetBrains Mono" font-weight="800" font-size="46" fill="${INK}">Grandma Cheryl's</text>
  <text x="64" y="200" font-family="JetBrains Mono" font-weight="800" font-size="46" fill="${ACCENT}">Banana Bread</text>
  <text x="64" y="244" font-family="JetBrains Mono" font-size="18" fill="${MUTED}">a simple, well-typeset recipe</text>

  <rect x="64" y="290" width="420" height="180" rx="10" fill="#e7c98f"/>
  <rect x="64" y="290" width="420" height="180" rx="10" fill="none" stroke="${INK}" stroke-opacity="0.15"/>

  <text x="64" y="520" font-family="JetBrains Mono" font-size="18" fill="${MUTED}">it does not stay that way. scroll and see.</text>
  <text x="64" y="580" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${ACCENT}">bisks.net/enshittify</text>

  <!-- right label -->
  <text x="${W - 40}" y="${H - 34}" text-anchor="end" font-family="JetBrains Mono" font-weight="800" font-size="15" fill="#ffffff" opacity="0.8">— the bottom of the page —</text>
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
