// Generates public/og.png and public/og-letters.png — the Open Graph preview
// cards for lovejar's two pages. Drawn shapes, not emoji: the bundled mono
// font has no color-emoji glyphs and resvg would render a tofu box instead
// (same reasoning as sites/warmhug/og-gen.mjs and sites/gratitude-garden/og-gen.mjs).
// Rasterised with @resvg/resvg-js (pure native module, no system
// Chromium/fontconfig needed).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png + og-letters.png
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG1 = "#2b1220", BG2 = "#1a0a14";
const DIM = "#d9b3c2";
const PINK = "#ff6f91", GOLD = "#ffd97a", CREAM = "#fff3ee", GLASS = "rgba(255,111,145,0.14)";

function titleGlyph(x, y, s, extra) {
  // Little folded note rect, rotated.
  return `<rect x="${x - 9 * s}" y="${y - 6.5 * s}" width="${18 * s}" height="${13 * s}" rx="${2 * s}"
    fill="${extra || CREAM}" transform="rotate(${(x * 13) % 40 - 20} ${x} ${y})"/>`;
}

function jarArt(cx, cy, s) {
  const notes = [
    [-20, 40], [4, 48], [26, 38], [-8, 20], [16, 22], [34, 30],
    [-28, 4], [-4, -4], [18, -8], [36, 2], [-16, -24], [8, -30], [26, -26],
  ];
  const noteRects = notes
    .map((p, i) => titleGlyph(cx + p[0] * s, cy + p[1] * s, s * 1.3, i % 2 ? GOLD : CREAM))
    .join("\n    ");
  return `
  <g>
    <path d="M ${cx - 34 * s},${cy - 82 * s} L ${cx - 34 * s},${cy - 104 * s}
             Q ${cx - 34 * s},${cy - 116 * s} ${cx - 22 * s},${cy - 116 * s}
             L ${cx + 22 * s},${cy - 116 * s}
             Q ${cx + 34 * s},${cy - 116 * s} ${cx + 34 * s},${cy - 104 * s}
             L ${cx + 34 * s},${cy - 82 * s}"
          fill="none" stroke="${GOLD}" stroke-width="${5 * s}" stroke-linecap="round"/>
    <path d="M ${cx - 40 * s},${cy - 82 * s} L ${cx + 40 * s},${cy - 82 * s}
             L ${cx + 52 * s},${cy - 40 * s} L ${cx + 52 * s},${cy + 72 * s}
             Q ${cx + 52 * s},${cy + 94 * s} ${cx + 30 * s},${cy + 94 * s}
             L ${cx - 30 * s},${cy + 94 * s}
             Q ${cx - 52 * s},${cy + 94 * s} ${cx - 52 * s},${cy + 72 * s}
             L ${cx - 52 * s},${cy - 40 * s} Z"
          fill="${GLASS}" stroke="${PINK}" stroke-width="${3.5 * s}" stroke-linejoin="round"/>
    ${noteRects}
  </g>`;
}

function heart(cx, cy, s, fill) {
  return `<path d="M ${cx},${cy + 10 * s} C ${cx - 16 * s},${cy - 6 * s} ${cx - 40 * s},${cy + 2 * s} ${cx - 40 * s},${cy + 22 * s}
    C ${cx - 40 * s},${cy + 40 * s} ${cx - 18 * s},${cy + 52 * s} ${cx},${cy + 70 * s}
    C ${cx + 18 * s},${cy + 52 * s} ${cx + 40 * s},${cy + 40 * s} ${cx + 40 * s},${cy + 22 * s}
    C ${cx + 40 * s},${cy + 2 * s} ${cx + 16 * s},${cy - 6 * s} ${cx},${cy + 10 * s} Z" fill="${fill}"/>`;
}

function baseSvg(inner) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="base" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${BG1}"/>
      <stop offset="1" stop-color="${BG2}"/>
    </linearGradient>
    <radialGradient id="glow1" cx="14%" cy="-10%" r="55%">
      <stop offset="0" stop-color="${PINK}" stop-opacity="0.30"/>
      <stop offset="1" stop-color="${PINK}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="88%" cy="5%" r="50%">
      <stop offset="0" stop-color="${GOLD}" stop-opacity="0.22"/>
      <stop offset="1" stop-color="${GOLD}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${PINK}"/>
      <stop offset="1" stop-color="${GOLD}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#base)"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>
  ${inner}
</svg>`;
}

const fontPath = fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url));
function render(svg, outName) {
  const r = new Resvg(svg, {
    fitTo: { mode: "width", value: W },
    font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
  });
  const png = r.render().asPng();
  const out = new URL(`./public/${outName}`, import.meta.url).pathname;
  writeFileSync(out, png);
  console.log("wrote", out, png.length, "bytes");
}

// --- og.png: jar ---
const jarSvg = baseSvg(`
  <text x="64" y="150" font-family="JetBrains Mono" font-weight="800" font-size="64" fill="url(#title)">love jar</text>
  <text x="66" y="196" font-family="JetBrains Mono" font-size="21" fill="${DIM}">write it down, draw it out</text>

  <text x="66" y="270" font-family="JetBrains Mono" font-size="18" fill="${DIM}">Drop a little note of appreciation</text>
  <text x="66" y="298" font-family="JetBrains Mono" font-size="18" fill="${DIM}">into the jar, for yourself or for</text>
  <text x="66" y="326" font-family="JetBrains Mono" font-size="18" fill="${DIM}">someone else. Draw one out</text>
  <text x="66" y="354" font-family="JetBrains Mono" font-size="18" fill="${DIM}">whenever you need to hear it.</text>

  <text x="66" y="560" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${GOLD}">lovejar.bisks.net</text>

  ${jarArt(900, 330, 1.9)}
`);
render(jarSvg, "og.png");

// --- og-letters.png: folded letter with wax seal ---
const letterX = 780, letterY = 300;
const letterArt = `
  <g transform="translate(${letterX} ${letterY})">
    <rect x="-170" y="-115" width="340" height="230" rx="10" fill="#fff3ee" transform="rotate(-4)"/>
    <path d="M -170,-115 L 0,20 L 170,-115" fill="none" stroke="#e8c9a8" stroke-width="4" transform="rotate(-4)"/>
    <rect x="-170" y="-115" width="340" height="230" rx="10" fill="none" stroke="#e8c9a8" stroke-width="3" transform="rotate(-4)"/>
    ${heart(6, -30, 1.1, PINK)}
    <circle cx="0" cy="30" r="34" fill="${PINK}" transform="rotate(-4)"/>
    ${heart(0, 12, 0.55, "#fff3ee")}
  </g>`;
const letterSvg = baseSvg(`
  <text x="64" y="150" font-family="JetBrains Mono" font-weight="800" font-size="58" fill="url(#title)">love letters</text>
  <text x="66" y="196" font-family="JetBrains Mono" font-size="21" fill="${DIM}">from love jar</text>

  <text x="66" y="270" font-family="JetBrains Mono" font-size="18" fill="${DIM}">Generate a cute love letter to</text>
  <text x="66" y="298" font-family="JetBrains Mono" font-size="18" fill="${DIM}">yourself or a friend. Pick a vibe,</text>
  <text x="66" y="326" font-family="JetBrains Mono" font-size="18" fill="${DIM}">get a letter, drop it in the jar</text>
  <text x="66" y="354" font-family="JetBrains Mono" font-size="18" fill="${DIM}">or send it their way.</text>

  <text x="66" y="560" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${GOLD}">lovejar.bisks.net/letters</text>

  ${letterArt}
`);
render(letterSvg, "og-letters.png");
