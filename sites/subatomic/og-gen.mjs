// Generates public/og.png — the Open Graph preview card for subatomic.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium / fontconfig needed — the font is
// bundled in ./fonts and loaded explicitly). Same recipe as
// sites/thewell/og-gen.mjs / sites/hyperobject/og-gen.mjs / sites/didscope/og-gen.mjs.
//
//   node og-gen.mjs   # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run by hand if the
// artwork changes.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#0b0d10", FG = "#eef1f4", DIM = "#8a92a0";
const ACCENT = "#ff5f2e", ACCENT2 = "#ffb199";
const DOWN = "#6f8dff";
const CARD = "#14171d", BORDER = "#262b34";

const cardX = 470, cardY = 60, cardW = 668, cardH = 510;

// three mock post rows with vote arrows, standing in for the feed.
const rows = [
  { board: "atproto", title: "did:plc identifiers, explained", score: 128, y: 0 },
  { board: "cooking", title: "the only pasta sauce you need", score: 64, y: 1 },
  { board: "askmoots", title: "what's your PDS?", score: 12, y: 2 },
];
const rowH = 150;
const rowsSvg = rows
  .map((r, i) => {
    const y = cardY + 40 + i * rowH;
    return `
    <rect x="${cardX + 30}" y="${y}" width="${cardW - 60}" height="${rowH - 20}" rx="10" fill="#181c23" stroke="${BORDER}"/>
    <text x="${cardX + 58}" y="${y + 48}" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="20" fill="${ACCENT}">&#9650;</text>
    <text x="${cardX + 58}" y="${y + 78}" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="18" fill="${FG}">${r.score}</text>
    <text x="${cardX + 58}" y="${y + 104}" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="20" fill="${DOWN}">&#9660;</text>
    <text x="${cardX + 90}" y="${y + 40}" font-family="JetBrains Mono" font-weight="700" font-size="14" fill="${ACCENT2}">b/${r.board}</text>
    <text x="${cardX + 90}" y="${y + 70}" font-family="JetBrains Mono" font-weight="700" font-size="19" fill="${FG}">${r.title}</text>
  `;
  })
  .join("\n");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="10%" cy="-10%" r="60%">
      <stop offset="0" stop-color="#2a140e"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${ACCENT}"/>
      <stop offset="1" stop-color="${ACCENT2}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>

  <text x="64" y="150" font-family="JetBrains Mono" font-weight="800" font-size="64" fill="url(#title)">subatomic</text>
  <text x="64" y="196" font-family="JetBrains Mono" font-size="20" fill="${DIM}">reddit but atproto.</text>

  <text x="64" y="296" font-family="JetBrains Mono" font-size="16" fill="${DIM}">post a link or text to a board,</text>
  <text x="64" y="322" font-family="JetBrains Mono" font-size="16" fill="${DIM}">upvote or downvote, comment.</text>
  <text x="64" y="360" font-family="JetBrains Mono" font-size="15" fill="${ACCENT}">every vote is a real record on your own PDS</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT}">subatomic.bisks.net</text>

  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="18" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>
  ${rowsSvg}
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
