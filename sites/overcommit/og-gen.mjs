// Generates public/og.png — the static OG/Twitter preview card for
// overcommit. Hand-drawn SVG at the canonical 1200x630 OG size, rasterised
// with @resvg/resvg-js (same recipe as sites/didscope/og-gen.mjs — no system
// fontconfig on this box, so JetBrains Mono is bundled in ./fonts and loaded
// explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#0b0b10", ASPHALT = "#1a1a24", LINE = "#2a2a38", FG = "#eef0ff", DIM = "#8d8fa8";
const YELLOW = "#e8ff3d", PINK = "#ff3df0", BLUE = "#37e0ff";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const cardX = 64, cardY = 300, cardW = W - 128, cardH = 250;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="10%" cy="0%" r="60%">
      <stop offset="0" stop-color="#3a2a00" stop-opacity=".6"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="95%" cy="10%" r="55%">
      <stop offset="0" stop-color="#001a2a" stop-opacity=".6"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <text x="64" y="120" font-family="JetBrains Mono" font-weight="800" font-size="64" fill="${YELLOW}">&lt;overcommit/&gt;</text>
  <text x="64" y="164" font-family="JetBrains Mono" font-size="24" fill="${DIM}">an AI coding agent grinds the live Bluesky firehose</text>

  <text x="64" y="230" font-family="JetBrains Mono" font-size="19" fill="${DIM}">Every real post on Jetstream v2 becomes a trick. Chain a combo live —</text>
  <text x="64" y="258" font-family="JetBrains Mono" font-size="19" fill="${DIM}">when the firehose really spikes, it lands the impossible one.</text>

  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="14" fill="${ASPHALT}" stroke="${LINE}" stroke-width="1.5"/>
  <line x1="${cardX + 30}" y1="${cardY + cardH / 2}" x2="${cardX + cardW - 30}" y2="${cardY + cardH / 2}" stroke="${YELLOW}" stroke-width="4" stroke-dasharray="18,12" opacity=".5"/>

  <text x="${cardX + 40}" y="${cardY + 60}" font-family="JetBrains Mono" font-weight="800" font-size="15" letter-spacing="2" fill="${PINK}">THE IMPOSSIBLE COMBO</text>
  <text x="${cardX + 40}" y="${cardY + 118}" font-family="JetBrains Mono" font-weight="800" font-size="40" fill="${FG}">Indy Nosebone</text>
  <text x="${cardX + 40}" y="${cardY + 170}" font-family="JetBrains Mono" font-weight="800" font-size="40" fill="${BLUE}">50-50 FS Rail Grind</text>
  <text x="${cardX + 40}" y="${cardY + 216}" font-family="JetBrains Mono" font-size="16" fill="${DIM}">you cannot actually grab and grind at once. that's the point.</text>

  <text x="64" y="${H - 40}" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${YELLOW}">overcommit.bisks.net</text>
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
