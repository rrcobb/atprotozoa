// Generates public/og.png — the generic Open Graph preview card for the bare
// steamtags landing page (per-game shares get their own og:image, the game's
// Steam header capsule, stamped in src/index.ts's renderShare — this is only
// the fallback for the un-personalized link). Hand-drawn SVG at the canonical
// OG size, rasterised with @resvg/resvg-js (same recipe as sites/didscope's
// og-gen.mjs — pure native module, no system Chromium/fontconfig needed).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#0f1720", BG2 = "#1c3550", FG = "#e9f1f7", DIM = "#8ba1b3";
const ACCENT = "#66c0f4", GOOD = "#6fcf97", MID = "#f2c94c", BAD = "#eb5757", CARD = "#16212c", BORDER = "#2a3b4a";

const chips = [
  { label: "Atmospheric", score: "9/10", color: GOOD },
  { label: "Story Rich", score: "8/10", color: GOOD },
  { label: "Roguelike", score: "5/10", color: MID },
  { label: "Relaxing", score: "2/10", color: BAD },
];

const chipSvg = chips
  .map((c, i) => {
    const y = 330 + i * 58;
    return `
    <text x="812" y="${y}" font-family="JetBrains Mono" font-size="24" fill="${FG}">${c.label}</text>
    <text x="1132" y="${y}" text-anchor="end" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${c.color}">${c.score}</text>`;
  })
  .join("");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="15%" cy="-10%" r="60%">
      <stop offset="0" stop-color="${BG2}"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${ACCENT}"/>
      <stop offset="1" stop-color="${GOOD}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>

  <text x="64" y="150" font-family="JetBrains Mono" font-weight="800" font-size="72" fill="url(#title)">steamtags</text>
  <text x="64" y="200" font-family="JetBrains Mono" font-size="26" fill="${DIM}">rate how well each tag</text>
  <text x="64" y="234" font-family="JetBrains Mono" font-size="26" fill="${DIM}">actually fits</text>

  <text x="64" y="330" font-family="JetBrains Mono" font-size="19" fill="${DIM}">Pick any Steam game. See its community tags,</text>
  <text x="64" y="358" font-family="JetBrains Mono" font-size="19" fill="${DIM}">sized by vote count — then score how much each</text>
  <text x="64" y="386" font-family="JetBrains Mono" font-size="19" fill="${DIM}">one fits, 1 to 10. Your call, not an algorithm's.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${GOOD}">bisks.net/steamtags</text>

  <!-- sample card -->
  <rect x="720" y="70" width="416" height="500" rx="16" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>
  <text x="760" y="150" font-family="JetBrains Mono" font-weight="800" font-size="52" fill="${ACCENT}">your tags</text>
  <line x1="760" y1="185" x2="1096" y2="185" stroke="${BORDER}" stroke-width="1"/>
  ${chipSvg}
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
