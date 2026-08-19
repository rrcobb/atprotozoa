// Generates public/og.png — the Open Graph preview card for biasdetective.
// Same recipe as sites/receipts/og-gen.mjs: hand-drawn SVG at the canonical
// OG size, rasterised with @resvg/resvg-js (no system Chromium needed).
// Note: resvg here has no color-emoji support, so the icon is drawn by hand
// (a magnifying glass) rather than referencing an emoji glyph.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const NAVY = "#1a2340", NAVY_DEEP = "#10152a", CREAM = "#fbf3e3";
const MUSTARD = "#f2b134", CORAL = "#ef6f6c", TEAL = "#2ec4b6";

const badges = [
  { c: MUSTARD, l: "S" },
  { c: CORAL, l: "S" },
  { c: TEAL, l: "C" },
  { c: "#7fb8c9", l: "A" },
  { c: "#b985e0", l: "H" },
  { c: "#8fce6a", l: "$" },
];
const badgeGap = 74;
const badgeStartX = 64;
const badgeY = 500;
const badgesSvg = badges
  .map((b, i) => {
    const x = badgeStartX + i * badgeGap;
    return `
    <circle cx="${x}" cy="${badgeY}" r="28" fill="${NAVY_DEEP}" stroke="${b.c}" stroke-width="3"/>
    <text x="${x}" y="${badgeY + 9}" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="22" fill="${b.c}">${b.l}</text>`;
  })
  .join("\n");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="10%" cy="0%" r="55%">
      <stop offset="0" stop-color="#2a3a1a" stop-opacity="0.4"/>
      <stop offset="1" stop-color="${NAVY}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="92%" cy="95%" r="55%">
      <stop offset="0" stop-color="#123632" stop-opacity="0.5"/>
      <stop offset="1" stop-color="${NAVY}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${MUSTARD}"/>
      <stop offset="1" stop-color="${CORAL}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${NAVY}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <!-- hand-drawn magnifying glass -->
  <g transform="translate(950,150)">
    <circle cx="0" cy="0" r="90" fill="none" stroke="${CREAM}" stroke-width="14"/>
    <circle cx="0" cy="0" r="90" fill="none" stroke="${MUSTARD}" stroke-width="4" opacity="0.6"/>
    <line x1="64" y1="64" x2="150" y2="150" stroke="${CREAM}" stroke-width="20" stroke-linecap="round"/>
  </g>

  <text x="64" y="130" font-family="JetBrains Mono" font-weight="800" font-size="54" fill="url(#title)">BIAS DETECTIVE</text>
  <text x="64" y="184" font-family="JetBrains Mono" font-weight="800" font-size="54" fill="url(#title)">ACADEMY</text>

  <text x="64" y="248" font-family="JetBrains Mono" font-size="20" fill="${CREAM}">Six real cases that train your brain to catch</text>
  <text x="64" y="276" font-family="JetBrains Mono" font-size="20" fill="${CREAM}">tricky thinking &#8212; built for kid detectives.</text>

  <text x="64" y="340" font-family="JetBrains Mono" font-size="16" fill="#8891b8">survivorship &#183; selection &#183; confirmation</text>
  <text x="64" y="364" font-family="JetBrains Mono" font-size="16" fill="#8891b8">availability &#183; hindsight &#183; small-sample bias</text>

  <text x="64" y="466" font-family="JetBrains Mono" font-size="15" letter-spacing="2" fill="#8891b8">EARN ALL SIX BADGES</text>
  ${badgesSvg}

  <text x="64" y="580" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${MUSTARD}">biasdetective.bisks.net</text>
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
