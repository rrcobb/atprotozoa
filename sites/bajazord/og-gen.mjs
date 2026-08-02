// Generates public/og.png — the Open Graph preview card for bajazord, so a
// shared link auto-renders a picture of the megazord in Bluesky / other
// unfurlers. Hand-drawn SVG at the canonical OG size, matching the live
// page's Baja Blast (teal/magenta/lime) look, rasterised with
// @resvg/resvg-js (pure native module, no system Chromium needed — this box
// has no fontconfig/system fonts either, so the font is bundled in ./fonts
// and loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// This is the generic fallback card for the bare link (a sample "COCKPIT /
// CORE / THRUSTERS" roster, not tied to any real seed). Per-combo share
// cards are generated live, client-side, in public/app.js (buildShareCard).
//
// House style: self-contained, copy-don't-abstract, adapted from
// sites/didscope/og-gen.mjs.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#050912", FG = "#eafffb", DIM = "#85a0a8";
const TEAL = "#17e6d0", MAGENTA = "#ff2e88", LIME = "#c6ff2e";

const roster = [
  { role: "COCKPIT", name: "acausal", color: TEAL },
  { role: "CORE", name: "knolling", color: MAGENTA },
  { role: "THRUSTERS", name: "norvidwave", color: LIME },
];

// the same blocky mech from public/index.html's #mech svg, redrawn at a
// smaller scale to sit on the right half of the card.
function mech(cx, cy, scale) {
  const t = (x, y) => `${(cx + x * scale).toFixed(1)} ${(cy + y * scale).toFixed(1)}`;
  return `
  <g>
    <line x1="${cx - 20 * scale}" y1="${cy - 122 * scale}" x2="${cx - 32 * scale}" y2="${cy - 104 * scale}" stroke="rgba(0,0,0,0.35)" stroke-width="${2 * scale}"/>
    <line x1="${cx + 20 * scale}" y1="${cy - 122 * scale}" x2="${cx + 32 * scale}" y2="${cy - 104 * scale}" stroke="rgba(0,0,0,0.35)" stroke-width="${2 * scale}"/>
    <ellipse cx="${cx}" cy="${cy - 100 * scale}" rx="${52 * scale}" ry="${13 * scale}" fill="${TEAL}"/>
    <rect x="${cx - 52 * scale}" y="${cy - 100 * scale}" width="${104 * scale}" height="${94 * scale}" rx="${16 * scale}" fill="${TEAL}"/>
    <ellipse cx="${cx}" cy="${cy - 6 * scale}" rx="${52 * scale}" ry="${13 * scale}" fill="${TEAL}" opacity="0.75"/>
    <rect x="${cx - 30 * scale}" y="${cy - 34 * scale}" width="${60 * scale}" height="${10 * scale}" rx="${3 * scale}" fill="#04120f" opacity="0.55"/>

    <rect x="${cx - 15 * scale}" y="${cy - 8 * scale}" width="${30 * scale}" height="${22 * scale}" fill="${MAGENTA}"/>
    <rect x="${cx - 110 * scale}" y="${cy + 26 * scale}" width="${66 * scale}" height="${46 * scale}" rx="${10 * scale}" fill="${MAGENTA}"/>
    <rect x="${cx + 44 * scale}" y="${cy + 26 * scale}" width="${66 * scale}" height="${46 * scale}" rx="${10 * scale}" fill="${MAGENTA}"/>
    <rect x="${cx - 112 * scale}" y="${cy + 66 * scale}" width="${52 * scale}" height="${92 * scale}" rx="${12 * scale}" fill="${MAGENTA}"/>
    <rect x="${cx + 60 * scale}" y="${cy + 66 * scale}" width="${52 * scale}" height="${92 * scale}" rx="${12 * scale}" fill="${MAGENTA}"/>
    <circle cx="${cx - 86 * scale}" cy="${cy + 168 * scale}" r="${24 * scale}" fill="${MAGENTA}"/>
    <circle cx="${cx + 86 * scale}" cy="${cy + 168 * scale}" r="${24 * scale}" fill="${MAGENTA}"/>
    <rect x="${cx - 52 * scale}" y="${cy + 20 * scale}" width="${104 * scale}" height="${150 * scale}" rx="${16 * scale}" fill="${MAGENTA}"/>
    <circle cx="${cx}" cy="${cy + 92 * scale}" r="${32 * scale}" fill="#04120f" opacity="0.35"/>
    <circle cx="${cx}" cy="${cy + 92 * scale}" r="${24 * scale}" fill="#ffffff"/>

    <rect x="${cx - 52 * scale}" y="${cy + 162 * scale}" width="${104 * scale}" height="${34 * scale}" rx="${10 * scale}" fill="${LIME}"/>
    <rect x="${cx - 48 * scale}" y="${cy + 192 * scale}" width="${46 * scale}" height="${88 * scale}" rx="${12 * scale}" fill="${LIME}"/>
    <rect x="${cx + 2 * scale}" y="${cy + 192 * scale}" width="${46 * scale}" height="${88 * scale}" rx="${12 * scale}" fill="${LIME}"/>
    <rect x="${cx - 60 * scale}" y="${cy + 274 * scale}" width="${60 * scale}" height="${28 * scale}" rx="${8 * scale}" fill="${LIME}"/>
    <rect x="${cx}" y="${cy + 274 * scale}" width="${60 * scale}" height="${28 * scale}" rx="${8 * scale}" fill="${LIME}"/>
  </g>`;
}

