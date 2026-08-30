// Generates public/og.png — the Open Graph preview card for meowsphere, so a
// shared link auto-renders a picture of the idea in Bluesky / other
// unfurlers.
//
// Hand-drawn SVG at the canonical OG size: a wireframe sphere studded with
// small glowing "meow" bubbles, plus a vector paw print (drawn from plain
// circles, not an emoji glyph — the bundled JetBrains Mono build here can't
// shape emoji, same workaround used across sites/*/og-gen.mjs). Rasterised
// with @resvg/resvg-js (pure native module, no system Chromium/fontconfig
// needed — the font is bundled in ./fonts and loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork. Adapted from sites/semanticmute/og-gen.mjs.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#08090d", PANEL = "#10121b", INK = "#e8ecf3", MUTED = "#8a96ac";
const CAT = "#ffb86b", CAT2 = "#ff8fb3", ACCENT = "#6ee7c8";
const BORDER = "rgba(232,236,243,0.14)";

// Sphere: an ellipse outline (a circle in perspective) plus a handful of
// small "bubble" pills scattered across it, brighter near the "front."
const cx = 860, cy = 250, rx = 230, ry = 210;
const latLines = [0.35, 0.62, 0.85].map(
  (k) =>
    `<ellipse cx="${cx}" cy="${cy}" rx="${(rx * k).toFixed(1)}" ry="${(ry * 0.32).toFixed(1)}" fill="none" stroke="${MUTED}" stroke-width="1.5" opacity="0.28"/>`,
);
const bubbles = [
  { x: 760, y: 120, o: 0.95, r: 8 },
  { x: 930, y: 95, o: 0.55, r: 6 },
  { x: 1020, y: 175, o: 0.85, r: 7 },
  { x: 690, y: 210, o: 0.7, r: 6 },
  { x: 860, y: 250, o: 1, r: 10 },
  { x: 1000, y: 300, o: 0.5, r: 5 },
  { x: 780, y: 340, o: 0.65, r: 6 },
  { x: 930, y: 380, o: 0.9, r: 8 },
  { x: 700, y: 330, o: 0.4, r: 5 },
  { x: 1060, y: 260, o: 0.35, r: 4 },
];
const bubblesSvg = bubbles
  .map(
    (b) =>
      `<circle cx="${b.x}" cy="${b.y}" r="${b.r}" fill="${CAT}" opacity="${b.o}"/>`,
  )
  .join("\n  ");

// Paw print, drawn from circles only (no emoji glyph reliance): one big pad
// plus four toes.
function pawPrint(px, py, s, color, opacity) {
  return `<g transform="translate(${px} ${py}) scale(${s})" fill="${color}" opacity="${opacity}">
    <ellipse cx="0" cy="14" rx="17" ry="14"/>
    <ellipse cx="-19" cy="-8" rx="7.5" ry="9.5" transform="rotate(-18 -19 -8)"/>
    <ellipse cx="-6" cy="-16" rx="7.5" ry="9.5" transform="rotate(-6 -6 -16)"/>
    <ellipse cx="8" cy="-16" rx="7.5" ry="9.5" transform="rotate(6 8 -16)"/>
    <ellipse cx="20" cy="-7" rx="7.5" ry="9.5" transform="rotate(18 20 -7)"/>
  </g>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="bgL" cx="18%" cy="30%" r="55%">
      <stop offset="0" stop-color="#3a2414"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="bgR" cx="82%" cy="35%" r="60%">
      <stop offset="0" stop-color="#2a1830"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="sphereGlow" cx="50%" cy="45%" r="55%">
      <stop offset="0" stop-color="#3a2a14" stop-opacity="0.9"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#bgL)"/>
  <rect width="${W}" height="${H}" fill="url(#bgR)"/>

  <circle cx="${cx}" cy="${cy}" r="260" fill="url(#sphereGlow)"/>
  <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="${CAT}" stroke-width="2" opacity="0.55"/>
  ${latLines.join("\n  ")}
  <line x1="${cx}" y1="${cy - ry}" x2="${cx}" y2="${cy + ry}" stroke="${MUTED}" stroke-width="1.5" opacity="0.25"/>
  ${bubblesSvg}

  ${pawPrint(150, 470, 1.9, CAT2, 0.9)}
  ${pawPrint(230, 400, 1.15, CAT2, 0.35)}

  <text x="60" y="290" font-family="JetBrains Mono" font-weight="800" font-size="64" fill="${INK}">meow<tspan fill="${CAT}">sphere</tspan></text>
  <text x="60" y="334" font-family="JetBrains Mono" font-size="23" fill="${MUTED}">a live sphere of cats</text>

  <rect x="60" y="520" width="1080" height="70" rx="12" fill="${PANEL}" stroke="${BORDER}" stroke-width="1.5"/>
  <text x="90" y="564" font-family="JetBrains Mono" font-size="19" fill="${INK}">every "meow" on the Bluesky firehose, right now, orbiting a globe you can spin</text>

  <text x="60" y="612" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT}">meowsphere.bisks.net</text>
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
