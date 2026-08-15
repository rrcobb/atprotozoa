// Generates public/og.png — the Open Graph preview card, so a shared link
// unfurls a picture of the battle instead of a bare URL. Hand-drawn SVG at
// the canonical OG size, rasterised with @resvg/resvg-js (pure native
// module, no system Chromium/fontconfig needed — font is bundled in
// ./fonts and loaded explicitly). Copied from sites/simcluster-gacha/og-gen.mjs.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// Static, generic card (two colonies facing off, no real handle baked in) —
// the per-result share card is generated live, client-side, in
// public/app.js (buildShareCard).

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#0c0f0a", FG = "#eef4e3", DIM = "#9db08c";
const FOREST = "#6ee06e", DESERT = "#ffb15c";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="10%" cy="0%" r="60%">
      <stop offset="0" stop-color="#1c3312"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="90%" cy="100%" r="60%">
      <stop offset="0" stop-color="#3a2708"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${FOREST}"/>
      <stop offset="1" stop-color="${DESERT}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <text x="64" y="130" font-family="JetBrains Mono" font-weight="800" font-size="62" fill="url(#title)">ant battle</text>
  <text x="64" y="200" font-family="JetBrains Mono" font-size="20" fill="${DIM}">your Bluesky <tspan fill="${FG}">SimCluster</tspan> (self + mutuals),</text>
  <text x="64" y="230" font-family="JetBrains Mono" font-size="20" fill="${DIM}">split into two colonies and set loose.</text>
  <text x="64" y="288" font-family="JetBrains Mono" font-size="17" fill="${DIM}">HP/ATK/SPD from real followers/posts/follows.</text>
  <text x="64" y="316" font-family="JetBrains Mono" font-size="17" fill="${DIM}">seeded — same handle, same war, every time.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${FOREST}">antbattle.bisks.net</text>

  <!-- battlefield: forest ants (left, dots+legs) vs desert ants (right) -->
  <rect x="680" y="70" width="440" height="480" rx="24" fill="none" stroke="#2c3a20" stroke-width="3"/>
  <g stroke-linecap="round">
    ${[
      [740, 190], [800, 220], [860, 180], [760, 260], [830, 280], [900, 230], [780, 330], [850, 350], [910, 310], [740, 390],
    ]
      .map(
        ([x, y]) => `
      <g stroke="${FOREST}" stroke-width="3">
        <line x1="${x - 14}" y1="${y}" x2="${x - 6}" y2="${y - 8}" />
        <line x1="${x - 14}" y1="${y}" x2="${x - 6}" y2="${y + 8}" />
        <line x1="${x + 14}" y1="${y}" x2="${x + 6}" y2="${y - 8}" />
        <line x1="${x + 14}" y1="${y}" x2="${x + 6}" y2="${y + 8}" />
      </g>
      <circle cx="${x - 9}" cy="${y}" r="6" fill="${FOREST}" />
      <circle cx="${x}" cy="${y}" r="8" fill="${FOREST}" />
      <circle cx="${x + 10}" cy="${y}" r="7" fill="${FOREST}" />
    `,
      )
      .join("")}
  </g>
  <g stroke-linecap="round">
    ${[
      [960, 190], [1020, 220], [1080, 180], [980, 260], [1050, 280], [960, 330], [1030, 350], [1090, 310], [1000, 390],
    ]
      .map(
        ([x, y]) => `
      <g stroke="${DESERT}" stroke-width="3">
        <line x1="${x - 14}" y1="${y}" x2="${x - 6}" y2="${y - 8}" />
        <line x1="${x - 14}" y1="${y}" x2="${x - 6}" y2="${y + 8}" />
        <line x1="${x + 14}" y1="${y}" x2="${x + 6}" y2="${y - 8}" />
        <line x1="${x + 14}" y1="${y}" x2="${x + 6}" y2="${y + 8}" />
      </g>
      <circle cx="${x - 9}" cy="${y}" r="6" fill="${DESERT}" />
      <circle cx="${x}" cy="${y}" r="8" fill="${DESERT}" />
      <circle cx="${x + 10}" cy="${y}" r="7" fill="${DESERT}" />
    `,
      )
      .join("")}
  </g>
  <text x="900" y="440" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="26" fill="${FG}">forest <tspan fill="${DIM}">vs</tspan> desert</text>
  <text x="900" y="470" text-anchor="middle" font-family="JetBrains Mono" font-size="15" fill="${DIM}">two colonies. one war.</text>
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
