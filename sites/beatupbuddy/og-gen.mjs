// Generates public/og.png — the Open Graph preview card for beat up buddy.
//
// Hand-drawn SVG "screenshot": a ragdoll dummy standing on a weighted
// bop-bag base, a speech bubble crying an actual @mfzx.net line, and a row
// of tool-initial badges along the bottom (no emoji — resvg has no emoji
// font loaded, only the bundled JetBrains Mono, so emoji glyphs rasterize
// as tofu boxes). This static card never fetches the real avatar (no
// network at build time) — the head is a placeholder "M" initial; the
// live page fetches @mfzx.net's actual avatar client-side.
// Rasterised with @resvg/resvg-js (pure native module, no system
// Chromium/fontconfig needed — font bundled in ./fonts).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// No live data, no network — deterministic so the card is stable across
// builds. Adapted from sites/mootkombat/og-gen.mjs.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const INK = "#f7ecec", MUTED = "#b89aa6", GOLD = "#ffcf4d", RED = "#ff4d5e";
const DUMMY = "#caa06a", DUMMY_STROKE = "#8a6a42", STITCH = "#5c4326";

// dummy stands on the right side of the card, clear of both the headline
// text (left) and the tool-badge footer strip (bottom) — a static reference
// to the same standing bop-bag pose as the live game, not a literal replay
// of its floor math.
const anchorX = 970;
const cardFloorY = 500;
const legW = 26, legH = 66;
const legY = cardFloorY - 10 - legH / 2;
const torsoW = 58, torsoH = 104, torsoY = legY - legH / 2 - torsoH / 2 + 4;
const armW = 22, armH = 58;
const headR = 40, headY = torsoY - headR - 56;

function limb(x, y, w, h, angle) {
  return `<g transform="translate(${x} ${y}) rotate(${angle})">
    <rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="${Math.min(w, h) * 0.35}" fill="${DUMMY}" stroke="${DUMMY_STROKE}" stroke-width="2.5"/>
    <line x1="0" y1="${-h / 2 + 6}" x2="0" y2="${h / 2 - 6}" stroke="${STITCH}" stroke-width="1.5" stroke-dasharray="4 4"/>
  </g>`;
}

const dummy = `
  <ellipse cx="${anchorX}" cy="${cardFloorY - 4}" rx="58" ry="17" fill="#241621" stroke="#402a38" stroke-width="3"/>
  ${limb(anchorX - 20, legY, legW, legH, -6)}
  ${limb(anchorX + 18, legY, legW, legH, 8)}
  <g transform="translate(${anchorX} ${torsoY})">
    <rect x="${-torsoW / 2}" y="${-torsoH / 2}" width="${torsoW}" height="${torsoH}" rx="18" fill="#9b7a4a" stroke="#6a4e2c" stroke-width="3"/>
    <line x1="0" y1="${-torsoH / 2 + 8}" x2="0" y2="${torsoH / 2 - 8}" stroke="${STITCH}" stroke-width="2" stroke-dasharray="5 5"/>
  </g>
  ${limb(anchorX - torsoW / 2 - armW / 2 + 6, torsoY - torsoH / 2 + armH / 2 + 6, armW, armH, 16)}
  ${limb(anchorX + torsoW / 2 + armW / 2 - 6, torsoY - torsoH / 2 + armH / 2 + 6, armW, armH, -22)}
  <g transform="translate(${anchorX} ${headY})">
    <circle r="${headR}" fill="#5b3a52"/>
    <circle r="${headR}" fill="none" stroke="${STITCH}" stroke-width="4" stroke-dasharray="6 6"/>
    <text x="0" y="8" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="30" fill="${INK}">M</text>
  </g>`;

const bubbleX = anchorX - 190, bubbleY = headY - 46;
const bubble = `
  <g>
    <rect x="${bubbleX - 140}" y="${bubbleY - 54}" width="280" height="74" rx="14" fill="#fff8ec" stroke="#402a38" stroke-width="2.5"/>
    <path d="M ${bubbleX + 90} ${bubbleY + 20} L ${bubbleX + 70} ${bubbleY + 20} L ${bubbleX + 94} ${bubbleY + 44} Z" fill="#fff8ec" stroke="#402a38" stroke-width="2.5"/>
    <text x="${bubbleX}" y="${bubbleY - 20}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="18" fill="#1a0f14">"i'm screenshotting</text>
    <text x="${bubbleX}" y="${bubbleY + 4}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="18" fill="#1a0f14">this later"</text>
  </g>`;

// tool row: initial badges instead of emoji (no emoji glyphs in the bundled
// font, and resvg has no system-font fallback to borrow one from)
const TOOLS = [
  ["FIST", RED],
  ["BAT", GOLD],
  ["HMR", RED],
  ["PAN", GOLD],
  ["BOOT", RED],
  ["CHKN", GOLD],
  ["ROPE", RED],
];
let toolRow = "";
TOOLS.forEach(([label, color], i) => {
  const x = 60 + i * 105;
  const y = H - 66;
  toolRow += `<rect x="${x}" y="${y - 24}" width="88" height="48" rx="10" fill="#241621" stroke="#402a38" stroke-width="2"/>
    <text x="${x + 44}" y="${y + 7}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="18" fill="${color}">${label}</text>`;
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="0.35" cy="0.05" r="0.9">
      <stop offset="0" stop-color="#3a1a24"/>
      <stop offset="1" stop-color="#171016"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect y="${H - 110}" width="${W}" height="110" fill="#20141b"/>
  <line x1="0" y1="${H - 110}" x2="${W}" y2="${H - 110}" stroke="#402a38" stroke-width="2"/>

  ${dummy}
  ${bubble}

  <text x="60" y="450" font-family="JetBrains Mono" font-weight="800" font-size="58" fill="${INK}">BEAT UP <tspan fill="${RED}">BUDDY</tspan></text>
  <text x="60" y="494" font-family="JetBrains Mono" font-size="24" fill="${GOLD}">@mfzx.net, but it's a ragdoll and you have a hammer</text>
  <text x="60" y="524" font-family="JetBrains Mono" font-size="19" fill="${MUTED}">real face, real posts — cried out on every single hit.</text>

  ${toolRow}
  <text x="${W - 60}" y="${H - 42}" text-anchor="end" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${RED}">beatupbuddy.bisks.net</text>
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
