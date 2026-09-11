// Generates public/og.png — the Open Graph preview card for victorylap.
//
// A static "trackside" card: an oval track with a dashed shortcut cutting
// across it to the finish line, a runner mid-celebration, and the made-up
// scoreboard (100%+ confidence, 0% evidence). Deterministic, no live state —
// same approach as sites/cancrusher/og-gen.mjs. Rasterised with @resvg/resvg-js.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const INK = "#ecfff2", MUTED = "#8fae9c", GOLD = "#ffcf4d", GREEN = "#4dffb0", RED = "#ff6b6b";

const cx = 860, cy = 360, rx = 260, ry = 170;
const cutAngle = -Math.PI / 2 + 0.58 * Math.PI * 2;
const cutX = cx + rx * Math.cos(cutAngle);
const cutY = cy + ry * Math.sin(cutAngle);
const finishX = cx;
const finishY = cy - ry;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="0.68" cy="0.45" r="0.9">
      <stop offset="0" stop-color="#1c3226"/>
      <stop offset="1" stop-color="#0d1410"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>

  <text x="56" y="110" font-family="JetBrains Mono" font-weight="800" font-size="52" fill="${INK}">PREMATURE</text>
  <text x="56" y="168" font-family="JetBrains Mono" font-weight="800" font-size="52" fill="${GOLD}">VICTORY LAP</text>
  <text x="56" y="205" font-family="JetBrains Mono" font-weight="600" font-size="21" fill="${MUTED}">declare victory before you've earned it. run the lap anyway.</text>

  <rect x="56" y="240" width="380" height="70" rx="10" fill="#122019" stroke="#24402f" stroke-width="2"/>
  <text x="76" y="270" font-family="JetBrains Mono" font-weight="800" font-size="28" fill="${GREEN}">confidence 340%</text>
  <text x="76" y="296" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${RED}">evidence 0%</text>

  <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="#24402f" stroke-width="22"/>
  <path d="M ${cx} ${cy - ry} A ${rx} ${ry} 0 0 1 ${cutX.toFixed(1)} ${cutY.toFixed(1)}" fill="none" stroke="#3a6b4c" stroke-width="22"/>
  <line x1="${cutX.toFixed(1)}" y1="${cutY.toFixed(1)}" x2="${finishX}" y2="${finishY}" stroke="${RED}" stroke-width="3" stroke-dasharray="8 10"/>

  <rect x="${finishX - 16}" y="${finishY - 14}" width="32" height="28" fill="${INK}"/>
  <text x="${cutX.toFixed(1)}" y="${(cutY - 14).toFixed(1)}" font-family="serif" font-size="46" text-anchor="middle">🙌</text>

  <text x="60" y="${H - 46}" font-family="JetBrains Mono" font-weight="700" font-size="26" fill="${GREEN}">victorylap.bisks.net</text>
</svg>`;

const fontPath = fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url));
const rr = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
});
const png = rr.render().asPng();
const out = new URL("./public/og.png", import.meta.url).pathname;
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");
