// Generates public/og.png — static, non-personalized (no per-user result to
// bake in; every visitor builds their own word client-side). Same recipe as
// sites/nothingness/og-gen.mjs: @resvg/resvg-js, no system fontconfig needed.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#0d0f14"/>
  <text x="90" y="220" font-family="JetBrains Mono" font-weight="700" font-size="88" fill="#e8e6f0">allo<tspan fill="#ff7a59">phones</tspan></text>
  <text x="92" y="280" font-family="JetBrains Mono" font-size="30" fill="#8b8ba0">every possible syllable, defined</text>

  <text x="92" y="420" font-family="JetBrains Mono" font-weight="700" font-size="72" fill="#6fd6ff">[pa] · [lom] · [tik]</text>
  <text x="92" y="470" font-family="JetBrains Mono" font-size="26" fill="#8b8ba0" font-style="italic">n. a sharp, sudden close strike, vast and near-flat in character.</text>

  <text x="92" y="560" font-family="JetBrains Mono" font-size="26" fill="#8b8ba0">click a point of articulation. click a vowel. mint a meaning.</text>
  <text x="92" y="600" font-family="JetBrains Mono" font-size="24" fill="#4a4e5e">allophones.bisks.net</text>
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
