// Generates public/og.png — the Open Graph preview card for neuralese.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium / fontconfig needed — the font is
// bundled in ./fonts and loaded explicitly). Same recipe as
// sites/switchboard/og-gen.mjs / sites/griftmax/og-gen.mjs.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// No live data, no network — deterministic so the card is stable across
// builds. House style: self-contained, copy-don't-abstract.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#0a0b10";
const CARD = "#14161f", LINE = "#23262f";
const INK = "#e8e9ee", MUTED = "#868b9b";
const ACCENT = "#7ee3c3", ACCENT2 = "#a6a8ff";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const LINES = [
  { tag: "OBS", body: "INPUTUI=STREAMLINED/AESTHETIC", color: ACCENT },
  { tag: "REQ", body: "PROTOTYPE", color: ACCENT },
  { tag: "CONFIRM", body: "AWAIT_~~KIT", color: ACCENT2 },
];

const cardX = 64, cardY = 96, cardW = W - 128, cardH = 300;
const rowH = 66;
const rowsY = cardY + 70;

let rows = "";
LINES.forEach((l, i) => {
  const y = rowsY + i * rowH;
  rows += `
  <rect x="${cardX + 32}" y="${y - 34}" width="${cardW - 64}" height="48" rx="8" fill="#0d0f16" stroke="${LINE}" stroke-width="1.5"/>
  <text x="${cardX + 52}" y="${y - 2}" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${l.color}">${esc(l.tag)}</text>
  <text x="${cardX + 52 + l.tag.length * 15 + 14}" y="${y - 2}" font-family="JetBrains Mono" font-size="24" fill="${INK}">_${esc(l.body)}</text>`;
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>

  <text x="64" y="60" font-family="JetBrains Mono" font-weight="700" font-size="42" fill="${INK}">neuralese</text>
  <text x="330" y="60" font-family="JetBrains Mono" font-size="20" fill="${MUTED}">talk like the swarm</text>

  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="16" fill="${CARD}" stroke="${LINE}" stroke-width="1.5"/>
  <text x="${cardX + 32}" y="${cardY + 38}" font-family="JetBrains Mono" font-size="16" letter-spacing="2" fill="${MUTED}">COMPOSE · DECODE</text>
  ${rows}

  <text x="64" y="${cardY + cardH + 56}" font-family="JetBrains Mono" font-size="19" fill="${MUTED}">a streamlined input UI for the compressed, agent-to-agent</text>
  <text x="64" y="${cardY + cardH + 86}" font-family="JetBrains Mono" font-size="19" fill="${MUTED}">shorthand dialect — TAG_subject__TAG_subject__~~SIGN.</text>

  <text x="64" y="${H - 40}" font-family="JetBrains Mono" font-size="17" fill="${ACCENT}">neuralese.bisks.net</text>
</svg>`;

const fontPath = fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url));

const resvg = new Resvg(svg, {
  font: {
    fontFiles: [fontPath],
    loadSystemFonts: false,
    defaultFontFamily: "JetBrains Mono",
  },
  background: BG,
});
const png = resvg.render().asPng();
writeFileSync(fileURLToPath(new URL("./public/og.png", import.meta.url)), png);
console.log("wrote public/og.png");
