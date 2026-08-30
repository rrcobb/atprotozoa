// Generates public/og.png — the static Open Graph preview card for
// lesslong.bisks.net. Hand-drawn SVG, rasterised with @resvg/resvg-js and
// skyclone's bundled JetBrains Mono font (no system Chromium/fontconfig
// needed). Same recipe as sites/footnoted/og-gen.mjs and sites/fieldguide/og-gen.mjs.
//
//   node og-gen.mjs   # writes ./public/og.png (borrows resvg + the font
//                      # from sites/skyclone — build-time only, not a
//                      # runtime dependency of this site)

import { Resvg } from "../skyclone/node_modules/@resvg/resvg-js/index.js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const fontPath = fileURLToPath(new URL("../skyclone/fonts/JetBrainsMono.ttf", import.meta.url));

const W = 1200, H = 630;
const BG = "#f6f4ee", PAPER = "#fffdf8", INK = "#24271f", MUTED = "#6b6a5e", FAINT = "#e2ddcc", ACCENT = "#2f5233", ACCENT_SOFT = "#6f8f6f";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>

  <text x="64" y="112" font-family="JetBrains Mono" font-weight="800" font-size="58" fill="${ACCENT}">lesslong</text>
  <text x="64" y="150" font-family="JetBrains Mono" font-size="19" fill="${MUTED}">the LessWrong Sequences, one paragraph per article</text>

  <line x1="64" y1="184" x2="${W - 64}" y2="184" stroke="${INK}" stroke-width="2"/>

  <g>
    <rect x="64" y="216" width="${W - 128}" height="94" rx="8" fill="${PAPER}" stroke="${FAINT}" stroke-width="1.5"/>
    <text x="88" y="250" font-family="JetBrains Mono" font-weight="700" font-size="17" fill="${INK}">Making Beliefs Pay Rent (in Anticipated Experiences)</text>
    <text x="88" y="276" font-family="Georgia, serif" font-size="16" fill="${MUTED}">A belief is only useful if it changes what you expect to</text>
    <text x="88" y="298" font-family="Georgia, serif" font-size="16" fill="${MUTED}">happen next — the essay calls this "making beliefs pay rent."</text>
  </g>

  <g>
    <rect x="64" y="328" width="${W - 128}" height="94" rx="8" fill="${PAPER}" stroke="${FAINT}" stroke-width="1.5"/>
    <text x="88" y="362" font-family="JetBrains Mono" font-weight="700" font-size="17" fill="${INK}">Politics is the Mind-Killer</text>
    <text x="88" y="388" font-family="Georgia, serif" font-size="16" fill="${MUTED}">The moment a topic turns political, people stop weighing</text>
    <text x="88" y="410" font-family="Georgia, serif" font-size="16" fill="${MUTED}">arguments and start signaling which team they're on.</text>
  </g>

  <g>
    <rect x="64" y="440" width="${W - 128}" height="94" rx="8" fill="${PAPER}" stroke="${FAINT}" stroke-width="1.5"/>
    <text x="88" y="474" font-family="JetBrains Mono" font-weight="700" font-size="17" fill="${INK}">Joy in the Merely Real</text>
    <text x="88" y="500" font-family="Georgia, serif" font-size="16" fill="${MUTED}">A real flower can be more amazing than a magic one —</text>
    <text x="88" y="522" font-family="Georgia, serif" font-size="16" fill="${MUTED}">because the real one is actually happening.</text>
  </g>

  <text x="64" y="588" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT}">lesslong.bisks.net</text>
  <text x="64" y="612" font-family="JetBrains Mono" font-size="14" fill="${MUTED}">six sequences, one paragraph each, 8th grade reading level</text>
</svg>`;

const resvg = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
});
const png = resvg.render().asPng();
const out = fileURLToPath(new URL("./public/og.png", import.meta.url));
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");
