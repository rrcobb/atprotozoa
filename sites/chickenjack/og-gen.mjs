// Generates public/og.png — the Open Graph preview card for chickenjack, so
// a shared link auto-renders a picture of the table in Bluesky / other
// unfurlers.
//
// Hand-drawn SVG at the canonical OG size: wordmark + pitch on the left, a
// felt-green table snippet on the right with a sample dealer/player hand
// (placeholder cards, not a real live hand — the real table is rendered
// live, client-side, in public/index.html). Rasterised with @resvg/resvg-js
// (pure native module, no system Chromium/fontconfig needed — the font is
// bundled in ./fonts and loaded explicitly).
//
//   node og-gen.mjs   # writes ./public/og.png
//
// Gotcha learned from sites/grindset (see sites/sidenote diary,
// 2026-08-05): resvg-js renders emoji as tofu boxes when the bundled font
// has no emoji glyphs and loadSystemFonts is false — the SVG parses fine, no
// error, it just silently draws empty boxes. Suit symbols (♠♥♦♣) hit the
// same problem (JetBrains Mono has no guarantee of covering them), so suits
// here are drawn as vector shapes, never as text glyphs. Card ranks are
// plain ASCII (A/K/Q/J/10/digits), which the font does cover.
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork. Adapted from sites/guestbet/og-gen.mjs.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#0a0e14", INK = "#eef2f7", MUTED = "#8b98a8";
const ACCENT = "#4da3ff", GOLD = "#ffd166", GOOD = "#59d38c", BAD = "#ff9a8c";
const FELT = "#0f3d2c", FELT_LINE = "rgba(255,255,255,0.16)";

// A vector suit glyph, small and centered at (x, y) — no font dependency.
function suitGlyph(kind, x, y, size, color) {
  const s = size;
  if (kind === "spade") {
    return `<path d="M ${x} ${y - s} C ${x + s} ${y - s * 0.2}, ${x + s} ${y + s * 0.5}, ${x} ${y + s * 0.35}
      C ${x - s} ${y + s * 0.5}, ${x - s} ${y - s * 0.2}, ${x} ${y - s} Z
      M ${x} ${y + s * 0.3} L ${x - s * 0.15} ${y + s * 0.9} L ${x + s * 0.15} ${y + s * 0.9} Z" fill="${color}"/>`;
  }
  if (kind === "heart") {
    return `<path d="M ${x} ${y + s * 0.8} C ${x - s * 1.1} ${y - s * 0.1}, ${x - s * 0.5} ${y - s}, ${x} ${y - s * 0.35}
      C ${x + s * 0.5} ${y - s}, ${x + s * 1.1} ${y - s * 0.1}, ${x} ${y + s * 0.8} Z" fill="${color}"/>`;
  }
  if (kind === "diamond") {
    return `<path d="M ${x} ${y - s} L ${x + s * 0.75} ${y} L ${x} ${y + s} L ${x - s * 0.75} ${y} Z" fill="${color}"/>`;
  }
  // club
  return `<path d="M ${x} ${y - s * 0.2} m -${s * 0.42} 0 a ${s * 0.42} ${s * 0.42} 0 1 0 ${s * 0.84} 0 a ${s * 0.42} ${s * 0.42} 0 1 0 -${s * 0.84} 0
    M ${x - s * 0.4} ${y + s * 0.35} m -${s * 0.42} 0 a ${s * 0.42} ${s * 0.42} 0 1 0 ${s * 0.84} 0 a ${s * 0.42} ${s * 0.42} 0 1 0 -${s * 0.84} 0
    M ${x + s * 0.4} ${y + s * 0.35} m -${s * 0.42} 0 a ${s * 0.42} ${s * 0.42} 0 1 0 ${s * 0.84} 0 a ${s * 0.42} ${s * 0.42} 0 1 0 -${s * 0.84} 0
    M ${x} ${y + s * 0.15} L ${x - s * 0.14} ${y + s * 1.05} L ${x + s * 0.14} ${y + s * 1.05} Z" fill="${color}"/>`;
}

