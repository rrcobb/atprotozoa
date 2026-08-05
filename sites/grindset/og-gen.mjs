// Generates public/og.png — the Open Graph preview card for grindset.
// A garish hustle-course landing page in miniature: countdown banner, gradient
// headline, a fake pricing card with a struck-through price. Deliberately the
// visual opposite of every other buildthis OG card (dark terminal aesthetic,
// JetBrains Mono, muted accents) — this one is loud, pastel-gradient, sans-
// serif, because the site itself is the thing @fromthewestmeadow.com would
// hate most. Hand-drawn SVG, rasterised with @resvg/resvg-js (no system
// fontconfig on this box, so the font is bundled in ./fonts).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork. Adapted from sites/promptrot/og-gen.mjs.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const INK = "#1a0b2e", PAPER = "#fff9f0", PURPLE = "#7b2ff7", PINK = "#f72585";
const ORANGE = "#ff9500", GOLD = "#ffd60a";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${PURPLE}"/>
      <stop offset="0.6" stop-color="#3a0ca3"/>
      <stop offset="1" stop-color="${INK}"/>
    </linearGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${GOLD}"/>
      <stop offset="1" stop-color="${ORANGE}"/>
    </linearGradient>
    <linearGradient id="urgency" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${PINK}"/>
      <stop offset="1" stop-color="${ORANGE}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#bg)"/>

  <rect x="0" y="0" width="${W}" height="52" fill="url(#urgency)"/>
  <text x="${W / 2}" y="34" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="#ffffff">DOORS CLOSE IN 47:00 — ONLY 3 SPOTS LEFT</text>

  <text x="60" y="180" font-family="JetBrains Mono" font-weight="800" font-size="52" fill="#ffffff">Unlock Your</text>
  <text x="60" y="248" font-family="JetBrains Mono" font-weight="800" font-size="52" fill="url(#title)">10x Grindset™</text>
  <text x="60" y="290" font-family="JetBrains Mono" font-size="19" fill="#d8c8ee">the website buildthis thinks you'd hate most</text>

  <rect x="60" y="330" width="360" height="220" rx="18" fill="#fff9f0" stroke="#f0e6ff"/>
  <text x="90" y="368" font-family="JetBrains Mono" font-weight="700" font-size="15" fill="${PINK}">MOST VISIONARY</text>
  <text x="90" y="404" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${INK}">Grindset Elite</text>
  <text x="90" y="432" font-family="JetBrains Mono" font-size="17" fill="#b9aecb" text-decoration="line-through">$9,997</text>
  <text x="90" y="480" font-family="JetBrains Mono" font-weight="800" font-size="40" fill="${PURPLE}">$2,997</text>
  <text x="90" y="512" font-family="JetBrains Mono" font-size="14" fill="#9a8fae">zero real backend included</text>

  <text x="460" y="380" font-family="JetBrains Mono" font-size="18" fill="#d8c8ee">• 247 people viewing right now</text>
  <text x="460" y="412" font-family="JetBrains Mono" font-size="18" fill="#d8c8ee">• Aiden never answers your question</text>
  <text x="460" y="444" font-family="JetBrains Mono" font-size="18" fill="#d8c8ee">• quiz is rigged: everyone scores 100</text>
  <text x="460" y="476" font-family="JetBrains Mono" font-size="18" fill="#d8c8ee">• the cookie banner tracks nothing</text>

  <text x="60" y="${H - 40}" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${GOLD}">grindset.bisks.net</text>
  <text x="${W - 60}" y="${H - 40}" text-anchor="end" font-family="JetBrains Mono" font-size="15" fill="#b9aecb">a buildthis build for @fromthewestmeadow.com</text>
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
