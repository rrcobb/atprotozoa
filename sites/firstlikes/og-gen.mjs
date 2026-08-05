// Generates public/og.png — the static Open Graph preview card, so a bare
// share of firstlikes.bisks.net (no handle yet) still unfurls as a real
// picture instead of a blank card. Hand-drawn SVG at the canonical OG size,
// matching the live page's plain black-on-white house look, rasterised with
// @resvg/resvg-js (pure native module, already vendored at the repo root —
// see sites/didscope/og-gen.mjs, this is the same recipe).
//
//   node og-gen.mjs   # writes ./public/og.png
//
// A sample account (not a real one) — per-account share cards are generated
// live, client-side, in public/index.html (buildShareCard).

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const INK = "#111111", MUTED = "#6b6b6b", FAINT = "#e4e4e4", ACCENT = "#1a5fd0", GOLD = "#b8860b";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const rows = [
  { label: "10 likes", value: "post #47", hit: true },
  { label: "100 likes", value: "post #612", hit: true },
  { label: "1000 likes", value: "not yet", hit: false },
];

const rowH = 130;
const startY = 300;

const rowsSvg = rows
  .map((r, i) => {
    const y = startY + i * rowH;
    const numColor = r.hit ? GOLD : MUTED;
    return `
    <line x1="64" y1="${y - 44}" x2="${W - 64}" y2="${y - 44}" stroke="${FAINT}" stroke-width="1"/>
    <text x="64" y="${y}" font-family="JetBrains Mono" font-weight="800" font-size="34" fill="${numColor}">${esc(r.label)}</text>
    <text x="${W - 64}" y="${y}" text-anchor="end" font-family="JetBrains Mono" font-weight="700" font-size="30" fill="${INK}">${esc(r.value)}</text>`;
  })
  .join("\n");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#ffffff"/>

  <text x="64" y="110" font-family="JetBrains Mono" font-weight="800" font-size="60" fill="${ACCENT}">firstlikes</text>
  <text x="64" y="150" font-family="JetBrains Mono" font-size="21" fill="${MUTED}">how many posts to your first hit?</text>

  <text x="64" y="210" font-family="JetBrains Mono" font-size="18" fill="${MUTED}">enter a handle — we read every post they've ever made,</text>
  <text x="64" y="236" font-family="JetBrains Mono" font-size="18" fill="${MUTED}">oldest first, to find which post number crossed each one.</text>

  ${rowsSvg}

  <text x="64" y="${H - 40}" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT}">firstlikes.bisks.net</text>
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
