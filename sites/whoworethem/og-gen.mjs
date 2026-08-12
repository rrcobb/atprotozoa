// Generates public/og.png — the Open Graph preview card for whoworethem, so
// a shared link auto-renders a picture of the premise (an old object, a
// name nobody kept, a guess anyway) in Bluesky / other unfurlers.
// Hand-drawn SVG at the canonical OG size, matching the live page's
// black-on-white mono look, rasterised with @resvg/resvg-js (pure native
// module, no system Chromium needed — this box has no fontconfig/system
// fonts either, so fonts are bundled in ./fonts and loaded explicitly).
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
const INK = "#111111", MUTED = "#6b6b6b", ACCENT = "#1a5fd0", FAINT = "#e4e4e4";
const MONO = "JetBrains Mono";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#ffffff"/>

  <text x="70" y="110" font-family="${MONO}" font-weight="bold" font-size="54" fill="${INK}">who wore them?</text>
  <text x="70" y="150" font-family="${MONO}" font-size="24" fill="${MUTED}">a speculative-bio generator for found objects</text>

  <rect x="70" y="200" width="1060" height="130" rx="6" fill="none" stroke="${FAINT}" stroke-width="2"/>
  <text x="100" y="240" font-family="${MONO}" font-size="22" fill="${MUTED}">2,000-year-old Roman leather briefs, found in a London well.</text>
  <text x="100" y="272" font-family="${MONO}" font-size="22" fill="${INK}">"Probably worn by young girls who were acrobatic dancers."</text>
  <text x="100" y="308" font-family="${MONO}" font-size="24" fill="${ACCENT}">→ "Who wore them?" — first post seen on the open firehose.</text>

  <rect x="70" y="360" width="1060" height="170" rx="6" fill="none" stroke="${INK}" stroke-width="3"/>
  <text x="100" y="405" font-family="${MONO}" font-size="20" fill="${MUTED}">BEST GUESS</text>
  <text x="100" y="450" font-family="${MONO}" font-weight="bold" font-size="30" fill="${INK}">let's call them M.</text>
  <text x="100" y="490" font-family="${MONO}" font-size="22" fill="${INK}">an acrobat's apprentice, small enough the laces</text>
  <text x="100" y="518" font-family="${MONO}" font-size="22" fill="${INK}">still had room to grow.</text>

  <text x="1130" y="588" text-anchor="end" font-family="${MONO}" font-weight="bold" font-size="24" fill="${ACCENT}">whoworethem.bisks.net</text>
</svg>`;

const fontPaths = [
  fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url)),
];
const r = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: fontPaths, loadSystemFonts: false, defaultFontFamily: MONO },
});
const png = r.render().asPng();

writeFileSync(fileURLToPath(new URL("./public/og.png", import.meta.url)), png);
console.log("wrote public/og.png");
