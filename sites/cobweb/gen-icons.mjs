// Generates the extension toolbar icons (16/32/48/128) — MV3 requires
// bitmap icons, not SVG, so this hand-draws one spider mark and rasterises
// it at each size with @resvg/resvg-js. Same recipe as sites/skyclone's
// og-gen.mjs (no system Chromium/fontconfig on this box).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node gen-icons.mjs                      # writes ./public/extension/icons/icon*.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const BG = "#100b17";
const ACCENT = "#b388ff";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <rect width="128" height="128" rx="28" fill="${BG}"/>
  <g fill="none" stroke="${ACCENT}" stroke-width="6" stroke-linecap="round">
    <path d="M50 66 Q18 44 4 50"/>
    <path d="M50 78 Q14 74 2 82"/>
    <path d="M50 90 Q14 100 4 114"/>
    <path d="M78 66 Q110 44 124 50"/>
    <path d="M78 78 Q114 74 126 82"/>
    <path d="M78 90 Q114 100 124 114"/>
  </g>
  <ellipse cx="64" cy="86" rx="30" ry="24" fill="${ACCENT}"/>
  <circle cx="64" cy="52" r="19" fill="${ACCENT}"/>
</svg>`;

const sizes = [16, 32, 48, 128];
for (const size of sizes) {
  const r = new Resvg(svg, { fitTo: { mode: "width", value: size } });
  const png = r.render().asPng();
  const out = fileURLToPath(new URL(`./public/extension/icons/icon${size}.png`, import.meta.url));
  writeFileSync(out, png);
  console.log("wrote", out, png.length, "bytes");
}
