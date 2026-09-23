// Generates public/og.png — the Open Graph preview card for thoughtdome.
// Drawn shapes, not emoji: the bundled mono font has no color-emoji glyphs
// and resvg would render a tofu box instead (same reasoning as
// sites/warmhug/og-gen.mjs and sites/fortunejar/og-gen.mjs).
// Rasterised with @resvg/resvg-js (pure native module, no system
// Chromium/fontconfig needed).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#16121a", BG2 = "#1e1724", CARD = "#241b2e", BORDER = "#3c2c47";
const INK = "#f3ecf7", DIM = "#b09ec2", GOLD = "#f2b544", ROSE = "#e8547a";

const cardX = 90, cardY = 90, cardW = 1020, cardH = 450;
const midX = cardX + cardW / 2;

function spikes(cx, cy, r, n, color, op) {
  let d = "";
  for (let i = 0; i < n; i++) {
    const a1 = (i / n) * Math.PI * 2;
    const a2 = ((i + 0.5) / n) * Math.PI * 2;
    const x1 = (cx + Math.cos(a1) * r).toFixed(1);
    const y1 = (cy + Math.sin(a1) * r).toFixed(1);
    const x2 = (cx + Math.cos(a2) * r * 0.55).toFixed(1);
    const y2 = (cy + Math.sin(a2) * r * 0.55).toFixed(1);
    d += `${i === 0 ? "M" : "L"} ${x1} ${y1} L ${x2} ${y2} `;
  }
  return `<path d="${d}Z" fill="${color}" opacity="${op}"/>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${BG}"/>
      <stop offset="1" stop-color="${BG2}"/>
    </linearGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${GOLD}"/>
      <stop offset="1" stop-color="${ROSE}"/>
    </linearGradient>
    <linearGradient id="glowA" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${GOLD}" stop-opacity="0.22"/>
      <stop offset="1" stop-color="${GOLD}" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="glowB" x1="1" y1="0" x2="0" y2="0">
      <stop offset="0" stop-color="${ROSE}" stop-opacity="0.22"/>
      <stop offset="1" stop-color="${ROSE}" stop-opacity="0"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#bg)"/>

  <text x="64" y="118" font-family="JetBrains Mono" font-weight="800" font-size="52" fill="url(#title)">thunderdome of thought</text>
  <text x="66" y="156" font-family="JetBrains Mono" font-size="19" fill="${DIM}">two definitions enter. one leaves.</text>

  <rect x="${cardX}" y="${cardY + 110}" width="${cardW / 2}" height="${cardH - 110}" fill="url(#glowA)"/>
  <rect x="${midX}" y="${cardY + 110}" width="${cardW / 2}" height="${cardH - 110}" fill="url(#glowB)"/>
  <rect x="${cardX}" y="${cardY + 110}" width="${cardW}" height="${cardH - 110}" rx="18" fill="${CARD}" stroke="${BORDER}" stroke-width="2"/>
  <line x1="${midX}" y1="${cardY + 110}" x2="${midX}" y2="${cardY + cardH}" stroke="${BORDER}" stroke-width="2"/>

  ${spikes(cardX + 220, cardY + 300, 60, 10, GOLD, 0.85)}
  ${spikes(midX + 220, cardY + 300, 60, 12, ROSE, 0.85)}

  <text x="${cardX + 60}" y="${cardY + 300 + 6}" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="30" fill="${INK}">A</text>
  <text x="${midX + 60}" y="${cardY + 300 + 6}" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="30" fill="${INK}">B</text>

  <text x="${midX}" y="${cardY + 300 + 12}" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="34" fill="${DIM}">VS</text>

  <text x="${cardX + 40}" y="${cardY + 400}" font-family="JetBrains Mono" font-size="16" fill="${DIM}">folk intuition</text>
  <text x="${midX + 40}" y="${cardY + 400}" font-family="JetBrains Mono" font-size="16" fill="${DIM}">neuroscience</text>

  <text x="66" y="600" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${GOLD}">thoughtdome.bisks.net</text>
  <text x="720" y="600" font-family="JetBrains Mono" font-size="16" fill="${DIM}">vote every round · ELO keeps score</text>
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