const rosterSvg = roster
  .map((r, i) => {
    const y = 388 + i * 62;
    return `
  <rect x="64" y="${y}" width="10" height="46" fill="${r.color}"/>
  <text x="90" y="${y + 18}" font-family="JetBrains Mono" font-weight="800" font-size="14" fill="${r.color}">${r.role}</text>
  <text x="90" y="${y + 42}" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${FG}">${r.name}</text>`;
  })
  .join("\n");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glowA" cx="10%" cy="-10%" r="55%">
      <stop offset="0" stop-color="rgba(23,230,208,0.30)"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glowB" cx="95%" cy="0%" r="55%">
      <stop offset="0" stop-color="rgba(255,46,136,0.25)"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glowC" cx="60%" cy="105%" r="55%">
      <stop offset="0" stop-color="rgba(198,255,46,0.14)"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${TEAL}"/>
      <stop offset="0.55" stop-color="${MAGENTA}"/>
      <stop offset="1" stop-color="${LIME}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glowA)"/>
  <rect width="${W}" height="${H}" fill="url(#glowB)"/>
  <rect width="${W}" height="${H}" fill="url(#glowC)"/>

  <text x="64" y="140" font-family="JetBrains Mono" font-weight="900" font-size="76" fill="url(#title)">bajazord</text>
  <text x="64" y="188" font-family="JetBrains Mono" font-size="21" fill="${DIM}">three real atprotozoa sites,</text>
  <text x="64" y="216" font-family="JetBrains Mono" font-size="21" fill="${DIM}">one Baja Blast megazord</text>

  <text x="64" y="290" font-family="JetBrains Mono" font-size="17" fill="${DIM}">Type a handle. It hashes to a</text>
  <text x="64" y="316" font-family="JetBrains Mono" font-size="17" fill="${DIM}">cockpit, a core, and thrusters —</text>
  <text x="64" y="342" font-family="JetBrains Mono" font-size="17" fill="${DIM}">slammed together, every time.</text>

  <text x="64" y="368" font-family="JetBrains Mono" font-weight="700" font-size="13" letter-spacing="2" fill="${DIM}">SAMPLE ROLL</text>
  ${rosterSvg}

  <text x="64" y="580" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${TEAL}">bajazord.bisks.net</text>

  ${mech(920, 330, 1.35)}
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
