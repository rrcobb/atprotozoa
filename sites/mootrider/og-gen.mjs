// Generates public/og.png — the Open Graph preview card for mootrider, so a
// shared link auto-renders a picture of the game in Bluesky / other unfurlers.
//
// Hand-drawn SVG "screenshot" of the live scene: the purple dusk sky, the
// gold pencil-line hill, the player avatar on its sled, a couple of moot-pfp
// rocks with warning marks, and a top chicken — same palette as game.js.
// Rasterised with @resvg/resvg-js (pure native module, no system
// Chromium/fontconfig needed — font bundled in ./fonts).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// No live data, no network — deterministic so the card is stable across
// builds. House style: self-contained, copy-don't-abstract. Re-run this by
// hand if you change the artwork. Adapted from sites/breathingwalls/og-gen.mjs.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const INK = "#f1ece2", MUTED = "#9089a3", ACCENT = "#ffb454", WARN = "#ff7f7f";

let seed = 42;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

// ── terrain: same multi-octave sine hill shape as terrainY() in game.js ──
const GROUND_BASE = H * 0.62;
function terrainY(x) {
  return (
    GROUND_BASE +
    Math.sin(x * 0.0055 + 1.4) * 70 +
    Math.sin(x * 0.014 + 2.1) * 34 +
    Math.sin(x * 0.03 + 0.6) * 14
  );
}
let terrainPath = `M 0 ${H}`;
const pts = [];
for (let x = 0; x <= W; x += 8) pts.push([x, terrainY(x)]);
for (const [x, y] of pts) terrainPath += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
terrainPath += ` L ${W} ${H} Z`;
let terrainLine = `M ${pts[0][0]} ${pts[0][1].toFixed(1)}`;
for (const [x, y] of pts) terrainLine += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;

// ── a pfp-circle avatar (used for player + rock moots + far dots) ──────────
let gid = 0;
function avatar(cx, cy, r, hue, initial, ring) {
  const id = "a" + gid++;
  const size = (r * 1.05) / Math.max(1, initial.length * 0.7);
  return `
  <g>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="hsl(${hue} 55% 42%)"/>
    <text x="${cx}" y="${cy + size * 0.34}" text-anchor="middle" font-family="JetBrains Mono"
      font-weight="700" font-size="${size.toFixed(0)}" fill="rgba(255,255,255,0.92)">${initial}</text>
    <circle cx="${cx}" cy="${cy}" r="${r + 1.4}" fill="none" stroke="${ring}" stroke-width="2.5"/>
  </g>`;
}

// ── scatter a few rocks (moot obstacles) along the slope ───────────────────
const rockXs = [270, 430, 590, 830, 990];
const rockHues = [12, 200, 300, 45, 160];
let rocks = "";
rockXs.forEach((x, i) => {
  const y = terrainY(x) - 2;
  rocks += avatar(x, y, 21, rockHues[i], i % 2 === 0 ? "M" : "O", "rgba(255,127,127,0.85)");
  rocks += `<text x="${x}" y="${y - 32}" text-anchor="middle" font-family="JetBrains Mono"
    font-size="16" fill="${WARN}">!</text>`;
});

// ── the chicken (top chicken bonus) ─────────────────────────────────────────
const chX = 700, chY = terrainY(700) - 78;
const chicken = `
<g transform="translate(${chX} ${chY})">
  <ellipse cx="0" cy="0" rx="19" ry="16" fill="#f7f2e7"/>
  <path d="M -5 -13 L 0 -22 L 5 -13 Z" fill="#e0503f"/>
  <path d="M 14 -3 L 24 2 L 14 7 Z" fill="${ACCENT}"/>
  <circle cx="6" cy="-5" r="2.2" fill="#1c1c1c"/>
  <line x1="-5" y1="12" x2="-5" y2="19" stroke="${ACCENT}" stroke-width="2.5"/>
  <line x1="5" y1="12" x2="5" y2="19" stroke="${ACCENT}" stroke-width="2.5"/>
  <circle cx="0" cy="0" r="27" fill="none" stroke="rgba(255,209,102,0.5)" stroke-width="1.5"/>
</g>`;

// ── the player: avatar riding a little sled, mid-slope ──────────────────────
const px = 350, py = terrainY(px) - 4;
const angle = Math.atan2(terrainY(px + 6) - terrainY(px - 6), 12);
const player = `
<g transform="translate(${px} ${py}) rotate(${(angle * 180 / Math.PI).toFixed(1)})">
  <path d="M -22 9 L 26 9 L 19 18 L -17 18 Z" fill="#e0503f"/>
</g>
${avatar(px, py, 27, 280, "10-5", ACCENT)}`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1b1233"/>
      <stop offset="0.55" stop-color="#2c1a3f"/>
      <stop offset="1" stop-color="#3a2140"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#sky)"/>

  <!-- far hills -->
  <path d="M 0 ${H} L 0 ${(GROUND_BASE - 60).toFixed(0)} Q ${W * 0.25} ${(GROUND_BASE - 110).toFixed(0)} ${W * 0.5} ${(GROUND_BASE - 55).toFixed(0)} T ${W} ${(GROUND_BASE - 70).toFixed(0)} L ${W} ${H} Z"
    fill="rgba(120,90,160,0.25)"/>

  <!-- terrain -->
  <path d="${terrainPath}" fill="#161022"/>
  <path d="${terrainLine}" fill="none" stroke="${ACCENT}" stroke-width="3.5" stroke-linejoin="round"/>

  ${rocks}
  ${chicken}
  ${player}

  <text x="64" y="90" font-family="JetBrains Mono" font-weight="800" font-size="60" fill="${INK}">moot<tspan fill="${ACCENT}">rider</tspan></text>
  <text x="64" y="128" font-family="JetBrains Mono" font-size="21" fill="${MUTED}">sled your pfp down a hill made of your own moots</text>

  <text x="64" y="576" font-family="JetBrains Mono" font-size="18" fill="${MUTED}">one button: jump. dodge your moots, catch the top chicken.</text>
  <text x="${W - 64}" y="576" text-anchor="end" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${ACCENT}">mootrider.bisks.net</text>
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
