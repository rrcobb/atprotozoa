// Generates public/og.png — the static OG/Twitter preview card for
// palindrone. Hand-drawn SVG at the canonical 1200x630 OG size, rasterised
// with @resvg/resvg-js (same recipe as sites/overcommit/og-gen.mjs — no
// system fontconfig on this box, so JetBrains Mono is bundled in ./fonts and
// loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#ffffff", INK = "#111111", MUTED = "#6b6b6b", FAINT = "#e4e4e4", ACCENT = "#1a5fd0";

const WORD = "PALINDRONE";
// centered mirror band under the title, echoing the theme: the word and its
// own reverse, meeting in the middle.
const mirrorHalf = "SEGYGES";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect x="0" y="0" width="${W}" height="8" fill="${ACCENT}"/>

  <text x="64" y="150" font-family="JetBrains Mono" font-weight="800" font-size="72" fill="${INK}">${WORD}</text>
  <text x="64" y="196" font-family="JetBrains Mono" font-size="24" fill="${MUTED}">catalogs every palindrome on the live Bluesky firehose</text>

  <rect x="64" y="250" width="${W - 128}" height="220" rx="14" fill="#fafafa" stroke="${FAINT}" stroke-width="1.5"/>
  <text x="94" y="310" font-family="JetBrains Mono" font-weight="800" font-size="17" letter-spacing="2" fill="${ACCENT}">THE ASK THAT STARTED IT</text>
  <text x="94" y="360" font-family="JetBrains Mono" font-size="26" fill="${INK}">"i'd like to announce that</text>
  <text x="94" y="400" font-family="JetBrains Mono" font-weight="800" font-size="40" fill="${ACCENT}">${mirrorHalf.toLowerCase()} is a palindrome"</text>
  <text x="94" y="440" font-family="JetBrains Mono" font-size="18" fill="${MUTED}">— @ver.ooo, in the thread that got this built</text>

  <text x="64" y="${H - 40}" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${ACCENT}">palindrone.bisks.net</text>
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
