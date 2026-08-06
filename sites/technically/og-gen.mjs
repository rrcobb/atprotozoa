// Generates public/og.png — the Open Graph preview card for technically, a
// static "certificate" defining the site itself, in the site's own voice.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium/fontconfig needed — the font is
// bundled in ./fonts and loaded explicitly).
//
//   cp -r ../didscope/node_modules .   # one-time, not a project dependency (gitignored)
//   node og-gen.mjs                    # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#ffffff", INK = "#111111", MUTED = "#6b6b6b", FAINT = "#e4e4e4";
const ACCENT = "#1a5fd0", STAMP = "#c0392b";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const lines = [
  "It may be accessed, viewed, or otherwise perceived by any",
  "sufficiently internet-capable computing device, contingent",
  "upon said device maintaining an active connection to the",
  "Internet, by means of the Hypertext Transfer Protocol, or,",
  "for the security-conscious, its encrypted counterpart, HTTPS.",
];

const linesSvg = lines
  .map(
    (l, i) =>
      `<text x="64" y="${290 + i * 34}" font-family="JetBrains Mono" font-size="22" fill="${INK}">${esc(l)}</text>`
  )
  .join("\n");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect x="24" y="24" width="${W - 48}" height="${H - 48}" fill="none" stroke="${INK}" stroke-width="3"/>

  <text x="64" y="100" font-family="JetBrains Mono" font-weight="800" font-size="46" fill="${INK}">technically</text>
  <text x="64" y="132" font-family="JetBrains Mono" font-size="18" fill="${MUTED}">the pedantic redefinition engine</text>

  <line x1="64" y1="155" x2="${W - 64}" y2="155" stroke="${FAINT}" stroke-width="1.5"/>

  <text x="64" y="200" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${ACCENT}">re: &#8220;website&#8221;</text>
  ${linesSvg}

  <rect x="${W - 300}" y="${H - 118}" width="236" height="54" fill="none" stroke="${STAMP}" stroke-width="2"/>
  <text x="${W - 282}" y="${H - 84}" font-family="JetBrains Mono" font-weight="700" font-size="17" fill="${STAMP}">DEFINITION ON FILE</text>

  <text x="64" y="${H - 64}" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${ACCENT}">technically.bisks.net</text>
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
