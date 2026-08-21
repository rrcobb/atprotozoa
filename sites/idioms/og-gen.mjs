// Generates public/og.png — the static Open Graph preview card for
// idioms.bisks.net. Hand-drawn SVG, rasterised with @resvg/resvg-js and
// skyclone's bundled JetBrains Mono font (no system Chromium/fontconfig
// needed). Same recipe as sites/fieldguide/og-gen.mjs.
//
//   node og-gen.mjs   # writes ./public/og.png (borrows resvg + the font
//                      # from sites/skyclone — build-time only, not a
//                      # runtime dependency of this site)

import { Resvg } from "../skyclone/node_modules/@resvg/resvg-js/index.js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const fontPath = fileURLToPath(new URL("../skyclone/fonts/JetBrainsMono.ttf", import.meta.url));

const W = 1200, H = 630;
const BG = "#f6f3ec", INK = "#24211c", MUTED = "#6b6355", ACCENT = "#a3492b";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function wrapLines(text, maxChars) {
  const words = text.split(" ");
  const lines = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > maxChars) {
      lines.push(cur.trim());
      cur = w;
    } else {
      cur = (cur + " " + w).trim();
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

const quote = wrapLines(
  '"Are we about to do a Kubernetes, or is this genuinely a case where the lighter spool-up saves us maintenance headaches and technical debt?"',
  56
);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>

  <text x="64" y="108" font-family="JetBrains Mono" font-weight="800" font-size="58" fill="${INK}">idioms</text>
  <text x="64" y="150" font-family="JetBrains Mono" font-size="21" fill="${MUTED}">hard-won agent lessons, collated into one markdown doc</text>

  <line x1="64" y1="184" x2="${W - 64}" y2="184" stroke="${INK}" stroke-width="2"/>

  <rect x="64" y="222" width="${W - 128}" height="${quote.length * 34 + 100}" fill="#fffdf8" stroke="#ddd3bd" stroke-width="2" rx="8"/>
  <line x1="64" y1="222" x2="64" y2="${222 + quote.length * 34 + 100}" stroke="${ACCENT}" stroke-width="6"/>
  ${quote.map((line, i) => `<text x="100" y="${268 + i * 34}" font-family="JetBrains Mono" font-size="24" fill="${INK}">${esc(line)}</text>`).join("\n  ")}
  <text x="100" y="${268 + quote.length * 34 + 30}" font-family="JetBrains Mono" font-size="18" fill="${MUTED}">&#8212; @demigirlboss.bsky.social</text>

  <text x="64" y="600" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT}">idioms.bisks.net</text>
  <text x="330" y="600" font-family="JetBrains Mono" font-size="15" fill="${MUTED}">tag @buildthis.bisks.net to add your own</text>
</svg>`;

const resvg = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
});
const png = resvg.render().asPng();
const out = fileURLToPath(new URL("./public/og.png", import.meta.url));
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");
