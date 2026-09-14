// Generates public/og.png — the Open Graph preview for mutedcheck. Same
// recipe as sites/mutechella/og-gen.mjs (pure @resvg/resvg-js, no system
// fontconfig, font bundled in ./fonts). Static/generic — checking a post
// against someone's private muted-words list isn't a shareable result URL
// (the words themselves never leave the browser), so there's no per-result
// share card, just one branded image.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#14120f"/>
  <rect width="${W}" height="${H}" fill="url(#stripes)" opacity="0.5"/>
  <defs>
    <pattern id="stripes" width="28" height="28" patternTransform="rotate(135)" patternUnits="userSpaceOnUse">
      <rect width="14" height="28" fill="#1c1913"/>
    </pattern>
  </defs>
  <text x="${W / 2}" y="290" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="88" fill="#e8b23d">MUTEDCHECK</text>
  <text x="${W / 2}" y="360" text-anchor="middle" font-family="JetBrains Mono" font-size="26" fill="#f2ead8">does this post trip your muted words?</text>
  <text x="${W / 2}" y="430" text-anchor="middle" font-family="JetBrains Mono" font-size="22" fill="#a8977a">sign in · load your muted words · paste a post URL</text>
  <text x="${W / 2}" y="580" text-anchor="middle" font-family="JetBrains Mono" font-size="22" fill="#a8977a">mutedcheck.bisks.net</text>
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
