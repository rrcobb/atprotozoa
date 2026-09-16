// Generates public/og.png — the Open Graph preview card for chainedemoji.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium/fontconfig needed — font bundled
// in ./fonts and loaded explicitly). Copied and trimmed from
// sites/epitaph/og-gen.mjs.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const cx = W / 2;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="wall" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#171316"/>
      <stop offset="0.55" stop-color="#201a1d"/>
      <stop offset="1" stop-color="#2b2124"/>
    </linearGradient>
    <radialGradient id="spot" cx="0.5" cy="0.42" r="0.5">
      <stop offset="0" stop-color="#fff6d6" stop-opacity="0.20"/>
      <stop offset="1" stop-color="#fff6d6" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#wall)"/>
  <rect x="0" y="${H - 90}" width="${W}" height="90" fill="#0a0708"/>
  <rect x="0" y="0" width="${W}" height="${H - 90}" fill="url(#spot)"/>

  <!-- pedestal -->
  <rect x="${cx - 95}" y="${H - 230}" width="190" height="112" fill="#33373c"/>
  <rect x="${cx - 115}" y="${H - 122}" width="230" height="14" fill="#232629"/>
  <rect x="${cx - 130}" y="${H - 108}" width="260" height="12" fill="#1c1e20"/>

  <!-- low-poly face, offset so it sits above the pedestal -->
  <g transform="translate(${cx - 110}, ${H - 470})">
    <polygon points="110,18 158,44 150,96 110,110" fill="#f4c332"/>
    <polygon points="110,18 62,44 70,96 110,110" fill="#e6ad1f"/>
    <polygon points="158,44 196,92 150,96" fill="#f7d354"/>
    <polygon points="62,44 24,92 70,96" fill="#d99f1c"/>
    <polygon points="150,96 150,140 182,150 132,178 110,150" fill="#f7d354"/>
    <polygon points="70,96 70,140 38,150 88,178 110,150" fill="#e6ad1f"/>
    <polygon points="110,110 150,140 132,178 110,192 88,178 70,140" fill="#f4c332"/>
    <polygon points="86,80 104,74 108,92 90,98" fill="#241a0a"/>
    <ellipse cx="140" cy="86" rx="17" ry="12" fill="#241a0a"/>
    <ellipse cx="145" cy="82" rx="4" ry="3" fill="#fff" opacity="0.7"/>
    <path d="M78,128 Q110,168 150,124 Q132,150 108,150 Q88,150 78,128 Z" fill="#7a1418"/>
    <rect x="90" y="130" width="9" height="13" fill="#fff"/>
    <rect x="101" y="132" width="13" height="9" fill="#fff"/>
    <rect x="116" y="129" width="7" height="16" fill="#fff"/>
    <path d="M64,102 Q56,124 66,140 Q78,124 68,102 Z" fill="#6fc3e8"/>
    <path d="M168,100 Q176,120 166,134 Q156,120 164,100 Z" fill="#6fc3e8"/>
  </g>

  <!-- chain across the pedestal -->
  <g fill="none" stroke="#8a8478" stroke-width="9" opacity="0.95">
    <ellipse cx="${cx - 60}" cy="${H - 175}" rx="24" ry="15" transform="rotate(24 ${cx - 60} ${H - 175})"/>
    <ellipse cx="${cx - 15}" cy="${H - 192}" rx="24" ry="15" transform="rotate(-20 ${cx - 15} ${H - 192})"/>
    <ellipse cx="${cx + 30}" cy="${H - 175}" rx="24" ry="15" transform="rotate(24 ${cx + 30} ${H - 175})"/>
    <ellipse cx="${cx + 75}" cy="${H - 192}" rx="24" ry="15" transform="rotate(-20 ${cx + 75} ${H - 192})"/>
  </g>
  <g transform="translate(${cx - 12}, ${H - 210})">
    <rect x="-18" y="-4" width="36" height="30" rx="5" fill="#b8ac86" stroke="#6b6248" stroke-width="2.5"/>
    <path d="M-10,-4 v-11 a10,10 0 0 1 20,0 v11" fill="none" stroke="#6b6248" stroke-width="5"/>
    <circle cx="0" cy="12" r="4" fill="#3a331f"/>
  </g>

  <text x="${cx}" y="58" text-anchor="middle" font-family="DejaVu Serif" font-weight="700" font-size="15" fill="#c9a15b" letter-spacing="3">SPECIAL CONTAINMENT WING &#183; MUSEUM OF THE INTERNET</text>
  <text x="${cx}" y="100" text-anchor="middle" font-family="DejaVu Serif" font-weight="700" font-size="32" fill="#eef0f3" letter-spacing="0.5">EXHIBIT A: UNTITLED (CRYING-LAUGHING EMOJI)</text>

  <text x="${cx}" y="${H - 56}" text-anchor="middle" font-family="DejaVu Serif" font-size="22" fill="#f5e3e4" font-style="italic">&#8220;kill it kill it kill it KILL IT&#8221;</text>
  <text x="${cx}" y="${H - 24}" text-anchor="middle" font-family="DejaVu Serif" font-weight="700" font-size="20" fill="#eef0f3">chainedemoji.bisks.net</text>
</svg>`;

const fontRegular = fileURLToPath(new URL("./fonts/DejaVuSerif.ttf", import.meta.url));
const fontBold = fileURLToPath(new URL("./fonts/DejaVuSerif-Bold.ttf", import.meta.url));
const r = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontRegular, fontBold], loadSystemFonts: false, defaultFontFamily: "DejaVu Serif" },
});
const png = r.render().asPng();
const out = new URL("./public/og.png", import.meta.url).pathname;
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");
