// Generates public/og.png — the static Open Graph preview card for the bare
// bawkchain link. Hand-drawn SVG, rasterised with @resvg/resvg-js and
// skyclone's bundled JetBrains Mono font (no system Chromium/fontconfig
// needed). Same recipe as sites/topchicken/og-gen.mjs, sites/wentviral/og-gen.mjs,
// and sites/didscope/og-gen.mjs.
//
//   node og-gen.mjs   # writes ./public/og.png (borrows resvg + the font
//                      # from sites/skyclone — build-time only, not a
//                      # runtime dependency of this site)

import { Resvg } from "../skyclone/node_modules/@resvg/resvg-js/index.js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const fontPath = fileURLToPath(new URL("../skyclone/fonts/JetBrainsMono.ttf", import.meta.url));

const W = 1200, H = 630;
const BG = "#14100c", INK = "#f3ead9", MUTED = "#a4917a";
const ACCENT = "#d4af37", LIKE = "#ff5c6c", CHAIN = "#6fe3c4";
const CARD = "#1f1811", BORDER = "#3a2c1c";

// A little painterly blob standing in for an oil-painted portrait — avoids
// relying on emoji glyphs, which the JetBrains Mono build here can't shape
// (see sites/topchicken/public/og.png for the tofu-box result of trying).
function frame(x, y, size, hue) {
  const fw = size * 0.12;
  const cx = x + fw + size / 2, cy = y + fw + size / 2;
  return `
  <g>
    <rect x="${x}" y="${y}" width="${size + fw * 2}" height="${size + fw * 2}" rx="6" fill="#c79a3a"/>
    <rect x="${x + fw * 0.4}" y="${y + fw * 0.4}" width="${size + fw * 1.2}" height="${size + fw * 1.2}" rx="4" fill="#8a6a2c"/>
    <rect x="${x + fw}" y="${y + fw}" width="${size}" height="${size}" fill="${CARD}"/>
    <ellipse cx="${cx}" cy="${cy + size * 0.08}" rx="${size * 0.3}" ry="${size * 0.34}" fill="${hue}" opacity="0.9"/>
    <ellipse cx="${cx - size * 0.08}" cy="${cy - size * 0.22}" rx="${size * 0.14}" ry="${size * 0.13}" fill="${hue}" opacity="0.75"/>
    <path d="M ${cx + size * 0.02} ${cy - size * 0.3} l ${size * 0.14} ${-size * 0.06} l ${-size * 0.02} ${size * 0.14} z" fill="#e2571f"/>
  </g>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="50%" cy="-5%" r="60%">
      <stop offset="0" stop-color="#3a2810"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>

  <text x="60" y="118" font-family="JetBrains Mono" font-weight="800" font-size="60" fill="${ACCENT}">bawkchain</text>
  <text x="64" y="160" font-family="JetBrains Mono" font-size="21" fill="${MUTED}">oil paintings of Top Chicken winners, hash-chained</text>

  ${frame(64, 210, 140, "#e8b923")}
  ${frame(232, 210, 140, "#d97a4a")}
  ${frame(400, 210, 140, "#e8b923")}

  <text x="590" y="260" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${INK}">block #54 · @sneptech.bsky.social</text>
  <text x="590" y="294" font-family="JetBrains Mono" font-size="20" fill="${LIKE}">2939 likes</text>
  <text x="590" y="326" font-family="JetBrains Mono" font-size="16" fill="${CHAIN}">hash 7f3a91cd2e8b4f10…</text>
  <text x="590" y="352" font-family="JetBrains Mono" font-size="16" fill="${CHAIN}">prev 0c88de41a9276b53…</text>

  <text x="590" y="410" font-family="JetBrains Mono" font-size="19" fill="${MUTED}">Every winner @topchicken.bsky.social has crowned,</text>
  <text x="590" y="436" font-family="JetBrains Mono" font-size="19" fill="${MUTED}">oil-painted from their avatar and minted onto a</text>
  <text x="590" y="462" font-family="JetBrains Mono" font-weight="700" font-size="19" fill="${ACCENT}">fully client-side, fully reproducible hash chain.</text>

  <rect x="64" y="522" width="1072" height="1" fill="${BORDER}"/>
  <text x="64" y="588" font-family="JetBrains Mono" font-size="16" fill="${MUTED}">bisks.net/bawkchain</text>
</svg>`;

const resvg = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
});
const png = resvg.render().asPng();
const out = fileURLToPath(new URL("./public/og.png", import.meta.url));
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");
