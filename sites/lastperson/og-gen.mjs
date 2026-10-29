// Generates public/og.png (1200x630): a real LP1 bracket of 512 synthetic entrants
// drawn from the same engine the site runs. Run: node og-gen.mjs
// (resvg is borrowed from sites/receipts/node_modules if not installed here.)
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Tournament, roundSizes, genesisSeed } from "./public/lib/engine.js";

const require = createRequire(import.meta.url);
let Resvg;
try { ({ Resvg } = require("@resvg/resvg-js")); } catch { ({ Resvg } = createRequire(new URL("../receipts/", import.meta.url))("@resvg/resvg-js")); }

const N = 512, t = new Tournament(N, await genesisSeed()).runAll();
const X0 = 40, X1 = 1160, Y0 = 40, Y1 = 590, R = t.R;
const sx = (r) => X0 + ((X1 - X0) * r) / R, yOf = (r, p) => Y0 + ((Y1 - Y0) * (p * 2 ** r + Math.min((p + 1) * 2 ** r, N)) / 2) / N;
let idle = "", win = "", lose = "";
for (let r = 0; r < R; r++)
  for (let j = 0; j < t.sizes[r] >> 1; j++) {
    const second = t.rounds[r + 1][j] === t.rounds[r][2 * j + 1];
    for (const c of [0, 1]) {
      const d = `M${sx(r).toFixed(1)} ${yOf(r, 2 * j + c).toFixed(1)}H${((sx(r) + sx(r + 1)) / 2).toFixed(1)}V${yOf(r + 1, j).toFixed(1)}H${sx(r + 1).toFixed(1)}`;
      if ((c === 1) === second) win += d; else lose += d;
    }
  }
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
<rect width="1200" height="630" fill="#050505"/>
<path d="${lose}" fill="none" stroke="#c4372f" stroke-opacity=".55" stroke-width=".8"/>
<path d="${win}" fill="none" stroke="#9fe3b4" stroke-opacity=".8" stroke-width="1"/>
<rect x="0" y="0" width="1200" height="630" fill="url(#v)"/>
<defs><radialGradient id="v" cx="50%" cy="50%" r="70%"><stop offset=".35" stop-color="#050505" stop-opacity="0"/><stop offset="1" stop-color="#050505" stop-opacity=".9"/></radialGradient></defs>
<rect x="60" y="190" width="620" height="230" fill="#050505" fill-opacity=".86" stroke="#e8e6df" stroke-opacity=".6"/>
<text x="84" y="248" font-family="JetBrains Mono" font-size="32" font-weight="700" fill="#e8e6df" letter-spacing="2">THE LAST PERSON</text>
<text x="84" y="292" font-family="JetBrains Mono" font-size="32" font-weight="700" fill="#e8e6df" letter-spacing="2">ON THE INTERNET</text>
<text x="84" y="344" font-family="JetBrains Mono" font-size="20" fill="#9fe3b4">${N} IDENTITIES → 1 SURVIVOR</text>
<text x="84" y="388" font-family="JetBrains Mono" font-size="17" fill="#8a8880">There can only be one. Unfortunately.</text>
</svg>`;
writeFileSync(new URL("./public/og.png", import.meta.url), new Resvg(svg, { fitTo: { mode: "width", value: 1200 }, font: { fontFiles: [fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url))], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" } }).render().asPng());
console.log("wrote public/og.png");
