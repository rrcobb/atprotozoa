// Generates public/og.png — the Open Graph preview card for vaporize, so a
// shared link auto-renders a picture of the effect in Bluesky / other
// unfurlers.
//
// Hand-draws a grid of avatar circles with a glowing laser beam mid-sweep
// and a few already-disintegrated (dust particles drifting off) as an SVG,
// then rasterises it with @resvg/resvg-js (pure native module, no system
// Chromium needed — this box has no fontconfig/system fonts either, so the
// font is bundled in ./fonts and loaded explicitly). Copied from
// dial-a-mutual/og-gen.mjs (copy, don't abstract).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// No live data, no network — deterministic so the card is stable across
// builds.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#0a0c10";
const INK = "#e8edf2", MUTED = "#8792a3", ACCENT = "#6ff0ff", DANGER = "#ff3b6b";
const TINTS = ["#1a5fd0","#1f8a4c","#d81e6a","#e0a400","#8e44ad",
  "#c0392b","#0f9b9b","#e2711d","#5566dd","#2c8c3c"];

let seed = 918273;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const SYL = ["mo","ri","no","ce","ab","gr","mi","bo","th","el"];
const initialFor = () => SYL[Math.floor(rnd() * SYL.length)].toUpperCase();

// ── grid of avatars, right two-thirds ──────────────────────────────────────
const cols = 5, rows = 3, cell = 96, gap = 20;
const gridW = cols * cell + (cols - 1) * gap;
const gridH = rows * cell + (rows - 1) * gap;
const gridX = 1200 - 64 - gridW;
const gridY = (H - gridH) / 2;

// the beam sweeps between column 2 and 3 — everything left of it is intact,
// the column it's crossing is mid-disintegration, everything right is dust
const beamCol = 2;
const beamX = gridX + beamCol * (cell + gap) - gap / 2;

let cellsSvg = "";
let dustSvg = "";
for (let r = 0; r < rows; r++) {
  for (let c = 0; c < cols; c++) {
    const cx = gridX + c * (cell + gap) + cell / 2;
    const cy = gridY + r * (cell + gap) + cell / 2;
    const fill = TINTS[Math.floor(rnd() * TINTS.length)];
    const label = initialFor();

    if (c < beamCol) {
      // intact
      cellsSvg += `
      <circle cx="${cx}" cy="${cy}" r="${cell / 2}" fill="${fill}"/>
      <text x="${cx}" y="${cy + cell * 0.15}" text-anchor="middle" font-family="JetBrains Mono"
        font-weight="700" font-size="${cell * 0.34}" fill="rgba(255,255,255,.92)">${esc(label)}</text>`;
    } else if (c === beamCol) {
      // mid-disintegration: a few surviving arcs + scattered chips right at the cell
      cellsSvg += `
      <clipPath id="clip-${r}-${c}">
        <rect x="${cx - cell / 2}" y="${cy - cell / 2}" width="${cell * 0.4}" height="${cell}"/>
      </clipPath>
      <circle cx="${cx}" cy="${cy}" r="${cell / 2}" fill="${fill}" clip-path="url(#clip-${r}-${c})"/>`;
      for (let i = 0; i < 10; i++) {
        const a = rnd() * Math.PI * 2;
        const d = cell * (0.25 + rnd() * 0.55);
        const px = cx + Math.cos(a) * d;
        const py = cy + Math.sin(a) * d - d * 0.25;
        const s = 3 + rnd() * 6;
        const op = (0.15 + rnd() * 0.55).toFixed(2);
        dustSvg += `<rect x="${px.toFixed(1)}" y="${py.toFixed(1)}" width="${s.toFixed(1)}" height="${s.toFixed(1)}"
          fill="${fill}" opacity="${op}" transform="rotate(${(rnd() * 90).toFixed(0)} ${px.toFixed(1)} ${py.toFixed(1)})"/>`;
      }
    } else {
      // already dust: just a faint scatter, no circle left
      for (let i = 0; i < 8; i++) {
        const a = rnd() * Math.PI * 2;
        const d = cell * (0.3 + rnd() * 0.9);
        const px = cx + Math.cos(a) * d;
        const py = cy + Math.sin(a) * d - d * 0.4;
        const s = 2 + rnd() * 5;
        const op = (0.06 + rnd() * 0.25).toFixed(2);
        dustSvg += `<rect x="${px.toFixed(1)}" y="${py.toFixed(1)}" width="${s.toFixed(1)}" height="${s.toFixed(1)}"
          fill="${fill}" opacity="${op}" transform="rotate(${(rnd() * 90).toFixed(0)} ${px.toFixed(1)} ${py.toFixed(1)})"/>`;
      }
    }
  }
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${ACCENT}" stop-opacity="0.14"/>
      <stop offset="100%" stop-color="${ACCENT}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="beamgrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${ACCENT}" stop-opacity="0"/>
      <stop offset="50%" stop-color="${ACCENT}" stop-opacity="0.9"/>
      <stop offset="100%" stop-color="${ACCENT}" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <circle cx="200" cy="140" r="360" fill="url(#glow1)"/>
  <circle cx="${beamX}" cy="${H / 2}" r="260" fill="url(#glow1)"/>

  <!-- wordmark -->
  <text x="64" y="100" font-family="JetBrains Mono" font-weight="700"
    font-size="46" fill="${INK}">vaporize</text>
  <text x="64" y="140" font-family="JetBrains Mono" font-size="20"
    fill="${MUTED}">turn your moots to dust with a laser beam</text>

  <!-- blurb -->
  <text x="64" y="250" font-family="JetBrains Mono" font-size="17" fill="${INK}">Load a handle's</text>
  <text x="64" y="280" font-family="JetBrains Mono" font-size="17" fill="${INK}">moots, then hit</text>
  <text x="64" y="310" font-family="JetBrains Mono" font-size="17" fill="${DANGER}" font-weight="700">⚡ vaporize</text>
  <text x="64" y="345" font-family="JetBrains Mono" font-size="17" fill="${INK}">on any of them —</text>
  <text x="64" y="375" font-family="JetBrains Mono" font-size="17" fill="${INK}">the beam does the</text>
  <text x="64" y="405" font-family="JetBrains Mono" font-size="17" fill="${INK}">rest. purely cosmetic.</text>

  <!-- the grid -->
  ${cellsSvg}
  ${dustSvg}

  <!-- the beam -->
  <rect x="${beamX - 6}" y="${gridY - 24}" width="12" height="${gridH + 48}" fill="${ACCENT}"/>
  <rect x="${beamX - 22}" y="${gridY - 24}" width="44" height="${gridH + 48}" fill="url(#beamgrad)"/>

  <!-- footer strip -->
  <text x="64" y="600" font-family="JetBrains Mono" font-size="16"
    fill="${MUTED}">load your moots · vaporize them one by one · high-quality disintegration</text>
  <text x="${W - 64}" y="600" text-anchor="end" font-family="JetBrains Mono"
    font-size="16" fill="${ACCENT}">vaporize.bisks.net</text>
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
