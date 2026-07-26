// Generates public/og.png — the Open Graph preview card for chimehose, so a
// shared link auto-renders a picture of the idea in Bluesky / other
// unfurlers.
//
// Hand-drawn SVG at the canonical OG size: a bell (gold, additions) and a
// plucked string (blue, subtractions) each radiating rings, over the
// wordmark. Rasterised with @resvg/resvg-js (pure native module, no system
// Chromium/fontconfig needed — the font is bundled in ./fonts and loaded
// explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork. Adapted from sites/stanquiz/og-gen.mjs.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#05060a", PANEL = "#0c0f18", INK = "#eaf2fb", MUTED = "#90a2b8";
const GOLD = "#ffd166", BLUE = "#6ec8ff", PINK = "#ff7ab8";
const BORDER = "rgba(234,242,251,0.14)";

function rings(cx, cy, color, n, maxR) {
  let out = "";
  for (let i = 0; i < n; i++) {
    const r = maxR * ((i + 1) / n);
    const op = 0.55 * (1 - i / n) + 0.08;
    out += `<circle cx="${cx}" cy="${cy}" r="${r.toFixed(1)}" fill="none" stroke="${color}" stroke-width="2.5" opacity="${op.toFixed(2)}"/>`;
  }
  return out;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="bgL" cx="18%" cy="30%" r="55%">
      <stop offset="0" stop-color="#3a2a10"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="bgR" cx="82%" cy="70%" r="55%">
      <stop offset="0" stop-color="#0e2a3a"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#bgL)"/>
  <rect width="${W}" height="${H}" fill="url(#bgR)"/>

  ${rings(300, 300, GOLD, 4, 210)}
  ${rings(900, 380, BLUE, 4, 210)}

  <!-- bell glyph -->
  <path d="M300 210 c-46 0 -70 34 -70 78 c0 34 -10 56 -26 70 h192 c-16 -14 -26 -36 -26 -70 c0 -44 -24 -78 -70 -78 z" fill="${GOLD}"/>
  <rect x="288" y="358" width="24" height="14" rx="4" fill="${GOLD}"/>
  <circle cx="300" cy="378" r="9" fill="${GOLD}"/>

  <!-- plucked string glyph: a bent string across a small bridge -->
  <line x1="800" y1="380" x2="1000" y2="380" stroke="${BLUE}" stroke-width="4"/>
  <path d="M800 380 Q900 330 1000 380" fill="none" stroke="${BLUE}" stroke-width="4"/>
  <rect x="793" y="374" width="14" height="60" rx="3" fill="${BLUE}"/>
  <rect x="993" y="374" width="14" height="60" rx="3" fill="${BLUE}"/>

  <text x="60" y="130" font-family="JetBrains Mono" font-weight="800" font-size="60" fill="${GOLD}">chime<tspan fill="${BLUE}">hose</tspan></text>
  <text x="60" y="178" font-family="JetBrains Mono" font-size="22" fill="${MUTED}">listen to the atproto firehose</text>

  <rect x="60" y="470" width="1080" height="110" rx="14" fill="${PANEL}" stroke="${BORDER}" stroke-width="1.5"/>
  <text x="90" y="512" font-family="JetBrains Mono" font-size="19" fill="${GOLD}">new post = bell</text>
  <text x="90" y="546" font-family="JetBrains Mono" font-size="19" fill="${BLUE}">deleted post = string pluck</text>
  <text x="620" y="512" font-family="JetBrains Mono" font-size="19" fill="${INK}">pitch = size of the post</text>
  <text x="620" y="546" font-family="JetBrains Mono" font-size="19" fill="${MUTED}">bigger post, deeper note</text>

  <text x="60" y="600" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${PINK}">bisks.net/chimehose</text>
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
