// Generates public/og.png — the Open Graph preview card for threadwalk, so a
// shared link auto-renders a picture of the map in Bluesky / other
// unfurlers.
//
// Hand-draws a representative starfield map as an SVG (dark sky, glowing
// thread-nodes connected by faint similarity edges, a little white "you are
// here" dot) at the canonical OG size, then rasterises it with
// @resvg/resvg-js (pure native module, no system Chromium needed — this box
// has no fontconfig/system fonts either, so the font is bundled in ./fonts
// and loaded explicitly). Copied from dial-a-mutual/og-gen.mjs (copy, don't
// abstract).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// No live data, no network — deterministic so the card is stable across
// builds; the real map only exists once someone actually runs a crawl.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG1 = "#0e1430", BG2 = "#05070f";
const INK = "#e8ecff", MUTED = "#8892b8", ACCENT = "#6fb3ff";
const TINTS = ["#5b8cff", "#ff6b6b", "#5ad1a8", "#ffb454", "#c792ea",
  "#ff8fd6", "#4fd1ff", "#a8e05f", "#ff9f6b", "#8aa3ff"];

// tiny seeded RNG so the layout is identical every run
let seed = 1337;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

// ── map field, right two-thirds ─────────────────────────────────────────
const fieldX = 430, fieldY = 40, fieldW = W - fieldX - 40, fieldH = H - 80;

const NODES = Array.from({ length: 16 }, (_, i) => ({
  x: fieldX + rnd() * fieldW,
  y: fieldY + rnd() * fieldH,
  r: 6 + rnd() * 16,
  tint: TINTS[Math.floor(rnd() * TINTS.length)],
}));

let starsSvg = "";
for (let i = 0; i < 140; i++) {
  const sx = rnd() * W, sy = rnd() * H, sr = rnd() * 1.2 + 0.3, sa = rnd() * 0.5 + 0.15;
  starsSvg += `<circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="${sr.toFixed(2)}" fill="#cfe0ff" opacity="${sa.toFixed(2)}"/>`;
}

let edgesSvg = "";
for (let i = 0; i < NODES.length; i++) {
  for (let j = i + 1; j < NODES.length; j++) {
    const d = Math.hypot(NODES[i].x - NODES[j].x, NODES[i].y - NODES[j].y);
    if (d < 170 && rnd() > 0.45) {
      edgesSvg += `<line x1="${NODES[i].x.toFixed(1)}" y1="${NODES[i].y.toFixed(1)}" x2="${NODES[j].x.toFixed(1)}" y2="${NODES[j].y.toFixed(1)}" stroke="rgba(140,160,220,0.35)" stroke-width="1"/>`;
    }
  }
}

let nodesSvg = "";
for (const n of NODES) {
  nodesSvg += `
  <circle cx="${n.x.toFixed(1)}" cy="${n.y.toFixed(1)}" r="${n.r.toFixed(1)}" fill="${n.tint}" opacity="0.92"/>
  <circle cx="${n.x.toFixed(1)}" cy="${n.y.toFixed(1)}" r="${n.r.toFixed(1)}" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="1"/>`;
}

// the "you are here" dot, glowing, near the middle of the field
const meX = fieldX + fieldW * 0.42, meY = fieldY + fieldH * 0.55;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="bg" cx="50%" cy="50%" r="75%">
      <stop offset="0%" stop-color="${BG1}"/>
      <stop offset="100%" stop-color="${BG2}"/>
    </radialGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#8fd0ff" stop-opacity="0.9"/>
      <stop offset="100%" stop-color="#8fd0ff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  ${starsSvg}

  <!-- wordmark -->
  <text x="64" y="110" font-family="JetBrains Mono" font-weight="700"
    font-size="46" fill="${INK}">threadwalk</text>
  <text x="64" y="148" font-family="JetBrains Mono" font-size="18"
    fill="${MUTED}">walk the discourse map of your bit of the sky</text>

  <!-- blurb -->
  <text x="64" y="240" font-family="JetBrains Mono" font-size="16" fill="${INK}">A 2D map of what your</text>
  <text x="64" y="268" font-family="JetBrains Mono" font-size="16" fill="${INK}">oomfs and oomfs-of-oomfs</text>
  <text x="64" y="296" font-family="JetBrains Mono" font-size="16" fill="${INK}">are currently liking.</text>
  <text x="64" y="340" font-family="JetBrains Mono" font-size="16" fill="${INK}">Walk between threads</text>
  <text x="64" y="368" font-family="JetBrains Mono" font-size="16" fill="${INK}">with the arrow keys —</text>
  <text x="64" y="396" font-family="JetBrains Mono" font-size="16" fill="${INK}">the nearest one is</text>
  <text x="64" y="424" font-family="JetBrains Mono" font-size="16" fill="${INK}">always the next thing</text>
  <text x="64" y="452" font-family="JetBrains Mono" font-size="16" fill="${INK}">your people are into.</text>

  <!-- map field -->
  <rect x="${fieldX}" y="${fieldY}" width="${fieldW}" height="${fieldH}" rx="18"
    fill="rgba(255,255,255,0.02)" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>
  ${edgesSvg}
  ${nodesSvg}

  <!-- you-are-here dot -->
  <circle cx="${meX.toFixed(1)}" cy="${meY.toFixed(1)}" r="26" fill="url(#glow)"/>
  <circle cx="${meX.toFixed(1)}" cy="${meY.toFixed(1)}" r="6" fill="#ffffff"/>

  <!-- footer strip -->
  <text x="64" y="600" font-family="JetBrains Mono" font-size="16"
    fill="${MUTED}">chart your oomfs' likes · walk the map · find what's next</text>
  <text x="${W - 64}" y="600" text-anchor="end" font-family="JetBrains Mono"
    font-size="16" fill="${ACCENT}">threadwalk.bisks.net</text>
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
