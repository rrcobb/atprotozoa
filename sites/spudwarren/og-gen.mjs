// Generates public/og.png — the Open Graph card for spudwarren.
//   npm install @resvg/resvg-js --no-save
//   node og-gen.mjs
import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const tiles = [];
for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) {
  const x = 680 + c * 82, y = 200 + r * 82;
  const sprout = (r + c) % 3 === 0;
  tiles.push(`<rect x="${x}" y="${y}" width="74" height="74" rx="8" fill="${(r + c) % 2 ? "#2c2017" : "#3a2b1d"}"/>`);
  if (sprout) tiles.push(`<path d="M${x + 40} ${y + 60} Q${x + 30} ${y + 36} ${x + 18} ${y + 28} M${x + 40} ${y + 60} Q${x + 50} ${y + 34} ${x + 64} ${y + 26}" stroke="#8fbf5a" stroke-width="6" fill="none" stroke-linecap="round"/>`);
  else if ((r * 6 + c) % 4 === 1) tiles.push(`<ellipse cx="${x + 40}" cy="${y + 46}" rx="22" ry="16" fill="#c9a064"/><circle cx="${x + 33}" cy="${y + 44}" r="3" fill="#8a6a3a"/><circle cx="${x + 47}" cy="${y + 50}" r="3" fill="#8a6a3a"/>`);
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs><radialGradient id="g" cx="50%" cy="0%" r="90%"><stop offset="0" stop-color="#3b2d63"/><stop offset="1" stop-color="#120f1c"/></radialGradient></defs>
  <rect width="${W}" height="${H}" fill="url(#g)"/>
  <circle cx="1020" cy="110" r="46" fill="#f0e2c8" opacity=".9"/>
  ${tiles.join("\n  ")}
  <text x="70" y="250" font-family="JetBrains Mono" font-weight="700" font-size="84" fill="#f0e2c8">spud<tspan fill="#d9733a">warren</tspan></text>
  <text x="74" y="316" font-family="JetBrains Mono" font-size="30" fill="#a8957a">cozy potatopunk farming</text>
  <text x="74" y="364" font-family="JetBrains Mono" font-size="30" fill="#a8957a">you are a rat.</text>
  <g transform="translate(74 480)"><rect width="74" height="108" rx="30" fill="#0a0810" stroke="#b48cff" stroke-width="5"/><circle cx="54" cy="58" r="5" fill="#b48cff"/></g>
  <text x="170" y="540" font-family="JetBrains Mono" font-size="28" fill="#b48cff">the sixth door opens at night.</text>
  <text x="74" y="600" font-family="JetBrains Mono" font-size="24" fill="#6b5a46">spudwarren.bisks.net</text>
</svg>`;
const resvg = new Resvg(svg, { font: { fontFiles: [fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url))], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" } });
writeFileSync(fileURLToPath(new URL("./public/og.png", import.meta.url)), resvg.render().asPng());
console.log("wrote public/og.png");
