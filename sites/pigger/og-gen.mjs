// Generates public/og.png — the Open Graph preview card for pigger. A
// pixel-flavored street scene: pigman doctor mid-crossing on Nash Lane, a
// striped 7-Eleven awning up top, a rowdy student's car bearing down.
// Rasterised with @resvg/resvg-js (no system Chromium/fontconfig on this
// box; font bundled in ./fonts). Copied from lost-highway/og-gen.mjs.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const SKY1 = "#120d1a", SKY2 = "#241733", ROAD = "#232026", INK = "#f2e9da";
const ACCENT = "#ff8a3d", ACCENT2 = "#7fd8c8", AWNING = ["#d94f2b", "#f2f0e6", "#2a9d8f"];

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function awningStripes(x0, y0, w, h) {
  let out = "";
  const sw = 40;
  for (let i = 0; i * sw < w; i++) {
    out += `<rect x="${x0 + i * sw}" y="${y0}" width="${sw}" height="${h}" fill="${AWNING[i % 3]}"/>\n`;
  }
  return out;
}

// pigman doctor of mathematics, mid-crossing, paper bag under one arm
function pigDoctor(cx, cy, s) {
  return `
  <g transform="translate(${cx} ${cy}) scale(${s})">
    <rect x="-24" y="18" width="14" height="20" rx="4" fill="#caa9a0"/>
    <rect x="10" y="18" width="14" height="20" rx="4" fill="#caa9a0"/>
    <rect x="-30" y="-16" width="60" height="42" rx="14" fill="#f4f1e8" stroke="#d8d2c2" stroke-width="3"/>
    <text x="-8" y="14" font-family="JetBrains Mono" font-weight="800" font-size="18" fill="#7c6cff">&#960;</text>
    <path d="M -30 -8 L -40 14" stroke="#8a6a52" stroke-width="6" fill="none" stroke-linecap="round"/>
    <path d="M 30 -8 L 42 14" stroke="#8a6a52" stroke-width="6" fill="none" stroke-linecap="round"/>
    <rect x="26" y="-4" width="20" height="26" rx="3" fill="#b98a4a"/>
    <rect x="31" y="-22" width="10" height="20" rx="2" fill="#3a2a1a"/>
    <circle cx="0" cy="-34" r="26" fill="#e8a2a0"/>
    <ellipse cx="-20" cy="-50" rx="10" ry="15" fill="#d98684" transform="rotate(-25 -20 -50)"/>
    <ellipse cx="20" cy="-50" rx="10" ry="15" fill="#d98684" transform="rotate(25 20 -50)"/>
    <path d="M -8 -58 L -12 -68 M 0 -60 L 0 -70 M 8 -58 L 12 -68" stroke="#4a3a2a" stroke-width="3" stroke-linecap="round"/>
    <rect x="-12" y="-32" width="24" height="16" rx="7" fill="#d98684"/>
    <circle cx="-5" cy="-22" r="2.4" fill="#7a4a48"/>
    <circle cx="5" cy="-22" r="2.4" fill="#7a4a48"/>
    <circle cx="-10" cy="-38" r="8" fill="none" stroke="#221a14" stroke-width="3"/>
    <circle cx="10" cy="-38" r="8" fill="none" stroke="#221a14" stroke-width="3"/>
    <line x1="-2" y1="-38" x2="2" y2="-38" stroke="#221a14" stroke-width="3"/>
  </g>`;
}

function car(cx, cy, s, color, flip) {
  const dir = flip ? -1 : 1;
  return `
  <g transform="translate(${cx} ${cy}) scale(${s * dir},${s})">
    <rect x="-58" y="-28" width="116" height="56" rx="16" fill="${color}"/>
    <rect x="30" y="-20" width="20" height="40" rx="5" fill="#d2e6ff" opacity="0.75"/>
    <rect x="52" y="-20" width="6" height="12" fill="#fff3c4"/>
    <rect x="52" y="8" width="6" height="12" fill="#fff3c4"/>
    <rect x="-58" y="-20" width="5" height="12" fill="#ff5d73"/>
    <rect x="-58" y="8" width="5" height="12" fill="#ff5d73"/>
    <circle cx="-30" cy="30" r="14" fill="#111"/>
    <circle cx="28" cy="30" r="14" fill="#111"/>
  </g>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${SKY1}"/>
      <stop offset="1" stop-color="${SKY2}"/>
    </linearGradient>
    <linearGradient id="roadG" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2a2730"/>
      <stop offset="1" stop-color="${ROAD}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#sky)"/>

  <!-- 7-Eleven storefront strip, upper right -->
  <g transform="translate(760 20)">
    ${awningStripes(0, 0, 420, 26)}
    <rect x="0" y="26" width="420" height="90" fill="#171010"/>
    <rect x="160" y="40" width="120" height="70" fill="#0e2a2a" stroke="rgba(255,255,255,0.25)" stroke-width="3"/>
    <rect x="150" y="46" width="140" height="26" fill="#d94f2b"/>
    <text x="220" y="65" font-family="JetBrains Mono" font-weight="800" font-size="20" fill="#f2f0e6" text-anchor="middle">7-ELEVEN</text>
  </g>

  <!-- Nash Lane, three lanes rushing by -->
  <rect x="0" y="360" width="${W}" height="200" fill="url(#roadG)"/>
  <rect x="0" y="420" width="${W}" height="6" fill="#f2f0e6" opacity="0.4"/>
  <rect x="0" y="480" width="${W}" height="6" fill="#f2f0e6" opacity="0.4"/>

  ${car(980, 400, 1.05, "#ff206e", false)}
  ${car(220, 460, 0.95, "#457b9d", true)}
  ${car(1080, 520, 0.85, "#f4a300", false)}

  ${pigDoctor(430, 470, 1.55)}

  <rect width="${W}" height="${H}" fill="#000" opacity="0.10"/>

  <text x="64" y="120" font-family="JetBrains Mono" font-weight="800" font-size="88" letter-spacing="4" fill="${ACCENT}">PIGGER</text>
  <text x="66" y="160" font-family="JetBrains Mono" font-size="20" letter-spacing="2" fill="${ACCENT2}">A FROGGER FOR NASH LANE</text>
  <text x="66" y="600" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${INK}">pigger.bisks.net</text>
  <text x="66" y="200" font-family="JetBrains Mono" font-size="17" fill="${esc("#c9bfae")}">cross for the cheapest bourbon. cross back with the shakes.</text>
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
