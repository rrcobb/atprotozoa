// Generates public/og.png — the Open Graph preview card for vouch.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium / fontconfig needed — the font is
// bundled in ./fonts and loaded explicitly). Same recipe as
// sites/hyperobject/og-gen.mjs and sites/didscope/og-gen.mjs.
//
//   node og-gen.mjs   # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run by hand if the
// artwork changes.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#0a0f0d", CARD = "#11201a", BORDER = "#23372e";
const FG = "#eef4ee", DIM = "#8ba396";
const GOLD = "#d9b35a", GOLD2 = "#f0d18c";

const cardX = 470, cardY = 60, cardW = 668, cardH = 510;
const sealCx = cardX + cardW / 2;
const sealCy = cardY + 150;

const names = ["@rowan.exam", "@marist.ok", "@ferro.wav", "@quinn.zip"];
const rowY0 = cardY + 300;
const rows = names
  .map((n, i) => {
    const y = rowY0 + i * 52;
    return `
    <rect x="${cardX + 40}" y="${y}" width="${cardW - 80}" height="40" rx="9" fill="#16261f" stroke="${BORDER}" stroke-width="1.5"/>
    <circle cx="${cardX + 66}" cy="${y + 20}" r="12" fill="#223229" stroke="${BORDER}"/>
    <text x="${cardX + 88}" y="${y + 26}" font-family="JetBrains Mono" font-size="16" fill="${FG}">${n}</text>
    <text x="${cardX + cardW - 60}" y="${y + 26}" text-anchor="end" font-family="JetBrains Mono" font-size="16" fill="${GOLD}">✓</text>`;
  })
  .join("\n");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="15%" cy="-10%" r="60%">
      <stop offset="0" stop-color="#132018"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="90%" cy="0%" r="55%">
      <stop offset="0" stop-color="#1c2a20"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="sealgrad" cx="35%" cy="30%" r="70%">
      <stop offset="0" stop-color="${GOLD2}"/>
      <stop offset="0.6" stop-color="${GOLD}"/>
      <stop offset="1" stop-color="#8a6a25"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${GOLD}"/>
      <stop offset="1" stop-color="${GOLD2}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <text x="64" y="140" font-family="JetBrains Mono" font-weight="800" font-size="58" fill="url(#title)">vouch</text>
  <text x="64" y="188" font-family="JetBrains Mono" font-size="21" fill="${DIM}">who do you actually</text>
  <text x="64" y="216" font-family="JetBrains Mono" font-size="21" fill="${DIM}">stand behind?</text>

  <text x="64" y="290" font-family="JetBrains Mono" font-size="17" fill="${DIM}">Sign in, vouch for anyone you find</text>
  <text x="64" y="316" font-family="JetBrains Mono" font-size="17" fill="${DIM}">influential. A real record on your</text>
  <text x="64" y="342" font-family="JetBrains Mono" font-size="17" fill="${DIM}">own PDS — public for anyone to look up.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${GOLD}">vouch.bisks.net</text>

  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="18" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>

  <circle cx="${sealCx}" cy="${sealCy}" r="72" fill="url(#sealgrad)" stroke="${BORDER}" stroke-width="2"/>
  <text x="${sealCx}" y="${sealCy + 26}" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="56" fill="#23180a">✓</text>

  ${rows}
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
