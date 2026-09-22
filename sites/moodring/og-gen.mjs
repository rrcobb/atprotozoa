// Generates public/og.png — the Open Graph preview card for moodring, so a
// shared link auto-renders a picture of the ring in Bluesky / other
// unfurlers. Hand-drawn SVG at the canonical OG size, matching the live
// page's dark/glow look, rasterised with @resvg/resvg-js (pure native
// module, no system Chromium needed — this box has no fontconfig / system
// fonts either, so the font is bundled in ./fonts and loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// A generic sample ring (not tied to any real handle) — this is the static
// fallback card for the bare link. Per-handle share cards are generated
// live, client-side, in public/app.js (buildShareCard), and per-handle OG
// tags are stamped server-side by src/index.ts's /s/<handle>.
//
// The ring itself is faked as stacked, slightly-hue-shifted circles (a soft
// radial bloom) rather than a true conic gradient — SVG has no reliable
// conic-gradient support across renderers, unlike <canvas>'s
// createConicGradient, which public/app.js's live share-card generator uses
// instead. Close enough for a static preview image.
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#0a0a0f", FG = "#f0eef7", DIM = "#8d89a3";
const C1 = "#7dd8ff", C2 = "#c77dff", C3 = "#ff7de0";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const cx = 900, cy = 315, R = 190;

const ringLayers = [];
for (let i = 0; i < 14; i++) {
  const t = i / 13;
  const hue = 195 + t * 130; // sweeps pale blue -> violet -> pink
  ringLayers.push(
    `<circle cx="${cx}" cy="${cy}" r="${R - t * 26}" fill="none" stroke="hsl(${hue.toFixed(0)} 78% 62%)" stroke-width="6" opacity="${0.55 - t * 0.15}"/>`,
  );
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="15%" cy="-10%" r="60%">
      <stop offset="0" stop-color="#241a3a"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="78%" cy="55%" r="55%">
      <stop offset="0" stop-color="#2a1430"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${C2}"/>
      <stop offset="1" stop-color="${C1}"/>
    </linearGradient>
    <filter id="blur"><feGaussianBlur stdDeviation="4"/></filter>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <text x="64" y="150" font-family="JetBrains Mono" font-weight="800" font-size="66" fill="url(#title)">moodring</text>
  <text x="64" y="200" font-family="JetBrains Mono" font-size="22" fill="${DIM}">a <tspan fill="${C1}">bluesky</tspan> mood ring</text>

  <text x="64" y="280" font-family="JetBrains Mono" font-size="18" fill="${DIM}">Enter a handle. Reads the tone of</text>
  <text x="64" y="308" font-family="JetBrains Mono" font-size="18" fill="${DIM}">their last 10 posts and replies, then</text>
  <text x="64" y="336" font-family="JetBrains Mono" font-size="18" fill="${DIM}">wraps their avatar in the color it lands on.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${C1}">moodring.bisks.net</text>

  <g filter="url(#blur)">
    ${ringLayers.join("\n    ")}
  </g>
  <circle cx="${cx}" cy="${cy}" r="${R - 34}" fill="#131320" stroke="${BG}" stroke-width="6"/>
  <text x="${cx}" y="${cy - 6}" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="30" fill="${FG}">elated</text>
  <text x="${cx}" y="${cy + 26}" text-anchor="middle" font-family="JetBrains Mono" font-size="16" fill="${C3}">hot pink</text>
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
