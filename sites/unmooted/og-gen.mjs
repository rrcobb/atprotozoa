// Generates public/og.png — the Open Graph preview card for unmooted.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js.
// Copied from sites/actual/og-gen.mjs.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#0b0c10";
const INK = "#e8e6df", MUTED = "#8b8d97", ACCENT = "#e35b4a", GOOD = "#39d67a", FAINT = "#262931";

const rows = [
  { handle: "@norvid-studies.bsky.social", cross: false },
  { handle: "@timfduffy.com", cross: true },
  { handle: "@gracekind.net", cross: false },
  { handle: "@sengarrasbear.bsky.social", cross: false },
];

const rowY = 300;
const rowH = 62;
let rowsSvg = "";
rows.forEach((r, i) => {
  const y = rowY + i * rowH;
  const dim = r.cross ? 0.45 : 1;
  rowsSvg += `
    <circle cx="96" cy="${y}" r="20" fill="${FAINT}"/>
    <text x="132" y="${y + 7}" font-family="JetBrains Mono" font-size="22"
      fill="${r.cross ? MUTED : INK}" opacity="${dim}">${r.handle}</text>
    ${r.cross ? `<line x1="128" y1="${y}" x2="620" y2="${y}" stroke="${ACCENT}" stroke-width="2.5"/>` : ""}
    ${r.cross ? `<text x="640" y="${y + 7}" font-family="JetBrains Mono" font-weight="700" font-size="18" fill="${ACCENT}">unmooted</text>` : ""}
  `;
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <circle cx="120" cy="60" r="260" fill="${ACCENT}" opacity="0.10"/>
  <circle cx="${W - 60}" cy="0" r="220" fill="${GOOD}" opacity="0.06"/>

  <text x="60" y="120" font-family="JetBrains Mono" font-weight="800" font-size="58" fill="${INK}">unmooted</text>
  <text x="60" y="160" font-family="JetBrains Mono" font-size="24" fill="${MUTED}">catch who quietly stopped following</text>

  ${rowsSvg}

  <text x="60" y="${H - 56}" font-family="JetBrains Mono" font-size="18" fill="${MUTED}">check a handle now, check again later — diff the two, no firehose</text>
  <text x="${W - 60}" y="${H - 56}" text-anchor="end" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT}">unmooted.bisks.net</text>
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
