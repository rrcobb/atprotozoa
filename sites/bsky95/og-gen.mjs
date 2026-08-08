// Generates public/og.png — the Open Graph preview card for bsky95.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium/fontconfig needed — font bundled
// in ./fonts and loaded explicitly). Re-run by hand if the artwork changes.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const DESKTOP = "#008080";
const FACE = "#c0c0c0";
const HILITE = "#ffffff";
const SHADOW = "#808080";
const DARK = "#0a0a0a";
const TITLE_A = "#000080";
const TITLE_B = "#1084d0";
const INK = "#000000";

// A beveled rect: outset (raised) by default, inset when pressed=true.
function bevel(x, y, w, h, pressed = false) {
  const light = pressed ? DARK : HILITE;
  const dark = pressed ? HILITE : DARK;
  const midLight = pressed ? SHADOW : "#dfdfdf";
  const midDark = pressed ? "#dfdfdf" : SHADOW;
  return `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${FACE}"/>
    <line x1="${x}" y1="${y}" x2="${x + w}" y2="${y}" stroke="${light}" stroke-width="2"/>
    <line x1="${x}" y1="${y}" x2="${x}" y2="${y + h}" stroke="${light}" stroke-width="2"/>
    <line x1="${x + w}" y1="${y}" x2="${x + w}" y2="${y + h}" stroke="${dark}" stroke-width="2"/>
    <line x1="${x}" y1="${y + h}" x2="${x + w}" y2="${y + h}" stroke="${dark}" stroke-width="2"/>
    <line x1="${x + 2}" y1="${y + h - 2}" x2="${x + w - 2}" y2="${y + h - 2}" stroke="${midDark}" stroke-width="1"/>
    <line x1="${x + w - 2}" y1="${y + 2}" x2="${x + w - 2}" y2="${y + h - 2}" stroke="${midDark}" stroke-width="1"/>
  `;
}

