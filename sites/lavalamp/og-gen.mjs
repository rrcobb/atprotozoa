// Generates public/og.png — the Open Graph preview card for lavalamp, so a
// shared link auto-renders a picture of the lamp in Bluesky / other
// unfurlers.
//
// A generic (not per-handle — this is a client-only site, no server render)
// snapshot of the lamp: a glass capsule with gradient blobs at different
// heights, a couple with peeking text labels, same palette as the live page.
// Rasterised with @resvg/resvg-js (pure native module, no system
// Chromium/fontconfig needed — the font is bundled in ./fonts and loaded
// explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork. Adapted from sites/chimehose/og-gen.mjs.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#0a070c", INK = "#f4eef8", MUTED = "#a698ad", ACCENT = "#ff6a3d";
const GLASS_TOP = "#2a1030", GLASS_BOT = "#170a1c";

// same seven-color palette the live page cycles blobs through
const PALETTE = [
  ["#ff6a3d", "#ffb648"],
  ["#ff3d77", "#ff8a5c"],
  ["#c23df0", "#ff6ad5"],
  ["#ff4d4d", "#ffb347"],
  ["#ff8a00", "#ffd23f"],
];

// tiny seeded RNG so the layout is identical every run
let seed = 42;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

let gid = 0;
function blob(cx, cy, r, c1, c2, label) {
  const id = "b" + gid++;
  const wobble = 6 + rnd() * 6;
  const rx1 = 50 + rnd() * 10, ry1 = 50 + rnd() * 10;
  const label_ = label
    ? `<text x="${cx}" y="${cy + 4}" text-anchor="middle" font-family="JetBrains Mono"
        font-weight="700" font-size="${Math.max(13, r * 0.24).toFixed(0)}" fill="#fff8ec"
        style="paint-order: stroke" stroke="rgba(0,0,0,0.55)" stroke-width="4">${label}</text>`
    : "";
  return `
  <defs>
    <radialGradient id="grad-${id}" cx="35%" cy="30%" r="75%">
      <stop offset="0" stop-color="${c1}"/>
      <stop offset="1" stop-color="${c2}"/>
    </radialGradient>
  </defs>
  <ellipse cx="${cx}" cy="${cy}" rx="${(r + wobble * 0.3).toFixed(1)}" ry="${(r - wobble * 0.2).toFixed(1)}"
    fill="url(#grad-${id})" opacity="0.94"/>
  ${label_}`;
}

const cx = 330, cy = 340, capsuleW = 380, capsuleH = 560;
const clipId = "lampclip";

const blobsSpec = [
  { y: 0.86, r: 46, c: PALETTE[0], label: "" },
  { y: 0.70, r: 58, c: PALETTE[1], label: "lol suno com…" },
  { y: 0.52, r: 40, c: PALETTE[2], label: "" },
  { y: 0.36, r: 66, c: PALETTE[3], label: "never been this…" },
  { y: 0.20, r: 44, c: PALETTE[4], label: "" },
  { y: 0.08, r: 34, c: PALETTE[0], label: "" },
];

const blobsSvg = blobsSpec.map((b, i) => {
  const bx = cx + (i % 2 === 0 ? -1 : 1) * (18 + rnd() * 60);
  const by = cy + capsuleH / 2 - b.y * capsuleH * 0.98;
  return blob(bx, by, b.r, b.c[0], b.c[1], b.label);
}).join("");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="backglow" cx="27%" cy="50%" r="70%">
      <stop offset="0" stop-color="#3a1a3e"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="glass" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${GLASS_TOP}"/>
      <stop offset="0.55" stop-color="${GLASS_BOT}"/>
      <stop offset="1" stop-color="#120a16"/>
    </linearGradient>
    <radialGradient id="baseglow" cx="50%" cy="100%" r="55%">
      <stop offset="0" stop-color="rgba(255,150,60,0.45)"/>
      <stop offset="1" stop-color="rgba(255,150,60,0)"/>
    </radialGradient>
    <clipPath id="${clipId}">
      <rect x="${cx - capsuleW / 2}" y="${cy - capsuleH / 2}" width="${capsuleW}" height="${capsuleH}" rx="${capsuleW / 2}"/>
    </clipPath>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#backglow)"/>

  <!-- lamp cap -->
  <rect x="${cx - 78}" y="${cy - capsuleH / 2 - 24}" width="156" height="26" rx="10" fill="#8b8078"/>
  <rect x="${cx - 90}" y="${cy + capsuleH / 2}" width="180" height="32" rx="12" fill="#776d64"/>

  <g clip-path="url(#${clipId})">
    <rect x="${cx - capsuleW / 2}" y="${cy - capsuleH / 2}" width="${capsuleW}" height="${capsuleH}" fill="url(#glass)"/>
    <rect x="${cx - capsuleW / 2}" y="${cy - capsuleH / 2}" width="${capsuleW}" height="${capsuleH}" fill="url(#baseglow)"/>
    ${blobsSvg}
    <rect x="${cx - capsuleW / 2 + 34}" y="${cy - capsuleH / 2}" width="70" height="${capsuleH}" rx="35" fill="rgba(255,255,255,0.08)"/>
  </g>
  <rect x="${cx - capsuleW / 2}" y="${cy - capsuleH / 2}" width="${capsuleW}" height="${capsuleH}" rx="${capsuleW / 2}"
    fill="none" stroke="rgba(255,255,255,0.10)" stroke-width="2"/>

  <!-- wordmark -->
  <text x="640" y="220" font-family="JetBrains Mono" font-weight="800" font-size="72" fill="${INK}">lava lamp</text>
  <text x="640" y="270" font-family="JetBrains Mono" font-size="24" fill="${MUTED}">your bisks, floating on their likes</text>

  <text x="640" y="340" font-family="JetBrains Mono" font-size="21" fill="${ACCENT}">more likes floats higher</text>
  <text x="640" y="376" font-family="JetBrains Mono" font-size="21" fill="${MUTED}">fewer likes sinks low</text>
  <text x="640" y="412" font-family="JetBrains Mono" font-size="21" fill="${MUTED}">bangers and total flops, mixed together</text>
  <text x="640" y="448" font-family="JetBrains Mono" font-size="21" fill="${MUTED}">cycling out for fresh ones forever</text>

  <text x="640" y="560" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${ACCENT}">lavalamp.bisks.net</text>
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
