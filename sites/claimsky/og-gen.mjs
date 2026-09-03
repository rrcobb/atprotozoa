// Generates public/og.png — the Open Graph preview card for claimsky, so a
// shared link auto-renders a picture of the claim certificate in Bluesky /
// other unfurlers. Hand-drawn SVG at the canonical OG size, rasterised with
// @resvg/resvg-js (pure native module, no system Chromium needed — this box
// has no fontconfig/system fonts either, so the font is bundled in ./fonts
// and loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// A generic sample card (not tied to any real handle) — this is the static
// fallback card for the bare link. Per-claim share cards are generated live,
// client-side, in public/index.html (buildShareCard).
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const PAPER = "#f3ede0", INK = "#1c1626", DIM = "#5c5470", BORDER = "#c9b98f", VIOLET = "#7a3fd6", PINK = "#ff6ec7";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${PAPER}"/>
  <rect x="24" y="24" width="${W - 48}" height="${H - 48}" fill="none" stroke="${BORDER}" stroke-width="3"/>

  <text x="64" y="96" font-family="JetBrains Mono" font-weight="800" font-size="30" fill="${INK}">CLAIMSKY</text>
  <text x="64" y="122" font-family="JetBrains Mono" font-size="16" fill="${DIM}">Office of Manufactured Significance · claimsky.bisks.net</text>
  <line x1="64" y1="142" x2="${W - 64}" y2="142" stroke="${INK}" stroke-width="2"/>

  <text x="64" y="190" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${INK}">Claimant: @you</text>
  <text x="64" y="214" font-family="JetBrains Mono" font-size="16" fill="${DIM}">Enter any handle. It does not check.</text>

  <text x="64" y="272" font-family="JetBrains Mono" font-weight="800" font-size="30" fill="${VIOLET}">MAIN CHARACTER STATUS: PERMANENT</text>

  <text x="64" y="346" font-family="JetBrains Mono" font-size="18" fill="${INK}">&#10022; Reflexive pattern-matching applied to unrelated notifications.</text>
  <text x="64" y="376" font-family="JetBrains Mono" font-size="18" fill="${INK}">&#10022; Belief that the feed is personally addressed to them, confirmed.</text>
  <text x="64" y="406" font-family="JetBrains Mono" font-size="18" fill="${INK}">&#10022; Mild-to-total detachment from the concept of coincidence.</text>

  <line x1="64" y1="${H - 130}" x2="${W - 64}" y2="${H - 130}" stroke="${BORDER}" stroke-width="1" stroke-dasharray="4,5"/>
  <text x="64" y="${H - 90}" font-family="JetBrains Mono" font-style="italic" font-size="20" fill="${DIM}">ERIS, Attending Oracle</text>
  <text x="64" y="${H - 70}" font-family="JetBrains Mono" font-size="14" fill="${DIM}">Administered by</text>

  <text x="64" y="${H - 44}" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${PINK}">claimsky.bisks.net</text>
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
