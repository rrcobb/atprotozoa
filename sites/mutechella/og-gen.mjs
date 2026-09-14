// Generates public/og.png — the Open Graph preview for mutechella. Same
// recipe as sites/blocknotes/og-gen.mjs (pure @resvg/resvg-js, no system
// fontconfig, font bundled in ./fonts). Static/generic — a real per-user
// poster would mean encoding someone's actual mute list into a shareable
// image URL, and mute lists are private-ish (only the account owner can read
// their own via getMutes), so there's no per-result share card here, just
// one branded image, same call blocknotes made for the same reason.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="sun" cx="50%" cy="35%" r="60%">
      <stop offset="0%" stop-color="#ffdd8a"/>
      <stop offset="70%" stop-color="#b6432c"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="#f4e8d0"/>
  <circle cx="${W / 2}" cy="150" r="70" fill="url(#sun)"/>
  <text x="${W / 2}" y="330" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="96" fill="#b6432c">MUTECHELLA</text>
  <text x="${W / 2}" y="380" text-anchor="middle" font-family="JetBrains Mono" font-size="24" letter-spacing="6" fill="#2c6e5c">WEEKEND ONE &amp; WEEKEND TWO</text>
  <text x="${W / 2}" y="440" text-anchor="middle" font-family="JetBrains Mono" font-size="22" fill="#6b5a42">your mute list, headlining — biggest account, biggest font</text>
  <text x="${W / 2}" y="580" text-anchor="middle" font-family="JetBrains Mono" font-size="22" fill="#6b5a42">mutechella.bisks.net</text>
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
