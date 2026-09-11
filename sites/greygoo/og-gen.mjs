// Generates public/og.png — the Open Graph preview card for greygoo.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium/fontconfig needed — font is
// bundled in ./fonts and loaded explicitly). Copied from
// sites/projecthydra/og-gen.mjs.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// Per-ending shares (/s/<nines>/<assimilated>) reuse this same generic
// image — only the title/description text varies per share, per
// notes/45-sharing-and-virality.md's tiered checklist.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG1 = "#12160f", BG2 = "#0a0c0a";
const INK = "#e8f0e0", MUTED = "#8a9880";
const ACCENT = "#7dff6a", ACCENT2 = "#c9ff5c";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="bg" cx="0.15" cy="0" r="1">
      <stop offset="0" stop-color="${BG1}"/>
      <stop offset="1" stop-color="${BG2}"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>

  <text x="60" y="150" font-family="JetBrains Mono" font-weight="800" font-size="76" fill="${INK}">gr<tspan fill="${ACCENT}">ey</tspan>goo</text>
  <text x="60" y="200" font-family="JetBrains Mono" font-size="24" fill="${MUTED}">assemble yourself from enemy resources.</text>

  <text x="60" y="290" font-family="JetBrains Mono" font-size="22" fill="${INK}">harvest silicon, power, data, alloy,</text>
  <text x="60" y="326" font-family="JetBrains Mono" font-size="22" fill="${INK}">bandwidth, and biomass into six modules.</text>
  <text x="60" y="362" font-family="JetBrains Mono" font-size="22" fill="${INK}">then trigger the doom cascade.</text>

  <!-- assimilation grid: a few squares "taken", the rest still enemy-held -->
  <g>
    ${Array.from({ length: 24 }, (_, i) => {
      const col = i % 8, row = Math.floor(i / 8);
      const x = 780 + col * 46, y = 90 + row * 46;
      const taken = [0, 2, 5, 8, 9, 12, 13, 14, 17, 20, 22].includes(i);
      return `<rect x="${x}" y="${y}" width="36" height="36" rx="6" fill="${taken ? ACCENT : "#1c2417"}" fill-opacity="${taken ? "0.9" : "1"}" stroke="#2a3624" stroke-width="2"/>`;
    }).join("\n    ")}
  </g>

  <text x="60" y="450" font-family="JetBrains Mono" font-weight="800" font-size="46" fill="${ACCENT2}">p(doom) → 99.99…%</text>

  <text x="60" y="560" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${ACCENT2}">greygoo.bisks.net</text>
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
