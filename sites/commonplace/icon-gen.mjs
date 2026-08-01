// Generates the PWA icon set (public/icons/*.png) — no PWA precedent exists
// elsewhere in this repo (see notes/40-new-site-playbook.md), so this becomes
// the reference for the next one. Pure-shape glyph (a page with a folded
// corner + two rule lines, i.e. "a note") — no text, so it reads cleanly at
// 192px and doesn't need the bundled font. Rendered with @resvg/resvg-js,
// same recipe as og-gen.mjs.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node icon-gen.mjs                       # writes ./public/icons/*.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const RUST = "#c15b3f";
const CREAM = "#fdf6e8";
const RUST_DARK = "#9a4530";

// `inset` is the fraction of the canvas kept clear on each side — Android's
// maskable-icon safe zone wants the glyph inside the middle ~80%, so a
// maskable export gets a bigger inset than a plain any-purpose icon.
function iconSvg(size, inset, { transparentBg = false } = {}) {
  const s = size;
  const pad = s * inset;
  const glyphSize = s - pad * 2;
  const bg = transparentBg ? "" : `<rect width="${s}" height="${s}" fill="${RUST}"/>`;
  // A page with a folded top-right corner, plus two "rule lines" of text.
  const gx = pad, gy = pad, gw = glyphSize, gh = glyphSize;
  const fold = gw * 0.28;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  ${bg}
  <path d="M ${gx} ${gy}
           H ${gx + gw - fold}
           L ${gx + gw} ${gy + fold}
           V ${gy + gh}
           H ${gx}
           Z"
        fill="${CREAM}" stroke="${RUST_DARK}" stroke-width="${s * 0.012}" stroke-linejoin="round"/>
  <path d="M ${gx + gw - fold} ${gy} L ${gx + gw - fold} ${gy + fold} L ${gx + gw} ${gy + fold} Z"
        fill="${RUST_DARK}" opacity="0.35"/>
  <rect x="${gx + gw * 0.16}" y="${gy + gh * 0.45}" width="${gw * 0.68}" height="${gh * 0.07}" rx="${gh * 0.035}" fill="${RUST}" opacity="0.55"/>
  <rect x="${gx + gw * 0.16}" y="${gy + gh * 0.6}" width="${gw * 0.5}" height="${gh * 0.07}" rx="${gh * 0.035}" fill="${RUST}" opacity="0.55"/>
</svg>`;
}

function render(svg, size) {
  const r = new Resvg(svg, { fitTo: { mode: "width", value: size } });
  return r.render().asPng();
}

const outDir = fileURLToPath(new URL("./public/icons/", import.meta.url));
mkdirSync(outDir, { recursive: true });

const jobs = [
  { name: "icon-192.png", size: 192, inset: 0.14 },
  { name: "icon-512.png", size: 512, inset: 0.14 },
  { name: "icon-maskable-512.png", size: 512, inset: 0.22 },
  { name: "apple-touch-icon.png", size: 180, inset: 0.12 },
];

for (const job of jobs) {
  const svg = iconSvg(job.size, job.inset);
  const png = render(svg, job.size);
  writeFileSync(outDir + job.name, png);
  console.log("wrote", job.name, png.length, "bytes");
}
