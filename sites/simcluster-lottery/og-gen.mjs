// Generates public/og.png — the Open Graph preview for simcluster lottery.
// Rasterised with @resvg/resvg-js (same recipe as sites/nothingness/og-gen.mjs) —
// pure native module, no system fontconfig needed, font bundled in ./fonts.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#ffffff"/>
  <rect x="0" y="0" width="${W}" height="10" fill="#1a5fd0"/>
  <text x="90" y="200" font-family="JetBrains Mono" font-weight="500" font-size="26" letter-spacing="3" fill="#6b6b6b">HOURLY · DAILY · WEEKLY DRAWS</text>
  <text x="90" y="300" font-family="JetBrains Mono" font-weight="800" font-size="84" fill="#111111">simcluster</text>
  <text x="90" y="392" font-family="JetBrains Mono" font-weight="800" font-size="84" fill="#1a5fd0">lottery</text>
  <text x="90" y="460" font-family="JetBrains Mono" font-size="26" fill="#6b6b6b">buy tickets · track your wallet · top the leaderboard</text>
  <text x="90" y="560" font-family="JetBrains Mono" font-size="24" fill="#a6790f">play money only — resets every month</text>
  <text x="${W - 90}" y="560" text-anchor="end" font-family="JetBrains Mono" font-size="24" fill="#6b6b6b">simcluster-lottery.bisks.net</text>
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
