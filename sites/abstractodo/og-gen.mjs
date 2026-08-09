// Generates public/og.png — the Open Graph preview card for abstractodo, so
// a shared link auto-renders a picture of the ladder concept in Bluesky /
// other unfurlers. Hand-drawn SVG at the canonical OG size, matching the
// live page's black-on-white mono look, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium needed — this box has no
// fontconfig/system fonts either, so fonts are bundled in ./fonts and
// loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const INK = "#111111", MUTED = "#6b6b6b", ACCENT = "#1a5fd0", FAINT = "#e4e4e4";
const MONO = "JetBrains Mono";

const RUNGS = [
  { y: 470, label: "“organize desk”", dim: false },
  { y: 388, label: "“improve your task management skills”", dim: false },
  { y: 306, label: "“optimize your self-improvement strategy”", dim: false },
  { y: 224, label: "“contemplate the heat death of your to-do list”", dim: true },
];

const rungRows = RUNGS.map(
  (r, i) => `
  <line x1="70" y1="${r.y}" x2="1130" y2="${r.y}" stroke="${FAINT}" stroke-width="2"/>
  <circle cx="90" cy="${r.y}" r="9" fill="none" stroke="${r.dim ? MUTED : ACCENT}" stroke-width="3"/>
  ${i < RUNGS.length - 1 ? `<path d="M90 ${r.y - 9} L90 ${r.y - 68}" stroke="${MUTED}" stroke-width="2" stroke-dasharray="4 5"/>` : ""}
  <text x="118" y="${r.y + 8}" font-family="${MONO}" font-size="27" fill="${r.dim ? MUTED : INK}">${r.label}</text>`
).join("\n");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#ffffff"/>

  <text x="70" y="110" font-family="${MONO}" font-weight="bold" font-size="54" fill="${INK}">abstractodo</text>
  <text x="70" y="150" font-family="${MONO}" font-size="24" fill="${MUTED}">a to-do list that only escalates</text>

  ${rungRows}

  <text x="1130" y="200" text-anchor="end" font-family="${MONO}" font-size="22" fill="${ACCENT}">rung 21: the singularity ↑</text>

  <text x="70" y="588" font-family="${MONO}" font-weight="bold" font-size="24" fill="${ACCENT}">abstractodo.bisks.net</text>
</svg>`;

const fontPaths = [
  fileURLToPath(new URL("./fonts/DejaVuSerif.ttf", import.meta.url)),
  fileURLToPath(new URL("./fonts/DejaVuSerif-Bold.ttf", import.meta.url)),
  fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url)),
];
const r = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: fontPaths, loadSystemFonts: false, defaultFontFamily: MONO },
});
const png = r.render().asPng();
const out = new URL("./public/og.png", import.meta.url).pathname;
writeFileSync(out, png);
console.log("wrote", out);
