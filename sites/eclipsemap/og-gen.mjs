// Generates public/og.png — the Open Graph preview card for eclipsemap, so a
// shared link auto-renders a picture of the orrery in Bluesky / other
// unfurlers. Hand-drawn SVG at the canonical OG size, matching the live
// page's dark-orrery look, rasterised with @resvg/resvg-js (pure native
// module, no system Chromium needed — this box has no fontconfig/system
// fonts either, so the font is bundled in ./fonts and loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract (this is a near-duplicate
// of sites/didscope/og-gen.mjs, retooled for eclipsemap's palette/scene).
// Re-run this by hand if you change the artwork.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#05060c", FG = "#e8ecfb", DIM = "#8890b5";
const ACCENT = "#ffcf6b", ACCENT2 = "#6bb8ff", TOTAL = "#ff6b6b", BORDER = "#262c48";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// right-side scene: an orrery ring with a sun mid-total-eclipse (corona ring
// behind a dark occluding disk), echoing the live canvas.
const sceneCX = 870, sceneCY = 320;

const orbitRings = [130, 195, 260].map(
  (r) => `<circle cx="${sceneCX}" cy="${sceneCY}" r="${r}" fill="none" stroke="#ffffff14" stroke-width="1.5"/>`
).join("\n  ");

const planetDots = [
  { r: 130, ang: -0.6, size: 6, color: ACCENT2 },
  { r: 195, ang: 2.1, size: 8, color: TOTAL },
  { r: 260, ang: 0.9, size: 5, color: "#9fd9e8" },
].map(
  (p) => `<circle cx="${sceneCX + p.r * Math.cos(p.ang)}" cy="${sceneCY + p.r * Math.sin(p.ang)}" r="${p.size}" fill="${p.color}"/>`
).join("\n  ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="15%" cy="0%" r="65%">
      <stop offset="0" stop-color="#1a1240"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="corona" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="${ACCENT}" stop-opacity="0"/>
      <stop offset="0.72" stop-color="${ACCENT}" stop-opacity="0"/>
      <stop offset="0.86" stop-color="${ACCENT}" stop-opacity="0.9"/>
      <stop offset="1" stop-color="${ACCENT}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${ACCENT}"/>
      <stop offset="1" stop-color="${ACCENT2}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>

  <!-- left: wordmark + pitch -->
  <text x="64" y="150" font-family="JetBrains Mono" font-weight="800" font-size="66" fill="url(#title)">eclipsemap</text>
  <text x="64" y="200" font-family="JetBrains Mono" font-size="21" fill="${DIM}">every eclipse the solar system has —</text>
  <text x="64" y="228" font-family="JetBrains Mono" font-size="21" fill="${DIM}">not just Earth's</text>

  <text x="64" y="300" font-family="JetBrains Mono" font-size="17" fill="${DIM}">Real orbital elements. Real Keplerian</text>
  <text x="64" y="326" font-family="JetBrains Mono" font-size="17" fill="${DIM}">mechanics. Jupiter's moons eclipsing</text>
  <text x="64" y="352" font-family="JetBrains Mono" font-size="17" fill="${DIM}">almost daily, Pluto &amp; Charon's</text>
  <text x="64" y="378" font-family="JetBrains Mono" font-size="17" fill="${DIM}">century-apart mutual seasons.</text>

  <text x="64" y="470" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT2}">eclipsemap.bisks.net</text>

  <!-- right: total-eclipse scene inside a mini orrery -->
  ${orbitRings}
  ${planetDots}
  <circle cx="${sceneCX}" cy="${sceneCY}" r="105" fill="url(#corona)"/>
  <circle cx="${sceneCX}" cy="${sceneCY}" r="72" fill="#05060c" stroke="${BORDER}" stroke-width="1.5"/>
  <text x="${sceneCX}" y="${sceneCY + 150}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="14" letter-spacing="2" fill="${TOTAL}">TOTAL ECLIPSE</text>
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
