// Generates public/og.png — the Open Graph preview card for tubersona.
// Unlike bodyshop's og-gen (which hand-draws a stand-in because its live
// renderer leans on hsl()/pattern fills resvg doesn't reliably support),
// tubergen.js only uses flat hex colors and a plain radialGradient, so this
// calls the real lib/tuberbuilder.js + lib/tubergen.js and rasterizes an
// actual rollable build — the card is never out of sync with what the site
// draws.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { mulberry32, rollBuild, buildTitle, POINTS, SHAPES, VARIETIES, SPUD_DENSITIES } from "./public/lib/tuberbuilder.js";
import { tuberSVG } from "./public/lib/tubergen.js";

const W = 1200, H = 630;
const BG = "#16130e", FG = "#f2ead9", DIM = "#b3a58f";
const ACCENT = "#8fae63", ACCENT2 = "#ffd24e";

// Hand-picked "heirloom" build for the card — reads well at OG size:
// knobby shape, three eyes, leafy sprout, katana.
const rng = mulberry32(777);
const build = {
  seed: 777,
  tier: { id: "heirloom", label: "Heirloom", color: "#ffd24e" },
  variety: VARIETIES.find((v) => v.id === "purple"),
  shape: SHAPES.find((s) => s.id === "knobby"),
  bumps: Array.from({ length: POINTS }, () => 1 + (rng() * 2 - 1) * 0.16),
  eyeCount: 3,
  spudDensity: SPUD_DENSITIES.find((s) => s.id === "freckled"),
  spuds: Array.from({ length: 4 }, () => ({ a: rng() * Math.PI * 2, r: 0.35 + rng() * 0.5, size: 2 + rng() * 2.2 })),
  sprout: { id: "leafy", label: "Leafy Sprout" },
  accessory: { id: "katana", label: "Katana" },
};

const tuberInner = tuberSVG(build).replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="10%" cy="0%" r="55%">
      <stop offset="0" stop-color="#2a3416"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="95%" cy="100%" r="60%">
      <stop offset="0" stop-color="#241f0a"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${ACCENT}"/>
      <stop offset="1" stop-color="${ACCENT2}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <text x="64" y="150" font-family="JetBrains Mono" font-weight="800" font-size="72" fill="url(#title)">tubersona</text>
  <text x="64" y="196" font-family="JetBrains Mono" font-size="22" fill="${DIM}">what's your <tspan fill="${ACCENT2}">tubersona</tspan>?</text>

  <text x="64" y="290" font-family="JetBrains Mono" font-size="17" fill="${DIM}">Enter a Bluesky handle and dig one up: a lumpy</text>
  <text x="64" y="316" font-family="JetBrains Mono" font-size="17" fill="${DIM}">potato body, googly eyes, a sprout, and an</text>
  <text x="64" y="342" font-family="JetBrains Mono" font-size="17" fill="${DIM}">accessory from bandana to katana. Sprout to</text>
  <text x="64" y="368" font-family="JetBrains Mono" font-size="17" fill="${DIM}">Heirloom rarity. Every dig joins your patch.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT2}">tubersona.bisks.net</text>

  <g transform="translate(770,10) scale(1.75)">${tuberInner}</g>

  <rect x="898" y="60" width="130" height="40" rx="8" fill="${build.tier.color}"/>
  <text x="963" y="88" font-family="JetBrains Mono" font-weight="800" font-size="22" fill="#1a1006" text-anchor="middle">HEIRLOOM</text>
</svg>`;

const fontPath = fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url));
const r = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
});
const png = r.render().asPng();
const out = new URL("./public/og.png", import.meta.url).pathname;
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes", "-", buildTitle(build));
