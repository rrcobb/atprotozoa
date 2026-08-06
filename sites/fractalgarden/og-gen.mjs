// Generates public/og.png — the Open Graph preview card for fractalgarden.
// A small deterministic bed of recursive branch-plants at a few generations
// deep, rasterised with @resvg/resvg-js (pure native module, no system
// Chromium needed).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork. Adapted from sites/replicators/og-gen.mjs.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#0a0d07";
const MUTED = "#8fa082";
const ACCENT = "#ff8fd1";
const ACCENT2 = "#c9a6ff";

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

function buildSegments(genome, seed) {
  const rand = mulberry32(seed >>> 0);
  const segs = [];
  const buds = [];
  let frontier = [{ x: 0, y: 0, angle: -Math.PI / 2, length: genome.baseLen }];
  const maxDepth = genome.depth;
  for (let depth = 0; depth <= maxDepth; depth++) {
    const next = [];
    for (const node of frontier) {
      const x2 = node.x + Math.cos(node.angle) * node.length;
      const y2 = node.y + Math.sin(node.angle) * node.length;
      segs.push({ x1: node.x, y1: node.y, x2, y2, depth });
      if (depth === maxDepth) {
        if (rand() < genome.leafChance) buds.push({ x: x2, y: y2, r: 2.5 + rand() * 3 });
        continue;
      }
      const nBranches = genome.branches + (rand() < 0.15 ? 1 : 0);
      for (let b = 0; b < nBranches; b++) {
        const t = nBranches === 1 ? 0.5 : b / (nBranches - 1);
        const off = (t - 0.5) * genome.angleSpread + (rand() - 0.5) * genome.angleJitter;
        next.push({ x: x2, y: y2, angle: node.angle + off, length: node.length * genome.lenRatio });
      }
    }
    frontier = next;
    if (!frontier.length) break;
  }
  return { segs, buds };
}

function segColor(genome, depth, maxDepth) {
  const t = maxDepth ? depth / maxDepth : 0;
  const hue = Math.round(((genome.hue - 100) * t + 100 + 360) % 360);
  const sat = Math.round(30 + t * 45);
  const light = Math.round(26 + t * 32);
  return `hsl(${hue},${sat}%,${light}%)`;
}

// four plants across a few generations, positioned deterministically so the
// still image reads as a small live bed, not a random scatter.
const PLANTS = [
  { x: 210, y: 560, seed: 11, generation: 0 },
  { x: 430, y: 590, seed: 42, generation: 1 },
  { x: 640, y: 560, seed: 7, generation: 2 },
  { x: 340, y: 520, seed: 93, generation: 3 },
];

let parts = "";
for (const spec of PLANTS) {
  const grng = mulberry32(spec.seed * 7 + 3);
  const genome = {
    depth: clamp(3 + spec.generation, 3, 7),
    branches: 2 + (grng() < 0.35 ? 1 : 0),
    angleSpread: 0.6 + grng() * 0.55,
    angleJitter: 0.05 + grng() * 0.12,
    lenRatio: 0.62 + grng() * 0.1,
    baseLen: 46 + grng() * 16,
    leafChance: 0.3 + grng() * 0.4,
    hue: 300 + spec.generation * 25 + grng() * 30,
  };
  const { segs, buds } = buildSegments(genome, spec.seed);
  const lines = segs
    .map((s) => {
      const color = segColor(genome, s.depth, genome.depth);
      const width = Math.max(1, 4.2 - (s.depth / Math.max(1, genome.depth)) * 3.2).toFixed(2);
      return `<line x1="${(spec.x + s.x1).toFixed(1)}" y1="${(spec.y + s.y1).toFixed(1)}" x2="${(spec.x + s.x2).toFixed(1)}" y2="${(spec.y + s.y2).toFixed(1)}" stroke="${color}" stroke-width="${width}" stroke-linecap="round"/>`;
    })
    .join("\n    ");
  const dots = buds
    .map((b) => `<circle cx="${(spec.x + b.x).toFixed(1)}" cy="${(spec.y + b.y).toFixed(1)}" r="${b.r.toFixed(1)}" fill="hsl(${Math.round(genome.hue)},80%,68%)"/>`)
    .join("\n    ");
  parts += `\n    ${lines}\n    ${dots}`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <line x1="0" y1="606" x2="${W}" y2="606" stroke="#1a2113" stroke-width="1"/>
  <g>${parts}
  </g>

  <text x="66" y="70" font-family="JetBrains Mono" font-weight="800" font-size="52" fill="${ACCENT}">fractal garden</text>
  <text x="66" y="108" font-family="JetBrains Mono" font-size="20" fill="${MUTED}">plant a seed. click it and it blooms into mutated</text>
  <text x="66" y="134" font-family="JetBrains Mono" font-size="20" fill="${MUTED}">copies of itself — deeper and stranger each time.</text>
  <text x="66" y="580" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${ACCENT2}">fractalgarden.bisks.net</text>
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
