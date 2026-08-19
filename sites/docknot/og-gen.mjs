// Generates public/og.png — the Open Graph preview card for docknot.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium/fontconfig needed — the font is
// bundled in ./fonts and loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract (lifted from
// sites/didscope/og-gen.mjs and re-themed).

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#0a0d12", FG = "#e8edf4", DIM = "#8593a8";
const ACCENT = "#62e0c4", ACCENT2 = "#ffb454", CARD = "#131922", BORDER = "#232c39";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="15%" cy="-10%" r="55%">
      <stop offset="0" stop-color="#163028"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="90%" cy="5%" r="55%">
      <stop offset="0" stop-color="#1a2436"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${ACCENT}"/>
      <stop offset="1" stop-color="${ACCENT2}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <text x="64" y="150" font-family="JetBrains Mono" font-weight="800" font-size="68" fill="url(#title)">docknot</text>
  <text x="64" y="196" font-family="JetBrains Mono" font-size="21" fill="${DIM}">a doc-site generator that runs</text>
  <text x="64" y="224" font-family="JetBrains Mono" font-size="21" fill="${DIM}">entirely in your browser</text>

  <text x="64" y="290" font-family="JetBrains Mono" font-size="16" fill="${DIM}">"couldn't this just be a webasm static page?"</text>
  <text x="64" y="316" font-family="JetBrains Mono" font-size="16" fill="${DIM}">yes — paste markdown, it wasm-parses and</text>
  <text x="64" y="342" font-family="JetBrains Mono" font-size="16" fill="${DIM}">exports a real static site. no server.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT}">docknot.bisks.net</text>

  <rect x="618" y="70" width="520" height="490" rx="18" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>
  <rect x="648" y="108" width="80" height="10" rx="5" fill="${ACCENT}"/>
  <rect x="648" y="132" width="140" height="10" rx="5" fill="${BORDER}"/>
  <rect x="648" y="152" width="100" height="10" rx="5" fill="${BORDER}"/>

  <text x="648" y="210" font-family="JetBrains Mono" font-weight="700" font-size="19" fill="${FG}"># Getting started</text>
  <text x="648" y="244" font-family="JetBrains Mono" font-size="15" fill="${DIM}">This site was never written to</text>
  <text x="648" y="266" font-family="JetBrains Mono" font-size="15" fill="${DIM}">disk by a server. It's markdown,</text>
  <text x="648" y="288" font-family="JetBrains Mono" font-size="15" fill="${DIM}">run through a WebAssembly build</text>
  <text x="648" y="310" font-family="JetBrains Mono" font-size="15" fill="${DIM}">of md4c the moment you typed it.</text>

  <rect x="648" y="336" width="4" height="76" fill="${ACCENT2}"/>
  <text x="666" y="356" font-family="JetBrains Mono" font-size="14" fill="${ACCENT2}">- fetch raw docs from any URL</text>
  <text x="666" y="378" font-family="JetBrains Mono" font-size="14" fill="${ACCENT2}">- render with real .wasm md4c</text>
  <text x="666" y="400" font-family="JetBrains Mono" font-size="14" fill="${ACCENT2}">- download a static site .zip</text>

  <rect x="648" y="440" width="460" height="90" rx="10" fill="#0d1319" stroke="${BORDER}"/>
  <circle cx="672" cy="464" r="4" fill="${ACCENT}"/>
  <text x="686" y="469" font-family="JetBrains Mono" font-size="13" fill="${ACCENT}">render engine: markdown-wasm (md4c)</text>
  <text x="672" y="498" font-family="JetBrains Mono" font-size="13" fill="${DIM}">zero server calls after page load</text>
  <text x="672" y="518" font-family="JetBrains Mono" font-size="13" fill="${DIM}">except loading the wasm module</text>
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
