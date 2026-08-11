// Generates public/og.png — the static Open Graph preview for the bare
// seinfeldify.bisks.net link (per-verdict /c/<code> cards reuse this same
// image too — a per-card render would need per-card infra this v1 doesn't
// have yet). No character likenesses drawn — just emoji stand-ins and text,
// same "hand-built SVG, rasterised with @resvg/resvg-js" recipe as
// sites/didscope and sites/thread-heirloom (copy, don't abstract).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#fdf6e3", INK = "#1a1a1a", MUTED = "#6b6b6b", ACCENT = "#f2b134";
const ACCENT_TEXT = ["#f2b134", "#6a4c93", "#e63946", "#2a9d8f"];

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Text-only chips, not emoji — the bundled font has no emoji glyphs and
// resvg has no system/fallback fonts to borrow from (see sites/didscope's
// og-gen.mjs, which hit the same constraint and used a bare letter glyph
// instead of an icon).
const ROSTER = ["JERRY", "GEORGE", "ELAINE", "KRAMER"];

const chipW = 220, chipGap = 24, chipsTotalW = ROSTER.length * chipW + (ROSTER.length - 1) * chipGap;
const chipsX0 = (W - chipsTotalW) / 2;
const chipY = 330, chipH = 190;

const chipsSvg = ROSTER.map((name, i) => {
  const x = chipsX0 + i * (chipW + chipGap);
  return `
    <rect x="${x}" y="${chipY}" width="${chipW}" height="${chipH}" rx="14" fill="#ffffff" stroke="${INK}" stroke-width="2.5"/>
    <text x="${x + chipW / 2}" y="${chipY + chipH / 2 + 12}" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="30" fill="${ACCENT_TEXT[i % ACCENT_TEXT.length]}">${esc(name)}</text>
  `;
}).join("\n");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="14" fill="${ACCENT}"/>

  <text x="60" y="110" font-family="JetBrains Mono" font-weight="800" font-size="58" fill="${INK}">seinfeldify</text>
  <text x="60" y="150" font-family="JetBrains Mono" font-size="22" fill="${MUTED}">what's the deal with your posts?</text>

  ${chipsSvg}

  <text x="60" y="580" font-family="JetBrains Mono" font-size="19" fill="${MUTED}">enter a Bluesky handle — an AI reads their whole post history and</text>
  <text x="60" y="606" font-family="JetBrains Mono" font-size="19" fill="${MUTED}">decides which Seinfeld character they are, with receipts.</text>

  <text x="${W - 60}" y="50" text-anchor="end" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${INK}">seinfeldify.bisks.net</text>
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
