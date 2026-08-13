// Generates public/og.png — catspace's default Open Graph preview card.
// Hand-drawn SVG (bubblegum theme, no external assets — the cat face is
// drawn with plain shapes since resvg has no emoji glyphs available),
// rasterised with @resvg/resvg-js. Same recipe as sites/didscope/og-gen.mjs.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG1 = "#ff9ce6", BG2 = "#b98cff", ACCENT = "#ff2fb0", ACCENT2 = "#7a2ea6", TEXT = "#2a0e3a", CARD = "#fff8fd";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// A simple geometric cat face: circle head, two triangle ears, dot eyes,
// a small triangle nose, and whisker lines.
function catFace(cx, cy, r) {
  const earW = r * 0.55, earH = r * 0.7;
  return `
    <g>
      <polygon points="${cx - r * 0.75},${cy - r * 0.55} ${cx - r * 0.75 + earW},${cy - r * 0.55} ${cx - r * 0.55},${cy - r * 1.15}" fill="${ACCENT2}" />
      <polygon points="${cx + r * 0.75},${cy - r * 0.55} ${cx + r * 0.75 - earW},${cy - r * 0.55} ${cx + r * 0.55},${cy - r * 1.15}" fill="${ACCENT2}" />
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="${ACCENT}" />
      <circle cx="${cx - r * 0.35}" cy="${cy - r * 0.1}" r="${r * 0.09}" fill="${CARD}" />
      <circle cx="${cx + r * 0.35}" cy="${cy - r * 0.1}" r="${r * 0.09}" fill="${CARD}" />
      <polygon points="${cx},${cy + r * 0.15} ${cx - r * 0.08},${cy + r * 0.02} ${cx + r * 0.08},${cy + r * 0.02}" fill="${CARD}" />
      <line x1="${cx - r * 0.15}" y1="${cy + r * 0.25}" x2="${cx - r * 0.55}" y2="${cy + r * 0.15}" stroke="${CARD}" stroke-width="3" />
      <line x1="${cx - r * 0.15}" y1="${cy + r * 0.32}" x2="${cx - r * 0.55}" y2="${cy + r * 0.32}" stroke="${CARD}" stroke-width="3" />
      <line x1="${cx + r * 0.15}" y1="${cy + r * 0.25}" x2="${cx + r * 0.55}" y2="${cy + r * 0.15}" stroke="${CARD}" stroke-width="3" />
      <line x1="${cx + r * 0.15}" y1="${cy + r * 0.32}" x2="${cx + r * 0.55}" y2="${cy + r * 0.32}" stroke="${CARD}" stroke-width="3" />
    </g>`;
}

function sparkle(cx, cy, s, color) {
  return `<polygon fill="${color}" points="
    ${cx},${cy - s} ${cx + s * 0.28},${cy - s * 0.28} ${cx + s},${cy}
    ${cx + s * 0.28},${cy + s * 0.28} ${cx},${cy + s} ${cx - s * 0.28},${cy + s * 0.28}
    ${cx - s},${cy} ${cx - s * 0.28},${cy - s * 0.28}" />`;
}

let sparkles = "";
const sparkleSpots = [
  [120, 90, 14], [1080, 120, 18], [980, 480, 12], [140, 520, 16],
  [640, 60, 10], [960, 260, 9], [90, 300, 10], [1120, 400, 13],
];
for (const [x, y, s] of sparkleSpots) sparkles += sparkle(x, y, s, "#ffffff");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${BG1}"/>
      <stop offset="1" stop-color="${BG2}"/>
    </linearGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="1" stop-color="#ffe9fb"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  ${sparkles}

  <g transform="translate(120, 315)">
    ${catFace(0, 0, 130)}
  </g>

  <text x="400" y="230" font-family="JetBrains Mono" font-weight="800" font-size="88" fill="url(#title)">catspace</text>
  <text x="404" y="288" font-family="JetBrains Mono" font-weight="700" font-size="26" fill="#3a1550">myspace, but it's for your cat</text>

  <rect x="400" y="330" width="620" height="200" rx="16" fill="${CARD}" stroke="${ACCENT2}" stroke-width="3" stroke-dasharray="2,6"/>
  <text x="428" y="378" font-family="JetBrains Mono" font-size="20" fill="${TEXT}">mood: <tspan font-weight="700" fill="${ACCENT}">Feral</tspan></text>
  <text x="428" y="414" font-family="JetBrains Mono" font-size="20" fill="${TEXT}">now purring to: the can opener</text>
  <text x="428" y="450" font-family="JetBrains Mono" font-size="20" fill="${TEXT}">top 8 friends · guestbook · glitter</text>
  <text x="428" y="496" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${ACCENT2}">a real net.bisks.catspace.profile record</text>

  <text x="404" y="600" font-family="JetBrains Mono" font-weight="800" font-size="24" fill="#ffffff">catspace.bisks.net</text>
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
