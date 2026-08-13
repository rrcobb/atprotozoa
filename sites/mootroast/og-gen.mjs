// Generates public/og.png — the Open Graph preview card for mootroast, so a
// shared link auto-renders a picture of the drum roaster in Bluesky / other
// unfurlers.
//
// Hand-draws a representative "screenshot" of the drum roaster as an SVG
// (dark body, a ring of avatar-beans in a gradient from pale to charred) at
// the canonical OG size, then rasterises it with @resvg/resvg-js (pure
// native module, no system Chromium needed — this box has no
// fontconfig/system fonts either, so the font is bundled in ./fonts and
// loaded explicitly). Copied from dial-a-mutual/og-gen.mjs (copy, don't
// abstract).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// No live data, no network — deterministic so the card is stable across
// builds.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#1a120b";
const INK = "#f3e9db", MUTED = "#b8a48c", ACCENT = "#e0a02c";
const DRUM_BODY = "#4a4038", DRUM_DARK = "#302923", DRUM_GLASS = "#12100d";

// roast-level gradient, lightest to darkest, plus one charred outlier.
const ROAST_COLORS = ["#d9b98a", "#c99a5f", "#a5712f", "#7a4a1e", "#4f2e14", "#2a180b"];
const CHARRED = "#160a04";

// tiny seeded RNG so the layout is identical every run
let seed = 9001;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function bean(x, y, r, fill, charred) {
  const glow = charred
    ? `<circle cx="${x}" cy="${y}" r="${r + 6}" fill="none" stroke="#d9603f" stroke-width="2" opacity="0.55"/>`
    : "";
  return `
  <g>
    ${glow}
    <circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" stroke="rgba(0,0,0,.45)" stroke-width="2"/>
    <circle cx="${x - r * 0.32}" cy="${y - r * 0.32}" r="${r * 0.28}" fill="rgba(255,255,255,.14)"/>
  </g>`;
}

// ── the drum, right half ────────────────────────────────────────────────
const drumCx = 860, drumCy = 340, drumR = 210;

let beansSvg = "";
const BEAN_COUNT = 16;
for (let i = 0; i < BEAN_COUNT; i++) {
  const angle = (i / BEAN_COUNT) * Math.PI * 2 + rnd() * 0.3;
  const dist = drumR * (0.35 + rnd() * 0.55);
  const x = drumCx + Math.cos(angle) * dist;
  const y = drumCy + Math.sin(angle) * dist;
  const r = 20 + rnd() * 12;
  const charred = i === BEAN_COUNT - 1;
  const fill = charred ? CHARRED : ROAST_COLORS[Math.floor((i / BEAN_COUNT) * ROAST_COLORS.length)];
  beansSvg += bean(x, y, r, fill, charred);
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>

  <!-- wordmark -->
  <text x="64" y="100" font-family="JetBrains Mono" font-weight="700"
    font-size="46" fill="${ACCENT}">mootroast</text>
  <text x="64" y="140" font-family="JetBrains Mono" font-size="20"
    fill="${MUTED}">a drum roaster for your moots</text>

  <!-- blurb on the left -->
  <text x="64" y="250" font-family="JetBrains Mono" font-size="18" fill="${INK}">Load a handle's moots</text>
  <text x="64" y="282" font-family="JetBrains Mono" font-size="18" fill="${INK}">into the drum. They</text>
  <text x="64" y="314" font-family="JetBrains Mono" font-size="18" fill="${INK}">tumble and darken</text>
  <text x="64" y="346" font-family="JetBrains Mono" font-size="18" fill="${INK}">until they pop —</text>
  <text x="64" y="378" font-family="JetBrains Mono" font-size="18" fill="${INK}">cinnamon to charred,</text>
  <text x="64" y="410" font-family="JetBrains Mono" font-size="18" fill="${INK}">a tasting note each.</text>

  <!-- the drum -->
  <circle cx="${drumCx}" cy="${drumCy}" r="${drumR + 16}" fill="${DRUM_BODY}" stroke="${DRUM_DARK}" stroke-width="8"/>
  <circle cx="${drumCx}" cy="${drumCy}" r="${drumR}" fill="${DRUM_GLASS}"/>
  ${beansSvg}
  <circle cx="${drumCx}" cy="${drumCy}" r="${drumR}" fill="none" stroke="rgba(255,255,255,.06)" stroke-width="2"/>

  <!-- footer strip -->
  <text x="64" y="600" font-family="JetBrains Mono" font-size="16"
    fill="${MUTED}">tumble your moots · every bean pops with a roast level</text>
  <text x="${W - 64}" y="600" text-anchor="end" font-family="JetBrains Mono"
    font-size="16" fill="${ACCENT}">mootroast.bisks.net</text>
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
