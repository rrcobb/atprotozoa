// Generates public/og.png — the static Open Graph preview card for
// ED Z*TRON QUEST, a green-on-black terminal look matching the live page.
// Rasterised with @resvg/resvg-js (pure native module, no system Chromium),
// font bundled in ./fonts since this box has no system fonts either.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run by hand if the
// artwork changes. No per-result variant needed — this is a static card, the
// game has no shareable per-user state besides final score (handled by the
// bsky intent-compose link at win time, not a generated image).

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#060a06";
const FG = "#3cff6e";
const DIM = "#1e8a3e";
const ACCENT = "#ffcf4a";
const BORDER = "#163d1f";
const CARD = "#0b160c";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const transcriptLines = [
  { t: "> go boardroom", c: ACCENT },
  { t: "THE BOARDROOM", c: FG },
  { t: "A golden ticker-tape entity spins in place,", c: DIM },
  { t: "chanting “GROWTH. GROWTH. GROWTH.”", c: DIM },
  { t: "> show receipts", c: ACCENT },
  { t: "*** YOU HAVE WON ***", c: ACCENT },
];

const cardX = 60, cardY = 330, cardW = 700, cardH = 240;
const lineH = 30;
const linesSvg = transcriptLines
  .map(
    (l, i) =>
      `<text x="${cardX + 28}" y="${cardY + 44 + i * lineH}" font-family="JetBrains Mono" font-size="18" fill="${l.c}">${esc(l.t)}</text>`
  )
  .join("\n    ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="15%" cy="-10%" r="65%">
      <stop offset="0" stop-color="#0f3018"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>

  <text x="60" y="120" font-family="JetBrains Mono" font-weight="800" font-size="58" fill="${ACCENT}">ED Z*TRON QUEST</text>
  <text x="60" y="160" font-family="JetBrains Mono" font-size="22" fill="${DIM}">a zcode adventure in the rot economy</text>

  <text x="60" y="230" font-family="JetBrains Mono" font-size="18" fill="${FG}">Gather three receipts. Take down the Number.</text>
  <text x="60" y="258" font-family="JetBrains Mono" font-size="18" fill="${FG}">A tiny Infocom-style parser text adventure.</text>

  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="14" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>
  ${linesSvg}

  <text x="60" y="600" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT}">bisks.net/games/edzitronquest</text>
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
