// Generates public/og.png — the Open Graph preview card for tamagotchip, so
// a shared link auto-renders a picture of the device in Bluesky / other
// unfurlers. Hand-drawn SVG at the canonical OG size, matching the live
// page's little-green-terminal look, rasterised with @resvg/resvg-js (pure
// native module, no system Chromium needed — this box has no
// fontconfig/system fonts either, so the font is bundled in ./fonts and
// loaded explicitly). Same approach as sites/didscope/og-gen.mjs.
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

const BG = "#0d1410", PANEL = "#142019", BORDER = "#274536";
const INK = "#c9f2d8", DIM = "#7fa88f", ACCENT = "#5be08f", ACCENT2 = "#ffb454";
const SCREEN_BG = "#0a1f14", SCREEN_FG = "#6dffa8";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// the little "screen" mock — a boot-message grid, same vibe as the hello preset
const SCREEN_LINES = [
  "BOOTING...",
  "",
  "HELLO, WORLD",
  "",
  "",
  "FLASH YOUR OWN",
];

const bezelX = 740, bezelY = 95, bezelW = 380, bezelH = 440;
const screenX = bezelX + 28, screenY = bezelY + 50, screenW = bezelW - 56, screenH = 220;
const lineH = 34;

const screenSvg = SCREEN_LINES.map(
  (l, i) => `<text x="${screenX + 16}" y="${screenY + 34 + i * lineH}" font-family="JetBrains Mono" font-size="22" fill="${SCREEN_FG}">${esc(l)}</text>`,
).join("\n    ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="15%" cy="-10%" r="60%">
      <stop offset="0" stop-color="#1c3324"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="95%" cy="100%" r="55%">
      <stop offset="0" stop-color="#132b1e"/>
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

  <!-- left: wordmark + pitch -->
  <text x="64" y="150" font-family="JetBrains Mono" font-weight="800" font-size="60" fill="url(#title)">tamagotchip</text>
  <text x="64" y="196" font-family="JetBrains Mono" font-size="21" fill="${DIM}">a little virtual computer you</text>
  <text x="64" y="224" font-family="JetBrains Mono" font-size="21" fill="${DIM}">flash with your own firmware</text>

  <text x="64" y="292" font-family="JetBrains Mono" font-size="17" fill="${DIM}">write a tiny screen-drawing script,</text>
  <text x="64" y="318" font-family="JetBrains Mono" font-size="17" fill="${DIM}">hit flash, watch it boot. no real</text>
  <text x="64" y="344" font-family="JetBrains Mono" font-size="17" fill="${DIM}">hardware, no real risk.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT2}">tamagotchip.bisks.net</text>

  <!-- right: device bezel -->
  <rect x="${bezelX}" y="${bezelY}" width="${bezelW}" height="${bezelH}" rx="26" fill="${PANEL}" stroke="${BORDER}" stroke-width="2"/>
  <text x="${bezelX + bezelW / 2}" y="${bezelY + 34}" text-anchor="middle" font-family="JetBrains Mono" font-size="12" letter-spacing="3" fill="${DIM}">TAMAGOTCHIP // MODEL T-1</text>

  <rect x="${screenX}" y="${screenY}" width="${screenW}" height="${screenH}" rx="8" fill="${SCREEN_BG}" stroke="#0a1a0f" stroke-width="1.5"/>
  ${screenSvg}

  <rect x="${bezelX + bezelW / 2 - 70}" y="${screenY + screenH + 34}" width="66" height="34" rx="8" fill="${ACCENT}"/>
  <text x="${bezelX + bezelW / 2 - 37}" y="${screenY + screenH + 57}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="12" fill="#062012">FLASH</text>
  <rect x="${bezelX + bezelW / 2 + 4}" y="${screenY + screenH + 34}" width="66" height="34" rx="8" fill="none" stroke="${BORDER}" stroke-width="1.5"/>
  <text x="${bezelX + bezelW / 2 + 37}" y="${screenY + screenH + 57}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="12" fill="${INK}">RESET</text>
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
