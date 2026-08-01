// Generates public/og.png — the default Open Graph preview for commonplace.
// Per-document reads get their own og:image (the post's cover image if it has
// one) via src/index.ts's renderRead; this is the fallback for the bare
// homepage link and for documents without a cover image. Hand-drawn SVG at
// the canonical OG size, rasterised with @resvg/resvg-js (same recipe as
// sites/memex/og-gen.mjs) — pure native module, no system fontconfig needed,
// which matters since this sandbox has zero fonts installed otherwise.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const PAPER = "#f6f1e6", PAPER_DIM = "#ece3d2", INK = "#2b2420", INK_DIM = "#6b5e50";
const RUST = "#c15b3f", RUST_DARK = "#9a4530", CARD = "#fffaf0", BORDER = "#ddccae";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${PAPER}"/>
  <rect x="40" y="40" width="${W - 80}" height="${H - 80}" rx="18" fill="${PAPER_DIM}" stroke="${BORDER}" stroke-width="2"/>

  <text x="90" y="220" font-family="JetBrains Mono" font-weight="800" font-size="84" fill="${RUST_DARK}">commonplace</text>
  <text x="90" y="270" font-family="JetBrains Mono" font-size="26" fill="${INK_DIM}">a tumblr-esque standard.site editor</text>

  <text x="90" y="340" font-family="JetBrains Mono" font-size="20" fill="${INK}">write something · pick which publications it goes to</text>
  <text x="90" y="374" font-family="JetBrains Mono" font-size="20" fill="${INK}">it's a site.standard.document record, straight on your own PDS</text>

  <!-- sample card -->
  <rect x="90" y="420" width="720" height="140" rx="14" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>
  <rect x="118" y="448" width="120" height="14" rx="7" fill="${RUST}"/>
  <rect x="118" y="474" width="664" height="10" rx="5" fill="${BORDER}"/>
  <rect x="118" y="494" width="664" height="10" rx="5" fill="${BORDER}"/>
  <rect x="118" y="514" width="420" height="10" rx="5" fill="${BORDER}"/>
  <rect x="118" y="536" width="90" height="16" rx="8" fill="${PAPER_DIM}" stroke="${BORDER}"/>
  <rect x="218" y="536" width="70" height="16" rx="8" fill="${PAPER_DIM}" stroke="${BORDER}"/>

  <text x="90" y="600" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${RUST_DARK}">commonplace.bisks.net</text>
</svg>`;

const fontPath = fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url));
const r = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
});
const png = r.render().asPng();
const out = fileURLToPath(new URL("./public/og.png", import.meta.url));
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");
