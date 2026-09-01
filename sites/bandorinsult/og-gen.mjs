// Generates public/og.png — the Open Graph preview card for bandorinsult.
// Static artwork (not tied to any real playthrough — per-score cards are
// drawn live client-side in public/index.html's buildShareCard). Rasterised
// with @resvg/resvg-js, same recipe as sites/stanquiz/og-gen.mjs.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#08090d", INK = "#eef2f7", MUTED = "#8b96a8";
const BAND = "#59d38c", INSULT = "#ff6b81", GOLD = "#ffd166";
const CARD = "#12141c", BORDER = "rgba(238,242,247,0.14)";

let seed = 99;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

function scatter(cx, cy, r, n, color) {
  let dots = "";
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2;
    const rr = Math.sqrt(rnd()) * r;
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr * 0.8;
    dots += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(rnd() * 2.2 + 1.1).toFixed(1)}" fill="${color}" opacity="0.45"/>`;
  }
  return dots;
}

const bgDots = scatter(230, 420, 260, 26, BAND) + scatter(950, 500, 220, 22, INSULT);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="bg" cx="20%" cy="12%" r="65%">
      <stop offset="0" stop-color="#1c1030"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  ${bgDots}

  <text x="60" y="140" font-family="JetBrains Mono" font-weight="800" font-size="56" fill="${BAND}">Band Name</text>
  <text x="60" y="200" font-family="JetBrains Mono" font-weight="800" font-size="56" fill="${INK}">or <tspan fill="${INSULT}">Insult</tspan></text>
  <text x="60" y="250" font-family="JetBrains Mono" font-size="20" fill="${MUTED}">a noun phrase. ten rounds. tell rock</text>
  <text x="60" y="278" font-family="JetBrains Mono" font-size="20" fill="${MUTED}">and roll from a roast.</text>

  <text x="60" y="560" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${GOLD}">bandorinsult.bisks.net</text>

  <rect x="660" y="80" width="480" height="470" rx="18" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>
  <text x="900" y="150" text-anchor="middle" font-family="JetBrains Mono" font-size="18" fill="${MUTED}">is this a real band?</text>
  <text x="900" y="230" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="40" fill="${INK}">“Toad the Wet</text>
  <text x="900" y="278" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="40" fill="${INK}">Sprocket”</text>
  <line x1="712" y1="330" x2="1088" y2="330" stroke="${BORDER}" stroke-width="1" stroke-dasharray="3,4"/>
  <text x="900" y="390" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="26" fill="${BAND}">[ Band Name ]</text>
  <text x="900" y="440" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="26" fill="${INSULT}">[ Insult ]</text>
  <text x="900" y="500" text-anchor="middle" font-family="JetBrains Mono" font-size="16" fill="${MUTED}">(it's a real band. 90s alt-rock.)</text>
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
