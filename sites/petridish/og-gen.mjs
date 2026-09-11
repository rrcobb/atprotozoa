// Generates public/og.png — runs the actual particle-life rules for a few
// hundred steps on a fixed seed (same force() curve and mulberry32 PRNG as
// public/main.js, just O(n^2) since n is small for a one-off render) so the
// card shows a real settled colony, not a fake decorative scatter. Rasterised
// with @resvg/resvg-js, same recipe as sites/murmuration/og-gen.mjs (copy,
// don't abstract) — font vendored in ./fonts, node_modules local to this site.
//
//   node og-gen.mjs   # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const HUES = [352, 28, 200, 145, 268, 48, 320];
const BETA = 0.3;

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20260911);

function force(r, a) {
  if (r < BETA) return r / BETA - 1;
  if (r < 1) return a * (1 - Math.abs(2 * r - 1 - BETA) / (1 - BETA));
  return 0;
}

const NSPECIES = 5;
const N = 360;
const cx = 600, cy = 300, dishR = 250;
const reach = 60;

const matrix = [];
for (let i = 0; i < NSPECIES; i++) {
  const row = [];
  for (let j = 0; j < NSPECIES; j++) row.push(rng() * 2 - 1);
  matrix.push(row);
}

const particles = [];
for (let i = 0; i < N; i++) {
  const ang = rng() * Math.PI * 2;
  const rad = Math.sqrt(rng()) * dishR * 0.85;
  particles.push({
    x: cx + Math.cos(ang) * rad,
    y: cy + Math.sin(ang) * rad,
    vx: 0, vy: 0,
    type: Math.floor(rng() * NSPECIES),
  });
}

const friction = 0.12;
const fscale = 6;
for (let step = 0; step < 260; step++) {
  for (const p of particles) {
    let ax = 0, ay = 0;
    for (const o of particles) {
      if (o === p) continue;
      const dx = o.x - p.x, dy = o.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d === 0 || d > reach) continue;
      const f = force(d / reach, matrix[p.type][o.type]) * fscale;
      ax += (dx / d) * f;
      ay += (dy / d) * f;
    }
    p._ax = ax; p._ay = ay;
  }
  for (const p of particles) {
    p.vx = (p.vx + p._ax) * (1 - friction);
    p.vy = (p.vy + p._ay) * (1 - friction);
    p.x += p.vx;
    p.y += p.vy;
    const dx = p.x - cx, dy = p.y - cy;
    const d = Math.hypot(dx, dy);
    if (d > dishR) {
      const nx = dx / d, ny = dy / d;
      p.x = cx + nx * dishR;
      p.y = cy + ny * dishR;
      const vn = p.vx * nx + p.vy * ny;
      p.vx -= 2 * vn * nx;
      p.vy -= 2 * vn * ny;
      p.vx *= 0.6; p.vy *= 0.6;
    }
  }
}

let dots = "";
for (const p of particles) {
  const hue = HUES[p.type % HUES.length];
  dots += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4.2" fill="hsla(${hue},68%,46%,0.9)"/>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="bg" cx="50%" cy="42%" r="65%">
      <stop offset="0" stop-color="#f5f1e4"/>
      <stop offset="1" stop-color="#d8d0ba"/>
    </radialGradient>
    <radialGradient id="dish" cx="50%" cy="40%" r="70%">
      <stop offset="0" stop-color="#fdfbf3"/>
      <stop offset="1" stop-color="#eee6cf"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <circle cx="${cx}" cy="${cy}" r="${dishR}" fill="url(#dish)" stroke="rgba(120,110,80,0.35)" stroke-width="6"/>
  <circle cx="${cx}" cy="${cy}" r="${dishR - 4}" fill="none" stroke="rgba(255,255,255,0.8)" stroke-width="2"/>
  ${dots}
  <rect x="0" y="552" width="${W}" height="78" fill="rgba(42,38,32,0.9)"/>
  <text x="40" y="598" font-family="JetBrains Mono" font-weight="800" font-size="34" fill="#fdf6e8">petridish</text>
  <text x="${W - 40}" y="598" font-family="JetBrains Mono" font-size="19" fill="#f0c896" text-anchor="end">particle-life colonies in a dish</text>
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
