// Generates public/og.png — the Open Graph preview card for promptrot.
// A clean, well-punctuated prompt at top, decaying through a jagged crack
// into a stack of lowercase, typo'd follow-up posts below — the same
// before/after the live page demonstrates. Hand-drawn SVG at the canonical
// OG size, rasterised with @resvg/resvg-js (pure native module, no system
// Chromium needed — this box has no fontconfig/system fonts either, so the
// font is bundled in ./fonts and loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork. Adapted from sites/didscope/og-gen.mjs.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#0c0f0a", FG = "#eef0e6", DIM = "#9aa38a";
const CLEAN = "#4fb8ff", ROT = "#8fbf3f", ROT2 = "#c9a53b", CARD = "#14180f", BORDER = "#2a3020";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const BEFORE = "Build a budget tracker that logs expenses by category and exports a CSV.";
const POSTS = [
  { lead: "", text: "build a budget thing that just ads up my expenses" },
  { lead: "oh also", text: "make it export somthing i can open later" },
  { lead: "wait can you also", text: "make it update live and require a login for some reason" },
  { lead: "", text: "i meant just what ive requested" },
];

const rows = POSTS.map((p, i) => {
  const y = 310 + i * 68;
  const text = (p.lead ? p.lead + " " : "") + p.text;
  return `<g>
    <rect x="60" y="${y}" width="${W - 120}" height="56" rx="10" fill="${i % 2 === 0 ? CARD : "#171b12"}" stroke="${BORDER}"/>
    <text x="84" y="${y + 22}" font-family="JetBrains Mono" font-weight="700" font-size="13" fill="${i === POSTS.length - 1 ? "#ff9b6b" : CLEAN}">@buildthis.bisks.net</text>
    <text x="84" y="${y + 42}" font-family="JetBrains Mono" font-size="16" fill="${FG}">${esc(text)}</text>
  </g>`;
}).join("\n");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${CLEAN}"/>
      <stop offset="1" stop-color="${ROT}"/>
    </linearGradient>
    <radialGradient id="glow" cx="10%" cy="-10%" r="60%">
      <stop offset="0" stop-color="#1c2a12"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>

  <text x="60" y="90" font-family="JetBrains Mono" font-weight="800" font-size="48" fill="url(#title)">promptrot</text>
  <text x="60" y="122" font-family="JetBrains Mono" font-size="18" fill="${DIM}">enshittify your own prompts</text>

  <rect x="60" y="150" width="${W - 120}" height="90" rx="10" fill="#0f1310" stroke="${BORDER}"/>
  <text x="84" y="180" font-family="JetBrains Mono" font-weight="700" font-size="13" fill="${DIM}">BEFORE</text>
  <text x="84" y="210" font-family="JetBrains Mono" font-size="18" fill="${FG}">${esc(BEFORE)}</text>

  <text x="${W / 2}" y="264" text-anchor="middle" font-family="JetBrains Mono" font-size="20" fill="${DIM}">↓ rots into ↓</text>

  ${rows}

  <text x="60" y="${H - 24}" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ROT2}">promptrot.bisks.net</text>
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
