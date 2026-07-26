// Generates public/og.png — the Open Graph preview card for sokobisks, so a
// shared link auto-renders a picture of the game in Bluesky / other unfurlers.
//
// It hand-draws a representative "screenshot" of the game as an SVG: the real
// pixel sprites from the PuzzleScript source (buildthis, ideas, ship-pads, and
// the whole crew — norvid, thebes, bisks) laid out on the level-6 finale board,
// on the site's dark panel, with the gold wordmark. Rendered at the canonical
// OG size, then rasterised with headless Chromium.
//
//   node og-gen.mjs        # writes ./public/og.png
//
// Deterministic — no live data, no network — so the card is stable across
// builds. House style: self-contained, copy-don't-abstract (this is a cousin of
// moot-bingo/og-gen.mjs). Re-run by hand if you change the artwork or sprites.

import { writeFileSync, mkdtempSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const W = 1200, H = 630;

// ── palette, lifted from the site (index.html :root + engine sprites) ────────
const BG = "#0c0e14", PANEL = "#12141c", INK = "#e8ecf6", DIM = "#8b93a7",
  LINE = "#242a3c", GOLD = "#ffe66d", ORANGE = "#ffae57", TEAL = "#5ce1c6";

// ── the actual object sprites + colours from public/engine.js ────────────────
// 5×5 grids; each digit indexes into the object's colour list, "." = transparent.
const OBJ = {
  wall:   { colors: ["#2a2f42", "#363c56"],           sprite: ["00000","01110","00000","01110","00000"] },
  player: { colors: ["#ffae57", "#14181f", "#7fd4ff"], sprite: [".000.","02020","00000","00000",".0.0."] },
  idea:   { colors: ["#ffe66d", "#fff6c9", "#b8892b"], sprite: ["..2..",".010.","21012",".010.","..2.."] },
  target: { colors: ["#3ddc84"],                       sprite: ["0...0",".....","..0..",".....","0...0"] },
  norvid: { colors: ["#b18cff", "#14181f"],            sprite: [".000.","01010",".000.",".000.",".0.0."] },
  thebes: { colors: ["#5ce1c6", "#14181f"],            sprite: [".000.","01010",".000.",".000.",".0.0."] },
  bisks:  { colors: ["#7fb2ff", "#14181f"],            sprite: [".000.","01010",".000.",".000.",".0.0."] },
};

// The level-6 finale grid — the whole crew is on the board here.
// # wall · . floor · @ target(ship-pad) · * idea · P player(you) · n/h/b crew · I idea-on-pad
const LEVEL = [
  "###########",
  "#h.......b#",
  "#.........#",
  "#....I....#",   // one idea already shipped onto its pad, for a "nearly done" look
  "#.........#",
  "#....*....#",
  "#.........#",
  "#....P....#",
  "#....n....#",
  "###########",
];

// which glyphs draw which stack of objects (bottom→top)
const GLYPH = {
  "#": ["wall"],
  ".": [],
  "@": ["target"],
  "*": ["idea"],
  "P": ["player"],
  "n": ["norvid"],
  "h": ["thebes"],
  "b": ["bisks"],
  "I": ["target", "idea"],
};

const rows = LEVEL.length, cols = LEVEL[0].length;

// ── board geometry: a crisp pixel board centred in the right ~60% of the card ─
const CELL = 46;                 // px per game tile
const PX = CELL / 5;             // px per sprite pixel
const boardW = cols * CELL, boardH = rows * CELL;
const boardX = W - boardW - 74;  // right-aligned with margin
const boardY = (H - boardH) / 2 + 10;

function drawObj(name, ox, oy) {
  const { colors, sprite } = OBJ[name];
  let out = "";
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const ch = sprite[r][c];
      if (ch === ".") continue;
      const col = colors[+ch];
      if (!col) continue;
      const x = Math.floor(ox + c * PX), y = Math.floor(oy + r * PX);
      const w = Math.ceil(PX), h = Math.ceil(PX);
      out += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${col}"/>`;
    }
  }
  return out;
}

