// Generates public/og.png — the static Open Graph preview card for duochain
// (the generic, non-per-result card; per-post share cards are drawn live,
// client-side, in public/index.html's drawShareCard). Hand-drawn SVG at the
// canonical OG size, rasterised with @resvg/resvg-js (pure native module, no
// system Chromium/fontconfig needed — the font is bundled in ./fonts and
// loaded explicitly). Adapted from sites/grue/og-gen.mjs.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#08070c", INK = "#efe9f7", MUTED = "#93899f", FAINT = "#2a2436", FAINTBG = "#120e19";
const A = "#ff6fae", B = "#5fd1ff";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function wrapLines(text, maxChars) {
  const words = text.split(" ");
  const lines = [];
  let line = "";
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (line && test.length > maxChars) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

const sample =
  "the two of us agreed it was, in fact, a normal amount of posting for a tuesday, and then kept going anyway";
const sampleLines = wrapLines(sample, 40);

const cardX = 60, cardY = 250, cardW = W - 120, cardH = H - 340;
const lineH = 34;
let textY = cardY + 56;
const textSvg = sampleLines
  .slice(0, 6)
  .map((l, i) => `<text x="${cardX + 40}" y="${textY + i * lineH}" font-family="JetBrains Mono" font-size="26" fill="${INK}">${esc(l)}</text>`)
  .join("\n    ");

// Two overlapping avatar-placeholder circles (A/B) up top, echoing the
// live page's out-avatars, plus a small A→B gradient dot ring standing in
// for the blend slider.
const dots = Array.from({ length: 10 }, (_, i) => {
  const t = i / 9;
  const x = 640 + i * 46;
  const color = t < 0.5 ? A : B;
  return `<circle cx="${x}" cy="34" r="6" fill="${color}" opacity="${0.25 + 0.55 * (i % 2 === 0 ? 1 : 0.6)}"/>`;
}).join("\n  ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="ab" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${A}"/>
      <stop offset="1" stop-color="${B}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="10" fill="url(#ab)"/>
  <rect y="${H - 10}" width="${W}" height="10" fill="url(#ab)"/>

  ${dots}

  <circle cx="70" cy="180" r="26" fill="${FAINTBG}" stroke="${A}" stroke-width="3"/>
  <circle cx="106" cy="180" r="26" fill="${FAINTBG}" stroke="${B}" stroke-width="3"/>

  <text x="60" y="100" font-family="JetBrains Mono" font-weight="800" font-size="52" fill="${INK}">duochain</text>
  <text x="140" y="186" font-family="JetBrains Mono" font-size="18" fill="${MUTED}">two accounts, one Markov chain</text>

  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="16" fill="${FAINTBG}" stroke="${FAINT}" stroke-width="1.5"/>
  ${textSvg}

  <text x="60" y="${H - 40}" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${B}">duochain.bisks.net</text>
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