function playingCard(x, y, rank, suit, faceDown) {
  const cw = 96, ch = 132;
  if (faceDown) {
    return `<rect x="${x}" y="${y}" width="${cw}" height="${ch}" rx="10" fill="#16496f" stroke="${FELT_LINE}" stroke-width="1.5"/>
      <rect x="${x + 10}" y="${y + 10}" width="${cw - 20}" height="${ch - 20}" rx="6" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="1.5"/>`;
  }
  const red = suit === "heart" || suit === "diamond";
  const ink = red ? BAD : "#171717";
  return `
    <rect x="${x}" y="${y}" width="${cw}" height="${ch}" rx="10" fill="#ffffff" stroke="rgba(0,0,0,0.15)" stroke-width="1.5"/>
    <text x="${x + 14}" y="${y + 34}" font-family="JetBrains Mono" font-weight="800" font-size="26" fill="${ink}">${rank}</text>
    ${suitGlyph(suit, x + 24, y + 56, 12, ink)}
    <text x="${x + cw - 14}" y="${y + ch - 16}" text-anchor="end" font-family="JetBrains Mono" font-weight="800" font-size="26" fill="${ink}">${rank}</text>
    ${suitGlyph(suit, x + cw - 24, y + ch - 40, 12, ink)}
  `;
}

const tableX = 616, tableY = 96, tableW = 520, tableH = 440;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="10%" cy="0%" r="60%">
      <stop offset="0" stop-color="#12304f"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>

  <text x="64" y="180" font-family="JetBrains Mono" font-weight="800" font-size="58" fill="${INK}">chicken<tspan fill="${GOLD}">jack</tspan></text>
  <text x="64" y="222" font-family="JetBrains Mono" font-size="20" fill="${MUTED}">massively multiplayer blackjack</text>

  <text x="64" y="292" font-family="JetBrains Mono" font-size="18" fill="${MUTED}">A fresh hand deals every minute, on the</text>
  <text x="64" y="320" font-family="JetBrains Mono" font-size="18" fill="${MUTED}">minute, UTC. Jump in, get cards, bet</text>
  <text x="64" y="348" font-family="JetBrains Mono" font-size="18" fill="${MUTED}">chips, hit or stand, stack up winnings.</text>

  <rect x="64" y="392" width="330" height="1" fill="${FELT_LINE}"/>
  <text x="64" y="432" font-family="JetBrains Mono" font-weight="700" font-size="17" fill="${GOOD}">top chicken leaderboard</text>
  <text x="64" y="460" font-family="JetBrains Mono" font-size="16" fill="${MUTED}">whoever's up the most chips wins the crown</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT}">chickenjack.bisks.net</text>

  <rect x="${tableX}" y="${tableY}" width="${tableW}" height="${tableH}" rx="22" fill="${FELT}" stroke="${FELT_LINE}" stroke-width="1.5"/>
  <text x="${tableX + tableW / 2}" y="${tableY + 40}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="13" letter-spacing="2" fill="rgba(238,247,241,0.6)">DEALER</text>
  ${playingCard(tableX + tableW / 2 - 108, tableY + 56, "K", "spade", false)}
  ${playingCard(tableX + tableW / 2 + 6, tableY + 56, "", "", true)}
  <text x="${tableX + tableW / 2}" y="${tableY + 232}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="13" letter-spacing="2" fill="rgba(238,247,241,0.6)">YOUR HAND</text>
  ${playingCard(tableX + tableW / 2 - 108, tableY + 248, "A", "heart", false)}
  ${playingCard(tableX + tableW / 2 + 6, tableY + 248, "10", "club", false)}
  <text x="${tableX + tableW / 2}" y="${tableY + tableH - 32}" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="20" fill="${GOOD}">blackjack! 3:2</text>
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
