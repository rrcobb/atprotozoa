// Generates public/og.png — static, non-personalized (the ontology is fixed
// data, not a per-user result). Same recipe as sites/allophones/og-gen.mjs:
// @resvg/resvg-js, no system fontconfig needed.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#0c0d12"/>
  <text x="90" y="180" font-family="JetBrains Mono" font-weight="700" font-size="64" fill="#e7e5ef">Tractatus</text>
  <text x="90" y="248" font-family="JetBrains Mono" font-weight="700" font-size="64" fill="#b6ffd8">Logico-Blueskyicus</text>

  <text x="92" y="330" font-family="JetBrains Mono" font-size="26" fill="#8b899c">honoring the suffering of everyone affected by blueskyisms</text>

  <text x="92" y="430" font-family="JetBrains Mono" font-weight="700" font-size="30" fill="#7fd1ff">2.1  The Ontological Escalation:</text>
  <text x="92" y="470" font-family="JetBrains Mono" font-size="26" fill="#e7e5ef">a private grievance, formalized into linked</text>
  <text x="92" y="504" font-family="JetBrains Mono" font-size="26" fill="#e7e5ef">logical atoms before its author has finished</text>
  <text x="92" y="538" font-family="JetBrains Mono" font-size="26" fill="#e7e5ef">being sad about it.</text>

  <text x="92" y="600" font-family="JetBrains Mono" font-size="24" fill="#4a4e5e">blueskyisms.bisks.net</text>
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
