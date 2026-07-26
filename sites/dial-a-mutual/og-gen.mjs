// Generates public/og.png — the Open Graph preview card for dial-a-mutual, so
// a shared link auto-renders a picture of the machine in Bluesky / other
// unfurlers.
//
// Hand-draws a representative "screenshot" of the answering machine as an SVG
// (cream body, green LCD readout, a keypad of little avatar circles) at the
// canonical OG size, then rasterises it with @resvg/resvg-js (pure native
// module, no system Chromium needed — this box has no fontconfig/system
// fonts either, so the font is bundled in ./fonts and loaded explicitly).
// Copied from didscope/og-gen.mjs (copy, don't abstract).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// No live data, no network — deterministic so the card is stable across
// builds. House style: self-contained, copy-don't-abstract (layout borrowed
// from moot-bingo/og-gen.mjs, swapped for phone artwork).

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const TINTS = ["#1a5fd0","#1f8a4c","#d81e6a","#e0a400","#8e44ad",
  "#c0392b","#0f9b9b","#e2711d","#5566dd","#2c8c3c"];
const INK = "#111111", MUTED = "#6b6b6b", ACCENT = "#1a5fd0";
const PHONE = "#e9dfc8", PHONE_DARK = "#cfc09a", PHONE_INK = "#4a4335";
const LCD_BG = "#12210f", LCD_INK = "#7ef27a";

// tiny seeded RNG so the layout is identical every run
let seed = 4242;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const SYL = ["mo","ri","no","ce","ab","gr","mi","bo","th","el"];
const initialFor = () => SYL[Math.floor(rnd() * SYL.length)].toUpperCase();

function avatarCircle(x, y, r, fill, label) {
  return `
  <g>
    <circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/>
    <text x="${x}" y="${y + r * 0.32}" text-anchor="middle"
      font-family="JetBrains Mono" font-weight="700"
      font-size="${(r * 0.85).toFixed(1)}" fill="rgba(255,255,255,.92)">${esc(label)}</text>
    <circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="rgba(0,0,0,.22)" stroke-width="1"/>
  </g>`;
}

// ── the phone unit, right two-thirds ───────────────────────────────────────
// Sized keypad-out: pick a cell size that makes 3×4 keys fit inside the unit,
// then wrap the unit box (and LCD) around that with fixed margins — geometry
// computed from the grid, not the other way round, so nothing gets clipped.
// (the real keypad also has */0/# — this static card just shows the 3×3
// speed-dial slate, which reads clearly at OG-card size)
const KEYS = ["1","2","3","4","5","6","7","8","9"];
const cols = 3, rows = 3, cell = 100, gap = 16;
const padTotalW = cols * cell + (cols - 1) * gap;
const padTotalH = rows * cell + (rows - 1) * gap;

const padMargin = 36; // inside the unit, around the keypad
const lcdH = 64;
const lcdGap = 22; // between LCD and keypad

const unitW = padTotalW + padMargin * 2;
const unitH = padMargin + lcdH + lcdGap + padTotalH + padMargin;
const unitX = 480;
const unitY = 100;

const lcdX = unitX + padMargin, lcdY = unitY + padMargin, lcdW = unitW - padMargin * 2;
const padX = unitX + padMargin, padY = lcdY + lcdH + lcdGap;

let padSvg = "";
KEYS.forEach((k, i) => {
  const r = Math.floor(i / cols), c = i % cols;
  const x = padX + c * (cell + gap), y = padY + r * (cell + gap);
  const hasContact = k !== "*" && k !== "#";
  padSvg += `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="12"
    fill="#fbf7ec" stroke="${PHONE_DARK}" stroke-width="2"/>`;
  padSvg += `<text x="${x + 9}" y="${y + 18}" font-family="JetBrains Mono"
    font-weight="700" font-size="13" fill="${PHONE_INK}">${k}</text>`;
  if (hasContact) {
    const fill = TINTS[Math.floor(rnd() * TINTS.length)];
    padSvg += avatarCircle(x + cell / 2, y + cell / 2 + 7, cell * 0.28, fill, initialFor());
  }
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#ffffff"/>

  <!-- wordmark -->
  <text x="64" y="90" font-family="JetBrains Mono" font-weight="700"
    font-size="40" fill="${INK}">dial a mutual</text>
  <text x="64" y="128" font-family="JetBrains Mono" font-size="19"
    fill="${MUTED}">call your moots' answering machine</text>

  <!-- blurb on the left -->
  <text x="64" y="230" font-family="JetBrains Mono" font-size="17" fill="${INK}">Type a handle,</text>
  <text x="64" y="260" font-family="JetBrains Mono" font-size="17" fill="${INK}">get its moots</text>
  <text x="64" y="290" font-family="JetBrains Mono" font-size="17" fill="${INK}">on speed dial.</text>
  <text x="64" y="335" font-family="JetBrains Mono" font-size="17" fill="${INK}">Dial one and</text>
  <text x="64" y="365" font-family="JetBrains Mono" font-size="17" fill="${INK}">hear their last</text>
  <text x="64" y="395" font-family="JetBrains Mono" font-size="17" fill="${INK}">post, read aloud.</text>

  <!-- the machine -->
  <rect x="${unitX}" y="${unitY}" width="${unitW}" height="${unitH}" rx="24"
    fill="${PHONE}" stroke="${PHONE_DARK}" stroke-width="2"/>

  <!-- LCD -->
  <rect x="${lcdX}" y="${lcdY}" width="${lcdW}" height="${lcdH}" rx="8" fill="${LCD_BG}"/>
  <text x="${lcdX + 18}" y="${lcdY + 34}" font-family="JetBrains Mono"
    font-weight="700" font-size="20" fill="${LCD_INK}">RINGING…</text>
  <text x="${lcdX + 18}" y="${lcdY + 62}" font-family="JetBrains Mono"
    font-size="15" fill="${LCD_INK}" opacity="0.8">@norvid-studies.bsky.social</text>
  <circle cx="${lcdX + lcdW - 22}" cy="${lcdY + 24}" r="6" fill="#e04a3c"/>

  <!-- keypad -->
  ${padSvg}

  <!-- footer strip -->
  <text x="64" y="600" font-family="JetBrains Mono" font-size="16"
    fill="${MUTED}">dial a moot · the machine picks up · hear their last post</text>
  <text x="${W - 64}" y="600" text-anchor="end" font-family="JetBrains Mono"
    font-size="16" fill="${ACCENT}">dial-a-mutual.bisks.net</text>
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
