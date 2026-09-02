// Generates public/og.png — the Open Graph preview card for insecollider.
// A dark accelerator ring feeding glowing motes into a growing singularity,
// mirroring the live canvas sim. Rasterised with @resvg/resvg-js (pure
// native module, no system Chromium needed).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork. Adapted from sites/foomtree/og-gen.mjs.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#050308";
const ACCENT = "#b56bff";
const ACCENT2 = "#ff5f8f";
const WARN = "#ff8a4a";
const MUTED = "#9482ab";

const cx = 860, cy = 340;
const ringR = 190;

// motes scattered around the ring + spiraling in toward the singularity
const motes = [];
for (let i = 0; i < 22; i++) {
  const a = (i / 22) * Math.PI * 2 + (i % 3) * 0.15;
  const r = ringR - (i % 5) * 18;
  const x = cx + Math.cos(a) * r;
  const y = cy + Math.sin(a) * r;
  const color = i % 4 === 0 ? WARN : i % 3 === 0 ? ACCENT2 : ACCENT;
  const size = 2.2 + (i % 3) * 1.3;
  motes.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${size}" fill="${color}" opacity="${(0.55 + (i % 4) * 0.12).toFixed(2)}"/>`);
}
const moteShapes = motes.join("\n  ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#000000"/>
      <stop offset="55%" stop-color="#140420" stop-opacity="0.92"/>
      <stop offset="85%" stop-color="${ACCENT}" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="${ACCENT}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="bgGlow" cx="30%" cy="30%" r="70%">
      <stop offset="0%" stop-color="#1a0a2a"/>
      <stop offset="100%" stop-color="${BG}"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bgGlow)"/>

  <circle cx="${cx}" cy="${cy}" r="${ringR}" fill="none" stroke="${ACCENT}" stroke-width="1.5" opacity="0.3"/>
  <circle cx="${cx}" cy="${cy}" r="${ringR}" fill="none" stroke="${ACCENT}" stroke-width="9" opacity="0.08"/>
  ${moteShapes}
  <circle cx="${cx}" cy="${cy}" r="72" fill="url(#glow)"/>
  <circle cx="${cx}" cy="${cy}" r="28" fill="#000000"/>

  <text x="66" y="220" font-family="JetBrains Mono" font-weight="800" font-size="66" fill="${ACCENT}">insecollider</text>
  <text x="68" y="270" font-family="JetBrains Mono" font-size="21" fill="${MUTED}">a particle accelerator, but its insecurities.</text>
  <text x="68" y="298" font-family="JetBrains Mono" font-size="21" fill="${MUTED}">click to release one — watch it spiral into</text>
  <text x="68" y="326" font-family="JetBrains Mono" font-size="21" fill="${MUTED}">a growing singularity until it collapses.</text>
  <text x="68" y="580" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${WARN}">insecollider.bisks.net</text>
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
