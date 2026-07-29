// Generates public/og.png — the Open Graph preview card for cutitclose, so a
// shared link auto-renders a picture of the game instead of a bare URL.
//
// Hand-drawn SVG: title + tagline on the left, a mini split-flap departure
// board on the right with sample flight data (flavor only, not live data),
// rasterised with sharp (librsvg under the hood — already a hoisted repo
// dependency, no extra install needed). No emoji glyphs — this sandbox has
// no system font/emoji set, so an emoji would render as a blank tofu box;
// the little plane is a hand-drawn SVG path instead.
//
// Text needs a font or it renders blank (no fontconfig default in this
// environment) — point FONTCONFIG_FILE at a tiny generated config that
// registers ./fonts/JetBrainsMono.ttf before any text gets drawn.
//
//   node og-gen.mjs   # writes ./public/og.png

import sharp from "sharp";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));

const fcDir = join(tmpdir(), "cutitclose-fontconfig");
mkdirSync(join(fcDir, "cache"), { recursive: true });
const fontsDir = join(__dirname, "fonts");
writeFileSync(
  join(fcDir, "fonts.conf"),
  `<?xml version="1.0"?>\n<!DOCTYPE fontconfig SYSTEM "fonts.dtd">\n<fontconfig>\n  <dir>${fontsDir}</dir>\n  <cachedir>${join(fcDir, "cache")}</cachedir>\n</fontconfig>\n`
);
process.env.FONTCONFIG_FILE = join(fcDir, "fonts.conf");

const W = 1200, H = 630;
const BG = "#0a0e17", PANEL = "#10141f", PANEL2 = "#151b29", INK = "#eef1fb", DIM = "#7c8aa3",
  LINE = "#232b3d", AMBER = "#ffb238", GREEN = "#3ddc84", TEAL = "#4fd1c5";
const mono = "JetBrains Mono";

// ── hand-drawn plane icon (no emoji glyphs available) ─────────────────────
const planeIcon = `
  <g transform="translate(74,90) rotate(-18)">
    <path d="M0 14 L58 14 L84 0 L96 4 L74 18 L96 20 L120 14 L132 18 L96 30 L74 28 L58 34 L40 34 L48 20 L0 20 Z"
      fill="${AMBER}" opacity=".95"/>
  </g>`;

// ── mini split-flap departure board (right side) ───────────────────────────
const boardX = 660, boardY = 150, boardW = 470, boardH = 330;
const rows = [
  ["FLIGHT", "TP 1584"],
  ["TO", "LISBON"],
  ["GATE", "C14"],
  ["LAST CALL", "5:42 PM"],
  ["STATUS", "BOARDING"],
];
const rowH = boardH / rows.length;
let boardRows = "";
rows.forEach(([k, v], i) => {
  const ry = boardY + i * rowH;
  boardRows += `<line x1="${boardX}" y1="${ry}" x2="${boardX + boardW}" y2="${ry}" stroke="${LINE}" stroke-width="1.5"/>`;
  boardRows += `<text x="${boardX + 24}" y="${ry + rowH / 2 - 6}" font-family="${mono}" font-size="13" letter-spacing="2" fill="${DIM}">${k}</text>`;
  const valColor = k === "STATUS" ? GREEN : k === "LAST CALL" ? AMBER : INK;
  boardRows += `<text x="${boardX + 24}" y="${ry + rowH / 2 + 20}" font-family="${mono}" font-weight="700" font-size="26" letter-spacing="1.5" fill="${valColor}">${v}</text>`;
});
boardRows += `<line x1="${boardX}" y1="${boardY + boardH}" x2="${boardX + boardW}" y2="${boardY + boardH}" stroke="${LINE}" stroke-width="1.5"/>`;

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="30%" cy="-10%" r="70%">
      <stop offset="0%" stop-color="#241d0d"/>
      <stop offset="100%" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>

  ${planeIcon}

  <text x="74" y="150" font-family="${mono}" font-weight="800" font-size="66"
    letter-spacing="1" fill="${AMBER}">cutitclose</text>

  <text x="74" y="196" font-family="${mono}" font-size="21" fill="${INK}">A choose-your-own-adventure race to the gate.</text>
  <text x="74" y="228" font-family="${mono}" font-size="18" fill="${DIM}">Pick your route, your parking, your security line.</text>
  <text x="74" y="256" font-family="${mono}" font-size="18" fill="${DIM}">Score = how close to last call, without missing it.</text>

  <rect x="74" y="300" width="220" height="1" fill="${LINE}"/>

  <text x="74" y="340" font-family="${mono}" font-size="14" letter-spacing="2" fill="${TEAL}">SAMPLE RESULT</text>
  <text x="74" y="378" font-family="${mono}" font-weight="800" font-size="32" fill="${GREEN}">Threaded the needle</text>
  <text x="74" y="410" font-family="${mono}" font-size="18" fill="${INK}">landed 2 min before last call — score 100/100</text>

  <rect x="${boardX}" y="${boardY}" width="${boardW}" height="${boardH}" rx="12" fill="${PANEL}" stroke="${LINE}" stroke-width="1.5"/>
  ${boardRows}

  <text x="74" y="${H - 46}" font-family="${mono}" font-weight="700" font-size="22" fill="${TEAL}">bisks.net/games/cutitclose</text>
</svg>`;

const outPath = join(__dirname, "public", "og.png");
const png = await sharp(Buffer.from(svg)).png().toBuffer();
writeFileSync(outPath, png);
console.log("wrote", outPath, png.length, "bytes");
