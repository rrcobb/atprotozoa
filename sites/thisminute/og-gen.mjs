// Generates public/og.png — the Open Graph preview card for thisminute.
//
// Hand-drawn SVG at the canonical OG size: a faint scrolling word-stream
// behind the wordmark, and a sample generated-post card on the right.
// Rasterised with @resvg/resvg-js (pure native module, no system Chromium /
// fontconfig needed — the font is bundled in ./fonts and loaded explicitly).
// Adapted from sites/simclustered/og-gen.mjs (copy, don't abstract).
//
//   node og-gen.mjs   # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#ffffff", INK = "#111111", MUTED = "#6b6b6b", FAINT = "#e4e4e4";
const ACCENT = "#1a5fd0";

// tiny seeded RNG so the layout is identical every run
let seed = 4242;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

const GHOST_WORDS = [
  "the", "moots", "are", "posting", "again", "about", "trigrams", "and",
  "firehose", "and", "a", "cluster", "of", "words", "nobody", "asked", "for",
  "but", "here", "we", "are", "sixty", "seconds", "later", "still",
];
let ghostLines = "";
for (let row = 0; row < 9; row++) {
  const y = 40 + row * 68;
  let x = -40 + ((row * 53) % 200);
  let line = "";
  while (x < W + 200) {
    const w = GHOST_WORDS[Math.floor(rnd() * GHOST_WORDS.length)];
    line += `<text x="${x}" y="${y}" font-family="JetBrains Mono" font-size="18" fill="${FAINT}">${w}</text>`;
    x += w.length * 11 + 22;
  }
  ghostLines += line;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <g opacity="0.55">${ghostLines}</g>
  <rect width="${W}" height="${H}" fill="${BG}" opacity="0.35"/>

  <text x="60" y="150" font-family="JetBrains Mono" font-weight="700" font-size="52" fill="${INK}">this minute's</text>
  <text x="60" y="212" font-family="JetBrains Mono" font-weight="700" font-size="52" fill="${ACCENT}">post</text>

  <text x="60" y="272" font-family="JetBrains Mono" font-size="19" fill="${MUTED}">the live Bluesky firehose's last 60</text>
  <text x="60" y="300" font-family="JetBrains Mono" font-size="19" fill="${MUTED}">seconds, remixed by a Markov chain —</text>
  <text x="60" y="328" font-family="JetBrains Mono" font-size="19" fill="${MUTED}">global, or just @bisks.net's simcluster.</text>

  <text x="60" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT}">thisminute.bisks.net</text>

  <rect x="640" y="90" width="500" height="440" rx="14" fill="${BG}" stroke="${INK}" stroke-width="2"/>
  <rect x="700" y="70" width="150" height="30" fill="${BG}"/>
  <text x="712" y="92" font-family="JetBrains Mono" font-weight="700" font-size="13" fill="${ACCENT}" letter-spacing="1">THIS MINUTE</text>

  <text x="682" y="200" font-family="JetBrains Mono" font-size="21" fill="${INK}">"everyone on the timeline</text>
  <text x="682" y="234" font-family="JetBrains Mono" font-size="21" fill="${INK}">is somehow talking about</text>
  <text x="682" y="268" font-family="JetBrains Mono" font-size="21" fill="${INK}">the same three things at</text>
  <text x="682" y="302" font-family="JetBrains Mono" font-size="21" fill="${INK}">once, and none of them</text>
  <text x="682" y="336" font-family="JetBrains Mono" font-size="21" fill="${INK}">make sense together."</text>

  <line x1="682" y1="370" x2="1100" y2="370" stroke="${FAINT}" stroke-width="1"/>
  <text x="682" y="400" font-family="JetBrains Mono" font-size="14" fill="${MUTED}">from 214 posts / 2,930 words · auto</text>
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
