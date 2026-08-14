// Generates public/og.png — the Open Graph preview card for moottery. A
// mock of the game itself: a manila case-file card with a partly-redacted
// quote and a row of suspect @handle chips under it (drawn flat, no real
// avatars — this runs with no network). Rasterised with @resvg/resvg-js
// (pure native module, no system Chromium needed) — copied from
// sites/whodatninja/og-gen.mjs.
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

const BG = "#0c0d0b";
const INK = "#eae7d8", MUTED = "#8a8a78", FAINT = "#2a2c22";
const ACCENT = "#e0a400", GOOD = "#39d67a", BAD = "#e35b4a";
const PAPER = "#e9dfb8", PAPER_INK = "#241e0c", PAPER_FAINT = "#b9ac7c";

const SUSPECTS = ["@norvid-studies", "@gracekind.net", "@antiali.as", "@fromthewestmeadow.com"];
const GUILTY_INDEX = 1;

const cardX = 60, cardY = 158, cardW = W - 120, cardH = 260;

// A redacted evidence line: alternating readable words and solid blackout
// bars, laid out as individual <tspan>s so the bars render as filled rects
// rather than glyphs.
const LINE = [
  { t: "went ", redacted: false },
  { t: "quiet ", redacted: false },
  { t: "for six days, then said ", redacted: false },
  { t: "██████", redacted: true },
  { t: " was ", redacted: false },
  { t: "████", redacted: true },
  { t: ".", redacted: false },
];

let tspans = "";
LINE.forEach((seg) => {
  const fill = seg.redacted ? "#1a1206" : PAPER_INK;
  tspans += `<tspan fill="${fill}">${seg.t}</tspan>`;
});

const chipY = cardY + cardH + 56;
const chipH = 56, chipGap = 14;
let chipsSvg = "";
let cx = cardX;
SUSPECTS.forEach((label, i) => {
  const isGuilty = i === GUILTY_INDEX;
  const w = 34 + label.length * 15.5;
  const stroke = isGuilty ? GOOD : FAINT;
  const fill = isGuilty ? "rgba(57,214,122,0.12)" : "#14160f";
  const textColor = isGuilty ? GOOD : INK;
  chipsSvg += `
    <rect x="${cx}" y="${chipY}" width="${w}" height="${chipH}" rx="10" fill="${fill}" stroke="${stroke}" stroke-width="${isGuilty ? 3 : 2}"/>
    <text x="${cx + w / 2}" y="${chipY + chipH / 2 + 8}" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${textColor}" text-anchor="middle">${label}</text>`;
  cx += w + chipGap;
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="12%" cy="-10%" r="55%">
      <stop offset="0" stop-color="${ACCENT}" stop-opacity="0.16"/>
      <stop offset="1" stop-color="${ACCENT}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="95%" cy="0%" r="50%">
      <stop offset="0" stop-color="${BAD}" stop-opacity="0.10"/>
      <stop offset="1" stop-color="${BAD}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <text x="60" y="96" font-family="JetBrains Mono" font-weight="800" font-size="52" fill="${ACCENT}">moottery</text>
  <text x="60" y="138" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${INK}">a case file built from real posts</text>

  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="14" fill="${PAPER}"/>
  <text x="${cardX + 36}" y="${cardY + 56}" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${PAPER_FAINT}">PAGE 2 OF 3 · 45% LEGIBLE</text>
  <text x="${cardX + 36}" y="${cardY + 130}" font-family="JetBrains Mono" font-weight="700" font-size="34">${tspans}</text>
  <text x="${cardX + 36}" y="${cardY + cardH - 34}" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${PAPER_FAINT}">lifted from a real, public post</text>

  <text x="${cardX}" y="${chipY - 22}" font-family="JetBrains Mono" font-size="20" fill="${MUTED}">who wrote it?</text>
  ${chipsSvg}

  <text x="60" y="574" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${ACCENT}">moottery.bisks.net</text>
</svg>`;

const fontPath = fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url));
const r_ = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
});
const png = r_.render().asPng();
const out = new URL("./public/og.png", import.meta.url).pathname;
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");
