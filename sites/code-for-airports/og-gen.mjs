// Generates public/og.png — the Open Graph preview card for code for
// airports, so a shared link unfurls as a dark split-flap departures board
// instead of a bare URL.
//
// Rasterised with @resvg/resvg-js (pure native module, no system Chromium
// needed — font bundled in ./fonts). Adapted from
// sites/breathingwalls/og-gen.mjs.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// Re-run this by hand if the board/track list changes.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { TRACKS } from "./public/lib/tracks.js";

const W = 1200,
  H = 630;
const BG = "#05060a";
const INK = "#eef0f2";
const MUTED = "#7c8290";
const ACCENT = "#f0b429";
const ACCENT2 = "#4fd1c5";
const FAINT = "#1c2028";
const LIVE = "#34d399";

const pad = 76;
let rows = "";
const rowH = 62;
const boardTop = 330;
TRACKS.forEach((t, i) => {
  const [fno, fdest] = t.title.split(" — ");
  const y = boardTop + i * rowH;
  const status = i === 1 ? "BOARDING" : "SCHEDULED";
  const statusColor = i === 1 ? LIVE : MUTED;
  rows += `
    <line x1="${pad}" y1="${y + 18}" x2="${W - pad}" y2="${y + 18}" stroke="${FAINT}" stroke-width="1"/>
    <text x="${pad}" y="${y + 8}" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${ACCENT}">${fno}</text>
    <text x="${pad + 110}" y="${y + 8}" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${INK}">${fdest}</text>
    <text x="${W - pad}" y="${y + 8}" text-anchor="end" font-family="JetBrains Mono" font-weight="700" font-size="18" letter-spacing="2" fill="${statusColor}">${status}</text>`;
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="18%" cy="0%" r="70%">
      <stop offset="0" stop-color="#241a06"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>

  <text x="${pad}" y="118" font-family="JetBrains Mono" font-weight="700" font-size="24" letter-spacing="6" fill="${ACCENT}">NOW DEPARTING</text>
  <text x="${pad}" y="188" font-family="JetBrains Mono" font-weight="800" font-size="66" letter-spacing="1" fill="${INK}">CODE FOR AIRPORTS</text>
  <text x="${pad}" y="234" font-family="JetBrains Mono" font-size="21" fill="${MUTED}">a generative ambient album — Web Audio voices drifting out of phase, forever</text>

  <rect x="${pad}" y="${boardTop - 46}" width="${W - pad * 2}" height="${rowH * TRACKS.length + 30}" rx="10" fill="none" stroke="${FAINT}" stroke-width="1.5"/>
  ${rows}

  <text x="${pad}" y="${H - 46}" font-family="JetBrains Mono" font-size="19" fill="${ACCENT2}">in the vein of Brian Eno's Music for Airports — not a cover of it</text>
  <text x="${pad}" y="${H - 16}" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${ACCENT}">bisks.net/code-for-airports</text>
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
