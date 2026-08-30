// Generates the PWA icon set (public/icons/*.png). Recipe copied from
// sites/commonplace/icon-gen.mjs (the repo's PWA-icon reference). Glyph is
// three staggered swimlane bars of different lengths — reads as "timeline/
// gantt" at a glance, no text needed so it holds up at 192px.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node icon-gen.mjs                       # writes ./public/icons/*.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const INK = "#12181f";
const TEAL = "#2f8f7a";
const AMBER = "#e0a83e";
const CORAL = "#d9694f";
const PAPER = "#eef3f1";

function iconSvg(size, inset, { transparentBg = false } = {}) {
  const s = size;
  const pad = s * inset;
  const gw = s - pad * 2;
  const bg = transparentBg ? "" : `<rect width="${s}" height="${s}" fill="${INK}"/>`;
  const barH = gw * 0.16;
  const gap = gw * 0.14;
  const y0 = pad + gw * 0.14;
  const rows = [
    { w: gw * 0.92, x: 0, color: TEAL },
    { w: gw * 0.62, x: gw * 0.18, color: AMBER },
    { w: gw * 0.78, x: gw * 0.05, color: CORAL },
  ];
  const bars = rows
    .map((r, i) => {
      const y = y0 + i * (barH + gap);
      return `<rect x="${pad + r.x}" y="${y}" width="${r.w}" height="${barH}" rx="${barH * 0.35}" fill="${r.color}"/>`;
    })
    .join("\n  ");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  ${bg}
  ${bars}
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
  { name: "icon-maskable-512.png", size: 512, inset: 0.24 },
  { name: "apple-touch-icon.png", size: 180, inset: 0.12 },
];

for (const job of jobs) {
  const svg = iconSvg(job.size, job.inset);
  const png = render(svg, job.size);
  writeFileSync(outDir + job.name, png);
  console.log("wrote", job.name, png.length, "bytes");
}
