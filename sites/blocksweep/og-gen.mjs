// Generates public/og.png — the Open Graph preview card for blocksweep.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium/fontconfig needed — the font is
// bundled in ./fonts and loaded explicitly). Copied and adapted from
// sites/rollcall/og-gen.mjs (copy, don't abstract).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// A generic card, not tied to any real list — like rollcall, blocksweep's
// actual result (which list, how many blocked) isn't cacheable as a static
// image without a per-result server route, so this static card is the only
// og:image the site serves.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#150d0d", FG = "#f2e4e4", DIM = "#a68888";
const ACCENT = "#e05c5c", ACCENT2 = "#ff8383";
const CARD = "#1e1414", BORDER = "#3a2424", PANEL2 = "#261818";

const rows = [
  { name: "did:plc:z72i7h...", handle: "@bsky.app" },
  { name: "did:plc:24chxm...", handle: "@ver.ooo" },
  { name: "did:plc:kpxj7u...", handle: "@moll.dev" },
  { name: "did:plc:f6n22z...", handle: "@bisks.net" },
];

const rowsSvg = rows.map((r, i) => {
  const y = 128 + i * 76;
  return `
    <circle cx="702" cy="${y}" r="24" fill="${PANEL2}" stroke="${BORDER}" stroke-width="1.5"/>
    <text x="742" y="${y - 6}" font-family="JetBrains Mono" font-size="17" fill="${DIM}">${r.name}</text>
    <text x="742" y="${y + 16}" font-family="JetBrains Mono" font-weight="700" font-size="17" fill="${FG}">${r.handle}</text>
    <rect x="1010" y="${y - 16}" width="140" height="32" rx="8" fill="${ACCENT}22" stroke="${ACCENT}" stroke-width="1.3"/>
    <text x="1080" y="${y + 5}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="15" fill="${ACCENT}">blocked</text>`;
}).join("");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="15%" cy="-10%" r="60%">
      <stop offset="0" stop-color="#331a1a"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${ACCENT}"/>
      <stop offset="1" stop-color="${ACCENT2}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>

  <text x="64" y="140" font-family="JetBrains Mono" font-weight="800" font-size="56" fill="url(#title)">🧹 blocksweep</text>
  <text x="64" y="188" font-family="JetBrains Mono" font-size="21" fill="${DIM}">paste a Bluesky list, review it,</text>
  <text x="64" y="216" font-family="JetBrains Mono" font-size="21" fill="${DIM}">sign in, and block everyone left</text>
  <text x="64" y="244" font-family="JetBrains Mono" font-size="21" fill="${DIM}">checked — in one sweep.</text>

  <text x="64" y="330" font-family="JetBrains Mono" font-size="17" fill="${DIM}">Real app.bsky.graph.block records,</text>
  <text x="64" y="356" font-family="JetBrains Mono" font-size="17" fill="${DIM}">written straight to your own PDS —</text>
  <text x="64" y="382" font-family="JetBrains Mono" font-size="17" fill="${DIM}">not a soft subscribe-to-list mute.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT}">blocksweep.bisks.net</text>

  <rect x="670" y="70" width="470" height="480" rx="18" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>
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
