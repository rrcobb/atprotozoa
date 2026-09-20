// Generates public/og.png — the static Open Graph preview card for
// barbcourt. Rasterised with @resvg/resvg-js (pure native module, no system
// Chromium/fontconfig needed — the font is bundled in ./fonts and loaded
// explicitly). This box has no fontconfig either way.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run by hand if the
// artwork changes; nothing regenerates this automatically.

import { Resvg } from "@resvg/resvg-js";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const W = 1200, H = 630;
const PAPER = "#f4ecd8", INK = "#241c15", ACCENT = "#6b1f2a", LINE = "#cdbf9c";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${PAPER}"/>
  <rect x="24" y="24" width="${W - 48}" height="${H - 48}" fill="none" stroke="${ACCENT}" stroke-width="6"/>
  <rect x="40" y="40" width="${W - 80}" height="${H - 80}" fill="none" stroke="${INK}" stroke-width="1"/>

  <text x="${W / 2}" y="230" text-anchor="middle" font-family="DejaVu Serif" font-weight="bold" font-size="88" fill="${ACCENT}">barbcourt</text>
  <text x="${W / 2}" y="290" text-anchor="middle" font-family="DejaVu Serif" font-style="italic" font-size="28" fill="${INK}">a court of manners</text>

  <text x="${W / 2}" y="380" text-anchor="middle" font-family="DejaVu Serif" font-size="24" fill="${INK}">Rise through Victorian society purely by how</text>
  <text x="${W / 2}" y="416" text-anchor="middle" font-family="DejaVu Serif" font-size="24" fill="${INK}">cutting your remarks are.</text>

  <text x="${W / 2}" y="480" text-anchor="middle" font-family="DejaVu Serif" font-style="italic" font-size="20" fill="${LINE}">“That was blunt, not cutting — there's a difference.”</text>

  <text x="${W / 2}" y="560" text-anchor="middle" font-family="DejaVu Serif" font-weight="bold" font-size="22" fill="${ACCENT}">barbcourt.bisks.net</text>
</svg>`;

const fontFile = join(__dirname, "fonts", "DejaVuSerif.ttf");
const fontFileBold = join(__dirname, "fonts", "DejaVuSerif-Bold.ttf");

const resvg = new Resvg(svg, {
  font: {
    fontFiles: [fontFile, fontFileBold],
    loadSystemFonts: false,
    defaultFontFamily: "DejaVu Serif",
  },
});

const png = resvg.render().asPng();
writeFileSync(join(__dirname, "public", "og.png"), png);
console.log("wrote public/og.png");
