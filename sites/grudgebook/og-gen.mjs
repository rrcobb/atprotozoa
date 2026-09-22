// Generates public/og.png — the Open Graph preview for grudgebook. Same
// recipe as sites/blocknotes/og-gen.mjs (pure @resvg/resvg-js, no system
// fontconfig, font bundled in ./fonts). Static/generic — this site's actual
// per-user grudge ledgers are private-ish (see the privacy note on the page
// itself), so there's no per-result share card, just one branded image.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#120e0e"/>
  <text x="${W / 2}" y="270" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="96" fill="#e05c5c">grudgebook</text>
  <text x="${W / 2}" y="340" text-anchor="middle" font-family="JetBrains Mono" font-size="26" fill="#a68888">a subject. a note. the receipts.</text>
  <text x="${W / 2}" y="400" text-anchor="middle" font-family="JetBrains Mono" font-size="22" fill="#6b5555">an organized ledger of things made wrong</text>
  <text x="${W / 2}" y="560" text-anchor="middle" font-family="JetBrains Mono" font-size="22" fill="#6b5555">grudgebook.bisks.net</text>
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
