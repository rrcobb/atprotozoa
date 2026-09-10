// Generates public/og.png — a dusk sky with a scattered flock of triangular
// birds, deterministically placed (seeded) so re-running this script always
// produces the same card. Rasterised with @resvg/resvg-js, same recipe as
// sites/macpaint/og-gen.mjs (copy, don't abstract) — font vendored in
// ./fonts, node_modules resolved from the pnpm workspace root.
//
//   node og-gen.mjs   # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20260910);

function bird(x, y, ang, len, wid, fill) {
  const dx = Math.cos(ang), dy = Math.sin(ang);
  const px = -dy, py = dx;
  const nose = [x + dx * len, y + dy * len];
  const tailL = [x - dx * len * 0.6 + px * wid, y - dy * len * 0.6 + py * wid];
  const mid = [x - dx * len * 0.3, y - dy * len * 0.3];
  const tailR = [x - dx * len * 0.6 - px * wid, y - dy * len * 0.6 - py * wid];
  return `<path d="M ${nose[0]} ${nose[1]} L ${tailL[0]} ${tailL[1]} L ${mid[0]} ${mid[1]} L ${tailR[0]} ${tailR[1]} Z" fill="${fill}"/>`;
}

// A loose vee-shaped swirl, roughly murmuration-shaped: two converging arcs.
let flock = "";
const cx = 620, cy = 300;
for (let i = 0; i < 140; i++) {
  const t = i / 140;
  const arm = i % 2;
  const radius = 60 + t * 420 + rng() * 30;
  const theta = t * 3.6 + arm * Math.PI * 0.55 + rng() * 0.15;
  const x = cx + Math.cos(theta) * radius * 1.4;
  const y = cy + Math.sin(theta) * radius * 0.55 - t * 40;
  if (x < -20 || x > W + 20 || y < -20 || y > H + 20) continue;
  const ang = theta + Math.PI / 2 + (rng() - 0.5) * 0.4;
  flock += bird(x, y, ang, 9 + rng() * 4, 3.5, "rgba(15,8,10,0.9)");
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1a1030"/>
      <stop offset="0.22" stop-color="#3a1f4d"/>
      <stop offset="0.45" stop-color="#7a3b5e"/>
      <stop offset="0.65" stop-color="#c85a4a"/>
      <stop offset="0.82" stop-color="#e8935a"/>
      <stop offset="1" stop-color="#f5c168"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#sky)"/>
  ${flock}

  <rect x="0" y="552" width="${W}" height="78" fill="rgba(10,4,20,0.72)"/>
  <text x="40" y="598" font-family="JetBrains Mono" font-weight="800" font-size="34" fill="#f3ead8">murmuration</text>
  <text x="${W - 40}" y="598" font-family="JetBrains Mono" font-size="19" fill="#ffd8a8" text-anchor="end">a flock of starlings, or your own follows</text>
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
