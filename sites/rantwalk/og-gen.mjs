// Generates public/og.png — the static Open Graph preview card for rantwalk.
// Hand-drawn SVG, rasterised with @resvg/resvg-js. Same recipe as
// sites/norvidpot/og-gen.mjs and sites/impostorbel/og-gen.mjs.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#f6f5f0", PAPER = "#ffffff", INK = "#202122", DIM = "#54595d", DIM2 = "#72777d";
const LINK = "#0645ad", ACCENT = "#b3312c", BORDER = "#c8c2ae", GOOD = "#14866d";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// No system fonts are available in the build sandbox (no fontconfig), so —
// same as sites/norvidpot/og-gen.mjs — everything uses the one bundled TTF.
const F = "JetBrains Mono";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect x="10" y="10" width="${W - 20}" height="${H - 20}" fill="none" stroke="${BORDER}" stroke-width="3"/>

  <text x="56" y="108" font-family="${F}" font-weight="700" font-size="58" fill="${INK}">rant<tspan fill="${ACCENT}">walk</tspan></text>
  <text x="58" y="140" font-family="${F}" font-size="19" fill="${DIM}">a free rant that anyone can click through</text>

  <line x1="56" y1="168" x2="${W - 56}" y2="168" stroke="${BORDER}" stroke-width="2"/>

  <rect x="56" y="200" width="${W - 112}" height="160" rx="6" fill="${PAPER}" stroke="${BORDER}"/>
  <text x="84" y="238" font-family="${F}" font-weight="700" font-size="14" fill="${DIM2}">START</text>
  <text x="84" y="268" font-family="${F}" font-size="19" fill="${INK}">"this is a separate rant but I actually think most</text>
  <text x="84" y="296" font-family="${F}" font-size="19" fill="${INK}">people are basically immune to propaganda..."</text>
  <text x="84" y="332" font-family="${F}" font-size="15" fill="${LINK}">click the underlined words to jump forward &#8594;</text>

  <rect x="56" y="378" width="${W - 112}" height="118" rx="6" fill="#fff8f6" stroke="${ACCENT}" stroke-dasharray="6,4"/>
  <text x="84" y="410" font-family="${F}" font-weight="700" font-size="14" fill="${ACCENT}">TARGET</text>
  <text x="84" y="440" font-family="${F}" font-size="19" fill="${INK}">some other rant, further along the timeline</text>
  <text x="84" y="470" font-family="${F}" font-size="14" fill="${DIM}">reach it in as few clicks as you can — the graph only points forward.</text>

  <text x="56" y="${H - 56}" font-family="${F}" font-weight="700" font-size="24" fill="${LINK}">rantwalk.bisks.net</text>
  <text x="56" y="${H - 28}" font-family="${F}" font-size="15" fill="${DIM2}">the wiki speedrun game, played on @norvid-studies.bsky.social's own posts</text>
</svg>`;

const fontPath = fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url));
const r = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: F },
});
const png = r.render().asPng();
const out = new URL("./public/og.png", import.meta.url).pathname;
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");