let cells = "";
for (let r = 0; r < rows; r++) {
  for (let c = 0; c < cols; c++) {
    const ox = boardX + c * CELL, oy = boardY + r * CELL;
    for (const name of GLYPH[LEVEL[r][c]] || []) cells += drawObj(name, ox, oy);
  }
}

// ── crew legend chips on the left (matches the .crew row in the page) ────────
const crew = [
  { label: "buildthis (you)", color: ORANGE },
  { label: "norvid",          color: "#b18cff" },
  { label: "thebes",          color: TEAL },
  { label: "bisks",           color: "#7fb2ff" },
];
let legend = "";
crew.forEach((m, i) => {
  const y = 372 + i * 34;
  legend += `<rect x="74" y="${y - 12}" width="15" height="15" rx="2" fill="${m.color}"/>`;
  legend += `<text x="99" y="${y}" font-family="ui-monospace, monospace" font-size="17" fill="${DIM}">${m.label}</text>`;
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="bg" cx="50%" cy="-10%" r="90%">
      <stop offset="0" stop-color="#171a26"/>
      <stop offset="0.6" stop-color="${BG}"/>
      <stop offset="1" stop-color="${BG}"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#bg)"/>

  <!-- wordmark + tagline (left column), matching the page header -->
  <text x="74" y="118" font-family="ui-monospace, monospace" font-weight="700"
    font-size="64" letter-spacing="1" fill="${GOLD}">sokobisks</text>
  <text x="74" y="176" font-family="ui-monospace, monospace" font-size="21"
    fill="${DIM}">a tiny <tspan fill="${ORANGE}">PuzzleScript</tspan>-style sokoban</text>
  <text x="74" y="212" font-family="ui-monospace, monospace" font-size="21"
    fill="${DIM}">about the adventures of the</text>
  <text x="74" y="248" font-family="ui-monospace, monospace" font-size="21"
    fill="${DIM}">build crew.</text>
  <text x="74" y="300" font-family="ui-monospace, monospace" font-size="18"
    fill="${INK}">you are the <tspan fill="${ORANGE}">@buildthis</tspan> bot — shove</text>
  <text x="74" y="330" font-family="ui-monospace, monospace" font-size="18"
    fill="${INK}">every idea onto a ship-pad.</text>

  ${legend}

  <!-- the board panel -->
  <rect x="${boardX - 22}" y="${boardY - 22}" width="${boardW + 44}" height="${boardH + 44}"
    rx="16" fill="${PANEL}" stroke="${LINE}" stroke-width="1.5"/>
  ${cells}

  <!-- footer -->
  <text x="74" y="588" font-family="ui-monospace, monospace" font-size="16"
    fill="${DIM}">shove every idea onto a ship-pad · it really is PuzzleScript</text>
  <text x="${W - 74}" y="588" text-anchor="end" font-family="ui-monospace, monospace"
    font-size="16" fill="${TEAL}">bisks.net/games/sokobisks</text>
</svg>`;

const html = `<!doctype html><html><head><meta charset="utf-8">
<style>html,body{margin:0;padding:0}</style></head>
<body>${svg}</body></html>`;

const dir = mkdtempSync(join(tmpdir(), "og-"));
const htmlPath = join(dir, "card.html");
writeFileSync(htmlPath, html);

// Find a headless-capable Chromium. Named `chromium` on Linux CI; on this Mac
// it's Google Chrome. First hit wins.
const CANDIDATES = [
  "chromium",
  "chromium-browser",
  "google-chrome",
  "google-chrome-stable",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
];
function pickBrowser() {
  for (const c of CANDIDATES) {
    try {
      execFileSync(c, ["--version"], { stdio: "ignore" });
      return c;
    } catch { /* try next */ }
  }
  throw new Error("no chromium/chrome found — tried: " + CANDIDATES.join(", "));
}

const out = new URL("./public/og.png", import.meta.url).pathname;
execFileSync(pickBrowser(), [
  "--headless",
  "--no-sandbox",
  "--disable-gpu",
  "--hide-scrollbars",
  "--force-device-scale-factor=1",
  `--window-size=${W},${H}`,
  `--screenshot=${out}`,
  "file://" + htmlPath,
], { stdio: "inherit" });

console.log("wrote", out);
