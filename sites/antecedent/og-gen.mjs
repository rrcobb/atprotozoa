// Generates public/og.png — the Open Graph preview card for antecedent, so a
// shared link auto-renders a picture of the joke (a pronoun with nothing to
// point at, then something to point it at) in Bluesky / other unfurlers.
// Hand-drawn SVG at the canonical OG size, matching the live page's
// black-on-white mono look, rasterised with @resvg/resvg-js (pure native
// module, no system Chromium needed — this box has no fontconfig/system
// fonts either, so fonts are bundled in ./fonts and loaded explicitly).
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

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#ffffff"/>

  <text x="70" y="110" font-family="${MONO}" font-weight="bold" font-size="54" fill="${INK}">antecedent</text>
  <text x="70" y="150" font-family="${MONO}" font-size="24" fill="${MUTED}">a system for discovering what "this" you should build</text>

  <rect x="70" y="200" width="1060" height="110" rx="6" fill="none" stroke="${FAINT}" stroke-width="2"/>
  <text x="100" y="245" font-family="${MONO}" font-size="26" fill="${MUTED}">"build </text>
  <text x="222" y="245" font-family="${MONO}" font-size="26" fill="${INK}" text-decoration="line-through">this</text>
  <text x="308" y="245" font-family="${MONO}" font-size="26" fill="${MUTED}">"</text>
  <text x="100" y="288" font-family="${MONO}" font-size="22" fill="${ACCENT}">→ no antecedent. reroll until it has one.</text>

  <rect x="70" y="340" width="1060" height="190" rx="6" fill="none" stroke="${INK}" stroke-width="3"/>
  <text x="100" y="385" font-family="${MONO}" font-size="20" fill="${MUTED}">THIS</text>
  <text x="100" y="435" font-family="${MONO}" font-weight="bold" font-size="34" fill="${INK}">gossipcourt</text>
  <text x="100" y="475" font-family="${MONO}" font-size="24" fill="${INK}">a courtroom drama starring your mutuals,</text>
  <text x="100" y="505" font-family="${MONO}" font-size="24" fill="${INK}">that ends in a duel.</text>

  <text x="1130" y="588" text-anchor="end" font-family="${MONO}" font-weight="bold" font-size="24" fill="${ACCENT}">antecedent.bisks.net</text>
</svg>`;

const fontPaths = [
  fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url)),
];
const r = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: fontPaths, loadSystemFonts: false, defaultFontFamily: MONO },
});
const png = r.render().asPng();

writeFileSync(fileURLToPath(new URL("./public/og.png", import.meta.url)), png);
console.log("wrote public/og.png");
