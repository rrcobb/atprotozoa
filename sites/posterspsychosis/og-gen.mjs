// Generates public/og.png — the Open Graph preview card for the poster's
// psychosis clinic, so a shared link auto-renders a picture of the
// prescription pad in Bluesky / other unfurlers. Hand-drawn SVG at the
// canonical OG size, rasterised with @resvg/resvg-js (pure native module,
// no system Chromium needed — this box has no fontconfig/system fonts
// either, so the font is bundled in ./fonts and loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// A generic sample chart (not tied to any real handle) — this is the static
// fallback card for the bare link. Per-diagnosis share cards are generated
// live, client-side, in public/index.html (buildShareCard).
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const PAPER = "#f4f1e9", INK = "#1a1a1a", DIM = "#5a554a", BORDER = "#b9b195", RED = "#c23b3b";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${PAPER}"/>
  <rect x="24" y="24" width="${W - 48}" height="${H - 48}" fill="none" stroke="${BORDER}" stroke-width="3"/>

  <text x="64" y="96" font-family="JetBrains Mono" font-weight="800" font-size="30" fill="${INK}">BISKS GENERAL HOSPITAL</text>
  <text x="64" y="122" font-family="JetBrains Mono" font-size="16" fill="${DIM}">Dept. of Extremely Online Medicine · posterspsychosis.bisks.net</text>
  <line x1="64" y1="142" x2="${W - 64}" y2="142" stroke="${INK}" stroke-width="2"/>

  <text x="64" y="190" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${INK}">Patient: @you</text>
  <text x="64" y="214" font-family="JetBrains Mono" font-size="16" fill="${DIM}">Enter any handle to pull the real chart</text>

  <text x="64" y="270" font-family="JetBrains Mono" font-weight="800" font-size="26" fill="${RED}">Diagnosis: Poster's Psychosis</text>

  <text x="64" y="400" font-family="JetBrains Mono" font-weight="800" font-size="90" fill="${INK}">&#8478;</text>

  <text x="190" y="370" font-family="JetBrains Mono" font-weight="800" font-size="40" fill="${INK}">POST MORE</text>
  <text x="190" y="398" font-family="JetBrains Mono" font-size="20" fill="${DIM}">(postum maximus, 1 skeet)</text>
  <text x="190" y="432" font-family="JetBrains Mono" font-size="18" fill="${INK}">Take one (1) post immediately upon reading.</text>
  <text x="190" y="458" font-family="JetBrains Mono" font-size="18" fill="${INK}">Repeat every time the urge occurs.</text>

  <line x1="64" y1="${H - 130}" x2="${W - 64}" y2="${H - 130}" stroke="${BORDER}" stroke-width="1" stroke-dasharray="4,5"/>
  <text x="64" y="${H - 90}" font-family="JetBrains Mono" font-style="italic" font-size="20" fill="${DIM}">Dr. S. Keet, MD</text>
  <text x="64" y="${H - 70}" font-family="JetBrains Mono" font-size="14" fill="${DIM}">Attending Physician</text>

  <text x="64" y="${H - 44}" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${RED}">posterspsychosis.bisks.net</text>
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
