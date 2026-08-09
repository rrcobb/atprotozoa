// Generates public/og.png — the Open Graph preview card for
// apebrainserum (the "ape brain serum graveyard" crates.io list).
//
// Hand-draws a little tombstone graveyard as an SVG at the canonical OG
// size, then rasterises it with @resvg/resvg-js (pure native module, no
// system Chromium needed — this box has no fontconfig/system fonts either,
// so the font is bundled in ./fonts and loaded explicitly).
// Copied from addtheboom/og-gen.mjs (copy, don't abstract).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// Pulls headline numbers from public/data/crates.json (checked-in snapshot,
// no network at build time) so the card matches the page.

import { Resvg } from "@resvg/resvg-js";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const crates = JSON.parse(readFileSync(join(__dirname, "public/data/crates.json"), "utf8"));
const totalDownloads = crates.reduce((a, c) => a + c.downloads, 0);
const fmtDownloads = (n) => (n / 1e9).toFixed(2) + "B";

const W = 1200, H = 630;
const BG = "#0a0d0a";
const FG = "#dfe8dc";
const DIM = "#7c8a76";
const ACCENT = "#6fbf5c";
const ACCENT2 = "#9edc8e";
const STONE = "#1a231a";
const STONE_LINE = "#3a4a35";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ── a rounded tombstone with a crate name on it ─────────────────────────
function tombstone(cx, baseY, w, h, name) {
  const x = cx - w / 2;
  const topR = w / 2;
  const label = name.length > 12 ? name.slice(0, 11) + "…" : name;
  return `
    <g>
      <path d="M ${x} ${baseY} L ${x} ${baseY - h + topR}
               A ${topR} ${topR} 0 0 1 ${x + w} ${baseY - h + topR}
               L ${x + w} ${baseY} Z"
            fill="${STONE}" stroke="${STONE_LINE}" stroke-width="3"/>
      <text x="${cx}" y="${baseY - h + topR + 6}" text-anchor="middle" font-family="JetBrains Mono"
        font-weight="700" font-size="15" fill="${DIM}">RIP</text>
      <text x="${cx}" y="${baseY - 22}" text-anchor="middle" font-family="JetBrains Mono"
        font-weight="700" font-size="15" fill="${ACCENT2}">${esc(label)}</text>
    </g>`;
}

// seeded RNG so the card is deterministic across builds
let seed = 424242;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

// scattered faint stars/dots in the sky for texture
let dots = "";
for (let i = 0; i < 50; i++) {
  const x = 20 + rnd() * (W - 40);
  const y = 20 + rnd() * 260;
  const r = 1 + rnd() * 1.8;
  dots += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="${ACCENT}" opacity="${(0.12 + rnd() * 0.18).toFixed(2)}"/>`;
}

// a modest row of tombstones along the bottom, named after a few of the
// oldest/heaviest entries so the card feels like it's showing real data
const names = crates.slice(0, 6).map((c) => c.name);
const groundY = 560;
const positions = [130, 260, 400, 560, 730, 900, 1060];
let stones = "";
names.forEach((name, i) => {
  const w = 105 + (i % 3) * 12;
  const h = 130 + (i % 2) * 22;
  stones += tombstone(positions[i], groundY, w, h, name);
});

const svg = `
<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="glow1" cx="20%" cy="0%" r="60%">
      <stop offset="0%" stop-color="#1b3116"/>
      <stop offset="100%" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="90%" cy="10%" r="55%">
      <stop offset="0%" stop-color="#14231a"/>
      <stop offset="100%" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>
  ${dots}

  <!-- ground -->
  <rect x="0" y="${groundY}" width="${W}" height="${H - groundY}" fill="#0d130c"/>
  <rect x="0" y="${groundY}" width="${W}" height="3" fill="${STONE_LINE}"/>

  ${stones}

  <!-- title block -->
  <text x="70" y="90" font-family="JetBrains Mono" font-weight="700" font-size="50" fill="${ACCENT2}">ape brain serum</text>
  <text x="70" y="146" font-family="JetBrains Mono" font-weight="700" font-size="50" fill="${ACCENT2}">graveyard</text>

  <text x="70" y="196" font-family="JetBrains Mono" font-weight="400" font-size="21" fill="${FG}">the top 100 most-downloaded crates.io packages that</text>
  <text x="70" y="226" font-family="JetBrains Mono" font-weight="400" font-size="21" fill="${FG}">haven't been touched in over 3 years.</text>

  <text x="70" y="278" font-family="JetBrains Mono" font-weight="700" font-size="26" fill="${ACCENT}">${fmtDownloads(totalDownloads)} combined downloads, running on silence.</text>

  <text x="70" y="610" font-family="JetBrains Mono" font-weight="400" font-size="18" fill="${DIM}">apebrainserum.bisks.net</text>
</svg>`;

const resvg = new Resvg(svg, {
  font: {
    fontFiles: [join(__dirname, "fonts/JetBrainsMono.ttf")],
    loadSystemFonts: false,
    defaultFontFamily: "JetBrains Mono",
  },
  background: BG,
});
const png = resvg.render().asPng();
writeFileSync(join(__dirname, "public/og.png"), png);
console.log(`wrote public/og.png (${png.length} bytes)`);
