// Generates public/og.png — the Open Graph preview card for leafloop.
// A small deterministic snapshot of a few fractal trees mid-canopy, with
// leaf clusters at the tips, rasterised with @resvg/resvg-js (pure native
// module, no system Chromium needed).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork. Adapted from sites/fractalgarden/og-gen.mjs.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#060911";
const MUTED = "#7f8db3";
const ACCENT = "#7ee8b8";
const ACCENT2 = "#ffb86b";

// tiny deterministic PRNG so re-runs are byte-stable
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function buildTree(genome, seed) {
  const rand = mulberry32(seed >>> 0);
  const segs = [];
  const leaves = [];
  let frontier = [{ x: 0, y: 0, angle: -Math.PI / 2, length: genome.baseLen }];
  const maxDepth = genome.depth;
  for (let depth = 0; depth <= maxDepth; depth++) {
    const next = [];
    for (const node of frontier) {
      const x2 = node.x + Math.cos(node.angle) * node.length;
      const y2 = node.y + Math.sin(node.angle) * node.length;
      segs.push({ x1: node.x, y1: node.y, x2, y2, depth });
      if (depth === maxDepth) {
        const nLeaves = 1 + Math.floor(rand() * 3);
        for (let l = 0; l < nLeaves; l++) {
          leaves.push({
            x: x2, y: y2,
            angle: node.angle + (rand() - 0.5) * 1.6,
            size: 3.2 + rand() * 3.4,
            hueOffset: (rand() - 0.5) * 50,
          });
        }
        continue;
      }
      const nBranches = genome.branches + (rand() < 0.12 ? 1 : 0);
      for (let b = 0; b < nBranches; b++) {
        const t = nBranches === 1 ? 0.5 : b / (nBranches - 1);
        const off = (t - 0.5) * genome.angleSpread + (rand() - 0.5) * genome.angleJitter;
        next.push({ x: x2, y: y2, angle: node.angle + off, length: node.length * genome.lenRatio });
      }
    }
    frontier = next;
    if (!frontier.length) break;
  }
  return { segs, leaves, maxDepth };
}

function branchColor(depth, maxDepth) {
  const t = maxDepth ? depth / maxDepth : 0;
  return `hsl(28,${Math.round(18 + t * 10)}%,${Math.round(16 + t * 14)}%)`;
}

function leafColor(genome, leaf) {
  const hue = (genome.hue + leaf.hueOffset + 360) % 360;
  return `hsl(${Math.round(hue)},78%,64%)`;
}

// four trees at different generations/scales, positioned deterministically
// so the still image reads as a live canopy caught mid-loop.
const TREES = [
  { x: 190, y: 560, seed: 11, generation: 0, baseLen: 62 },
  { x: 430, y: 585, seed: 42, generation: 1, baseLen: 46 },
  { x: 690, y: 555, seed: 7, generation: 2, baseLen: 32 },
  { x: 380, y: 500, seed: 93, generation: 3, baseLen: 22 },
  { x: 560, y: 480, seed: 61, generation: 2, baseLen: 26 },
];

let parts = "";
for (const spec of TREES) {
  const grng = mulberry32(spec.seed * 7 + 3);
  const genome = {
    depth: clamp(5 + (spec.generation % 2), 5, 7),
    branches: 2 + (grng() < 0.3 ? 1 : 0),
    angleSpread: 0.5 + grng() * 0.5,
    angleJitter: 0.04 + grng() * 0.1,
    lenRatio: 0.68 + grng() * 0.08,
    baseLen: spec.baseLen,
    hue: (140 + spec.generation * 55 + grng() * 40) % 360,
  };
  const { segs, leaves, maxDepth } = buildTree(genome, spec.seed);
  const lines = segs
    .map((s) => {
      const color = branchColor(s.depth, genome.depth);
      const width = Math.max(1, 4 - (s.depth / Math.max(1, genome.depth)) * 3).toFixed(2);
      return `<line x1="${(spec.x + s.x1).toFixed(1)}" y1="${(spec.y + s.y1).toFixed(1)}" x2="${(spec.x + s.x2).toFixed(1)}" y2="${(spec.y + s.y2).toFixed(1)}" stroke="${color}" stroke-width="${width}" stroke-linecap="round"/>`;
    })
    .join("\n    ");
  const dots = leaves
    .map((l) => `<ellipse cx="${(spec.x + l.x).toFixed(1)}" cy="${(spec.y + l.y).toFixed(1)}" rx="${l.size.toFixed(1)}" ry="${(l.size * 0.42).toFixed(1)}" fill="${leafColor(genome, l)}" transform="rotate(${(l.angle * 180 / Math.PI).toFixed(1)} ${(spec.x + l.x).toFixed(1)} ${(spec.y + l.y).toFixed(1)})"/>`)
    .join("\n    ");
  parts += `\n    ${lines}\n    ${dots}`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#060911"/>
      <stop offset="0.75" stop-color="#0a0f1a"/>
      <stop offset="1" stop-color="#0d1420"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#sky)"/>
  <line x1="0" y1="606" x2="${W}" y2="606" stroke="#182338" stroke-width="1"/>
  <g>${parts}
  </g>

  <text x="66" y="70" font-family="JetBrains Mono" font-weight="800" font-size="52" fill="${ACCENT}">leafloop</text>
  <text x="66" y="108" font-family="JetBrains Mono" font-size="20" fill="${MUTED}">colorful leaves sway in the wind, and branch tips</text>
  <text x="66" y="134" font-family="JetBrains Mono" font-size="20" fill="${MUTED}">keep sprouting whole new trees. no clicking needed.</text>
  <text x="66" y="580" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${ACCENT2}">leafloop.bisks.net</text>
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
