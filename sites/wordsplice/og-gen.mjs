// Generates public/og.png — the static Open Graph preview card for
// WordSplice. Hand-drawn SVG at the canonical OG size, rasterised with
// @resvg/resvg-js (no system fonts in this box, so DejaVu Serif is bundled in
// ./fonts and loaded explicitly). Copied and trimmed from
// sites/splicepedia/og-gen.mjs, reskinned for the word-level ransom-note look.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const CORK = "#7a5a3a", CORK_DARK = "#5e4429";
const INK = "#202122", MUTED = "#f3ead2", RED = "#ab1f24";
const PAPERS = ["#fdf6e3", "#f3ead2", "#eee2c8"];

// A representative fake splice, hand-picked to sell the joke at a glance —
// same idea as the sentence-level clippings on splicepedia's card, just one
// word each, with the "torn from an article" caption underneath.
const clips = [
  { word: "The", rot: -4, source: "Beaver" },
  { word: "reign", rot: 3, source: "Xu Pingjun" },
  { word: "was", rot: -2, source: "Stoicism" },
  { word: "widely", rot: 5, source: "Locomotive" },
  { word: "spliced", rot: -3, source: "Malware" },
  { word: "into", rot: 2, source: "Kimchi-jjigae" },
];

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const SLOT_W = (W - 128) / clips.length;
const clipY = 300;
const clipRows = clips
  .map((c, i) => {
    const paper = PAPERS[i % PAPERS.length];
    const fontSize = 32;
    const textW = c.word.length * fontSize * 0.56 + 32;
    const cx = 64 + SLOT_W * i + SLOT_W / 2;
    return `
    <g transform="translate(${cx}, ${clipY}) rotate(${c.rot})">
      <rect x="${-textW / 2}" y="-46" width="${textW}" height="58" rx="3" fill="${paper}" stroke="rgba(0,0,0,0.25)" stroke-width="1.5"/>
      <text x="0" y="-8" text-anchor="middle" font-family="DejaVu Serif" font-weight="700" font-size="${fontSize}" fill="#1a1a1a">${esc(c.word)}</text>
    </g>
    <text x="${cx}" y="${clipY + 42}" text-anchor="middle" font-family="DejaVu Serif" font-size="12.5" fill="${MUTED}" opacity="0.85">from “${esc(c.source)}”</text>`;
  })
  .join("\n");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${CORK}"/>
  <rect width="${W}" height="${H}" fill="url(#texture)" opacity="0.5"/>
  <defs>
    <pattern id="texture" width="14" height="14" patternUnits="userSpaceOnUse">
      <circle cx="3" cy="3" r="1.1" fill="rgba(0,0,0,0.18)"/>
      <circle cx="9" cy="9" r="1.1" fill="rgba(255,255,255,0.06)"/>
    </pattern>
  </defs>
  <rect width="${W}" height="10" fill="${CORK_DARK}"/>

  <rect x="48" y="48" width="${W - 96}" height="112" rx="4" fill="#fdf6e3" stroke="rgba(0,0,0,0.25)" stroke-width="1.5" transform="rotate(-1 ${W / 2} 104)"/>
  <text x="80" y="128" font-family="DejaVu Serif" font-weight="700" font-size="58" fill="${INK}" transform="rotate(-1 ${W / 2} 104)">WordSplice</text>

  <text x="64" y="220" font-family="DejaVu Serif" font-size="24" fill="${MUTED}">splicepedia's successor, one level down — every WORD is real</text>

  ${clipRows}

  <text x="64" y="420" font-family="DejaVu Serif" font-size="20" fill="${MUTED}">Every word is verbatim from a different Wikipedia article, beam-searched into a real grammar slot.</text>
  <text x="64" y="452" font-family="DejaVu Serif" font-size="20" fill="${MUTED}">Click “show clippings” to see where each one was cut from.</text>

  <text x="64" y="560" font-family="DejaVu Serif" font-weight="700" font-size="30" fill="#ffd27a">wordsplice.bisks.net</text>
</svg>`;

const fontRegular = fileURLToPath(new URL("./fonts/DejaVuSerif.ttf", import.meta.url));
const fontBold = fileURLToPath(new URL("./fonts/DejaVuSerif-Bold.ttf", import.meta.url));
const r = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontRegular, fontBold], loadSystemFonts: false, defaultFontFamily: "DejaVu Serif" },
});
const png = r.render().asPng();
const out = fileURLToPath(new URL("./public/og.png", import.meta.url));
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");
