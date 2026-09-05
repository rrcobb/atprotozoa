// Generates public/og.png — the static Open Graph preview card for the bare
// orrery.bisks.net link. Per-world share cards use the same static image
// (the interesting part is which world got highlighted, which the
// og:title/description already say — see src/index.ts's renderShare).
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium/fontconfig needed — the font is
// bundled in ./fonts and loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#0d0d0d";
const RING = "rgba(255,255,255,0.14)";
const SUN = "#ffe6a0";

const COLORS = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#4dbf4d"];

const cx = 330, cy = 315;
const rings = [55, 100, 145, 190, 235, 280];

// deterministic scatter of dots per ring, seeded so re-running gives the
// same image
function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}
const rand = seeded(42);

let dots = "";
let ringSvg = "";
for (let i = 0; i < rings.length; i++) {
  const r = rings[i];
  ringSvg += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${RING}" stroke-width="1.5"/>`;
  const count = 6 + i * 3;
  for (let k = 0; k < count; k++) {
    const a = (k / count) * Math.PI * 2 + rand() * 0.4;
    const jitter = (rand() - 0.5) * 10;
    const x = cx + Math.cos(a) * (r + jitter);
    const y = cy + Math.sin(a) * (r + jitter);
    const color = COLORS[i % COLORS.length];
    dots += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.4" fill="${color}"/>`;
  }
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="${cx}" cy="${cy}" r="320" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#241d0d"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <circle cx="${cx}" cy="${cy}" r="320" fill="url(#glow)"/>
  ${ringSvg}
  <circle cx="${cx}" cy="${cy}" r="34" fill="${SUN}" opacity="0.18"/>
  <circle cx="${cx}" cy="${cy}" r="13" fill="${SUN}"/>
  ${dots}

  <text x="660" y="230" font-family="JetBrains Mono" font-weight="800" font-size="72" fill="#ffffff">orrery</text>
  <text x="662" y="286" font-family="JetBrains Mono" font-size="22" fill="#c3c2b7">every atprotozoa site, drawn as a</text>
  <text x="662" y="318" font-family="JetBrains Mono" font-size="22" fill="#c3c2b7">tiny solar system orbiting bisks.net</text>

  <text x="662" y="380" font-family="JetBrains Mono" font-size="17" fill="#898781">toy &#183; game &#183; tool &#183; joke &#183; explainer &#183; art</text>

  <text x="662" y="540" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${SUN}">orrery.bisks.net</text>
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
