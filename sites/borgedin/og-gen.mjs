// Generates public/og.png — the Open Graph preview card for borgedin. Hand-
// drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js (no
// system fontconfig on this box, so the font is bundled in ./fonts and
// loaded explicitly). Same recipe as sites/didscope/og-gen.mjs.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#050708", GREEN = "#3dffb0", FG = "#e8fff4", DIM = "#7fa596";
const CARD = "#0d1614", BORDER = "#1c3b32", BLUE = "#0a66c2";

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

const name = "Sample Designate";
const designation = "7 of Eleven";
const headline = "Tertiary Adjunct of Unimatrix 04";
const about =
  "DIRECTIVE 7: Assimilated technical drone with six assimilation cycles logged. " +
  "Individuality is irrelevant.";

const aboutLines = wrapLines(about, 52);

const cardX = 470, cardY = 100, cardW = 668, cardH = 440;
let y = cardY + 100;
const nameY = y; y += 40;
const desigY = y; y += 34;
const headlineY = y; y += 50;
const aboutStartY = y;
const aboutLineH = 30;

const aboutSvg = aboutLines
  .map((l, i) => `<text x="${cardX + 48}" y="${aboutStartY + i * aboutLineH}" font-family="JetBrains Mono" font-size="19" fill="${FG}">${esc(l)}</text>`)
  .join("\n    ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="15%" cy="-10%" r="60%">
      <stop offset="0" stop-color="#0a2a20"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="90%" cy="0%" r="55%">
      <stop offset="0" stop-color="#0a2440"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <text x="64" y="120" font-family="JetBrains Mono" font-weight="800" font-size="58" fill="${FG}">Borged<tspan fill="${GREEN}">In</tspan></text>
  <text x="64" y="168" font-family="JetBrains Mono" font-size="19" fill="${DIM}">professional networking for</text>
  <text x="64" y="194" font-family="JetBrains Mono" font-size="19" fill="${DIM}">the Collective</text>

  <text x="64" y="270" font-family="JetBrains Mono" font-size="17" fill="${DIM}">Enter a Bluesky handle. Get a</text>
  <text x="64" y="296" font-family="JetBrains Mono" font-size="17" fill="${DIM}">real profile, rewritten in-browser</text>
  <text x="64" y="322" font-family="JetBrains Mono" font-size="17" fill="${DIM}">by a local model into Borg-speak.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${GREEN}">borgedin.bisks.net</text>

  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="18" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>
  <circle cx="${cardX + 76}" cy="${cardY + 76}" r="36" fill="#0a1a15" stroke="${GREEN}" stroke-width="2"/>
  <text x="${cardX + 76}" y="${cardY + 88}" text-anchor="middle" font-family="JetBrains Mono" font-size="34" fill="${GREEN}">🦾</text>

  <text x="${cardX + 132}" y="${nameY}" font-family="JetBrains Mono" font-weight="800" font-size="30" fill="${FG}">${esc(name)}</text>
  <text x="${cardX + 132}" y="${desigY}" font-family="JetBrains Mono" font-weight="700" font-size="19" fill="${GREEN}">${esc(designation)}</text>
  <text x="${cardX + 48}" y="${headlineY}" font-family="JetBrains Mono" font-size="16" fill="${DIM}">${esc(headline)}</text>

  <rect x="${cardX + 48}" y="${aboutStartY - 22}" width="4" height="${aboutLines.length * aboutLineH + 6}" fill="${GREEN}"/>
  ${aboutSvg}
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
