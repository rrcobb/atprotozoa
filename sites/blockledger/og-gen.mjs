// Generates public/og.png — the static Open Graph preview card for the bare
// blockledger link. Hand-drawn SVG at the canonical OG size, rasterised with
// @resvg/resvg-js (pure native module, no system Chromium/fontconfig needed
// here — the font is bundled in ./fonts and loaded explicitly). Per-result
// share cards are generated live, client-side, in public/index.html
// (buildShareCard); this is only the generic fallback for an un-personalized
// link. Copied and trimmed from sites/didscope/og-gen.mjs.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#ffffff", INK = "#111111", MUTED = "#6b6b6b", FAINT = "#e4e4e4";
const ACCENT = "#1a5fd0", BAD = "#b3261e";

// Fabricated example handles, not tied to any real account — same reasoning
// as didscope/og-gen.mjs's sample reading: this is a generic static fallback
// card, not a real result, so it shouldn't bake in anyone's actual data.
const rows = [
  ["moot.example", "buddy.example"],
  ["pal.example", "friend.example"],
];

let rowsSvg = "";
const startY = 330, rowH = 120;
rows.forEach(([a, b], i) => {
  const y = startY + i * rowH;
  rowsSvg += `
  <circle cx="76" cy="${y}" r="17" fill="${FAINT}"/>
  <text x="104" y="${y + 8}" font-family="JetBrains Mono" font-weight="700" font-size="26" fill="${INK}">@${a}</text>
  <text x="104" y="${y + 40}" font-family="JetBrains Mono" font-weight="700" font-size="19" fill="${BAD}">blocks ↓</text>
  <circle cx="76" cy="${y + 66}" r="17" fill="${FAINT}"/>
  <text x="104" y="${y + 74}" font-family="JetBrains Mono" font-weight="700" font-size="26" fill="${INK}">@${b}</text>
  <line x1="60" y1="${y + 100}" x2="${W - 60}" y2="${y + 100}" stroke="${FAINT}" stroke-width="1"/>`;
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect x="0" y="0" width="${W}" height="6" fill="${ACCENT}"/>

  <text x="60" y="100" font-family="JetBrains Mono" font-weight="800" font-size="58" fill="${INK}">blockledger</text>
  <text x="60" y="140" font-family="JetBrains Mono" font-size="22" fill="${MUTED}">who blocks who in your circle</text>

  <text x="60" y="220" font-family="JetBrains Mono" font-size="18" fill="${MUTED}">Your mutuals are supposed to be your people.</text>
  <text x="60" y="248" font-family="JetBrains Mono" font-size="18" fill="${MUTED}">blockledger checks whether any of them quietly</text>
  <text x="60" y="276" font-family="JetBrains Mono" font-size="18" fill="${MUTED}">block each other.</text>

  ${rowsSvg}

  <text x="60" y="590" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${ACCENT}">blockledger.bisks.net</text>
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
