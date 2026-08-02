// Generates public/og.png — the Open Graph preview card for leanmath, so a
// shared link auto-renders a picture of the tool in Bluesky / other
// unfurlers. Hand-drawn SVG at the canonical OG size, matching the live
// page's light/mono/blue bisks.net look, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium — this box has no fontconfig or
// system fonts either, so the font is bundled in ./fonts and loaded
// explicitly).
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

const BG = "#ffffff", INK = "#111111", MUTED = "#6b6b6b", FAINT = "#e4e4e4", FAINTBG = "#f6f6f6";
const ACCENT = "#1a5fd0", GOOD = "#1f8a4c";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const cardX = 64, cardY = 300, cardW = 1072, cardH = 260;
const leanLine = "theorem le_trans {a b c : ℕ} (h1 : a ≤ b) (h2 : b ≤ c) : a ≤ c";
const mathLine = "∀ a, b, c : ℕ,  h₁ : a ≤ b  h₂ : b ≤ c  →  a ≤ c";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>

  <text x="64" y="118" font-family="JetBrains Mono" font-weight="800" font-size="60" fill="${INK}">leanmath</text>
  <text x="64" y="162" font-family="JetBrains Mono" font-size="22" fill="${MUTED}">Lean &#8594; readable math notation</text>

  <text x="64" y="220" font-family="JetBrains Mono" font-size="18" fill="${MUTED}">Paste a theorem, lemma, or def. Get a plain-English breakdown</text>
  <text x="64" y="248" font-family="JetBrains Mono" font-size="18" fill="${MUTED}">of its binders and hypotheses, plus copyable LaTeX.</text>

  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="14" fill="${FAINTBG}" stroke="${FAINT}" stroke-width="1.5"/>

  <text x="${cardX + 32}" y="${cardY + 44}" font-family="JetBrains Mono" font-weight="700" font-size="14" letter-spacing="1.5" fill="${MUTED}">LEAN</text>
  <text x="${cardX + 32}" y="${cardY + 84}" font-family="JetBrains Mono" font-size="19" fill="${INK}">${esc(leanLine)}</text>

  <line x1="${cardX + 32}" y1="${cardY + 116}" x2="${cardX + cardW - 32}" y2="${cardY + 116}" stroke="${FAINT}" stroke-width="1" stroke-dasharray="4,5"/>

  <text x="${cardX + 32}" y="${cardY + 156}" font-family="JetBrains Mono" font-weight="700" font-size="14" letter-spacing="1.5" fill="${ACCENT}">MATH</text>
  <text x="${cardX + 32}" y="${cardY + 196}" font-family="JetBrains Mono" font-size="22" fill="${INK}">${esc(mathLine)}</text>
  <text x="${cardX + 32}" y="${cardY + 228}" font-family="JetBrains Mono" font-size="16" fill="${GOOD}">+ copyable LaTeX, + proof sketch for tactic proofs</text>

  <text x="64" y="${H - 48}" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT}">leanmath.bisks.net</text>
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
