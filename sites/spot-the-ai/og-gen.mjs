// Generates public/og.png — the Open Graph preview card for spot-the-ai.
// Shows an actual pair from the quiz (one AI, one human illustration) so the
// unfurled link previews the real bit: "can you tell which is which?"
// Rasterised with @resvg/resvg-js (no system Chromium / fontconfig needed —
// font is bundled in ./fonts, images embedded as base64 data URIs).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#f3ede2", INK = "#1c1a17", DIM = "#6b6255", ACCENT = "#b5482f", ACCENT2 = "#2f6b52", BORDER = "#d8cdb8";

const imgPath = (name) => fileURLToPath(new URL(`./public/images/${name}`, import.meta.url));
const toDataUri = (name, mime) => `data:${mime};base64,${readFileSync(imgPath(name)).toString("base64")}`;

const aiImg = toDataUri("sorgin.png", "image/png");
const humanImg = toDataUri("baba-yaga.jpg", "image/jpeg");

const cardW = 420, cardH = 420, cardY = 150, gap = 40;
const leftX = 60, rightX = leftX + cardW + gap;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <clipPath id="clipLeft"><rect x="${leftX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="14"/></clipPath>
    <clipPath id="clipRight"><rect x="${rightX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="14"/></clipPath>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>

  <text x="${W / 2}" y="72" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="52" fill="${INK}">Spot the <tspan fill="${ACCENT}">AI</tspan></text>
  <text x="${W / 2}" y="108" text-anchor="middle" font-family="JetBrains Mono" font-size="19" fill="${DIM}">one of these is AI-generated. can you tell which?</text>

  <g clip-path="url(#clipLeft)">
    <image href="${aiImg}" x="${leftX}" y="${cardY}" width="${cardW}" height="${cardH}" preserveAspectRatio="xMidYMid slice"/>
  </g>
  <rect x="${leftX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="14" fill="none" stroke="${BORDER}" stroke-width="3"/>

  <g clip-path="url(#clipRight)">
    <image href="${humanImg}" x="${rightX}" y="${cardY}" width="${cardW}" height="${cardH}" preserveAspectRatio="xMidYMid slice"/>
  </g>
  <rect x="${rightX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="14" fill="none" stroke="${BORDER}" stroke-width="3"/>

  <text x="${leftX + cardW / 2}" y="${cardY + cardH + 40}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${DIM}">A</text>
  <text x="${rightX + cardW / 2}" y="${cardY + cardH + 40}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${DIM}">B</text>

  <text x="${W / 2}" y="${H - 34}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT2}">spot-the-ai.bisks.net</text>
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
