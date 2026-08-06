// Generates public/og.png — the static Open Graph preview card, so a bare
// share of dobreakthrough.bisks.net still unfurls as a real picture instead
// of a blank card. Hand-drawn SVG at the canonical OG size, matching the
// live page's plain black-on-white house look, rasterised with
// @resvg/resvg-js (pure native module, already vendored at the repo root —
// see sites/didscope/og-gen.mjs, this is the same recipe).
//
//   node og-gen.mjs   # writes ./public/og.png
//
// No emoji in the SVG text: JetBrainsMono.ttf has no emoji glyphs and
// resvg-js with loadSystemFonts:false draws empty tofu boxes for anything
// outside the font (see sites/grindset's og-gen note) — the live page uses
// emoji freely since real browsers have system emoji fonts, this static
// render doesn't.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const INK = "#111111", MUTED = "#6b6b6b", FAINT = "#e4e4e4", ACCENT = "#1a5fd0", GOLD = "#b8860b", GOOD = "#0d7a3f";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const rows = [
  { label: "PRE-SEED", value: "$150K", color: MUTED },
  { label: "SERIES A", value: "$8M", color: GOOD },
  { label: "IPO", value: "$410M", color: GOLD },
];

const rowH = 130;
const startY = 300;

const rowsSvg = rows
  .map((r, i) => {
    const y = startY + i * rowH;
    return `
    <line x1="64" y1="${y - 44}" x2="${W - 64}" y2="${y - 44}" stroke="${FAINT}" stroke-width="1"/>
    <text x="64" y="${y}" font-family="JetBrains Mono" font-weight="800" font-size="34" fill="${r.color}">${esc(r.label)}</text>
    <text x="${W - 64}" y="${y}" text-anchor="end" font-family="JetBrains Mono" font-weight="700" font-size="30" fill="${INK}">${esc(r.value)} raised</text>`;
  })
  .join("\n");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#ffffff"/>

  <text x="64" y="104" font-family="JetBrains Mono" font-weight="800" font-size="52" fill="${ACCENT}">DO A BREAKTHROUGH</text>
  <text x="64" y="146" font-family="JetBrains Mono" font-size="21" fill="${MUTED}">business ideas mined from a Bluesky account</text>

  <text x="64" y="206" font-family="JetBrains Mono" font-size="18" fill="${MUTED}">press the button — the idea mutates one funding stage</text>
  <text x="64" y="232" font-family="JetBrains Mono" font-size="18" fill="${MUTED}">further along a startup's usual arc. it never really stops.</text>

  ${rowsSvg}

  <text x="64" y="${H - 40}" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT}">dobreakthrough.bisks.net</text>
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
