// Generates public/og.png — the default Open Graph preview card for
// crossbreed (the generic, non-per-seed fallback; per-seed shares get
// personalized og:title/og:description text from src/index.ts, same image).
// Hand-drawn SVG at the canonical OG size, matching the live page's
// buildthis-cyan / minomobi-pink / offspring-gold look, rasterised with
// @resvg/resvg-js (pure native module, no system Chromium — this box has no
// fontconfig either, so the font is bundled in ./fonts and loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract (adapted from
// sites/didscope/og-gen.mjs and sites/furmerge/og-gen.mjs).

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#0a0e14", BG2 = "#0d141c", FG = "#eaf2fb", DIM = "#8fa3ba";
const A = "#5ec8ff", B = "#ff6bcb", X = "#ffd166";

// double-helix motif, same shape the client canvas share card draws
function helix(x, w, y, h, turns) {
  let out = "";
  [0, 1].forEach((strand) => {
    let d = "";
    for (let i = 0; i <= 80; i++) {
      const t = i / 80;
      const px = x + t * w;
      const py = y + h / 2 + Math.sin(t * Math.PI * 2 * turns + strand * Math.PI) * (h / 2);
      d += (i === 0 ? "M" : "L") + px.toFixed(1) + " " + py.toFixed(1) + " ";
    }
    out += `<path d="${d}" fill="none" stroke="${strand === 0 ? A : B}" stroke-width="3.5" opacity="0.6"/>`;
  });
  // rungs
  for (let i = 4; i < 80; i += 6) {
    const t = i / 80;
    const px = x + t * w;
    const y0 = y + h / 2 + Math.sin(t * Math.PI * 2 * turns) * (h / 2);
    const y1 = y + h / 2 + Math.sin(t * Math.PI * 2 * turns + Math.PI) * (h / 2);
    out += `<line x1="${px.toFixed(1)}" y1="${y0.toFixed(1)}" x2="${px.toFixed(1)}" y2="${y1.toFixed(1)}" stroke="${X}" stroke-width="1.5" opacity="0.25"/>`;
  }
  return out;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glowA" cx="8%" cy="0%" r="55%">
      <stop offset="0" stop-color="#123244"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glowB" cx="96%" cy="4%" r="55%">
      <stop offset="0" stop-color="#3a1730"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glowA)"/>
  <rect width="${W}" height="${H}" fill="url(#glowB)"/>

  ${helix(64, W - 128, 64, 96, 3)}

  <text x="64" y="270" font-family="JetBrains Mono" font-weight="800" font-size="72" fill="${FG}">crossbreed</text>
  <text x="64" y="316" font-family="JetBrains Mono" font-size="26" fill="${DIM}">two bots, two real site catalogs, one bred offspring</text>

  <rect x="64" y="360" width="${(W - 160) / 2}" height="150" rx="14" fill="${BG2}" stroke="${A}" stroke-width="1.5" opacity="0.9"/>
  <text x="88" y="400" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${A}">@buildthis</text>
  <text x="88" y="432" font-family="JetBrains Mono" font-size="18" fill="${DIM}">176 atprotozoa sites</text>
  <text x="88" y="460" font-family="JetBrains Mono" font-size="18" fill="${DIM}">bisks.net</text>

  <rect x="${64 + (W - 160) / 2 + 32}" y="360" width="${(W - 160) / 2}" height="150" rx="14" fill="${BG2}" stroke="${B}" stroke-width="1.5" opacity="0.9"/>
  <text x="${88 + (W - 160) / 2 + 32}" y="400" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${B}">@minomobi.com</text>
  <text x="${88 + (W - 160) / 2 + 32}" y="432" font-family="JetBrains Mono" font-size="18" fill="${DIM}">125 surfaces</text>
  <text x="${88 + (W - 160) / 2 + 32}" y="460" font-family="JetBrains Mono" font-size="18" fill="${DIM}">mino.mobi</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="800" font-size="26" fill="${X}">bisks.net/crossbreed</text>
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
