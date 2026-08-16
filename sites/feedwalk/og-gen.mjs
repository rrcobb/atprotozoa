// Generates public/og.png — the Open Graph preview card for feedwalk.
//
// A row of receding picture frames (simple isometric-ish rectangles,
// smaller and dimmer the further back) standing in for the endless gallery
// corridor, behind the wordmark. Rasterised with @resvg/resvg-js (pure
// native module, no system Chromium/fontconfig needed — font bundled in
// ./fonts).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Adapted from
// sites/hypertower/og-gen.mjs.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG_TOP = "#1c1622", BG_BOT = "#0c0910";
const INK = "#f0e9df", MUTED = "#9186a0";
const ACCENT = "#e8b34c", CYAN = "#5fd6d1";

// ---- receding corridor of frames: nested, unfilled rects (a solid fill on
// the nearest/largest one would occlude every farther/smaller one behind
// it, since they're all centered on the same vanishing point) ----
let corridorSvg = "";
const CX = 900, CY = 330;
for (let i = 6; i >= 0; i--) {
  const depth = i / 6; // 0 = nearest, 1 = farthest
  const scale = 1 - depth * 0.72;
  const w = 260 * scale, h = 190 * scale;
  const x = CX - w / 2;
  const y = CY - h / 2 - depth * 18;
  const hue = (i * 47) % 360;
  corridorSvg += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="${(6 * scale).toFixed(1)}" fill="none" stroke="hsl(${hue} 55% 62%)" stroke-opacity="${(0.85 - depth * 0.55).toFixed(2)}" stroke-width="${(3 * scale).toFixed(1)}"/>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${BG_TOP}"/>
      <stop offset="1" stop-color="${BG_BOT}"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="${ACCENT}" stop-opacity="0.22"/>
      <stop offset="1" stop-color="${ACCENT}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <circle cx="${CX}" cy="${CY}" r="280" fill="url(#glow)"/>
  ${corridorSvg}

  <text x="64" y="150" font-family="JetBrains Mono" font-weight="800" font-size="72" fill="${INK}">FEEDWALK</text>
  <text x="66" y="192" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${CYAN}" letter-spacing="4">WALK THROUGH WHO YOU FOLLOW</text>

  <text x="66" y="252" font-family="JetBrains Mono" font-size="21" fill="${MUTED}">an endless first-person museum —</text>
  <text x="66" y="282" font-family="JetBrains Mono" font-size="21" fill="${MUTED}">every frame is a real post from someone you follow</text>

  <text x="66" y="340" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT}">type a handle, no login</text>
  <text x="66" y="368" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${CYAN}">walk until you've seen it all</text>

  <text x="64" y="576" font-family="JetBrains Mono" font-weight="700" font-size="26" fill="${CYAN}">feedwalk.bisks.net</text>
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
