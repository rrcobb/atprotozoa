// Generates public/og.png — the Open Graph preview card for followteroids.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium/fontconfig needed — font is
// bundled in ./fonts and loaded explicitly). Copied from didscope/og-gen.mjs
// — copy, don't abstract.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#05060c", BG2 = "#0a0d1c", FG = "#e7e8ea", DIM = "#8a8fa5";
const ACCENT = "#ffd166", ACCENT2 = "#7fd8ff", ROCK = "#3a3f52", ROCK_LINE = "#6a7090";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function rockPath(cx, cy, r, seed) {
  const pts = 10;
  let d = "";
  for (let i = 0; i < pts; i++) {
    const a = (i / pts) * Math.PI * 2;
    const wobble = 0.75 + (Math.sin(seed + i * 2.7) * 0.5 + 0.5) * 0.5;
    const x = cx + Math.cos(a) * r * wobble;
    const y = cy + Math.sin(a) * r * wobble;
    d += (i === 0 ? "M" : "L") + x.toFixed(1) + "," + y.toFixed(1) + " ";
  }
  return d + "Z";
}

// A handful of decorative rocks + a ship, right side.
const rocks = [
  { cx: 900, cy: 160, r: 62, seed: 1.1 },
  { cx: 1040, cy: 340, r: 40, seed: 3.4 },
  { cx: 840, cy: 420, r: 26, seed: 5.9 },
  { cx: 1090, cy: 480, r: 20, seed: 2.2 },
  { cx: 960, cy: 540, r: 15, seed: 7.1 },
];

const rocksSvg = rocks
  .map((r) => `<path d="${rockPath(r.cx, r.cy, r.r, r.seed)}" fill="${ROCK}" stroke="${ROCK_LINE}" stroke-width="2"/>`)
  .join("\n  ");

// A reveal card, echoing the in-game break-up popup.
const cardX = 760, cardY = 210, cardW = 380, cardH = 108;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="15%" cy="10%" r="55%">
      <stop offset="0" stop-color="#1a2440"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="85%" cy="70%" r="50%">
      <stop offset="0" stop-color="#2a1f10"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  ${Array.from({ length: 60 }).map((_, i) => {
    const x = (i * 97) % W;
    const y = (i * 53 + (i % 7) * 41) % H;
    const s = (i % 3 === 0) ? 2 : 1;
    return `<circle cx="${x}" cy="${y}" r="${s}" fill="${DIM}" opacity="${0.25 + (i % 5) * 0.1}"/>`;
  }).join("\n  ")}

  ${rocksSvg}

  <!-- ship -->
  <g transform="translate(720,120) rotate(-25)">
    <path d="M0,-22 L14,20 L0,10 L-14,20 Z" fill="${ACCENT2}" stroke="#05060c" stroke-width="2"/>
  </g>

  <!-- reveal card -->
  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="14" fill="#0e1016" stroke="${ACCENT}" stroke-width="2"/>
  <circle cx="${cardX + 56}" cy="${cardY + cardH / 2}" r="30" fill="#21242e"/>
  <text x="${cardX + 56}" y="${cardY + cardH / 2 + 10}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="26" fill="${ACCENT}">@</text>
  <text x="${cardX + 104}" y="${cardY + 46}" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${FG}">who was that?</text>
  <text x="${cardX + 104}" y="${cardY + 74}" font-family="JetBrains Mono" font-size="15" fill="${DIM}">broke up: @handle.bsky.social</text>

  <!-- left: wordmark + pitch -->
  <text x="64" y="150" font-family="JetBrains Mono" font-weight="800" font-size="66" fill="${ACCENT}">follow</text>
  <text x="64" y="216" font-family="JetBrains Mono" font-weight="800" font-size="66" fill="${ACCENT2}">teroids</text>

  <text x="64" y="290" font-family="JetBrains Mono" font-size="19" fill="${DIM}">every asteroid is someone you follow,</text>
  <text x="64" y="318" font-family="JetBrains Mono" font-size="19" fill="${DIM}">sized by their follower count. blast</text>
  <text x="64" y="346" font-family="JetBrains Mono" font-size="19" fill="${DIM}">'em open to see who it was.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT}">followteroids.bisks.net</text>
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
