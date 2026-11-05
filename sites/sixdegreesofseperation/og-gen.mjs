// Generates public/og.png — the Open Graph preview card for sixdegreesofseperation.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium/fontconfig needed — font is
// bundled in ./fonts and loaded explicitly). Copied from
// sites/mootfluence/og-gen.mjs.
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
const BG = "#fffdf8", INK = "#14171a", MUTED = "#6b6b6b", FAINT = "#e2ddd0";
const ACCENT = "#1083fe";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <text x="64" y="130" font-family="JetBrains Mono" font-weight="800" font-size="44" fill="${INK}">SixDegreesOfSeperation</text>
  <text x="64" y="172" font-family="JetBrains Mono" font-size="20" fill="${MUTED}">who do <tspan fill="${ACCENT}">all your moots block?</tspan></text>
  <text x="64" y="240" font-family="JetBrains Mono" font-size="17" fill="${MUTED}">reads every block your mutuals have made,</text>
  <text x="64" y="266" font-family="JetBrains Mono" font-size="17" fill="${MUTED}">ranks accounts blocked by 6 or more,</text>
  <text x="64" y="292" font-family="JetBrains Mono" font-size="17" fill="${MUTED}">saves them as a moderation list.</text>
  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT}">sixdegreesofseperation.bisks.net</text>
  <rect x="700" y="110" width="440" height="380" rx="16" fill="#ffffff" stroke="${FAINT}" stroke-width="2"/>
  ${[11, 9, 8, 7, 6].map((n, i) => `<circle cx="740" cy="${166 + i * 66}" r="18" fill="${["#1083fe", "#7c5cff", "#00ba7c", "#f91880", "#b8860b"][i]}" opacity="0.85"/><rect x="775" y="${158 + i * 66}" width="${150 - i * 14}" height="12" rx="6" fill="${FAINT}"/><text x="1090" y="${172 + i * 66}" text-anchor="end" font-family="JetBrains Mono" font-weight="800" font-size="22" fill="#f91880">${n}</text>`).join("")}
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
