// Generates public/og.png — the Open Graph preview card for metronome.
// Hand-drawn SVG (a pendulum metronome body with a swung arm, plus title/
// tagline), rasterised with @resvg/resvg-js (pure native module, no system
// Chromium needed).
//
//   node og-gen.mjs   # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract — this is a cousin of
// sites/claudoku/og-gen.mjs and sites/mootrider/og-gen.mjs.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#131316", PANEL = "#1c1c21", INK = "#f2f1ee", DIM = "#94929c",
  ACCENT = "#f5a623", DOWNBEAT = "#ff5d73", LINE = "#2f2f37";

// ── pendulum metronome body (right side) ─────────────────────────────────
const bx = 860, by = 120, bw = 220, bh = 400;
const body = `
  <g>
    <path d="M${bx-70} ${by+bh} L${bx+bw+70} ${by+bh} L${bx+bw+30} ${by} L${bx-30} ${by} Z"
      fill="${PANEL}" stroke="${LINE}" stroke-width="4" stroke-linejoin="round"/>
    <path d="M${bx-30} ${by} L${bx-10} ${by-40} L${bx+bw+10} ${by-40} L${bx+bw+30} ${by} Z"
      fill="${PANEL}" stroke="${LINE}" stroke-width="4" stroke-linejoin="round"/>
    <line x1="${bx+bw/2}" y1="${by-40}" x2="${bx+bw/2+95}" y2="${by+250}"
      stroke="${ACCENT}" stroke-width="10" stroke-linecap="round"
      transform="rotate(18 ${bx+bw/2} ${by-40})"/>
    <circle cx="${bx+bw/2}" cy="${by-40}" r="12" fill="${ACCENT}"/>
    <circle cx="${bx+bw/2+95}" cy="${by+250}" r="16" fill="${DOWNBEAT}"
      transform="rotate(18 ${bx+bw/2} ${by-40})"/>
    ${Array.from({ length: 5 }, (_, i) => {
      const yy = by + 60 + i * 60;
      return `<line x1="${bx+10}" y1="${yy}" x2="${bx+bw-10}" y2="${yy}" stroke="${LINE}" stroke-width="3"/>`;
    }).join("")}
  </g>
`;

// ── beat dots (mirrors the in-page visualizer) ───────────────────────────
const dotsY = 470;
const dots = Array.from({ length: 4 }, (_, i) => {
  const cx = 120 + i * 60;
  const isDown = i === 0;
  return `<circle cx="${cx}" cy="${dotsY}" r="16" fill="${isDown ? DOWNBEAT : ACCENT}" opacity="${isDown ? 1 : 0.55}"/>`;
}).join("");

const svg = `
<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect x="0" y="0" width="${W}" height="${H}" fill="url(#grad)" opacity="0.5"/>
  <defs>
    <radialGradient id="grad" cx="20%" cy="20%" r="80%">
      <stop offset="0%" stop-color="#20202a"/>
      <stop offset="100%" stop-color="${BG}"/>
    </radialGradient>
  </defs>

  ${body}

  <text x="90" y="200" font-family="JetBrains Mono" font-weight="700" font-size="86" fill="${INK}">metro<tspan fill="${ACCENT}">nome</tspan></text>
  <text x="92" y="260" font-family="JetBrains Mono" font-size="24" fill="${DIM}">tap tempo · time signatures · subdivisions · setlist mode</text>

  ${dots}
  <text x="350" y="479" font-family="JetBrains Mono" font-size="22" fill="${DIM}">30-280 bpm, right in the browser</text>

  <text x="90" y="580" font-family="JetBrains Mono" font-size="22" fill="${DIM}">metronome.bisks.net</text>
</svg>
`;

const fontPath = fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url));
const resvg = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
});
const png = resvg.render().asPng();
writeFileSync(new URL("./public/og.png", import.meta.url), png);
console.log("wrote public/og.png", png.length, "bytes");