function tile(x, y, size, color, glyph) {
  const iconSize = size - 14;
  let icon = "";
  if (glyph === "house") {
    icon = `<polygon points="${x + size / 2},${y + 8} ${x + size - 10},${y + size / 2 - 2} ${x + 10},${y + size / 2 - 2}" fill="${color}"/>
      <rect x="${x + 14}" y="${y + size / 2 - 2}" width="${size - 28}" height="${size / 2 - 12}" fill="${color}"/>`;
  } else if (glyph === "circle") {
    icon = `<circle cx="${x + size / 2}" cy="${y + size / 2 - 2}" r="${iconSize / 3}" fill="none" stroke="${color}" stroke-width="5"/>
      <line x1="${x + size / 2 + iconSize / 3 - 2}" y1="${y + size / 2 + iconSize / 3 - 4}" x2="${x + size - 10}" y2="${y + size - 10}" stroke="${color}" stroke-width="5"/>`;
  } else if (glyph === "people") {
    icon = `<circle cx="${x + size / 2 - 8}" cy="${y + size / 2 - 6}" r="8" fill="${color}"/>
      <circle cx="${x + size / 2 + 10}" cy="${y + size / 2 - 2}" r="8" fill="${color}"/>
      <rect x="${x + size / 2 - 18}" y="${y + size / 2 + 2}" width="20" height="14" fill="${color}"/>
      <rect x="${x + size / 2 - 2}" y="${y + size / 2 + 6}" width="20" height="14" fill="${color}"/>`;
  } else if (glyph === "pencil") {
    icon = `<rect x="${x + size / 2 - 4}" y="${y + 10}" width="8" height="${iconSize - 4}" fill="${color}" transform="rotate(35 ${x + size / 2} ${y + size / 2})"/>`;
  } else if (glyph === "arrows") {
    icon = `<circle cx="${x + size / 2}" cy="${y + size / 2 - 2}" r="${iconSize / 3}" fill="none" stroke="${color}" stroke-width="5" stroke-dasharray="10 6"/>`;
  } else if (glyph === "bell") {
    icon = `<path d="M ${x + size / 2} ${y + 10} Q ${x + size - 14} ${y + 10} ${x + size - 14} ${y + size / 2}
      L ${x + size - 14} ${y + size - 16} L ${x + 14} ${y + size - 16} L ${x + 14} ${y + size / 2}
      Q ${x + 14} ${y + 10} ${x + size / 2} ${y + 10} Z" fill="${color}"/>`;
  } else if (glyph === "chart") {
    icon = `<rect x="${x + 14}" y="${y + size - 26}" width="10" height="16" fill="${color}"/>
      <rect x="${x + 28}" y="${y + size - 34}" width="10" height="24" fill="${color}"/>
      <rect x="${x + 42}" y="${y + size - 42}" width="10" height="32" fill="${color}"/>`;
  }
  return `${bevel(x, y, size, size)}${icon}`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${DESKTOP}"/>

  <!-- window -->
  ${bevel(70, 55, 900, 500)}

  <!-- titlebar -->
  <defs>
    <linearGradient id="tb" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${TITLE_A}"/>
      <stop offset="1" stop-color="${TITLE_B}"/>
    </linearGradient>
  </defs>
  <rect x="74" y="59" width="892" height="34" fill="url(#tb)"/>
  <text x="90" y="83" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="#ffffff">Bluesky Social</text>
  ${bevel(930, 65, 22, 22)}
  ${bevel(936 + 20, 65, 22, 22)}

  <!-- menubar -->
  <rect x="74" y="93" width="892" height="26" fill="${FACE}"/>
  <text x="90" y="111" font-family="JetBrains Mono" font-size="15" fill="${INK}">File  Edit  View  Favorites  Tools  Help</text>
  <line x1="74" y1="119" x2="966" y2="119" stroke="${SHADOW}" stroke-width="1"/>

  <!-- groupbox: Explore -->
  <rect x="92" y="140" width="270" height="110" fill="none" stroke="${SHADOW}" stroke-width="2"/>
  <rect x="106" y="132" width="66" height="14" fill="${FACE}"/>
  <text x="110" y="143" font-family="JetBrains Mono" font-size="14" fill="${INK}">Explore</text>
  ${tile(112, 158, 70, TITLE_A, "house")}
  ${tile(196, 158, 70, TITLE_A, "circle")}

  <!-- groupbox: Your Timeline -->
  <rect x="378" y="140" width="300" height="110" fill="none" stroke="${SHADOW}" stroke-width="2"/>
  <rect x="392" y="132" width="118" height="14" fill="${FACE}"/>
  <text x="396" y="143" font-family="JetBrains Mono" font-size="14" fill="${INK}">Your Timeline</text>
  ${tile(398, 158, 70, TITLE_A, "people")}
  ${tile(482, 158, 70, TITLE_A, "arrows")}
  ${tile(566, 158, 70, TITLE_A, "chart")}

  <!-- groupbox: Post & Connect -->
  <rect x="694" y="140" width="256" height="110" fill="none" stroke="${SHADOW}" stroke-width="2"/>
  <rect x="708" y="132" width="150" height="14" fill="${FACE}"/>
  <text x="712" y="143" font-family="JetBrains Mono" font-size="14" fill="${INK}">Post &amp; Connect</text>
  ${tile(714, 158, 70, TITLE_A, "pencil")}
  ${tile(798, 158, 70, TITLE_A, "arrows")}

  <!-- groupbox: Discover -->
  <rect x="92" y="266" width="270" height="110" fill="none" stroke="${SHADOW}" stroke-width="2"/>
  <rect x="106" y="258" width="86" height="14" fill="${FACE}"/>
  <text x="110" y="269" font-family="JetBrains Mono" font-size="14" fill="${INK}">Discover</text>
  ${tile(112, 284, 70, TITLE_A, "chart")}
  ${tile(196, 284, 70, TITLE_A, "circle")}

  <!-- groupbox: Notifications -->
  <rect x="378" y="266" width="300" height="110" fill="none" stroke="${SHADOW}" stroke-width="2"/>
  <rect x="392" y="258" width="140" height="14" fill="${FACE}"/>
  <text x="396" y="269" font-family="JetBrains Mono" font-size="14" fill="${INK}">Notifications</text>
  ${tile(398, 284, 70, TITLE_A, "bell")}
  ${tile(482, 284, 70, TITLE_A, "bell")}

  <!-- statusbar -->
  ${bevel(74, 500, 892, 30, true)}
  <text x="88" y="520" font-family="JetBrains Mono" font-size="14" fill="${INK}">Ready</text>

  <text x="70" y="590" font-family="JetBrains Mono" font-weight="700" font-size="30" fill="#ffffff">BLUESKY SOCIAL — WINDOWS 95 EDITION</text>
  <text x="70" y="620" font-family="JetBrains Mono" font-size="20" fill="#d6f3f0">bsky95.bisks.net</text>
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
