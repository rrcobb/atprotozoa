// Generates public/og.png — the Open Graph preview card for recordscope, so a
// shared link auto-renders a picture of the tool in Bluesky / other
// unfurlers. Hand-drawn SVG at the canonical OG size, matching the live
// page's amber/parchment look, rasterised with @resvg/resvg-js (pure native
// module, no system Chromium needed — this box has no fontconfig/system
// fonts either, so the font is bundled in ./fonts and loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// A generic sample card (not tied to any real record) — this is the static
// fallback for the bare link. Per-record share cards get their own real
// og:title/description server-side, in src/index.ts (renderShare).
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#12100c", FG = "#f2ead9", DIM = "#a99d84";
const ACCENT = "#e8a33d", ACCENT2 = "#7cb9a8", CARD = "#1d1912", BORDER = "#37301f";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const cardX = 470, cardY = 70, cardW = 668, cardH = 490;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="15%" cy="-10%" r="60%">
      <stop offset="0" stop-color="#3a2a12"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="90%" cy="0%" r="55%">
      <stop offset="0" stop-color="#123028"/>
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
  <text x="64" y="140" font-family="JetBrains Mono" font-weight="800" font-size="60" fill="url(#title)">recordscope</text>
  <text x="64" y="188" font-family="JetBrains Mono" font-size="21" fill="${DIM}">read any <tspan fill="${ACCENT2}">atproto</tspan> record</text>
  <text x="64" y="216" font-family="JetBrains Mono" font-size="21" fill="${DIM}">straight off its PDS</text>

  <text x="64" y="288" font-family="JetBrains Mono" font-size="17" fill="${DIM}">Paste an AT-URI or a whtwnd.com</text>
  <text x="64" y="314" font-family="JetBrains Mono" font-size="17" fill="${DIM}">link. Get a rendered page back —</text>
  <text x="64" y="340" font-family="JetBrains Mono" font-size="17" fill="${DIM}">with its own link to share instead.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT2}">recordscope.bisks.net</text>

  <!-- right: input -> output card -->
  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="18" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>

  <rect x="${cardX + 40}" y="${cardY + 40}" width="${cardW - 80}" height="46" rx="9" fill="${BG}" stroke="${BORDER}"/>
  <text x="${cardX + 58}" y="${cardY + 70}" font-family="JetBrains Mono" font-size="16" fill="${ACCENT2}">at://did:plc:cp5h…/com.whtwnd.blog.entry/rasta-la-vista</text>

  <text x="${cardX + cardW / 2}" y="${cardY + 130}" text-anchor="middle" font-family="JetBrains Mono" font-size="24" fill="${DIM}">↓</text>

  <rect x="${cardX + 40}" y="${cardY + 150}" width="${cardW - 80}" height="${cardH - 190}" rx="12" fill="${BG}" stroke="${BORDER}"/>
  <text x="${cardX + 64}" y="${cardY + 196}" font-family="JetBrains Mono" font-weight="800" font-size="24" fill="${FG}">RASTA LA VISTA</text>
  <text x="${cardX + 64}" y="${cardY + 226}" font-family="JetBrains Mono" font-size="14" fill="${DIM}">com.whtwnd.blog.entry · @antiali.as</text>

  <rect x="${cardX + 64}" y="${cardY + 250}" width="4" height="150" fill="${ACCENT}"/>
  <text x="${cardX + 84}" y="${cardY + 272}" font-family="JetBrains Mono" font-size="15" fill="${FG}">INT. OPEN PLAN OFFICE — EARLY</text>
  <text x="${cardX + 84}" y="${cardY + 296}" font-family="JetBrains Mono" font-size="15" fill="${FG}">MORNING</text>
  <text x="${cardX + 84}" y="${cardY + 328}" font-family="JetBrains Mono" font-size="14" fill="${DIM}">ENG MANAGER paces near SR</text>
  <text x="${cardX + 84}" y="${cardY + 350}" font-family="JetBrains Mono" font-size="14" fill="${DIM}">DIRECTOR's office, pitching...</text>
  <text x="${cardX + 84}" y="${cardY + 382}" font-family="JetBrains Mono" font-size="14" fill="${ACCENT2}">no huge paste needed.</text>
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
