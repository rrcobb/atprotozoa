// Generates public/og.png — the Open Graph preview card for platoscave, so a
// shared link auto-renders in Bluesky / other unfurlers.
//
// The cave, rendered once as flat vector art: puppeteers behind a low wall
// hold cutouts up to the fire, three prisoners chained in the foreground
// stare at the shadows on the back wall. Y2K flash-portal palette — hot
// magenta/cyan glow, chrome-bevel title text, scanlines.
// Rasterised with @resvg/resvg-js (pure native module, no system Chromium
// needed — font bundled in ./fonts and loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run by hand if the
// artwork changes. Adapted from sites/fitzcarraldo/og-gen.mjs.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const C = {
  rock: "#1a0f22", rockLo: "#100815", rockHi: "#2a1a34",
  fire: "#ff6a00", fireHot: "#ffd23f", fireGlow: "#ff2fb8",
  wall: "#241130", shadow: "#0a0410",
  chain: "#4a3a55", prisoner: "#150a1c",
  magenta: "#ff2fd6", cyan: "#2fe6ff", ink: "#0a0410", cream: "#fff4e0",
};

function shadowPuppet(cx, cy, scale, kind) {
  // crude cutout silhouettes cast on the back wall — deliberately vector-crude,
  // like someone's first week in Flash 5
  const s = scale;
  if (kind === "horse") {
    return `<g transform="translate(${cx} ${cy}) scale(${s})" fill="${C.shadow}">
      <ellipse cx="0" cy="0" rx="46" ry="20"/>
      <polygon points="-40,-10 -60,-38 -48,-6"/>
      <rect x="-34" y="10" width="10" height="30"/>
      <rect x="24" y="10" width="10" height="30"/>
      <polygon points="44,-6 62,-2 64,6 44,10"/>
    </g>`;
  }
  if (kind === "bird") {
    return `<g transform="translate(${cx} ${cy}) scale(${s})" fill="${C.shadow}">
      <ellipse cx="0" cy="0" rx="26" ry="14"/>
      <polygon points="-60,-30 0,-4 -50,4"/>
      <polygon points="60,-26 0,-2 52,8"/>
      <polygon points="24,-8 40,-16 30,2"/>
    </g>`;
  }
  return `<g transform="translate(${cx} ${cy}) scale(${s})" fill="${C.shadow}">
    <path d="M -20,30 C -30,10 -30,-20 -14,-32 C -6,-38 6,-38 14,-32 C 30,-20 30,10 20,30 Z"/>
    <ellipse cx="0" cy="-34" rx="10" ry="6"/>
  </g>`;
}

function prisoner(cx, baseY) {
  return `<g transform="translate(${cx} ${baseY})">
    <rect x="-9" y="-64" width="18" height="46" rx="6" fill="${C.prisoner}"/>
    <circle cx="0" cy="-74" r="12" fill="${C.prisoner}"/>
    <rect x="-9" y="-20" width="8" height="20" fill="${C.prisoner}"/>
    <rect x="1" y="-20" width="8" height="20" fill="${C.prisoner}"/>
    <line x1="0" y1="-74" x2="0" y2="6" stroke="${C.chain}" stroke-width="2" stroke-dasharray="4 3" opacity="0.8"/>
    <circle cx="0" cy="8" r="4" fill="${C.chain}"/>
  </g>`;
}

const puppets = [
  shadowPuppet(300, 210, 1.5, "horse"),
  shadowPuppet(560, 190, 1.9, "urn"),
  shadowPuppet(860, 205, 1.6, "bird"),
];

const prisoners = [prisoner(430, 470), prisoner(600, 480), prisoner(770, 470)];

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="fireglow" cx="50%" cy="60%" r="65%">
      <stop offset="0" stop-color="${C.fireGlow}" stop-opacity="0.55"/>
      <stop offset="0.5" stop-color="${C.magenta}" stop-opacity="0.18"/>
      <stop offset="1" stop-color="${C.rock}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="wallgrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${C.wall}"/>
      <stop offset="1" stop-color="${C.rockLo}"/>
    </linearGradient>
    <linearGradient id="floorgrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#120817"/>
      <stop offset="1" stop-color="#05020a"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${C.rock}"/>
  <rect x="0" y="0" width="${W}" height="360" fill="url(#wallgrad)"/>
  <rect x="0" y="0" width="${W}" height="${H}" fill="url(#fireglow)"/>

  ${puppets.join("\n  ")}

  <rect x="0" y="360" width="${W}" height="${H - 360}" fill="url(#floorgrad)"/>
  <rect x="0" y="356" width="${W}" height="10" fill="${C.rockHi}" opacity="0.6"/>

  <!-- low wall the puppeteers work behind -->
  <rect x="0" y="380" width="${W}" height="18" fill="#3a2848"/>
  <rect x="0" y="380" width="${W}" height="4" fill="#5a3e70"/>

  <!-- fire, foreground, between puppets and prisoners -->
  <g transform="translate(600 430)">
    <ellipse cx="0" cy="30" rx="70" ry="14" fill="#000" opacity="0.4"/>
    <polygon points="-30,20 -40,-30 -8,-70 10,-30 34,-10 8,-2 20,20" fill="${C.fire}"/>
    <polygon points="-14,16 -18,-18 0,-46 14,-14 4,4" fill="${C.fireHot}"/>
  </g>

  ${prisoners.join("\n  ")}

  <!-- scanlines -->
  <g opacity="0.12">
    ${Array.from({ length: Math.floor(H / 4) }, (_, i) =>
      `<rect x="0" y="${i * 4}" width="${W}" height="1" fill="#000"/>`
    ).join("")}
  </g>

  <rect x="0" y="0" width="${W}" height="${H}" fill="rgba(10,4,16,0.18)"/>

  <text x="600" y="96" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="62" fill="${C.cream}" stroke="${C.magenta}" stroke-width="6" paint-order="stroke" style="letter-spacing:2px">PLATO'S CAVE</text>
  <text x="600" y="138" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="23" fill="${C.cyan}" stroke="#000" stroke-width="4" paint-order="stroke">a flash-game simulator of the Allegory · est. 2002</text>
  <text x="600" y="600" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="26" fill="${C.cream}" stroke="#000" stroke-width="4" paint-order="stroke">bisks.net/games/platoscave</text>
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
