// Generates public/og.png — the Open Graph preview card for windchimes, so a
// shared link auto-renders a picture of the idea in Bluesky / other
// unfurlers.
//
// Hand-drawn SVG at the canonical OG size: five hanging chime tubes (one per
// material accent) over a dusk-sky gradient with a couple of wind streaks,
// over the wordmark. Rasterised with @resvg/resvg-js (pure native module, no
// system Chromium/fontconfig needed — the font is bundled in ./fonts and
// loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork. Adapted from sites/chimehose/og-gen.mjs.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#05070a", PANEL = "#0b0f14", INK = "#eef2f5", MUTED = "#9fb0c0";
const ACCENT = "#ffb454";
const BORDER = "rgba(238,242,245,0.14)";

// Five tubes, longest (lowest note) on the left, each a distinct material
// accent so the card reads as "pick a material" at a glance.
const TUBES = [
  { x: 230, len: 230, w: 34, top: "#a3713f", bottom: "#4c3019", glow: "#e2a765" }, // wood
  { x: 400, len: 200, w: 26, top: "#cfca86", bottom: "#5f6b37", glow: "#b9d97a" }, // bamboo
  { x: 570, len: 250, w: 22, top: "#eef4fa", bottom: "#5e6d7c", glow: "#cfe3f5" }, // metal
  { x: 740, len: 180, w: 30, top: "#e1fcfc", bottom: "#5fa3a3", glow: "#7ff0e8" }, // glass
  { x: 910, len: 210, w: 34, top: "#a3713f", bottom: "#4c3019", glow: "#e2a765" }, // wood
];

const barY = 150;

function tube(t) {
  const rx = t.w * 0.4;
  return `
  <line x1="${t.x}" y1="${barY}" x2="${t.x}" y2="${barY + 16}" stroke="rgba(230,230,230,0.35)" stroke-width="2"/>
  <rect x="${t.x - t.w / 2}" y="${barY + 16}" width="${t.w}" height="${t.len}" rx="${rx}"
        fill="url(#grad-${t.x})" opacity="0.97"/>
  <circle cx="${t.x}" cy="${barY + 16 + t.len * 0.5}" r="${t.w * 1.6}" fill="${t.glow}" opacity="0.14"/>`;
}

function gradDef(t) {
  return `<linearGradient id="grad-${t.x}" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="${t.top}"/>
    <stop offset="0.5" stop-color="${t.top}"/>
    <stop offset="1" stop-color="${t.bottom}"/>
  </linearGradient>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0c1420"/>
      <stop offset="1" stop-color="${BG}"/>
    </linearGradient>
    ${TUBES.map(gradDef).join("\n")}
  </defs>
  <rect width="${W}" height="${H}" fill="url(#sky)"/>

  <!-- wind streaks -->
  <g stroke="rgba(255,255,255,0.12)" stroke-width="2">
    <line x1="40" y1="90" x2="140" y2="90"/>
    <line x1="1000" y1="130" x2="1120" y2="130"/>
    <line x1="80" y1="420" x2="170" y2="420"/>
    <line x1="1020" y1="380" x2="1150" y2="380"/>
  </g>

  <!-- suspension bar -->
  <line x1="180" y1="${barY}" x2="960" y2="${barY}" stroke="rgba(200,200,210,0.4)" stroke-width="7"/>

  ${TUBES.map(tube).join("\n")}

  <text x="60" y="90" font-family="JetBrains Mono" font-weight="800" font-size="60" fill="${INK}">wind<tspan fill="${ACCENT}">chimes</tspan></text>
  <text x="60" y="130" font-family="JetBrains Mono" font-size="22" fill="${MUTED}">hung on the atproto firehose</text>

  <rect x="60" y="470" width="1080" height="110" rx="14" fill="${PANEL}" stroke="${BORDER}" stroke-width="1.5"/>
  <text x="90" y="512" font-family="JetBrains Mono" font-size="19" fill="${ACCENT}">wood · bamboo · metal · glass</text>
  <text x="90" y="546" font-family="JetBrains Mono" font-size="19" fill="${MUTED}">pick a material and a key</text>
  <text x="620" y="512" font-family="JetBrains Mono" font-size="19" fill="${INK}">every post strikes a chime</text>
  <text x="620" y="546" font-family="JetBrains Mono" font-size="19" fill="${MUTED}">busy firehose, windy day</text>

  <text x="60" y="600" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT}">windchimes.bisks.net</text>
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
