// Generates public/og.png — the Open Graph preview card for distrotycoon.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium needed — this box has no
// fontconfig/system fonts either, so the font is bundled in ./fonts and
// loaded explicitly). Same recipe as sites/aurafarmville/og-gen.mjs.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// A generic terminal window mid-flamewar — not tied to any player's distro.
// Per-result personalization happens client-side in the share card canvas.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#090c09", FG = "#dcf5e2", DIM = "#6f8d76";
const ACCENT = "#39ff88", ACCENT2 = "#ffb347";

const termX = 620, termY = 150, termW = 520, termH = 330;
const lines = [
  { t: "$ ./configure --faction=collective", c: DIM },
  { t: "installing systemd as PID 1...", c: FG },
  { t: "have you tried the other init?", c: ACCENT2 },
  { t: "> arguing on r/linux...  38%", c: ACCENT },
  { t: "> arguing on hacker news... 12%", c: ACCENT },
  { t: "> arguing on bluesky...   61%", c: ACCENT },
  { t: "ready to argue.", c: FG },
];

let termLines = "";
lines.forEach((l, i) => {
  const y = termY + 44 + i * 38;
  termLines += `<text x="${termX + 24}" y="${y}" font-family="JetBrains Mono" font-size="17" fill="${l.c}">${l.t
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")}</text>`;
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="8%" cy="-10%" r="60%">
      <stop offset="0" stop-color="#123018"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="95%" cy="0%" r="55%">
      <stop offset="0" stop-color="#241c08"/>
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

  <text x="64" y="150" font-family="JetBrains Mono" font-weight="800" font-size="56" fill="url(#title)">distrotycoon</text>
  <text x="64" y="200" font-family="JetBrains Mono" font-size="19" fill="${FG}">build your own linux distro.</text>
  <text x="64" y="228" font-family="JetBrains Mono" font-size="19" fill="${FG}">win the internet, one</text>
  <text x="64" y="256" font-family="JetBrains Mono" font-size="19" fill="${FG}">comment section at a time.</text>

  <text x="64" y="320" font-family="JetBrains Mono" font-size="14" fill="${DIM}">phoronix · reddit</text>
  <text x="64" y="344" font-family="JetBrains Mono" font-size="14" fill="${DIM}">hacker news · x</text>
  <text x="64" y="368" font-family="JetBrains Mono" font-size="14" fill="${DIM}">mastodon · bluesky</text>

  <rect x="${termX}" y="${termY}" width="${termW}" height="${termH}" rx="14" fill="#0f140f" stroke="#1f2e21" stroke-width="1.5"/>
  <circle cx="${termX + 24}" cy="${termY + 22}" r="6" fill="#ff6b6b"/>
  <circle cx="${termX + 46}" cy="${termY + 22}" r="6" fill="${ACCENT2}"/>
  <circle cx="${termX + 68}" cy="${termY + 22}" r="6" fill="${ACCENT}"/>
  ${termLines}

  <text x="64" y="${H - 40}" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT}">distrotycoon.bisks.net</text>
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
