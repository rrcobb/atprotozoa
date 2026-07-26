// Generates public/og.png — the Open Graph preview card for simclash, so a
// shared link auto-renders a picture of the collision in Bluesky / other
// unfurlers.
//
// Hand-draws a representative "screenshot" of the live canvas as an SVG (two
// glowing particle clusters, blue and orange, mid-collision with gold sparks
// and connecting strands across the overlap) at the canonical OG size, then
// rasterises it with resvg (no live data, no network — deterministic so the
// card is stable across builds).
//
//   node og-gen.mjs   # writes ./og.svg
//   npx --yes @resvg/resvg-js-cli --font-file fonts/JetBrainsMono.ttf \
//     --font-default-family "JetBrains Mono" og.svg public/og.png
//
// (resvg needs an explicit font file — this sandbox has none installed via
// fontconfig, so text silently disappears without --font-file. fonts/ here
// is copied from sites/toroidarium/fonts/, generation-time only — nothing in
// public/ references it, the live page uses the system mono font stack.)
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand (and
// the resvg step above) if you change the artwork.

import { writeFileSync } from "node:fs";

const W = 1200, H = 630;

const INK = "#eaf2fb", MUTED = "#90a2b8", GOLD = "#ffd166";
const BLUE = "#4da3ff", ORANGE = "#ff8a4d";

// tiny seeded RNG so the layout is identical every run
let seed = 1337;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

function cluster(cx, cy, r, n, color) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2;
    const rr = Math.sqrt(rnd()) * r;
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.85]);
  }
  let lines = "";
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const dx = pts[i][0] - pts[j][0], dy = pts[i][1] - pts[j][1];
      const d = Math.hypot(dx, dy);
      if (d < r * 0.45) {
        lines += `<line x1="${pts[i][0].toFixed(1)}" y1="${pts[i][1].toFixed(1)}" x2="${pts[j][0].toFixed(1)}" y2="${pts[j][1].toFixed(1)}" stroke="${color}" stroke-width="1" opacity="${(0.22 * (1 - d / (r * 0.45))).toFixed(2)}"/>`;
      }
    }
  }
  let dots = `<circle cx="${cx}" cy="${cy}" r="3.5" fill="#ffffff" opacity="0.9"/>`;
  for (const [x, y] of pts) {
    dots += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(rnd() * 2.4 + 1.6).toFixed(1)}" fill="${color}" opacity="0.92"/>`;
  }
  return { lines, dots, pts };
}

const clusterA = cluster(430, 300, 150, 22, BLUE);
const clusterB = cluster(760, 330, 160, 24, ORANGE);
const midX = (430 + 760) / 2, midY = (300 + 330) / 2;

// a handful of gold strands crossing the overlap gap
let strands = "";
for (let i = 0; i < 9; i++) {
  const pa = clusterA.pts[Math.floor(rnd() * clusterA.pts.length)];
  const pb = clusterB.pts[Math.floor(rnd() * clusterB.pts.length)];
  strands += `<line x1="${pa[0].toFixed(1)}" y1="${pa[1].toFixed(1)}" x2="${pb[0].toFixed(1)}" y2="${pb[1].toFixed(1)}" stroke="${GOLD}" stroke-width="1.4" opacity="${(0.15 + rnd() * 0.35).toFixed(2)}"/>`;
}

// gold sparks clustered at the point of impact
let sparks = "";
for (let i = 0; i < 14; i++) {
  const x = midX + (rnd() - 0.5) * 130, y = midY + (rnd() - 0.5) * 110;
  const r = rnd() * 3 + 1.5;
  sparks += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="${GOLD}"><animate attributeName="opacity" values="1" dur="1s"/></circle>`;
}

const shockwave = (r, o) =>
  `<circle cx="${midX}" cy="${midY}" r="${r}" fill="none" stroke="${GOLD}" stroke-width="2" opacity="${o}"/>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="bg" cx="50%" cy="42%" r="75%">
      <stop offset="0" stop-color="#0d1220"/>
      <stop offset="0.6" stop-color="#080a12"/>
      <stop offset="1" stop-color="#05060a"/>
    </radialGradient>
    <radialGradient id="glowA" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="${BLUE}" stop-opacity="0.28"/>
      <stop offset="1" stop-color="${BLUE}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glowB" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="${ORANGE}" stop-opacity="0.28"/>
      <stop offset="1" stop-color="${ORANGE}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>

  <circle cx="430" cy="300" r="220" fill="url(#glowA)"/>
  <circle cx="760" cy="330" r="230" fill="url(#glowB)"/>

  ${shockwave(96, 0.5)}
  ${shockwave(150, 0.28)}
  ${strands}
  ${clusterA.lines}
  ${clusterB.lines}
  ${clusterA.dots}
  ${clusterB.dots}
  ${sparks}

  <text x="60" y="96" font-family="ui-monospace, monospace" font-weight="800"
    font-size="54" fill="${INK}">simclash</text>
  <text x="60" y="136" font-family="ui-monospace, monospace" font-size="20"
    fill="${MUTED}">a visual metaphor for simclusters colliding</text>

  <text x="60" y="${H - 48}" font-family="ui-monospace, monospace" font-size="16"
    fill="${MUTED}">two clusters collide, shared mutuals spark gold</text>
  <text x="${W - 60}" y="${H - 48}" text-anchor="end" font-family="ui-monospace, monospace"
    font-size="16" fill="${GOLD}">simclash.bisks.net</text>
</svg>`;

writeFileSync(new URL("./og.svg", import.meta.url), svg);
console.log("wrote og.svg — now run:\n  npx --yes @resvg/resvg-js-cli --font-file fonts/JetBrainsMono.ttf --font-default-family \"JetBrains Mono\" og.svg public/og.png");
