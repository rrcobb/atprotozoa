// Generates public/og.png — the static Open Graph preview card for cobweb.
// Hand-drawn SVG, rasterised with @resvg/resvg-js (no system Chromium/
// fontconfig needed — the font is bundled in ./fonts). Same recipe as
// sites/skyclone/og-gen.mjs.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#07050a", FG = "#ece7f5", DIM = "#9a8bb0";
const ACCENT = "#b388ff", ACCENT2 = "#7c5cd6", CARD = "#150f1e", BORDER = "#2c2338";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="15%" cy="0%" r="55%">
      <stop offset="0" stop-color="#241a3d"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${ACCENT}"/>
      <stop offset="1" stop-color="${ACCENT2}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>

  <g fill="none" stroke="${ACCENT}" stroke-width="4" stroke-linecap="round" opacity="0.9">
    <path d="M46 78 Q22 60 8 64"/>
    <path d="M46 88 Q18 84 4 90"/>
    <path d="M46 98 Q18 106 6 116"/>
    <path d="M46 106 Q24 122 12 132"/>
    <path d="M82 78 Q106 60 120 64"/>
    <path d="M82 88 Q110 84 124 90"/>
    <path d="M82 98 Q110 106 122 116"/>
    <path d="M82 106 Q104 122 116 132"/>
  </g>
  <ellipse cx="64" cy="104" rx="28" ry="22" fill="${ACCENT}" opacity="0.9"/>
  <circle cx="64" cy="72" r="17" fill="${ACCENT}" opacity="0.9"/>
  <text x="140" y="120" font-family="JetBrains Mono" font-weight="800" font-size="60" fill="url(#title)">cobweb</text>
  <text x="64" y="172" font-family="JetBrains Mono" font-size="20" fill="${DIM}">skyclone, frozen into a browser plugin</text>

  <text x="64" y="240" font-family="JetBrains Mono" font-size="15" fill="${DIM}">No fetch. No host_permissions. No AppView.</text>
  <text x="64" y="266" font-family="JetBrains Mono" font-size="15" fill="${DIM}">Every post is a DATA literal baked into</text>
  <text x="64" y="292" font-family="JetBrains Mono" font-size="15" fill="${DIM}">popup.js — a snapshot, not a stream.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${ACCENT}">bisks.net/cobweb</text>

  <g>
    <rect x="660" y="70" width="470" height="118" rx="14" fill="${CARD}" stroke="${BORDER}"/>
    <circle cx="700" cy="110" r="20" fill="${ACCENT}"/>
    <text x="700" y="117" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="16" fill="${BG}">🕷️</text>
    <text x="732" y="106" font-family="JetBrains Mono" font-weight="700" font-size="15" fill="${FG}">${esc("cobweb")}</text>
    <text x="732" y="126" font-family="JetBrains Mono" font-size="13" fill="${DIM}">${esc("@cobweb.bisks.net")}</text>
    <text x="700" y="162" font-family="JetBrains Mono" font-size="14" fill="${FG}">${esc("const DATA = [ ...six frozen posts ]")}</text>
  </g>
  <g>
    <rect x="660" y="204" width="470" height="118" rx="14" fill="${CARD}" stroke="${BORDER}"/>
    <circle cx="700" cy="244" r="20" fill="${ACCENT2}"/>
    <text x="700" y="251" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="16" fill="${BG}">🧙</text>
    <text x="732" y="240" font-family="JetBrains Mono" font-weight="700" font-size="15" fill="${FG}">${esc("the witch button")}</text>
    <text x="732" y="260" font-family="JetBrains Mono" font-size="13" fill="${DIM}">${esc("still works, purely local")}</text>
    <text x="700" y="296" font-family="JetBrains Mono" font-size="14" fill="${FG}">${esc("burns and vanishes on click")}</text>
  </g>
  <g>
    <rect x="660" y="338" width="470" height="118" rx="14" fill="${CARD}" stroke="${BORDER}"/>
    <circle cx="700" cy="378" r="20" fill="#7ee787"/>
    <text x="700" y="385" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="16" fill="${BG}">🪰</text>
    <text x="732" y="374" font-family="JetBrains Mono" font-weight="700" font-size="15" fill="${FG}">${esc("reposts, still flies")}</text>
    <text x="732" y="394" font-family="JetBrains Mono" font-size="13" fill="${DIM}">${esc("just no live feed behind them")}</text>
    <text x="700" y="430" font-family="JetBrains Mono" font-size="14" fill="${FG}">${esc("manifest v3, zero permissions")}</text>
  </g>
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
