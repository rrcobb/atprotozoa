// Generates public/og.png — the Open Graph preview card for enterforest, so
// a shared link auto-renders a picture of the game instead of a bare URL.
//
// Hand-drawn SVG: a dark treeline silhouette, a scatter of small lit eyes
// in the dark, "ENTER FOREST?" with Yes/No pill buttons (homage to the
// @dame.is post this riffs on), rasterised with sharp (librsvg under the
// hood — already a hoisted repo dependency, no extra install needed). No
// emoji glyphs in the raster — this sandbox has no system emoji font, so
// they'd render as tofu; everything here is a plain SVG shape or text.
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

const fcDir = join(tmpdir(), "enterforest-fontconfig");
mkdirSync(join(fcDir, "cache"), { recursive: true });
const fontsDir = join(__dirname, "fonts");
writeFileSync(
  join(fcDir, "fonts.conf"),
  `<?xml version="1.0"?>\n<!DOCTYPE fontconfig SYSTEM "fonts.dtd">\n<fontconfig>\n  <dir>${fontsDir}</dir>\n  <cachedir>${join(fcDir, "cache")}</cachedir>\n</fontconfig>\n`
);
process.env.FONTCONFIG_FILE = join(fcDir, "fonts.conf");

const W = 1200, H = 630;
const BG = "#070b08", PANEL = "#0e150f", INK = "#e9efe4", DIM = "#7f9a83",
  LINE = "#1e2c1f", GOLD = "#e8c25a", GREEN = "#6fd18a", VIOLET = "#b79bf0",
  TREE = "#0a130b", TREE2 = "#0d180e";
const mono = "JetBrains Mono";

function seededRand(seed) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}
const rnd = seededRand(42);

// ── jagged treeline silhouette, two overlapping layers for depth ──────────
function treeline(baseY, color, seed, jitter) {
  const r = seededRand(seed);
  let d = `M0 ${H} L0 ${baseY}`;
  let x = 0;
  while (x < W) {
    const peakH = 40 + r() * jitter;
    const w = 22 + r() * 26;
    d += ` L${x + w / 2} ${baseY - peakH} L${x + w} ${baseY}`;
    x += w;
  }
  d += ` L${W} ${H} Z`;
  return `<path d="${d}" fill="${color}"/>`;
}

// ── scatter of small lit eye-pairs in the dark canopy ──────────────────────
let eyes = "";
const eyeSpots = [
  [150, 210], [340, 160], [520, 230], [760, 180], [940, 240], [1080, 190],
  [230, 320], [640, 300],
];
eyeSpots.forEach(([ex, ey], i) => {
  const gap = 9 + (i % 3) * 2;
  const c = i % 4 === 0 ? VIOLET : GOLD;
  eyes += `<circle cx="${ex}" cy="${ey}" r="3.2" fill="${c}" opacity=".9"/>`;
  eyes += `<circle cx="${ex + gap}" cy="${ey}" r="3.2" fill="${c}" opacity=".9"/>`;
});

function pillButton(x, y, w, h, label, color, filled) {
  const fill = filled ? color : "none";
  const textFill = filled ? "#1a1608" : color;
  return `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="${fill}" stroke="${color}" stroke-width="2"/>
    <text x="${x + w / 2}" y="${y + h / 2 + 8}" text-anchor="middle" font-family="${mono}" font-weight="800" font-size="22" fill="${textFill}">${label}</text>
  `;
}

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="50%" cy="0%" r="75%">
      <stop offset="0%" stop-color="#132214"/>
      <stop offset="100%" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>

  ${eyes}

  ${treeline(560, TREE2, 7, 90)}
  ${treeline(610, TREE, 13, 120)}

  <text x="${W / 2}" y="150" text-anchor="middle" font-family="${mono}" font-weight="800" font-size="60"
    letter-spacing="1" fill="${GOLD}">ENTER FOREST?</text>

  <text x="${W / 2}" y="196" text-anchor="middle" font-family="${mono}" font-size="19" fill="${INK}">A choose-your-own-adventure. Cryptids, fae courts, a path that loops.</text>
  <text x="${W / 2}" y="226" text-anchor="middle" font-family="${mono}" font-size="17" fill="${DIM}">16 endings — good, bad, and deeply weird.</text>

  ${pillButton(W / 2 - 190, 260, 160, 56, "Yes", GOLD, true)}
  ${pillButton(W / 2 + 30, 260, 160, 56, "No", DIM, false)}

  <text x="${W / 2}" y="380" text-anchor="middle" font-family="${mono}" font-size="14" letter-spacing="2" fill="${VIOLET}">SAMPLE ENDING</text>
  <text x="${W / 2}" y="418" text-anchor="middle" font-family="${mono}" font-weight="800" font-size="30" fill="${GREEN}">Moth-Marked</text>
  <text x="${W / 2}" y="448" text-anchor="middle" font-family="${mono}" font-size="16" fill="${INK}">"You held its stare. It blinked first."</text>

  <text x="${W / 2}" y="${H - 40}" text-anchor="middle" font-family="${mono}" font-weight="700" font-size="22" fill="${VIOLET}">enterforest.bisks.net</text>
</svg>`;

const outPath = join(__dirname, "public", "og.png");
const png = await sharp(Buffer.from(svg)).png().toBuffer();
writeFileSync(outPath, png);
console.log("wrote", outPath, png.length, "bytes");
