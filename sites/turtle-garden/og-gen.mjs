// Generates public/og.png — the Open Graph preview card for turtle garden.
// Actually runs the classic fractal-plant L-system (same expand/walk logic
// as the live page, reimplemented here in Node) and renders the real
// segments as the artwork, rather than hand-drawing a plant icon.
// Rasterised with @resvg/resvg-js (pure native module, no system Chromium
// needed).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Adapted from
// sites/quine-garden/og-gen.mjs.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const INK = "#111111", MUTED = "#6b6b6b", ACCENT = "#1a5fd0", PAPER = "#fbfbf8";

// ── the same fractal-plant grammar as the live page ─────────────────
const axiom = "X";
const rules = { X: "F+[[X]-X]-F[-FX]+X", F: "FF" };
const ITER = 5, ANGLE = 25, HEADING = 90;

function expand(axiom, rules, iterations) {
  let s = axiom;
  for (let i = 0; i < iterations; i++) {
    let next = "";
    for (const ch of s) next += rules[ch] !== undefined ? rules[ch] : ch;
    s = next;
  }
  return s;
}

function walk(str, angleDeg, headingDeg) {
  let x = 0, y = 0, heading = headingDeg;
  const segs = [];
  const stack = [];
  let depth = 0, maxDepth = 0;
  for (const ch of str) {
    if (ch === "F") {
      const rad = (heading * Math.PI) / 180;
      const nx = x + Math.cos(rad), ny = y + Math.sin(rad);
      segs.push({ x1: x, y1: y, x2: nx, y2: ny, depth });
      x = nx; y = ny;
    } else if (ch === "+") heading += angleDeg;
    else if (ch === "-") heading -= angleDeg;
    else if (ch === "[") { stack.push({ x, y, heading, depth }); depth++; maxDepth = Math.max(maxDepth, depth); }
    else if (ch === "]") { const s = stack.pop(); x = s.x; y = s.y; heading = s.heading; depth = s.depth; }
  }
  return { segs, maxDepth: Math.max(1, maxDepth) };
}

function depthColor(depth, maxDepth) {
  const t = Math.min(1, depth / maxDepth);
  const hue = 28 + t * (132 - 28);
  const sat = 35 + t * 40;
  const light = 32 + t * 18;
  return `hsl(${hue.toFixed(0)}, ${sat.toFixed(0)}%, ${light.toFixed(0)}%)`;
}

const str = expand(axiom, rules, ITER);
const { segs, maxDepth } = walk(str, ANGLE, HEADING);

let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
for (const s of segs) {
  minX = Math.min(minX, s.x1, s.x2); maxX = Math.max(maxX, s.x1, s.x2);
  minY = Math.min(minY, s.y1, s.y2); maxY = Math.max(maxY, s.y1, s.y2);
}
const spanX = maxX - minX, spanY = maxY - minY;

// Plant panel: right two-thirds of the card, full height.
const panelX = 520, panelW = W - panelX - 40, panelH = H - 80, panelY = 40;
const scale = Math.min(panelW / spanX, panelH / spanY) * 0.92;
const offX = panelX + (panelW - spanX * scale) / 2 - minX * scale;
const offY = panelY + panelH - (panelH - spanY * scale) / 2 + minY * scale;

const px = (x) => (x * scale + offX).toFixed(1);
const py = (y) => (offY - y * scale).toFixed(1);

const lines = segs
  .map((s) => {
    const w = Math.max(1.4, 7 * (1 - s.depth / (maxDepth + 1)));
    return `<line x1="${px(s.x1)}" y1="${py(s.y1)}" x2="${px(s.x2)}" y2="${py(s.y2)}" stroke="${depthColor(s.depth, maxDepth)}" stroke-width="${w.toFixed(1)}" stroke-linecap="round"/>`;
  })
  .join("\n  ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${PAPER}"/>

  <text x="66" y="150" font-family="JetBrains Mono" font-weight="800" font-size="70" fill="${INK}">turtle</text>
  <text x="66" y="228" font-family="JetBrains Mono" font-weight="800" font-size="70" fill="${INK}">garden</text>
  <text x="68" y="288" font-family="JetBrains Mono" font-size="21" fill="${MUTED}">a five-character grammar,</text>
  <text x="68" y="318" font-family="JetBrains Mono" font-size="21" fill="${MUTED}">rewritten on itself five times —</text>
  <text x="68" y="348" font-family="JetBrains Mono" font-size="21" fill="${MUTED}">this is the actual output, not a drawing</text>

  <text x="68" y="440" font-family="JetBrains Mono" font-size="16" fill="${MUTED}">X → F+[[X]-X]-F[-FX]+X</text>
  <text x="68" y="466" font-family="JetBrains Mono" font-size="16" fill="${MUTED}">F → FF</text>

  <text x="68" y="580" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${ACCENT}">bisks.net/turtle-garden</text>

  ${lines}
</svg>`;

const fontPath = fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url));
const r_ = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
});
const png = r_.render().asPng();
const out = new URL("./public/og.png", import.meta.url).pathname;
writeFileSync(out, png);
console.log("wrote", out, `(${segs.length} segments)`);
