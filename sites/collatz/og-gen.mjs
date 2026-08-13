// Generates public/og.png — the static Open Graph preview card for the bare
// collatz.bisks.net link. Per-number share cards are drawn live, client-side,
// in public/app.js (drawCard); this is just the generic fallback, built
// around the site's sample number (27, the classic short-but-wild one).
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium/fontconfig needed — the font is
// bundled in ./fonts and loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG1 = "#1c0912", BG2 = "#2c0f22", FG = "#fbeee2", DIM = "#e9d7c4";
const ROSE = "#ff5c8a", GOLD = "#f2c265";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// A tiny hand-picked hailstone trace for 27's first stretch (27 -> 82 -> 41 ->
// 124 -> 62 -> 31 -> 94 -> 47 -> 142 -> 71 -> 214 -> 107 -> 322 -> 161 -> 484),
// log2'd and normalized to 0..1 — just decorative motion, not the full 111
// steps.
const trace = [27, 82, 41, 124, 62, 31, 94, 47, 142, 71, 214, 107, 322, 161, 484, 242, 121, 364, 182, 91]
  .map((v) => Math.log2(v));
const traceMin = Math.min(...trace), traceMax = Math.max(...trace);
const tracePoints = trace
  .map((v, i) => {
    const x = 620 + (i / (trace.length - 1)) * 520;
    const y = 130 + (1 - (v - traceMin) / (traceMax - traceMin)) * 90;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  })
  .join(" ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="15%" cy="0%" r="60%">
      <stop offset="0" stop-color="#4a1230"/>
      <stop offset="1" stop-color="${BG1}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="90%" cy="10%" r="55%">
      <stop offset="0" stop-color="#3a1450"/>
      <stop offset="1" stop-color="${BG1}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${ROSE}"/>
      <stop offset="1" stop-color="${GOLD}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG1}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <g transform="translate(64,66) scale(2.1)"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill="${ROSE}"/></g>
  <text x="130" y="120" font-family="JetBrains Mono" font-weight="800" font-size="76" fill="url(#title)">collatz</text>
  <text x="72" y="180" font-family="JetBrains Mono" font-size="24" fill="${DIM}">an unhinged love letter to <tspan fill="${GOLD}">3n + 1</tspan></text>

  <text x="72" y="280" font-family="JetBrains Mono" font-size="19" fill="${DIM}">Give it any number. It brings your number</text>
  <text x="72" y="310" font-family="JetBrains Mono" font-size="19" fill="${DIM}">home to 1 — and writes it a letter about</text>
  <text x="72" y="340" font-family="JetBrains Mono" font-size="19" fill="${DIM}">the whole ordeal.</text>

  <text x="72" y="560" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${GOLD}">collatz.bisks.net</text>

  <!-- right: a sample heartbeat trace -->
  <rect x="600" y="60" width="560" height="220" rx="16" fill="#1a0710" stroke="#522038" stroke-width="1.5"/>
  <text x="628" y="96" font-family="JetBrains Mono" font-size="13" letter-spacing="2" fill="${ROSE}">YOUR HEARTBEAT, MAPPED</text>
  <polyline points="${esc(tracePoints)}" fill="none" stroke="${ROSE}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
  <g transform="translate(1076,215) scale(1.15)"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill="#ffd6de"/></g>

  <rect x="600" y="330" width="560" height="240" rx="16" fill="${FG}" opacity="0.97"/>
  <text x="632" y="378" font-family="JetBrains Mono" font-weight="700" font-size="28" fill="#8f1330">Dear 27,</text>
  <text x="632" y="414" font-family="JetBrains Mono" font-size="18" fill="#2a1512">that was fast. 111 steps and</text>
  <text x="632" y="440" font-family="JetBrains Mono" font-size="18" fill="#2a1512">you were already in my arms.</text>
  <text x="632" y="466" font-family="JetBrains Mono" font-size="18" fill="#2a1512">I like to think that means</text>
  <text x="632" y="492" font-family="JetBrains Mono" font-size="18" fill="#2a1512">something.</text>
  <text x="632" y="540" font-family="JetBrains Mono" font-weight="700" font-size="16" fill="#b23a5f">111 steps &#183; peak 9,232 &#183; home at 1</text>
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
