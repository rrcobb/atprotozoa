// Generates public/og.png — the Open Graph preview card for orbslist, so a
// shared link renders a picture of the vandalized listing photo in
// Bluesky / other unfurlers.
//
// A generic (not per-load — this is a client-only site, no server render)
// snapshot: the fake couch listing photo with a fixed scatter of green
// gradient orbs on top, plus the wordmark. Rasterised with @resvg/resvg-js
// (pure native module, no system Chromium/fontconfig needed — the font is
// bundled in ./fonts and loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork. Adapted from sites/lavalamp/og-gen.mjs.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#0d0f0c", INK = "#f4f6f0", MUTED = "#9aa695", ACCENT = "#4ade80";
const WALL = "#cfc0a0", FLOOR = "#7d6440";

// tiny seeded RNG so the layout is identical every run
let seed = 7;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

let gid = 0;
function orb(cx, cy, r, opacity) {
  const id = "o" + gid++;
  const h1 = 78 + rnd() * 60, h2 = h1 + 10 + rnd() * 20;
  const c1 = `hsl(${h1.toFixed(0)} 75% 60%)`, c2 = `hsl(${h2.toFixed(0)} 70% 16%)`;
  return `
  <defs>
    <radialGradient id="grad-${id}" cx="35%" cy="30%" r="75%">
      <stop offset="0" stop-color="${c1}"/>
      <stop offset="0.7" stop-color="${c2}"/>
      <stop offset="1" stop-color="${c2}" stop-opacity="0"/>
    </radialGradient>
    <filter id="blur-${id}"><feGaussianBlur stdDeviation="${(r * 0.12).toFixed(1)}"/></filter>
  </defs>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#grad-${id})" opacity="${opacity}" filter="url(#blur-${id})" style="mix-blend-mode:screen"/>`;
}

const photoX = 46, photoY = 46, photoW = 560, photoH = 538;

// couch, drawn at photo scale (roughly matching the live SVG proportions)
const couchSvg = `
  <rect x="${photoX}" y="${photoY}" width="${photoW}" height="${photoH * 0.62}" fill="${WALL}"/>
  <rect x="${photoX}" y="${photoY + photoH * 0.62}" width="${photoW}" height="${photoH * 0.38}" fill="${FLOOR}"/>
  <g transform="translate(${photoX + 130}, ${photoY + 230})">
    <rect x="8" y="52" width="300" height="94" rx="16" fill="#8a6d3f"/>
    <rect x="-14" y="30" width="30" height="130" rx="14" fill="#71592f"/>
    <rect x="298" y="30" width="30" height="130" rx="14" fill="#71592f"/>
    <rect x="20" y="0" width="280" height="56" rx="16" fill="#9c7d47"/>
    <rect x="30" y="52" width="82" height="56" rx="12" fill="#a68952"/>
    <rect x="122" y="52" width="82" height="56" rx="12" fill="#a68952"/>
    <rect x="214" y="52" width="82" height="56" rx="12" fill="#a68952"/>
    <rect x="-14" y="180" width="326" height="14" rx="5" fill="#4a3a20"/>
  </g>`;

const orbsSvg = [
  orb(photoX + 90, photoY + 110, 130, 0.85),
  orb(photoX + 420, photoY + 90, 160, 0.75),
  orb(photoX + 480, photoY + 380, 150, 0.8),
  orb(photoX + 140, photoY + 400, 110, 0.7),
  orb(photoX + 300, photoY + 250, 190, 0.55),
].join("");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#backglow)"/>
  <defs>
    <radialGradient id="backglow" cx="80%" cy="30%" r="70%">
      <stop offset="0" stop-color="#173a20"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <g>
    <rect x="${photoX - 4}" y="${photoY - 4}" width="${photoW + 8}" height="${photoH + 8}" fill="none" stroke="#3a4238" stroke-width="2"/>
    ${couchSvg}
    ${orbsSvg}
    <rect x="${photoX}" y="${photoY + photoH - 40}" width="${photoW}" height="40" fill="rgba(0,0,0,0.55)"/>
    <text x="${photoX + 14}" y="${photoY + photoH - 13}" font-family="JetBrains Mono" font-size="18" fill="#fff">1 of 4 — front view</text>
  </g>

  <text x="662" y="200" font-family="JetBrains Mono" font-weight="800" font-size="72" fill="${INK}">orbslist</text>
  <text x="662" y="250" font-family="JetBrains Mono" font-size="23" fill="${MUTED}">a listing, ruined by green orbs</text>

  <text x="662" y="330" font-family="JetBrains Mono" font-size="21" fill="${ACCENT}">free couch, some cat scratches</text>
  <text x="662" y="366" font-family="JetBrains Mono" font-size="21" fill="${MUTED}">structurally sound, pickup only</text>
  <text x="662" y="412" font-family="JetBrains Mono" font-size="21" fill="${MUTED}">every photo pre-vandalized</text>
  <text x="662" y="448" font-family="JetBrains Mono" font-size="21" fill="${MUTED}">with random blurred green orbs</text>

  <text x="662" y="560" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${ACCENT}">orbslist.bisks.net</text>
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
