// Generates public/og.png — the Open Graph preview card for aurafarmville,
// so a shared link auto-renders a glowing little farm grid in Bluesky /
// other unfurlers. Hand-drawn SVG at the canonical OG size, rasterised with
// @resvg/resvg-js (pure native module, no system Chromium needed — this box
// has no fontconfig/system fonts either, so the font is bundled in ./fonts
// and loaded explicitly, and there's no emoji font available so the plots
// are drawn as simple vector shapes rather than emoji glyphs). Same recipe
// as sites/bloomgarden/og-gen.mjs.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// A generic 3x3 plot grid, some ripe (glowing) and some growing — not tied
// to any real farm. Per-farm personalization for a real /f/<code> link is in
// the og:title/description text, stamped server-side by src/index.ts, not
// in this image.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#100b1a", FG = "#f3edff", DIM = "#a698c4";
const ACCENT = "#c77dff", ACCENT2 = "#7ee8c7", ACCENT3 = "#ff8fc4";

const PLOTS = [
  { color: ACCENT2, ripe: true },
  { color: ACCENT3, ripe: false },
  { color: ACCENT, ripe: true },
  { color: ACCENT, ripe: false },
  { color: ACCENT2, ripe: true },
  { color: ACCENT3, ripe: false },
  { color: ACCENT3, ripe: true },
  { color: ACCENT2, ripe: false },
  { color: ACCENT, ripe: true },
];

function plantShape(cx, cy, color, ripe) {
  const stemH = ripe ? 34 : 22;
  const headR = ripe ? 15 : 9;
  let out = `<rect x="${cx - 2}" y="${cy - stemH}" width="4" height="${stemH}" rx="2" fill="#3f7d4c"/>`;
  if (ripe) {
    out += `<circle cx="${cx}" cy="${cy - stemH - headR + 4}" r="${headR}" fill="${color}"/>`;
    out += `<circle cx="${cx}" cy="${cy - stemH - headR + 4}" r="${headR * 0.4}" fill="${BG}" opacity="0.25"/>`;
  } else {
    out += `<ellipse cx="${cx - 6}" cy="${cy - stemH + 4}" rx="9" ry="5" fill="${color}" opacity="0.85" transform="rotate(-25 ${cx - 6} ${cy - stemH + 4})"/>`;
    out += `<ellipse cx="${cx + 6}" cy="${cy - stemH + 6}" rx="9" ry="5" fill="${color}" opacity="0.85" transform="rotate(25 ${cx + 6} ${cy - stemH + 6})"/>`;
  }
  return out;
}

const gridX = 660, gridY = 190, cellW = 150, cellH = 130, gap = 14;
let plotsSvg = "";
PLOTS.forEach((p, i) => {
  const col = i % 3, row = Math.floor(i / 3);
  const x = gridX + col * (cellW + gap);
  const y = gridY + row * (cellH + gap);
  plotsSvg += `<rect x="${x}" y="${y}" width="${cellW}" height="${cellH}" rx="16" fill="#1a1428" stroke="${p.ripe ? p.color : "#332a4a"}" stroke-width="${p.ripe ? 2.5 : 1.5}"/>`;
  if (p.ripe) {
    plotsSvg += `<rect x="${x}" y="${y}" width="${cellW}" height="${cellH}" rx="16" fill="${p.color}" opacity="0.08"/>`;
  }
  plotsSvg += plantShape(x + cellW / 2, y + cellH - 22, p.color, p.ripe);
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="8%" cy="-10%" r="60%">
      <stop offset="0" stop-color="#2a1a4a"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="95%" cy="0%" r="55%">
      <stop offset="0" stop-color="#1a3a3a"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${ACCENT}"/>
      <stop offset="0.5" stop-color="${ACCENT3}"/>
      <stop offset="1" stop-color="${ACCENT2}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <text x="64" y="150" font-family="JetBrains Mono" font-weight="800" font-size="58" fill="url(#title)">aurafarmville</text>
  <text x="64" y="204" font-family="JetBrains Mono" font-size="23" fill="${FG}">farm your aura, not your crops.</text>

  <text x="64" y="252" font-family="JetBrains Mono" font-size="17" fill="${DIM}">plant it, protect it from the fanum tax,</text>
  <text x="64" y="278" font-family="JetBrains Mono" font-size="17" fill="${DIM}">grind your way to Grand Aura Overlord.</text>

  ${plotsSvg}

  <text x="64" y="${H - 40}" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT2}">aurafarmville.bisks.net</text>
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
