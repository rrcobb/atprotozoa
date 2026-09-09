// Generates public/og.png — the Open Graph preview card for kidpix.
//
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium/fontconfig needed — the font is
// bundled in ./fonts and loaded explicitly). node_modules + fonts copied in
// from sites/macpaint, which already vendors this. House style:
// self-contained, copy-don't-abstract.
//
//   node og-gen.mjs   # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#2b0f5e";
const RAINBOW = ["#ff3b3b", "#ff9d1f", "#ffe14d", "#4ade4a", "#2fb5ff", "#b06bff"];

let title = "";
const word = "kidpix";
const cw = 78;
for (let i = 0; i < word.length; i++) {
  const x = 64 + i * cw;
  title += `<text x="${x}" y="180" font-family="JetBrains Mono" font-weight="800" font-size="90" fill="${RAINBOW[i % RAINBOW.length]}">${word[i]}</text>`;
}

// a little toolbox of colored "tool" chips — hand-drawn vector doodles
// instead of emoji glyphs, since resvg has no color-emoji font available.
const DOODLES = [
  // pencil (diagonal stroke + tip)
  (c) => `<path d="M-24 20 L-16 4 L14 -24 L26 -12 L-4 16 Z" fill="none" stroke="${c}" stroke-width="6" stroke-linejoin="round"/>`,
  // paintbrush blob + handle
  (c) => `<path d="M-20 24c0-14 8-20 18-20s10 8 8-4-8-16-8-26a10 10 0 0120 0c0 18-10 20-10 34 0 8 6 10 6 10" fill="none" stroke="${c}" stroke-width="6" stroke-linecap="round"/>`,
  // rainbow arc
  (c) => `<path d="M-26 20a26 26 0 0152 0" fill="none" stroke="${c}" stroke-width="7"/><path d="M-16 20a16 16 0 0132 0" fill="none" stroke="${RAINBOW[1]}" stroke-width="6"/><path d="M-6 20a6 6 0 0112 0" fill="none" stroke="${RAINBOW[4]}" stroke-width="5"/>`,
  // paint bucket
  (c) => `<path d="M-20 -6l16-14 20 20-16 14z" fill="${c}" stroke="#1a1a1a" stroke-width="4"/><circle cx="18" cy="20" r="7" fill="${c}" stroke="#1a1a1a" stroke-width="3"/>`,
  // eraser block
  (c) => `<rect x="-22" y="-8" width="44" height="26" rx="4" fill="${c}" stroke="#1a1a1a" stroke-width="4" transform="rotate(-12)"/>`,
  // star stamp
  (c) => { let d = ""; for (let i = 0; i < 10; i++) { const r = i % 2 === 0 ? 26 : 11; const a = (Math.PI / 5) * i - Math.PI / 2; const x = Math.cos(a) * r, y = Math.sin(a) * r; d += (i === 0 ? "M" : "L") + x.toFixed(1) + " " + y.toFixed(1) + " "; } return `<path d="${d}Z" fill="${c}"/>`; },
  // swirl
  (c) => `<path d="M0 0c14 0 22-8 22-18s-10-16-18-10 2 20 16 20 24-12 24-26" fill="none" stroke="${c}" stroke-width="6" stroke-linecap="round"/>`,
  // dynamite stick
  (c) => `<rect x="-10" y="-22" width="20" height="42" rx="6" fill="${c}" stroke="#1a1a1a" stroke-width="4"/><path d="M0 -22 Q10 -30 4 -36" fill="none" stroke="#1a1a1a" stroke-width="4"/><circle cx="4" cy="-37" r="4" fill="${RAINBOW[1]}"/>`,
];
let toolboxSvg = "";
const tbX = 700, tbY = 150, cell = 92, gap = 10;
for (let i = 0; i < DOODLES.length; i++) {
  const col = i % 2, row = Math.floor(i / 2);
  const x = tbX + col * (cell + gap);
  const y = tbY + row * (cell + gap);
  const tint = RAINBOW[i % RAINBOW.length];
  toolboxSvg += `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="14" fill="#fff" stroke="#1a1a1a" stroke-width="4"/>`;
  toolboxSvg += `<g transform="translate(${x + cell / 2} ${y + cell / 2})">${DOODLES[i](tint)}</g>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#diag)" opacity="0.15"/>
  <defs>
    <pattern id="diag" width="48" height="48" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
      <rect width="24" height="48" fill="#ffffff"/>
    </pattern>
  </defs>

  ${title}
  <text x="68" y="230" font-family="JetBrains Mono" font-size="24" fill="#f0e8ff">a Kid Pix 1.0 style paint party</text>

  <text x="68" y="300" font-family="JetBrains Mono" font-size="19" fill="#d9c9ff">Wacky brushes, rubber stamps, a mixer of screen-melting</text>
  <text x="68" y="330" font-family="JetBrains Mono" font-size="19" fill="#d9c9ff">effects, and a dynamite clear button.</text>
  <text x="68" y="380" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="#ffe14d">Every sound effect + the music loop is synthesized</text>
  <text x="68" y="410" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="#ffe14d">live in the browser. No samples. No AI.</text>

  <text x="68" y="560" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="#ffffff">kidpix.bisks.net</text>

  ${toolboxSvg}
</svg>`;

const fontPath = fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url));
const r = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontPath], loadSystemFonts: true, defaultFontFamily: "JetBrains Mono" },
});
const png = r.render().asPng();
const out = new URL("./public/og.png", import.meta.url).pathname;
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");
