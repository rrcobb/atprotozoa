// Generates public/og.png — the Open Graph preview card for addtheboom.
//
// Hand-draws a comic-book "BOOM!!" starburst as an SVG at the canonical OG
// size, then rasterises it with @resvg/resvg-js (pure native module, no
// system Chromium needed — this box has no fontconfig/system fonts either,
// so the font is bundled in ./fonts and loaded explicitly).
// Copied from dial-a-mutual/og-gen.mjs (copy, don't abstract).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// No live data, no network — deterministic so the card is stable across
// builds.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const W = 1200, H = 630;
const BG = "#fdf6ec";
const INK = "#111111";
const MUTED = "#6b6b6b";
const ACCENT = "#d0361a";
const ACCENT_DARK = "#8f2411";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ── jagged comic-book starburst polygon ─────────────────────────────────
function burstPoints(cx, cy, spikes, outerR, innerR, rotation) {
  const pts = [];
  const step = Math.PI / spikes;
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const a = rotation + i * step;
    pts.push(`${(cx + Math.cos(a) * r).toFixed(1)},${(cy + Math.sin(a) * r).toFixed(1)}`);
  }
  return pts.join(" ");
}

const burstCx = 860, burstCy = 330;
const burstOuter = burstPoints(burstCx, burstCy, 11, 270, 175, -0.15);
const burstInner = burstPoints(burstCx, burstCy, 11, 245, 158, -0.15);

// scattered halftone dots for a bit of comic texture, seeded RNG so the
// card is deterministic across builds
let seed = 909;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
let dots = "";
for (let i = 0; i < 60; i++) {
  const x = 40 + rnd() * (W - 80);
  const y = 40 + rnd() * (H - 80);
  // skip dots that would land inside the burst, keeps it clean
  const d = Math.hypot(x - burstCx, y - burstCy);
  if (d < 300) continue;
  const r = 2 + rnd() * 3;
  dots += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="${ACCENT}" opacity="0.12"/>`;
}

const svg = `
<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${W}" height="${H}" fill="${BG}"/>
  ${dots}

  <!-- title block -->
  <text x="70" y="150" font-family="JetBrains Mono" font-weight="700" font-size="46" fill="${INK}">add the boom</text>
  <text x="70" y="196" font-family="JetBrains Mono" font-weight="400" font-size="22" fill="${MUTED}">it needed the sound effect and now it has it</text>

  <text x="70" y="280" font-family="JetBrains Mono" font-weight="400" font-size="19" fill="${INK}">something worse than the tiktok brainrot</text>
  <text x="70" y="310" font-family="JetBrains Mono" font-weight="400" font-size="19" fill="${INK}">boom sound effect is people in the comments</text>
  <text x="70" y="340" font-family="JetBrains Mono" font-weight="400" font-size="19" fill="${INK}">saying it should have been in there.</text>

  <text x="70" y="410" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${ACCENT}">so this machine does it for you.</text>

  <text x="70" y="560" font-family="JetBrains Mono" font-weight="400" font-size="18" fill="${MUTED}">addtheboom.bisks.net</text>

  <!-- burst -->
  <polygon points="${burstOuter}" fill="${ACCENT_DARK}"/>
  <polygon points="${burstInner}" fill="${ACCENT}"/>
  <polygon points="${burstOuter}" fill="none" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/>

  <text x="${burstCx}" y="${burstCy - 8}" text-anchor="middle" font-family="JetBrains Mono"
    font-weight="700" font-size="70" fill="#fff" stroke="${INK}" stroke-width="4" paint-order="stroke"
    transform="rotate(-6 ${burstCx} ${burstCy - 8})">BOOM</text>
  <text x="${burstCx}" y="${burstCy + 60}" text-anchor="middle" font-family="JetBrains Mono"
    font-weight="700" font-size="58" fill="#fff" stroke="${INK}" stroke-width="4" paint-order="stroke"
    transform="rotate(-6 ${burstCx} ${burstCy + 60})">!!</text>
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
