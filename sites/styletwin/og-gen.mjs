// Generates public/og.png — the Open Graph preview card for styletwin, so a
// shared link auto-renders a picture of the score in Bluesky / other
// unfurlers. Hand-drawn SVG at the canonical OG size, matching the live
// page's dark teal/violet look, rasterised with @resvg/resvg-js (pure native
// module, no system Chromium needed — this box has no fontconfig/system
// fonts either, so the font is bundled in ./fonts and loaded explicitly).
//
//   cp -r ../didscope/node_modules .   # one-time, not a project dependency (gitignored)
//   node og-gen.mjs                    # writes ./public/og.png
//
// A generic sample score (not tied to any real handle) — this is the static
// fallback card for the bare link. Per-comparison share cards are generated
// live, client-side, in public/index.html (buildShareCard).
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#070a12", FG = "#eef3fb", DIM = "#98a5bd", MUTED = "#616f88";
const ACCENT = "#2dd4bf", HIGHLIGHT = "#a78bfa", CARD = "#101828", BORDER = "#223049";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const cardX = 60, cardY = 220, cardW = W - 120, cardH = H - 280;

// generic sample score for the fallback card
const overall = 61;
const verdict = "Kindred-ish";
const blurb = "some real overlap, some real gaps — enter your own handle to find out.";

const meterX = cardX + 60, meterY = cardY + 96, meterW = cardW - 120, meterH = 14;

const axes = [
  ["length", 0.7],
  ["caps", 0.55],
  ["punct.", 0.4],
  ["emoji", 0.8],
  ["rhythm", 0.5],
];
const axesGap = 14;
const axesW = (cardW - 96 - axesGap * (axes.length - 1)) / axes.length;
const axesY = cardY + 210, axesH = 70;
const axesSvg = axes
  .map(([label, v], i) => {
    const ax = cardX + 48 + i * (axesW + axesGap);
    const bh = Math.max(4, v * axesH);
    return `
    <rect x="${ax}" y="${axesY + axesH - bh}" width="${axesW}" height="${bh}" rx="5" fill="${i % 2 === 0 ? ACCENT : HIGHLIGHT}"/>
    <text x="${ax + axesW / 2}" y="${axesY + axesH + 22}" text-anchor="middle" font-family="JetBrains Mono" font-size="13" fill="${MUTED}">${esc(label)}</text>`;
  })
  .join("\n");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="12%" cy="-10%" r="60%">
      <stop offset="0" stop-color="#123a36"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="92%" cy="0%" r="55%">
      <stop offset="0" stop-color="#2f2050"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${ACCENT}"/>
      <stop offset="1" stop-color="${HIGHLIGHT}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <text x="60" y="100" font-family="JetBrains Mono" font-weight="800" font-size="52" fill="url(#title)">styletwin</text>
  <text x="60" y="150" font-family="JetBrains Mono" font-size="21" fill="${DIM}">how close is your posting style</text>
  <text x="60" y="178" font-family="JetBrains Mono" font-size="21" fill="${DIM}">to cee.wtf's?</text>

  <text x="60" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT}">styletwin.bisks.net</text>

  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="18" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>

  <text x="${cardX + cardW / 2}" y="${cardY + 68}" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="58" fill="url(#title)">${overall}%</text>
  <text x="${cardX + cardW / 2}" y="${cardY + 96}" text-anchor="middle" font-family="JetBrains Mono" font-size="15" fill="${MUTED}">style match with cee.wtf</text>

  <rect x="${meterX}" y="${meterY + 20}" width="${meterW}" height="${meterH}" rx="7" fill="rgba(255,255,255,0.06)"/>
  <rect x="${meterX}" y="${meterY + 20}" width="${meterW * (overall / 100)}" height="${meterH}" rx="7" fill="url(#title)"/>

  ${axesSvg}

  <text x="${cardX + 48}" y="${cardY + 320}" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${FG}">${esc(verdict)}</text>
  <text x="${cardX + 48}" y="${cardY + 348}" font-family="JetBrains Mono" font-size="15" fill="${MUTED}">${esc(blurb)}</text>
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
