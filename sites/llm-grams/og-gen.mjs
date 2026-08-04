// Generates public/og.png — the Open Graph preview card for llm-grams, a
// hand-drawn SVG mock of the live chart (flat lines, one dramatic spike),
// rasterised with @resvg/resvg-js — same approach as sites/didscope/og-gen.mjs.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run by hand if the
// artwork changes.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#0d0d0d", CARD = "#1a1a19", BORDER = "#2c2c2a";
const FG = "#ffffff", DIM = "#c3c2b7", MUTED = "#898781";
const BLUE = "#3987e5", ORANGE = "#d95926", AQUA = "#199e70";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Chart panel geometry.
const cx = 470, cy = 90, cw = 668, ch = 420;
const px0 = cx + 40, px1 = cx + cw - 30;
const py0 = cy + 30, py1 = cy + ch - 40;

function pt(fracX, fracY) {
  const x = px0 + fracX * (px1 - px0);
  const y = py1 - fracY * (py1 - py0);
  return [x, y];
}

// "delve" — a slow-then-steep logistic-ish rise.
const delvePts = [0, 0.03, 0.05, 0.08, 0.14, 0.28, 0.5, 0.7, 0.82, 0.88, 0.9, 0.92]
  .map((v, i) => pt(i / 11, v));
// "boasts" — a gentler rise, stays lower.
const boastsPts = [0, 0.02, 0.03, 0.05, 0.08, 0.14, 0.24, 0.34, 0.4, 0.44, 0.47, 0.5]
  .map((v, i) => pt(i / 11, v));
// "wearing a trenchcoat" — flat, then a wild last-instant spike.
const trenchPts = [0.01, 0.01, 0.01, 0.02, 0.01, 0.02, 0.01, 0.02, 0.01, 0.02, 0.05, 1.0]
  .map((v, i) => pt(i / 11, v));

const toPath = (pts) => pts.map((p, i) => (i === 0 ? "M" : "L") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");

const gridLines = [0, 0.25, 0.5, 0.75, 1.0]
  .map((f) => {
    const [, y] = pt(0, f);
    return `<line x1="${px0}" x2="${px1}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${BORDER}" stroke-width="1"/>`;
  })
  .join("\n    ");

const legend = [
  { label: "delve", color: BLUE, x: cx + 40 },
  { label: "boasts", color: ORANGE, x: cx + 160 },
  { label: "wearing a trenchcoat", color: AQUA, x: cx + 290 },
]
  .map(
    (l) => `
    <line x1="${l.x}" x2="${l.x + 18}" y1="${cy + ch - 6}" y2="${cy + ch - 6}" stroke="${l.color}" stroke-width="3"/>
    <text x="${l.x + 24}" y="${cy + ch - 2}" font-family="JetBrains Mono" font-size="14" fill="${DIM}">${esc(l.label)}</text>`,
  )
  .join("\n");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="15%" cy="0%" r="55%">
      <stop offset="0" stop-color="#173a29"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="90%" cy="10%" r="55%">
      <stop offset="0" stop-color="#1c2c4a"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${BLUE}"/>
      <stop offset="1" stop-color="${AQUA}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <text x="64" y="140" font-family="JetBrains Mono" font-weight="800" font-size="60" fill="url(#title)">llm-grams</text>
  <text x="64" y="188" font-family="JetBrains Mono" font-size="20" fill="${DIM}">search interest for the phrases</text>
  <text x="64" y="216" font-family="JetBrains Mono" font-size="20" fill="${DIM}">LLMs won't stop using</text>

  <text x="64" y="280" font-family="JetBrains Mono" font-size="16" fill="${MUTED}">delve. tapestry. boasts.</text>
  <text x="64" y="306" font-family="JetBrains Mono" font-size="16" fill="${MUTED}">"it's not just X, it's Y."</text>
  <text x="64" y="332" font-family="JetBrains Mono" font-size="16" fill="${MUTED}">charted like Google Trends</text>
  <text x="64" y="358" font-family="JetBrains Mono" font-size="16" fill="${MUTED}">since ChatGPT launched.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${AQUA}">llm-grams.bisks.net</text>

  <rect x="${cx}" y="${cy}" width="${cw}" height="${ch}" rx="16" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>
  ${gridLines}

  <path d="${toPath(delvePts)}" fill="none" stroke="${BLUE}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="${toPath(boastsPts)}" fill="none" stroke="${ORANGE}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="${toPath(trenchPts)}" fill="none" stroke="${AQUA}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>

  <circle cx="${trenchPts[11][0]}" cy="${trenchPts[11][1]}" r="6" fill="${AQUA}" stroke="${CARD}" stroke-width="2"/>
  <text x="${trenchPts[11][0] - 210}" y="${trenchPts[11][1] - 14}" font-family="JetBrains Mono" font-weight="700" font-size="15" fill="${AQUA}">up ~5000% this month</text>

  ${legend}
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
