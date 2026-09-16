// Generates public/og.png — the Open Graph preview card for aidememoire, so
// a shared link auto-renders a picture of the case file in Bluesky / other
// unfurlers. Hand-drawn SVG at the canonical OG size, rasterised with
// @resvg/resvg-js (pure native module, no system Chromium — this box has
// no fontconfig/system fonts either, so the font is bundled in ./fonts and
// loaded explicitly). Copied from sites/posterspsychosis/og-gen.mjs (copy,
// don't abstract).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// A generic sample case (not tied to any real handle) — the static
// fallback card for the bare link. Per-case share cards are generated
// live, client-side, in public/app.js (buildShareCard).

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const PAPER = "#f2eee2", INK = "#1a1a1a", DIM = "#6b6250", BORDER = "#b5ac8f", RED = "#a3392f", BLUE = "#4c86a4";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${PAPER}"/>
  <rect x="24" y="24" width="${W - 48}" height="${H - 48}" fill="none" stroke="${BORDER}" stroke-width="3"/>

  <text x="64" y="92" font-family="JetBrains Mono" font-weight="800" font-size="28" fill="${INK}">AIDE MEMOIRE — CASE FILE</text>
  <text x="64" y="118" font-family="JetBrains Mono" font-size="16" fill="${DIM}">Dept. of Retroactive Boundary Enforcement · aidememoire.bisks.net</text>
  <line x1="64" y1="138" x2="${W - 64}" y2="138" stroke="${INK}" stroke-width="2"/>

  <circle cx="92" cy="192" r="32" fill="#e2dbc7" stroke="${BORDER}" stroke-width="2"/>
  <text x="140" y="186" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${INK}">Subject: @handle.bsky.social</text>
  <text x="140" y="210" font-family="JetBrains Mono" font-size="16" fill="${DIM}">Filed by @you · blocked on some regrettable Tuesday</text>

  <text x="64" y="258" font-family="JetBrains Mono" font-weight="800" font-size="22" fill="${RED}">CONFIDENCE: 74%</text>

  <text x="64" y="300" font-family="JetBrains Mono" font-size="20" fill="${INK}">Enter two real handles for the actual imputed</text>
  <text x="64" y="330" font-family="JetBrains Mono" font-size="20" fill="${INK}">rationale, pulled from a real block record and</text>
  <text x="64" y="360" font-family="JetBrains Mono" font-size="20" fill="${INK}">years of real posts on both sides.</text>

  <text x="64" y="410" font-family="JetBrains Mono" font-size="18" fill="${BLUE}">not AI. not real psychology. a keyword-matching robot.</text>

  <line x1="64" y1="${H - 90}" x2="${W - 64}" y2="${H - 90}" stroke="${BORDER}" stroke-width="1" stroke-dasharray="4,5"/>
  <text x="64" y="${H - 60}" font-family="JetBrains Mono" font-style="italic" font-size="16" fill="${DIM}">it imputes. it explicates. it is not licensed to do either.</text>
  <text x="64" y="${H - 32}" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${RED}">aidememoire.bisks.net</text>
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
