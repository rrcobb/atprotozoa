// Generates public/og.png — the Open Graph preview card for velvetrope.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium needed — the font is bundled in
// ./fonts and loaded explicitly, same as sites/didscope/og-gen.mjs).
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

const BG = "#150a1e", BG2 = "#1f0f2c", FG = "#f6eefc", DIM = "#c6aee0";
const ACCENT = "#b5179e", ACCENT2 = "#7a2ea1", CARD = "#241333", BORDER = "#432a5c";
const GOOD = "#3fcf83", BAD = "#ff6b6b";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const rows = [
  { who: "@mutual.one", tag: "wants in", good: true },
  { who: "@sock-puppet.test", tag: "wants out", good: false },
  { who: "@lurker.bsky.social", tag: "wants in", good: true },
];

const cardX = 470, cardY = 74, cardW = 668, cardH = 482;
const rowH = 74;
const rowsStartY = cardY + 176;

const rowsSvg = rows
  .map((r, i) => {
    const y = rowsStartY + i * rowH;
    const badgeColor = r.good ? GOOD : BAD;
    return `
    <rect x="${cardX + 40}" y="${y}" width="${cardW - 80}" height="${rowH - 16}" rx="10" fill="#2c1740" stroke="${BORDER}" stroke-width="1"/>
    <text x="${cardX + 66}" y="${y + 37}" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${FG}">${esc(r.who)}</text>
    <rect x="${cardX + cardW - 200}" y="${y + 16}" width="134" height="28" rx="14" fill="none" stroke="${badgeColor}" stroke-width="1.5"/>
    <text x="${cardX + cardW - 133}" y="${y + 35}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="14" fill="${badgeColor}">${esc(r.tag)}</text>
  `;
  })
  .join("\n");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="15%" cy="0%" r="60%">
      <stop offset="0" stop-color="#4a1a5e"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="95%" cy="100%" r="55%">
      <stop offset="0" stop-color="#5e123f"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${ACCENT}"/>
      <stop offset="1" stop-color="#e879c9"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <!-- left: wordmark + pitch -->
  <text x="64" y="140" font-family="JetBrains Mono" font-weight="800" font-size="58" fill="url(#title)">velvetrope</text>
  <text x="64" y="188" font-family="JetBrains Mono" font-size="20" fill="${DIM}">your moderation lists,</text>
  <text x="64" y="216" font-family="JetBrains Mono" font-size="20" fill="${DIM}">out in the open</text>

  <text x="64" y="290" font-family="JetBrains Mono" font-size="17" fill="${DIM}">Sign in with Bluesky. Anyone can</text>
  <text x="64" y="316" font-family="JetBrains Mono" font-size="17" fill="${DIM}">request to be added or removed.</text>
  <text x="64" y="342" font-family="JetBrains Mono" font-size="17" fill="${DIM}">You review the queue and bulk</text>
  <text x="64" y="368" font-family="JetBrains Mono" font-size="17" fill="${DIM}">approve or deny in one click.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT}">velvetrope.bisks.net</text>

  <!-- right: sample queue card -->
  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="18" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>
  <text x="${cardX + 40}" y="${cardY + 56}" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${FG}">request queue</text>
  <text x="${cardX + 40}" y="${cardY + 86}" font-family="JetBrains Mono" font-size="14" fill="${DIM}">"cool people only" · 3 pending</text>
  ${rowsSvg}
  <rect x="${cardX + 40}" y="${rowsStartY + rows.length * rowH + 10}" width="200" height="44" rx="8" fill="${GOOD}"/>
  <text x="${cardX + 140}" y="${rowsStartY + rows.length * rowH + 38}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="16" fill="#0c2e1a">approve all</text>
  <rect x="${cardX + 256}" y="${rowsStartY + rows.length * rowH + 10}" width="180" height="44" rx="8" fill="none" stroke="${BAD}" stroke-width="1.5"/>
  <text x="${cardX + 346}" y="${rowsStartY + rows.length * rowH + 38}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="16" fill="${BAD}">deny all</text>
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
