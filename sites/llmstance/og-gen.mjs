// Generates public/og.png — the Open Graph preview card for llmstance, so a
// shared link auto-renders a picture of the scoreboard in Bluesky / other
// unfurlers. Hand-drawn SVG at the canonical OG size, matching the live
// page's stance-scoreboard look, rasterised with @resvg/resvg-js (pure native
// module, no system Chromium needed — this box has no fontconfig/system
// fonts either, so the font is bundled in ./fonts and loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// A generic sample tally (not tied to any real handle) — this is the static
// fallback card for the bare link. Per-account share cards are generated
// live, client-side, in public/index.html (buildShareCard).
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#090a0d", FG = "#eef1f5", DIM = "#8891a0";
const PRO = "#35d488", ANTI = "#ff5f6d", UNCLEAR = "#6b7385";
const ACCENT = "#5fc9ff", CARD = "#12151c", BORDER = "#262b36";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function wrapLines(text, maxChars) {
  const words = text.split(" ");
  const lines = [];
  let line = "";
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (line && test.length > maxChars) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

const verdict = "Leans Pro-LLM.";
const pro = 14, anti = 6, unclear = 82;
const total = pro + anti + unclear;
const quote = "“finally got copilot to stop rewriting my whole file, genuinely useful today”";

const cardX = 470, cardY = 90, cardW = 668, cardH = 450;
const verdictLines = wrapLines(verdict, 22);
const quoteLines = wrapLines(quote, 44);

const barX = cardX + 44, barY = cardY + 150, barW = cardW - 88, barH = 30;
const proW = (pro / total) * barW;
const antiW = (anti / total) * barW;
const unclearW = barW - proW - antiW;

const verdictSvg = verdictLines
  .map((l, i) => `<text x="${cardX + cardW / 2}" y="${cardY + 70 + i * 42}" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="34" fill="${FG}">${esc(l)}</text>`)
  .join("\n    ");

const quoteSvg = quoteLines
  .map((l, i) => `<text x="${barX}" y="${barY + 150 + i * 26}" font-family="JetBrains Mono" font-style="italic" font-size="17" fill="${FG}">${esc(l)}</text>`)
  .join("\n    ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="12%" cy="-10%" r="55%">
      <stop offset="0" stop-color="#123322"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="92%" cy="0%" r="50%">
      <stop offset="0" stop-color="#3a1420"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${PRO}"/>
      <stop offset="1" stop-color="${ANTI}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <!-- left: wordmark + pitch -->
  <text x="64" y="140" font-family="JetBrains Mono" font-weight="800" font-size="60" fill="url(#title)">llmstance</text>
  <text x="64" y="188" font-family="JetBrains Mono" font-size="21" fill="${DIM}">where does this account</text>
  <text x="64" y="216" font-family="JetBrains Mono" font-size="21" fill="${DIM}">actually stand on <tspan fill="${ACCENT}">AI</tspan>?</text>

  <text x="64" y="290" font-family="JetBrains Mono" font-size="17" fill="${DIM}">Enter a handle. Every post gets</text>
  <text x="64" y="316" font-family="JetBrains Mono" font-size="17" fill="${DIM}">labeled Pro-LLM, Anti-LLM, or</text>
  <text x="64" y="342" font-family="JetBrains Mono" font-size="17" fill="${DIM}">Unclear, then tallied into a verdict.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT}">llmstance.bisks.net</text>

  <!-- right: sample scoreboard card -->
  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="18" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>

  ${verdictSvg}

  <rect x="${barX}" y="${barY}" width="${proW}" height="${barH}" fill="${PRO}"/>
  <rect x="${barX + proW}" y="${barY}" width="${antiW}" height="${barH}" fill="${ANTI}"/>
  <rect x="${barX + proW + antiW}" y="${barY}" width="${unclearW}" height="${barH}" fill="${UNCLEAR}"/>

  <text x="${barX}" y="${barY + 58}" font-family="JetBrains Mono" font-size="16" fill="${DIM}">${pro} pro-llm  ·  ${anti} anti-llm  ·  ${unclear} unclear</text>

  <line x1="${barX}" y1="${barY + 100}" x2="${cardX + cardW - 44}" y2="${barY + 100}" stroke="${BORDER}" stroke-width="1" stroke-dasharray="3,4"/>
  <text x="${barX}" y="${barY + 130}" font-family="JetBrains Mono" font-weight="700" font-size="13" letter-spacing="2" fill="${PRO}">STRONGEST PRO-LLM POST</text>
  ${quoteSvg}
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
