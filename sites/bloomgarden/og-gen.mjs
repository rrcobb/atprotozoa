// Generates public/og.png — the Open Graph preview card for bloomgarden, so a
// shared link auto-renders a little garden bed in Bluesky / other unfurlers.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium needed — this box has no
// fontconfig/system fonts either, so the font is bundled in ./fonts and
// loaded explicitly). Same recipe as sites/bouquet/og-gen.mjs.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// A generic sample bed (rose/poppy/lily/daisy/iris side by side, one of
// each species) — not tied to any real grown bloom. Per-bloom personalization
// for a real /view/<code> link is in the og:title/description text, stamped
// server-side by src/index.ts, not in this image.
//
// House style: self-contained, copy-don't-abstract. The petal-drawing helper
// is a deliberate duplicate of the one in public/index.html — server-side art
// asset generation, not a shared package. Re-run this by hand if the artwork
// changes.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#0f1a12", FG = "#eef7ee", DIM = "#9db89e";
const ACCENT = "#6fcf7c", ACCENT2 = "#ffd166";

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
function shade(hex, pct) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const amt = Math.round(2.55 * pct);
  r = clamp(r + amt, 0, 255); g = clamp(g + amt, 0, 255); b = clamp(b + amt, 0, 255);
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

const SPECIES = {
  rose:  { count: 11, len: 30, width: 19, round: 0.32, centerR: 6 },
  poppy: { count: 5,  len: 50, width: 40, round: 0.55, centerR: 12, centerColor: "#241109" },
  lily:  { count: 6,  len: 55, width: 15, round: 0.12, centerR: 5 },
  daisy: { count: 16, len: 29, width: 7.5, round: 0.2, centerR: 11, centerColor: "#7a5a1e" },
  iris:  { count: 6,  len: 40, width: 20, round: 0.28, centerR: 5 },
};

function petalPath(len, width, round) {
  const tipW = width * round;
  return `M0,0 C${(-width * 0.55).toFixed(1)},${(-len * 0.32).toFixed(1)} ${(-tipW).toFixed(1)},${(-len * 0.8).toFixed(1)} 0,${(-len).toFixed(1)} C${tipW.toFixed(1)},${(-len * 0.8).toFixed(1)} ${(width * 0.55).toFixed(1)},${(-len * 0.32).toFixed(1)} 0,0 Z`;
}

function renderFlowerHead(cx, cy, key, color) {
  const sp = SPECIES[key];
  let out = "";
  for (let i = 0; i < sp.count; i++) {
    const angle = i * (360 / sp.count);
    out += `<path d="${petalPath(sp.len, sp.width, sp.round)}" fill="${color}" opacity="0.95" transform="translate(${cx},${cy}) rotate(${angle.toFixed(1)})"/>`;
  }
  const cc = sp.centerColor || shade(color, -35);
  out += `<circle cx="${cx}" cy="${cy}" r="${sp.centerR}" fill="${cc}"/>`;
  return out;
}

function renderStem(baseX, baseY, headY) {
  return `<path d="M ${baseX} ${baseY} Q ${baseX - 10} ${(baseY + headY) / 2} ${baseX} ${headY}" fill="none" stroke="#3f7d4c" stroke-width="7" stroke-linecap="round"/>` +
    `<ellipse cx="${baseX - 18}" cy="${(baseY + headY) / 2 + 10}" rx="18" ry="9" fill="#4c9a5c" transform="rotate(-26 ${baseX - 18} ${(baseY + headY) / 2 + 10})"/>`;
}

const stems = [
  { x: 300, species: "rose", color: "#e0294f" },
  { x: 460, species: "poppy", color: "#ff6b35" },
  { x: 620, species: "lily", color: "#5aa9e6" },
  { x: 780, species: "daisy", color: "#ffd23f" },
  { x: 940, species: "iris", color: "#8a5fd6" },
];

const baseY = 590;
let flowersSvg = "";
stems.forEach((s, i) => {
  const headY = 400 + (i % 2 === 0 ? 0 : 24);
  flowersSvg += renderStem(s.x, baseY, headY);
  flowersSvg += renderFlowerHead(s.x, headY, s.species, s.color);
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="10%" cy="-10%" r="60%">
      <stop offset="0" stop-color="#1e3a24"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="95%" cy="0%" r="55%">
      <stop offset="0" stop-color="#16324a"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${ACCENT}"/>
      <stop offset="1" stop-color="${ACCENT2}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <ellipse cx="${W / 2}" cy="${baseY + 24}" rx="720" ry="60" fill="#5b4632"/>
  <ellipse cx="${W / 2}" cy="${baseY + 14}" rx="700" ry="46" fill="#7a5f42"/>

  <text x="64" y="150" font-family="JetBrains Mono" font-weight="800" font-size="60" fill="url(#title)">bloomgarden</text>
  <text x="64" y="212" font-family="JetBrains Mono" font-size="24" fill="${FG}">grow a flower that's you,</text>
  <text x="64" y="248" font-family="JetBrains Mono" font-size="24" fill="${FG}">cross it with someone else's</text>

  <text x="64" y="284" font-family="JetBrains Mono" font-size="17" fill="${DIM}">a quiz grows your bloom, real days water it,</text>
  <text x="64" y="310" font-family="JetBrains Mono" font-size="17" fill="${DIM}">and two blooms cross into a hybrid.</text>

  ${flowersSvg}

  <text x="64" y="${H - 40}" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT2}">bloomgarden.bisks.net</text>
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
