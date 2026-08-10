// Generates public/og.png — the Open Graph preview card for dosimeter.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium / fontconfig needed — the font is
// bundled in ./fonts and loaded explicitly). Copied from
// sites/thrashradar/og-gen.mjs (that site's own lineage cites
// sites/thrashmeter/og-gen.mjs, sites/intrigue/og-gen.mjs, sites/didscope's
// before that).
//
//   node og-gen.mjs   # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run by hand if the
// artwork changes. (No emoji glyphs here — JetBrains Mono alone can't
// render them, so the radiation-symbol motif from the page title is
// redrawn as plain shapes instead.)

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#060a08", FG = "#dcffe6", DIM = "#6f9c81";
const ACCENT = "#39ff6a", ACCENT2 = "#ffcf3d", DANGER = "#ff5b5b";
const CARD = "#0c1410", BORDER = "#1c3226";

const cx = 900, cy = 430, r = 150;

// three 60-degree arc bands over the top semicircle, same geometry as the
// live dial in public/index.html
function arcPoint(deg) {
  const rad = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy - r * Math.sin(rad)];
}
const [x180, y180] = arcPoint(180);
const [x120, y120] = arcPoint(120);
const [x60, y60] = arcPoint(60);
const [x0, y0] = arcPoint(0);

const needleAngle = -90 + (68 / 100) * 180; // a "hot" reading for the card
const nx = cx + (r - 55) * Math.sin((needleAngle * Math.PI) / 180);
const ny = cy - (r - 55) * Math.cos((needleAngle * Math.PI) / 180);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="10%" cy="-10%" r="60%">
      <stop offset="0" stop-color="#0e2617"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="95%" cy="5%" r="55%">
      <stop offset="0" stop-color="#201a05"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${ACCENT}"/>
      <stop offset="1" stop-color="${ACCENT2}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <text x="64" y="150" font-family="JetBrains Mono" font-weight="800" font-size="64" fill="url(#title)">dosimeter</text>
  <text x="64" y="200" font-family="JetBrains Mono" font-size="22" fill="${DIM}">a Geiger counter for the</text>
  <text x="64" y="230" font-family="JetBrains Mono" font-size="22" fill="${DIM}">bsky firehose</text>

  <text x="64" y="310" font-family="JetBrains Mono" font-size="18" fill="${DIM}">Watches live posts, tracks which</text>
  <text x="64" y="336" font-family="JetBrains Mono" font-size="18" fill="${DIM}">words and hashtags are running hot</text>
  <text x="64" y="362" font-family="JetBrains Mono" font-size="18" fill="${DIM}">against their own normal rate.</text>

  <text x="64" y="480" font-family="JetBrains Mono" font-weight="800" font-size="42" fill="${DANGER}">"nvidia" — 6.4x normal</text>
  <text x="64" y="514" font-family="JetBrains Mono" font-size="17" fill="${DIM}">a live example of a flagged situation</text>

  <text x="64" y="580" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${ACCENT2}">dosimeter.bisks.net</text>

  <rect x="720" y="290" width="360" height="280" rx="18" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>

  <path d="M ${x180} ${y180} A ${r} ${r} 0 0 1 ${x120} ${y120}" fill="none" stroke="${ACCENT}" stroke-width="20" stroke-linecap="round" opacity="0.6"/>
  <path d="M ${x120} ${y120} A ${r} ${r} 0 0 1 ${x60} ${y60}" fill="none" stroke="${ACCENT2}" stroke-width="20" stroke-linecap="round" opacity="0.6"/>
  <path d="M ${x60} ${y60} A ${r} ${r} 0 0 1 ${x0} ${y0}" fill="none" stroke="${DANGER}" stroke-width="20" stroke-linecap="round" opacity="0.6"/>
  <line x1="${cx}" y1="${cy}" x2="${nx.toFixed(1)}" y2="${ny.toFixed(1)}" stroke="${FG}" stroke-width="5" stroke-linecap="round"/>
  <circle cx="${cx}" cy="${cy}" r="9" fill="${FG}"/>
  <text x="${cx}" y="${cy + 60}" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="16" letter-spacing="2" fill="${DANGER}">HOT</text>
</svg>`;

const fontPath = fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url));
const r_ = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
});
const png = r_.render().asPng();
const out = new URL("./public/og.png", import.meta.url).pathname;
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");
