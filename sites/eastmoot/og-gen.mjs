// Generates public/og.png — the Open Graph preview card for eastmoot. Same
// recipe as sites/westmoot/og-gen.mjs (copy, don't abstract): hand-drawn SVG
// at the canonical OG size, rasterised with @resvg/resvg-js (pure native
// module, no system Chromium/fontconfig needed — the font is bundled in
// ./fonts and loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// Same "graph converging on a lit hub" composition as westmoot, but in the
// harbor-blue/brick-red palette instead of teal/amber, so the two cards read
// as siblings, not a reused asset. Static artwork, not a live snapshot of
// the real ballots — re-run this by hand if you change it.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#070a10", FG = "#eef0f2", DIM = "#8590a3", ACCENT = "#4fb0ff", BRICK = "#ff4d5e";

// Deterministic little PRNG so re-runs are reproducible without a system
// Math.random dependency mattering.
let seed = 20260728;
function rand() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}

// A field of "moot" nodes on the right, all converging toward one lit hub —
// the decided plan pulling the graph toward a single point.
const hub = { x: 1030, y: 300 };
const nodes = [];
for (let i = 0; i < 16; i++) {
  nodes.push({
    x: 660 + rand() * 470,
    y: 50 + rand() * 540,
    r: 3 + rand() * 4,
  });
}

let lines = "";
for (const n of nodes) {
  const dx = hub.x - n.x, dy = hub.y - n.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const op = (0.08 + 0.22 * (1 - Math.min(1, dist / 650))).toFixed(2);
  lines += `<line x1="${n.x.toFixed(1)}" y1="${n.y.toFixed(1)}" x2="${hub.x}" y2="${hub.y}" stroke="${ACCENT}" stroke-width="1" opacity="${op}"/>\n  `;
}
// A few cross-links between nearby nodes so it reads as a graph, not a star.
for (let i = 0; i < nodes.length; i++) {
  for (let j = i + 1; j < nodes.length; j++) {
    const a = nodes[i], b = nodes[j];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (d < 140 && rand() < 0.5) {
      lines += `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke="${ACCENT}" stroke-width="1" opacity="0.14"/>\n  `;
    }
  }
}
let dots = "";
for (const n of nodes) {
  dots += `<circle cx="${n.x.toFixed(1)}" cy="${n.y.toFixed(1)}" r="${n.r.toFixed(1)}" fill="${ACCENT}" opacity="0.85"/>\n  `;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="bg" cx="80%" cy="35%" r="90%">
      <stop offset="0%" stop-color="#182233"/>
      <stop offset="55%" stop-color="${BG}"/>
      <stop offset="100%" stop-color="#040608"/>
    </radialGradient>
    <radialGradient id="hubglow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${BRICK}" stop-opacity="0.9"/>
      <stop offset="45%" stop-color="${BRICK}" stop-opacity="0.25"/>
      <stop offset="100%" stop-color="${BRICK}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>

  ${lines}
  ${dots}
  <circle cx="${hub.x}" cy="${hub.y}" r="90" fill="url(#hubglow)"/>
  <circle cx="${hub.x}" cy="${hub.y}" r="9" fill="${BRICK}"/>

  <text x="64" y="188" font-family="JetBrains Mono" font-weight="800" font-size="72" fill="${FG}">eastmoot</text>
  <text x="64" y="230" font-family="JetBrains Mono" font-size="22" fill="${ACCENT}">a sentient meetup planner, instant-runoff edition</text>

  <text x="64" y="300" font-family="JetBrains Mono" font-size="19" fill="${DIM}">Rank an east-coast city. Rank a</text>
  <text x="64" y="328" font-family="JetBrains Mono" font-size="19" fill="${DIM}">weekend. RSVP with your handle. The</text>
  <text x="64" y="356" font-family="JetBrains Mono" font-size="19" fill="${DIM}">site runs a real runoff, round by</text>
  <text x="64" y="384" font-family="JetBrains Mono" font-size="19" fill="${DIM}">round, and shows its work.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${FG}">bisks.net/eastmoot</text>
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
