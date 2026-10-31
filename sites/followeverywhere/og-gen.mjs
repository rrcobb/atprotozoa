// Generates public/og.png (1200x630) with @resvg/resvg-js. Same recipe as
// sites/hyperobject/og-gen.mjs.   node og-gen.mjs
import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const apps = ["Bluesky", "Tangled", "Grain", "Spark"];
const pills = apps.map((a, i) => `
  <rect x="64" y="${300 + i * 56}" width="420" height="44" rx="10" fill="#141b33" stroke="#26325c"/>
  <text x="84" y="${329 + i * 56}" font-family="JetBrains Mono" font-size="20" fill="#e8ecff">${a}</text>
  <text x="464" y="${329 + i * 56}" text-anchor="end" font-family="JetBrains Mono" font-size="20" fill="#5de0a0">followed ✓</text>`).join("");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="#0b1020"/>
  <text x="64" y="140" font-family="JetBrains Mono" font-weight="800" font-size="64" fill="#6ea8ff">followeverywhere</text>
  <text x="64" y="196" font-family="JetBrains Mono" font-size="24" fill="#8a94c4">one account, every appview.</text>
  <text x="64" y="250" font-family="JetBrains Mono" font-size="20" fill="#8a94c4">scan the repo, follow on each.</text>
  ${pills}
  <text x="64" y="590" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="#6ea8ff">followeverywhere.bisks.net</text>
</svg>`;
const fontPath = fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url));
const png = new Resvg(svg, { fitTo: { mode: "width", value: W }, font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" } }).render().asPng();
const out = new URL("./public/og.png", import.meta.url).pathname;
writeFileSync(out, png);
console.log("wrote", out, png.length);
