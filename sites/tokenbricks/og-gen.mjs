// Generates public/og.png — the Open Graph preview card for tokenbricks, so
// a shared link auto-renders the site's actual idea: a sentence in normal
// proportional-width tokens above the same sentence redrawn as a wall of
// equal-width bricks. Hand-drawn SVG at the canonical OG size, rasterised
// with @resvg/resvg-js (pure native module, no system Chromium needed — this
// box has no fontconfig/system fonts either, so the font is bundled in
// ./fonts and loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// The ten tokens below are the real cl100k_base tokenization of "The quick
// brown fox jumps over the lazy dog." (verified by hand against
// gpt-tokenizer) — a static mockup, not a live run; the live page always
// computes the real thing client-side. See sites/logitlens/og-gen.mjs, this
// is the same recipe.
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#0c0e11", FG = "#edf1f4", DIM = "#93a0ab", DIM2 = "#5f6b76";
const ACCENT = "#5fa2ef", BORDER = "#232830", CARD = "#14171c";

// Same eight categorical hues as the live page (public/index.html --tok0..7).
const TOK_COLORS = ["#3987e5", "#d9713d", "#2bb37f", "#c98500", "#d55181", "#3fae3f", "#9085e9", "#e66767"];

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const TOKENS = ["The", " quick", " brown", " fox", " jumps", " over", " the", " lazy", " dog", "."];

const cardX = 420, cardY = 96, cardW = 716, cardH = 438;
const rowPad = 34;

// -- row 1: proportional width, one rect per token, width ~ character count --
const propTop = cardY + 96;
const propH = 44;
let px = cardX + rowPad;
const propSvg = TOKENS.map((t, i) => {
  const w = Math.max(26, t.length * 10 + 10);
  const rect = `<rect x="${px}" y="${propTop}" width="${w - 3}" height="${propH}" rx="6" fill="${TOK_COLORS[i % 8]}" fill-opacity="0.55"/>
  <text x="${px + (w - 3) / 2}" y="${propTop + propH / 2 + 6}" text-anchor="middle" font-family="JetBrains Mono" font-size="14" fill="${FG}">${esc(t.trim() || "·")}</text>`;
  px += w;
  return rect;
}).join("\n");

// -- row 2: equal width, same tokens, same order, same colors --
const brickTop = propTop + propH + 74;
const brickW = 58, brickH = 46, brickGap = 4;
let bx = cardX + rowPad;
const brickSvg = TOKENS.map((t, i) => {
  const rect = `<rect x="${bx}" y="${brickTop}" width="${brickW}" height="${brickH}" rx="5" fill="${TOK_COLORS[i % 8]}" fill-opacity="0.65"/>
  <text x="${bx + brickW / 2}" y="${brickTop + brickH / 2 + 6}" text-anchor="middle" font-family="JetBrains Mono" font-size="15" fill="${FG}">${esc(t.trim() || "·")}</text>`;
  bx += brickW + brickGap;
  return rect;
}).join("\n");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="6%" cy="-10%" r="55%">
      <stop offset="0" stop-color="#131c2b"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="98%" cy="2%" r="50%">
      <stop offset="0" stop-color="#1a1420"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <!-- left: wordmark + pitch -->
  <text x="64" y="150" font-family="JetBrains Mono" font-weight="800" font-size="52" fill="${FG}">token<tspan fill="${ACCENT}">bricks</tspan></text>
  <text x="64" y="196" font-family="JetBrains Mono" font-size="20" fill="${DIM}">every token, the</text>
  <text x="64" y="224" font-family="JetBrains Mono" font-size="20" fill="${DIM}"><tspan fill="${ACCENT}">same width</tspan></text>

  <text x="64" y="298" font-family="JetBrains Mono" font-size="16" fill="${DIM}">Real OpenAI BPE tokens,</text>
  <text x="64" y="324" font-family="JetBrains Mono" font-size="16" fill="${DIM}">tokenized live in your</text>
  <text x="64" y="350" font-family="JetBrains Mono" font-size="16" fill="${DIM}">browser, then redrawn as</text>
  <text x="64" y="376" font-family="JetBrains Mono" font-size="16" fill="${DIM}">a wall of equal-width bricks.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="19" fill="${ACCENT}">tokenbricks.bisks.net</text>

  <!-- right: comparison card -->
  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="18" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>
  <text x="${cardX + rowPad}" y="${cardY + 56}" font-family="JetBrains Mono" font-size="14" fill="${DIM2}">how you read it</text>
  ${propSvg}
  <text x="${cardX + rowPad}" y="${brickTop - 30}" font-family="JetBrains Mono" font-size="14" fill="${DIM2}">how the model reads it</text>
  ${brickSvg}
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
