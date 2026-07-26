// Generates public/og.png — the Open Graph preview card for moot kombat, so a
// shared link auto-renders a picture of the arena in Bluesky / other unfurlers.
//
// Hand-drawn SVG "screenshot" of the fight screen: two stick figures in a
// ready stance (player cyan, moot pink) facing off under a big VS, a strip
// of ladder-avatar circles along the bottom, same palette as index.html /
// fighter.js. Rasterised with @resvg/resvg-js (pure native module, no
// system Chromium/fontconfig needed — font bundled in ./fonts).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// No live data, no network — deterministic so the card is stable across
// builds. House style: self-contained, copy-don't-abstract. Re-run this by
// hand if you change the artwork. Adapted from sites/mootrider/og-gen.mjs.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const INK = "#f3ecff", MUTED = "#9a86b8", GOLD = "#ffd23f";
const PLAYER = "#26e0c9", ACCENT = "#ff2e63";

const GROUND = H * 0.72;

// ── a stick figure, ready stance, fists up, facing `dir` (1 = right, -1 = left) ──
function stickFigure(cx, color, dir, label) {
  const hipY = GROUND - 70, shoY = hipY - 80, headY = shoY - 34, r = 30;
  return `
  <g>
    <ellipse cx="${cx}" cy="${GROUND + 8}" rx="34" ry="8" fill="rgba(0,0,0,0.35)"/>
    <line x1="${cx}" y1="${hipY}" x2="${cx - 22}" y2="${GROUND}" stroke="${color}" stroke-width="7" stroke-linecap="round"/>
    <line x1="${cx}" y1="${hipY}" x2="${cx + 22 * dir * 0.4 + 10}" y2="${GROUND}" stroke="${color}" stroke-width="7" stroke-linecap="round"/>
    <line x1="${cx}" y1="${hipY}" x2="${cx}" y2="${shoY}" stroke="${color}" stroke-width="7" stroke-linecap="round"/>
    <line x1="${cx}" y1="${shoY}" x2="${cx - dir * 14}" y2="${shoY + 26}" stroke="${color}" stroke-width="7" stroke-linecap="round"/>
    <line x1="${cx}" y1="${shoY}" x2="${cx + dir * 52}" y2="${shoY - 14}" stroke="${color}" stroke-width="7" stroke-linecap="round"/>
    <circle cx="${cx}" cy="${headY}" r="${r}" fill="${color}"/>
    <circle cx="${cx}" cy="${headY}" r="${r + 2}" fill="none" stroke="${color}" stroke-width="2" opacity="0.5"/>
    <text x="${cx}" y="${headY + 6}" text-anchor="middle" font-family="JetBrains Mono" font-weight="800"
      font-size="20" fill="#0a0710">${label}</text>
  </g>`;
}

// ── ladder track: a row of small avatar-circle stand-ins along the bottom ──
let ladderRow = "";
const rungCount = 7, rungY = H - 46;
for (let i = 0; i < rungCount; i++) {
  const x = 110 + i * 90;
  const isBoss = i === rungCount - 1;
  const hue = 260 + i * 18;
  ladderRow += `
  <circle cx="${x}" cy="${rungY}" r="${isBoss ? 22 : 17}" fill="hsl(${hue} 45% 30%)"
    stroke="${isBoss ? GOLD : MUTED}" stroke-width="${isBoss ? 3 : 2}" opacity="${isBoss ? 1 : 0.75}"/>
  ${isBoss ? `<text x="${x}" y="${rungY - 32}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="15" fill="${GOLD}">BOSS</text>` : ""}`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="0.5" cy="0.15" r="0.9">
      <stop offset="0" stop-color="#2c1a44"/>
      <stop offset="1" stop-color="#0a0710"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>

  <line x1="0" y1="${GROUND + 8}" x2="${W}" y2="${GROUND + 8}" stroke="#2e2148" stroke-width="2"/>

  ${stickFigure(330, PLAYER, 1, "YOU")}
  ${stickFigure(W - 330, ACCENT, -1, "MOOT")}

  <text x="${W / 2}" y="${GROUND - 70}" text-anchor="middle" font-family="JetBrains Mono" font-weight="800"
    font-size="46" fill="${GOLD}" opacity="0.9">VS</text>

  ${ladderRow}

  <text x="64" y="96" font-family="JetBrains Mono" font-weight="800" font-size="62" fill="${INK}">MOOT <tspan fill="${ACCENT}">KOMBAT</tspan></text>
  <text x="64" y="134" font-family="JetBrains Mono" font-size="21" fill="${MUTED}">fight your way up a ladder of your own moots — biggest one last</text>

  <text x="${W - 64}" y="${H - 82}" text-anchor="end" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${ACCENT}">mootkombat.bisks.net</text>
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
