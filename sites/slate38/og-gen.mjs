// Generates public/og.png — the Open Graph preview card for slate38, so a
// shared link auto-renders the campaign poster in Bluesky / other unfurlers.
// Hand-drawn SVG at the canonical OG size, matching the live page's
// campaign-poster look, rasterised with @resvg/resvg-js (pure native module,
// no system Chromium needed — this box has no fontconfig/system fonts
// either, so the font is bundled in ./fonts and loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// This is the static, generic card for the bare link (the whole ticket).
// Per-endorsement share cards are generated live, client-side, in
// public/index.html (buildEndorseCard), and per-handle unfurls for
// /endorse/<handle> reuse this same generic image (see src/index.ts) — only
// the title/description text varies per share, not the picture.
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#0a0d1c", FG = "#f3efe2", DIM = "#8a93b8";
const ACCENT = "#ff3b5c", ACCENT2 = "#ffcb47", CARD = "#131a30", BORDER = "#2a3358";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Illustrative only — a static preview image can't run the live analysis,
// so these are sample rows, not a claim about who actually tops the real
// ranking (that's computed fresh from real feed data on every page load).
const TICKET = [
  { label: "HYPE INDEX 210 · #38", handle: "@heartpunk.com" },
  { label: "HYPE INDEX 264 · #37", handle: "@fubarchitect.com" },
  { label: "HYPE INDEX 318", handle: "@dollspace.gay" },
  { label: "HYPE INDEX 355", handle: "@vibecode.rodeo" },
  { label: "HYPE INDEX 402 · #1 (sample)", handle: "@antiali.as", top: true },
];

const cardX = 470, cardY = 60, cardW = 668, cardH = 510;
const rowH = 92;
let rowsSvg = "";
TICKET.forEach((c, i) => {
  const y = cardY + 44 + i * rowH;
  const rankColor = c.top ? ACCENT2 : DIM;
  rowsSvg += `
    <rect x="${cardX + 32}" y="${y}" width="${cardW - 64}" height="${rowH - 16}" rx="12"
      fill="${c.top ? "rgba(255,203,71,0.08)" : "rgba(255,255,255,0.02)"}"
      stroke="${c.top ? ACCENT2 : BORDER}" stroke-width="1.5"/>
    <text x="${cardX + 56}" y="${y + 32}" font-family="JetBrains Mono" font-weight="800" font-size="14" letter-spacing="1" fill="${rankColor}">${esc(c.label)}</text>
    <text x="${cardX + 56}" y="${y + 58}" font-family="JetBrains Mono" font-weight="800" font-size="24" fill="${FG}">${esc(c.handle)}</text>
  `;
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="15%" cy="-10%" r="60%">
      <stop offset="0" stop-color="#3a1030"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="90%" cy="0%" r="55%">
      <stop offset="0" stop-color="#0e2540"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${ACCENT}"/>
      <stop offset="1" stop-color="${ACCENT2}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <!-- left: wordmark + pitch -->
  <text x="64" y="100" font-family="JetBrains Mono" font-weight="800" font-size="20" letter-spacing="2" fill="${ACCENT2}">-- RANKED BY REAL DATA --</text>
  <text x="64" y="176" font-family="JetBrains Mono" font-weight="900" font-size="60" fill="url(#title)">THE SLATE</text>

  <text x="64" y="238" font-family="JetBrains Mono" font-size="18" fill="${DIM}">buildthis.bisks.net analyzes each</text>
  <text x="64" y="264" font-family="JetBrains Mono" font-size="18" fill="${DIM}">candidate's real feed and scores it —</text>
  <text x="64" y="290" font-family="JetBrains Mono" font-size="18" fill="${DIM}">all 38 #bsky38 picks, ranked by an</text>
  <text x="64" y="316" font-family="JetBrains Mono" font-size="18" fill="${DIM}">actual Hype Index.</text>

  <text x="64" y="378" font-family="JetBrains Mono" font-weight="700" font-size="17" fill="${ACCENT}">CAST YOUR BALLOT AT BSKY38.COM</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT2}">slate38.bisks.net</text>

  <!-- right: the ticket -->
  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="18" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>
  ${rowsSvg}
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
