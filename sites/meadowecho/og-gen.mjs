// Generates public/og.png — the Open Graph preview card for meadowecho, so a
// shared link auto-renders a picture of the idea in Bluesky / other
// unfurlers. Hand-drawn SVG at the canonical OG size, matching the live
// page's dark palette, rasterised with @resvg/resvg-js (pure native module,
// no system Chromium needed — this box has no fontconfig/system fonts
// either, so the font is bundled in ./fonts and loaded explicitly). Copied
// from sites/didscope's og-gen.mjs recipe — house style: copy, don't
// abstract.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// The artwork: a field of faint dots (the open firehose) with one lit up in
// the accent color and connected back to a small cluster of dots (the
// target's last 100 posts) — a static stand-in for "found a live echo."

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200,
  H = 630;

const BG = "#08090d";
const PANEL = "#10121b";
const FG = "#e8ecf3";
const DIM = "#808daa";
const ACCENT = "#6ee7c8";
const ECHO = "#ffd166";
const FAINT = "rgba(232,236,243,0.14)";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const rand = (seed) => {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
};

// Right-hand field: a scatter of faint firehose dots, plus a small cluster
// of "target" dots and one highlighted "echo" match with a connecting line.
const fieldX = 620,
  fieldY = 40,
  fieldW = 540,
  fieldH = 550;

const r = rand(7);
let dots = "";
for (let i = 0; i < 90; i++) {
  const x = fieldX + r() * fieldW;
  const y = fieldY + r() * fieldH;
  const rad = 2 + r() * 2.4;
  dots += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${rad.toFixed(1)}" fill="${FG}" opacity="${(0.08 + r() * 0.14).toFixed(2)}"/>\n  `;
}

// the target cluster — tight group of dots near the bottom-left of the field
const clusterCx = fieldX + 120,
  clusterCy = fieldY + fieldH - 110;
let cluster = "";
const rc = rand(13);
const clusterPts = [];
for (let i = 0; i < 9; i++) {
  const ang = rc() * Math.PI * 2;
  const rad = rc() * 46;
  const x = clusterCx + Math.cos(ang) * rad;
  const y = clusterCy + Math.sin(ang) * rad * 0.7;
  clusterPts.push([x, y]);
  cluster += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4.5" fill="${ACCENT}" opacity="0.85"/>\n  `;
}

// the echo — one match found elsewhere in the field, connected to the
// cluster's centroid with a dashed line
const echoX = fieldX + fieldW - 130,
  echoY = fieldY + 90;
const echoLine = `<line x1="${clusterCx}" y1="${clusterCy}" x2="${echoX}" y2="${echoY}" stroke="${ECHO}" stroke-width="1.5" stroke-dasharray="4,5" opacity="0.7"/>`;
const echoDot = `<circle cx="${echoX}" cy="${echoY}" r="9" fill="none" stroke="${ECHO}" stroke-width="2"/>
  <circle cx="${echoX}" cy="${echoY}" r="9" fill="${ECHO}" opacity="0.25"/>
  <circle cx="${echoX}" cy="${echoY}" r="16" fill="none" stroke="${ECHO}" stroke-width="1" opacity="0.35"/>
  <circle cx="${echoX}" cy="${echoY}" r="23" fill="none" stroke="${ECHO}" stroke-width="1" opacity="0.18"/>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="15%" cy="0%" r="65%">
      <stop offset="0" stop-color="#132018"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>

  <!-- left: wordmark + pitch -->
  <text x="64" y="140" font-family="JetBrains Mono" font-weight="800" font-size="60" fill="${FG}">meadow<tspan fill="${ACCENT}">echo</tspan></text>
  <text x="64" y="192" font-family="JetBrains Mono" font-size="21" fill="${DIM}">live semantic search over the</text>
  <text x="64" y="222" font-family="JetBrains Mono" font-size="21" fill="${DIM}">open firehose</text>

  <rect x="64" y="270" width="4" height="140" fill="${ACCENT}"/>
  <text x="90" y="300" font-family="JetBrains Mono" font-size="17" fill="${FG}">real sentence embeddings, cosine</text>
  <text x="90" y="326" font-family="JetBrains Mono" font-size="17" fill="${FG}">similarity against the centroid of</text>
  <text x="90" y="352" font-family="JetBrains Mono" font-size="17" fill="${FG}">@fromthewestmeadow.com's last 100</text>
  <text x="90" y="378" font-family="JetBrains Mono" font-size="17" fill="${FG}">posts — updated live, every batch.</text>

  <circle cx="80" cy="450" r="4" fill="${ACCENT}"/>
  <text x="96" y="455" font-family="JetBrains Mono" font-size="15" fill="${DIM}">their last 100 posts</text>
  <circle cx="80" cy="480" r="4.5" fill="none" stroke="${ECHO}" stroke-width="2"/>
  <text x="96" y="485" font-family="JetBrains Mono" font-size="15" fill="${DIM}">a live echo, found on the firehose</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT}">meadowecho.bisks.net</text>

  <!-- right: firehose field -->
  <rect x="${fieldX}" y="${fieldY}" width="${fieldW}" height="${fieldH}" rx="18" fill="${PANEL}" stroke="${FAINT}" stroke-width="1.5"/>
  ${dots}
  ${echoLine}
  ${cluster}
  ${echoDot}
</svg>`;

const fontPath = fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url));
const rsvg = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
});
const png = rsvg.render().asPng();
const out = new URL("./public/og.png", import.meta.url).pathname;
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");
