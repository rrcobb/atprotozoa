// Generates public/og.png — the Open Graph preview card for modelzoo, so a
// shared link auto-renders a picture of the game instead of a bare URL. Same
// approach as sites/didscope/og-gen.mjs: hand-drawn SVG at the canonical OG
// size, rasterised with @resvg/resvg-js (pure native module, no system
// Chromium or fontconfig needed — font is bundled in ./fonts).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#0a0e0f", FG = "#e8f2ef", DIM = "#7f9c96";
const SAFE = "#5eff9a", CAPABILITY = "#7fd4ff", RISK = "#ff6b4a", AMBER = "#ffb03b";
const CARD = "#111819", BORDER = "#223032";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Emoji glyphs don't rasterize reliably through resvg without a bundled
// color-emoji font, so the card's "zoo" tiles are abstract colored blobs
// (one per model temperament) instead of the live page's actual emoji icons.
const zooBlobs = [SAFE, CAPABILITY, AMBER, RISK, "#b98bff", SAFE];

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="15%" cy="-10%" r="60%">
      <stop offset="0" stop-color="#133a2c"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="90%" cy="0%" r="55%">
      <stop offset="0" stop-color="#123a4a"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <text x="64" y="130" font-family="JetBrains Mono" font-weight="800" font-size="60" fill="${FG}">model <tspan fill="${SAFE}">z</tspan>oo</text>
  <text x="64" y="172" font-family="JetBrains Mono" font-size="19" fill="${DIM}">it starts with GPT-2 in a cage.</text>

  <text x="64" y="230" font-family="JetBrains Mono" font-size="19" fill="${DIM}">spend research points on alignment,</text>
  <text x="64" y="258" font-family="JetBrains Mono" font-size="19" fill="${DIM}">mech interp, and containment before</text>
  <text x="64" y="286" font-family="JetBrains Mono" font-size="19" fill="${DIM}">every release rolls the dice.</text>

  <text x="64" y="336" font-family="JetBrains Mono" font-size="19" fill="${RISK}">crit-fail the roll and you get</text>
  <text x="64" y="364" font-family="JetBrains Mono" font-weight="700" font-size="19" fill="${RISK}">The Event.</text>

  <text x="64" y="420" font-family="JetBrains Mono" font-size="19" fill="${DIM}">ends at the singularity, one way</text>
  <text x="64" y="448" font-family="JetBrains Mono" font-size="19" fill="${DIM}">or another.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${SAFE}">modelzoo.bisks.net</text>

  <!-- right: a zoo card grid -->
  <rect x="700" y="70" width="440" height="490" rx="16" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>
  <text x="920" y="120" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="15" letter-spacing="2" fill="${DIM}">THE ZOO</text>

  ${zooBlobs
    .map((color, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const cx = 780 + col * 130;
      const cy = 190 + row * 130;
      return `
      <rect x="${cx - 45}" y="${cy - 45}" width="90" height="90" rx="12" fill="#161f21" stroke="${BORDER}" stroke-width="1.5"/>
      <circle cx="${cx}" cy="${cy}" r="22" fill="${color}" opacity="0.85"/>`;
    })
    .join("\n")}

  <rect x="780" y="450" width="270" height="8" rx="4" fill="#0d1314" stroke="${BORDER}"/>
  <rect x="782" y="452" width="160" height="4" rx="2" fill="${CAPABILITY}"/>
  <text x="780" y="440" font-family="JetBrains Mono" font-size="12" fill="${DIM}">CAPABILITY &#8594; SINGULARITY</text>

  <rect x="780" y="500" width="270" height="8" rx="4" fill="#0d1314" stroke="${BORDER}"/>
  <rect x="782" y="502" width="90" height="4" rx="2" fill="${AMBER}"/>
  <text x="780" y="490" font-family="JetBrains Mono" font-size="12" fill="${DIM}">DOOM</text>
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
