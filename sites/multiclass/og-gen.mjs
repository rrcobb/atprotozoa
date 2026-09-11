// Generates public/og.png — the Open Graph preview card for multiclass, so a
// shared link auto-renders a picture of a sample class card in Bluesky /
// other unfurlers. Hand-drawn SVG at the canonical OG size, matching the live
// page's card look, rasterised with @resvg/resvg-js (pure native module, no
// system Chromium needed — this box has no fontconfig/system fonts either,
// so the font is bundled in ./fonts and loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// A generic sample build (not tied to any real handle) — this is the static
// fallback card for the bare link. Per-account share cards are generated
// live, client-side, in public/index.html (buildShareCard).
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#0a0a0f", FG = "#eef1f5", DIM = "#8891a0";
const WIZARD = "#5fc9ff", WARLOCK = "#b46cff", CLERIC = "#ffcf5c";
const CARD = "#12131c", BORDER = "#262838";

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

const title = "Wizard / Warlock Multiclass";
const flavor = "academic, guarded... but made a pact anyway.";
const wizard = 58, warlock = 31, cleric = 11;
const total = wizard + warlock + cleric;

// Note: this SVG is rasterised with only JetBrains Mono loaded (no emoji
// font available in this sandbox), so labels here are plain text — the
// emoji icons only appear in the live, browser-rendered canvas card.
const cardX = 470, cardY = 90, cardW = 668, cardH = 450;
const titleLines = wrapLines(title, 20);
const flavorLines = wrapLines(flavor, 40);

const titleTop = cardY + 70;
const flavorTop = titleTop + titleLines.length * 40 + 20;
const barY = flavorTop + flavorLines.length * 24 + 30;
const barX = cardX + 44, barW = cardW - 88, barH = 30;
const wizardW = (wizard / total) * barW;
const warlockW = (warlock / total) * barW;
const clericW = barW - wizardW - warlockW;

const titleSvg = titleLines
  .map((l, i) => `<text x="${cardX + cardW / 2}" y="${titleTop + i * 40}" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="32" fill="${FG}">${esc(l)}</text>`)
  .join("\n    ");

const flavorSvg = flavorLines
  .map((l, i) => `<text x="${cardX + cardW / 2}" y="${flavorTop + i * 24}" text-anchor="middle" font-family="JetBrains Mono" font-style="italic" font-size="16" fill="${DIM}">${esc(l)}</text>`)
  .join("\n    ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="12%" cy="-10%" r="55%">
      <stop offset="0" stop-color="#123047"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="92%" cy="0%" r="50%">
      <stop offset="0" stop-color="#2e1a47"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${WIZARD}"/>
      <stop offset="0.5" stop-color="${WARLOCK}"/>
      <stop offset="1" stop-color="${CLERIC}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <!-- left: wordmark + pitch -->
  <text x="64" y="140" font-family="JetBrains Mono" font-weight="800" font-size="58" fill="url(#title)">multiclass</text>
  <text x="64" y="188" font-family="JetBrains Mono" font-size="21" fill="${DIM}">what kind of LLM</text>
  <text x="64" y="216" font-family="JetBrains Mono" font-size="21" fill="${DIM}">practitioner are you?</text>

  <text x="64" y="290" font-family="JetBrains Mono" font-size="17" fill="${DIM}">Wizard · Warlock · Cleric</text>
  <text x="64" y="316" font-family="JetBrains Mono" font-size="17" fill="${DIM}">scan a handle, or answer six</text>
  <text x="64" y="342" font-family="JetBrains Mono" font-size="17" fill="${DIM}">questions, for a multiclass build.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${WIZARD}">multiclass.bisks.net</text>

  <!-- right: sample class card -->
  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="18" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>

  ${titleSvg}
  ${flavorSvg}

  <rect x="${barX}" y="${barY}" width="${wizardW}" height="${barH}" fill="${WIZARD}"/>
  <rect x="${barX + wizardW}" y="${barY}" width="${warlockW}" height="${barH}" fill="${WARLOCK}"/>
  <rect x="${barX + wizardW + warlockW}" y="${barY}" width="${clericW}" height="${barH}" fill="${CLERIC}"/>

  <text x="${barX}" y="${barY + 58}" font-family="JetBrains Mono" font-size="16" fill="${DIM}">WIZARD ${wizard}%  ·  WARLOCK ${warlock}%  ·  CLERIC ${cleric}%</text>
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
