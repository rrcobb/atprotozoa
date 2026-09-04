// Generates public/og.png — the Open Graph preview card for vocoder.
//
// Rasterised with @resvg/resvg-js (pure native module, no system Chromium
// needed — font bundled in ./fonts). Adapted from
// sites/vadrone/og-gen.mjs.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200,
  H = 630;
const BG = "#0c0f10";
const PANEL = "#1c2422";
const INK = "#eef4f0";
const MUTED = "#93a19b";
const PHOSPHOR = "#3dff6e";
const AMBER = "#ffb020";
const WARN = "#ffcc00";

const bandHeights = [40, 62, 88, 70, 100, 55, 82, 96, 60, 74, 48, 30];
const barW = 34;
const barGap = 12;
const bandsX = 700;
const bandsBaseY = 470;
const bars = bandHeights
  .map((h, i) => {
    const x = bandsX + i * (barW + barGap);
    const y = bandsBaseY - h;
    return `<rect x="${x}" y="${y}" width="${barW}" height="${h}" rx="3" fill="${PHOSPHOR}" opacity="${0.55 + (i % 3) * 0.15}"/>`;
  })
  .join("\n");

let scope = "";
{
  const pts = [];
  const scopeX = 700,
    scopeY = 150,
    scopeW = 430,
    scopeH = 130;
  for (let i = 0; i <= 48; i++) {
    const t = i / 48;
    const x = scopeX + t * scopeW;
    const y = scopeY + scopeH / 2 + Math.sin(t * Math.PI * 5) * (scopeH / 2 - 10) * Math.sin(t * Math.PI);
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  scope = `<polyline points="${pts.join(" ")}" fill="none" stroke="${PHOSPHOR}" stroke-width="4"/>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <pattern id="stripes" width="28" height="28" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
      <rect width="14" height="28" fill="${WARN}"/>
      <rect x="14" width="14" height="28" fill="#1a1a1a"/>
    </pattern>
    <radialGradient id="glow" cx="30%" cy="0%" r="70%">
      <stop offset="0" stop-color="#182220"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect x="0" y="0" width="${W}" height="16" fill="url(#stripes)"/>

  <rect x="640" y="120" width="480" height="380" rx="10" fill="${PANEL}" stroke="#000" stroke-width="2"/>
  <rect x="666" y="146" width="428" height="150" rx="6" fill="#04120a" stroke="#06231a" stroke-width="4"/>
  ${scope}
  ${bars}

  <text x="80" y="200" font-family="JetBrains Mono" font-weight="700" font-size="22" letter-spacing="6" fill="${AMBER}">MODEL MK-1 · ATOMIC AUDIO DIV.</text>
  <text x="80" y="280" font-family="JetBrains Mono" font-weight="800" font-size="66" letter-spacing="1" fill="${PHOSPHOR}">ELECTRO-</text>
  <text x="80" y="352" font-family="JetBrains Mono" font-weight="800" font-size="66" letter-spacing="1" fill="${PHOSPHOR}">VOCODER</text>
  <text x="80" y="410" font-family="JetBrains Mono" font-size="22" fill="${MUTED}">mic in as modulator. keyboard plays a</text>
  <text x="80" y="442" font-family="JetBrains Mono" font-size="22" fill="${MUTED}">fully polyphonic carrier. live in the browser.</text>
  <text x="80" y="574" font-family="JetBrains Mono" font-weight="700" font-size="26" fill="${AMBER}">vocoder.bisks.net</text>
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
