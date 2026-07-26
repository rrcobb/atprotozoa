// Generates public/og.png — the Open Graph preview card for change, so a
// shared link auto-renders a picture of the board in Bluesky / other
// unfurlers. Hand-draws the real board geometry (see public/engine.js) in
// Tokyo Night colors at the canonical OG size, then rasterises with resvg
// (no live data, no network at raster time — deterministic card).
//
//   node og-gen.mjs   # writes ./og.svg
//   npx --yes @resvg/resvg-js-cli --font-file fonts/JetBrainsMono.ttf \
//     --font-default-family "JetBrains Mono" og.svg public/og.png
//
// (resvg needs an explicit font file — this sandbox has none installed via
// fontconfig, so text silently disappears without --font-file. fonts/ here
// is copied from sites/didscope/fonts/, generation-time only — nothing in
// public/ references it, the live page uses the system mono font stack.)
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand (and
// the resvg step above) if you change the board artwork.

import { writeFileSync } from "node:fs";

const W = 1200, H = 630;

const BG = "#1a1b26", PANEL = "#1f2335", LINE = "#292e42", INK = "#c0caf5",
  DIM = "#737aa2", BLUE = "#7aa2f7", BLUE_DK = "#3d59a1", RED = "#f7768e",
  RED_DK = "#db4b4b", PURPLE = "#bb9af7", GREEN = "#9ece6a";

// Same 14-point layout as public/engine.js, copied in (not imported — house
// style is copy-don't-abstract, and this only ever needs to match the shape,
// not the exact numbers).
const POINTS = {
  A: { x: 40, y: 76 }, B: { x: 40, y: 148 }, C: { x: 40, y: 220 },
  D: { x: 120, y: 40 }, E: { x: 120, y: 112 }, F: { x: 120, y: 184 }, G: { x: 120, y: 256 },
  H: { x: 200, y: 76 }, I: { x: 200, y: 148 }, J: { x: 200, y: 220 }, K: { x: 200, y: 292 },
  L: { x: 280, y: 112 }, M: { x: 280, y: 184 }, N: { x: 280, y: 256 },
};
const ROWS = [
  ["C", "G", "K"], ["K", "N"], ["B", "F", "J", "N"], ["B", "E", "H"],
  ["C", "F", "I", "L"], ["D", "H", "L"], ["A", "D"], ["A", "E", "I", "M"], ["G", "J", "M"],
];
// A representative mid-game position — some pieces moved off home, nobody's won yet.
const BLUE_AT = ["E", "H", "J"];
const RED_AT = ["I", "L", "N"];

// board occupies roughly the right half of the card, scaled + centered
const SCALE = 1.35, OX = 660, OY = 30;
const tx = (p) => OX + p.x * SCALE, ty = (p) => OY + p.y * SCALE;

let edges = "";
for (const row of ROWS) {
  edges += `<polyline points="${row.map((id) => `${tx(POINTS[id])},${ty(POINTS[id])}`).join(" ")}"
    fill="none" stroke="${LINE}" stroke-width="3.5"/>`;
}

function homeGlow(ids, color) {
  const pts = ids.map((id) => POINTS[id]);
  const pad = 34;
  const minX = Math.min(...pts.map((p) => p.x)) * SCALE + OX - pad;
  const maxX = Math.max(...pts.map((p) => p.x)) * SCALE + OX + pad;
  const minY = Math.min(...pts.map((p) => p.y)) * SCALE + OY - pad;
  const maxY = Math.max(...pts.map((p) => p.y)) * SCALE + OY + pad;
  return `<rect x="${minX}" y="${minY}" width="${maxX - minX}" height="${maxY - minY}" rx="34" fill="${color}" opacity="0.1"/>`;
}
const glows = homeGlow(["A", "B", "C"], BLUE) + homeGlow(["L", "M", "N"], RED);

let dots = "";
for (const [id, p] of Object.entries(POINTS)) {
  if (BLUE_AT.includes(id) || RED_AT.includes(id)) continue;
  dots += `<circle cx="${tx(p)}" cy="${ty(p)}" r="7" fill="${LINE}"/>`;
}
let pieces = "";
for (const id of BLUE_AT) {
  const p = POINTS[id];
  pieces += `<circle cx="${tx(p)}" cy="${ty(p)}" r="15" fill="${BLUE}" stroke="${BLUE_DK}" stroke-width="3"/>`;
}
for (const id of RED_AT) {
  const p = POINTS[id];
  pieces += `<circle cx="${tx(p)}" cy="${ty(p)}" r="15" fill="${RED}" stroke="${RED_DK}" stroke-width="3"/>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="bg" cx="20%" cy="-10%" r="90%">
      <stop offset="0" stop-color="#232742"/>
      <stop offset="0.6" stop-color="${BG}"/>
      <stop offset="1" stop-color="${BG}"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>

  <text x="64" y="128" font-family="JetBrains Mono, monospace" font-weight="800"
    font-size="66" fill="${BLUE}">change<tspan fill="${PURPLE}">!</tspan></text>
  <text x="64" y="176" font-family="JetBrains Mono, monospace" font-size="22"
    fill="${INK}">the 14-point GamesCrafters board game</text>

  <text x="64" y="238" font-family="JetBrains Mono, monospace" font-size="19"
    fill="${DIM}">slide your <tspan fill="${BLUE}">3</tspan> pieces forward, occupy the</text>
  <text x="64" y="268" font-family="JetBrains Mono, monospace" font-size="19"
    fill="${DIM}">opponent's home or trap them.</text>

  <text x="64" y="330" font-family="JetBrains Mono, monospace" font-size="19"
    fill="${GREEN}">the bot solves the whole game</text>
  <text x="64" y="360" font-family="JetBrains Mono, monospace" font-size="19"
    fill="${GREEN}">before making a single move.</text>

  <rect x="64" y="410" width="15" height="15" rx="3" fill="${BLUE}"/>
  <text x="90" y="423" font-family="JetBrains Mono, monospace" font-size="17" fill="${DIM}">blue</text>
  <rect x="164" y="410" width="15" height="15" rx="3" fill="${RED}"/>
  <text x="190" y="423" font-family="JetBrains Mono, monospace" font-size="17" fill="${DIM}">red</text>

  <text x="64" y="${H - 48}" font-family="JetBrains Mono, monospace" font-size="17"
    fill="${DIM}">Tokyo Night · SVG board · fits a phone screen</text>
  <text x="${W - 64}" y="${H - 48}" text-anchor="end" font-family="JetBrains Mono, monospace"
    font-size="17" fill="${PURPLE}">bisks.net/games/change</text>

  <rect x="${OX - 60}" y="${OY - 10}" width="${(280 - 40) * SCALE + 120}" height="${(292 - 40) * SCALE + 20}"
    rx="20" fill="${PANEL}" stroke="${LINE}" stroke-width="1.5"/>
  ${glows}
  ${edges}
  ${dots}
  ${pieces}
</svg>`;

writeFileSync(new URL("./og.svg", import.meta.url), svg);
console.log("wrote og.svg — now run:\n  npx --yes @resvg/resvg-js-cli --font-file fonts/JetBrainsMono.ttf --font-default-family \"JetBrains Mono\" og.svg public/og.png");
