// Generates public/og.png — the Open Graph preview card for hivemind.
//
// Hand-draws the same bee shape public/app.js's renderBeeSvg() builds (copy,
// don't abstract — this is a one-off Node script, not shared code) at a
// fixed level/mood, plus a stat mock-up panel, as an SVG at the canonical OG
// size, then rasterises it with @resvg/resvg-js (no system Chromium/
// fontconfig on this box — the font is bundled in ./fonts and loaded
// explicitly). No emoji glyphs — resvg with loadSystemFonts:false silently
// renders emoji as a blank box (see sites/duckfile and sites/loverob's
// sidenote entries), so the bee is drawn as vector shapes, same as the live
// page.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#12100a", PANEL = "#1c1810", BORDER = "#3a3120";
const TEXT = "#f3ecd8", MUTED = "#b8ab8a", GOLD = "#f4b731", GOLD_DARK = "#c98d0f";

function beeSvg(cx, cy, size) {
  const bodyW = size * 0.92, bodyH = size * 0.68;
  const stripes = 5;
  let stripeEls = "";
  for (let i = 0; i < stripes; i++) {
    const x = -bodyW / 2 + ((i + 1) * bodyW) / (stripes + 1);
    stripeEls += `<ellipse cx="${x.toFixed(1)}" cy="0" rx="${(bodyW / (stripes * 3.2)).toFixed(1)}" ry="${(bodyH / 2 - 2).toFixed(1)}" fill="#22190a" opacity="0.85"/>`;
  }
  const eyes = `<circle cx="-16" cy="-8" r="6" fill="#22190a"/><circle cx="-14" cy="-10" r="1.6" fill="#fff"/><circle cx="16" cy="-8" r="6" fill="#22190a"/><circle cx="18" cy="-10" r="1.6" fill="#fff"/>`;
  const mouth = `<path d="M -10 10 Q 0 20 10 10" stroke="#22190a" stroke-width="2.5" fill="none" stroke-linecap="round"/>`;
  const crown = `<g transform="translate(0,-${(bodyH / 2 + 22).toFixed(1)})">
    <path d="M -16 10 L -16 -6 L -8 4 L 0 -12 L 8 4 L 16 -6 L 16 10 Z" fill="${GOLD}" stroke="${GOLD_DARK}" stroke-width="1.5"/>
    <circle cx="0" cy="-12" r="2.4" fill="#ff9d2e"/>
  </g>`;
  const wingW = size * 0.42, wingH = size * 0.5;
  const wings = `<ellipse cx="-${(bodyW * 0.28).toFixed(1)}" cy="-${(bodyH * 0.42).toFixed(1)}" rx="${wingW.toFixed(1)}" ry="${wingH.toFixed(1)}" fill="#eaf6ff" opacity="0.75" stroke="#bcdcec" stroke-width="1"/><ellipse cx="${(bodyW * 0.28).toFixed(1)}" cy="-${(bodyH * 0.42).toFixed(1)}" rx="${wingW.toFixed(1)}" ry="${wingH.toFixed(1)}" fill="#eaf6ff" opacity="0.75" stroke="#bcdcec" stroke-width="1"/>`;
  const antennae = `<path d="M -10 -${(bodyH / 2).toFixed(1)} Q -18 -${(bodyH / 2 + 22).toFixed(1)} -24 -${(bodyH / 2 + 26).toFixed(1)}" stroke="#22190a" stroke-width="2.5" fill="none" stroke-linecap="round"/><path d="M 10 -${(bodyH / 2).toFixed(1)} Q 18 -${(bodyH / 2 + 22).toFixed(1)} 24 -${(bodyH / 2 + 26).toFixed(1)}" stroke="#22190a" stroke-width="2.5" fill="none" stroke-linecap="round"/><circle cx="-24" cy="-${(bodyH / 2 + 26).toFixed(1)}" r="3" fill="#22190a"/><circle cx="24" cy="-${(bodyH / 2 + 26).toFixed(1)}" r="3" fill="#22190a"/>`;

  return `<g transform="translate(${cx},${cy})">
    <circle cx="0" cy="0" r="${(size * 0.62).toFixed(1)}" fill="none" stroke="${GOLD}" stroke-width="2" opacity="0.25"/>
    ${wings}
    ${antennae}
    <ellipse cx="0" cy="0" rx="${(bodyW / 2).toFixed(1)}" ry="${(bodyH / 2).toFixed(1)}" fill="${GOLD}" stroke="#22190a" stroke-width="2.5"/>
    ${stripeEls}
    ${eyes}
    ${mouth}
    ${crown}
  </g>`;
}

// faint honeycomb hex-grid backdrop
function honeycomb() {
  const r = 46, w = Math.sqrt(3) * r, h = 2 * r * 0.75;
  let hexes = "";
  for (let row = -1; row < H / h + 2; row++) {
    for (let col = -1; col < W / w + 2; col++) {
      const cx = col * w + (row % 2 ? w / 2 : 0);
      const cy = row * h;
      const pts = Array.from({ length: 6 }, (_, i) => {
        const a = (Math.PI / 180) * (60 * i - 30);
        return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
      }).join(" ");
      hexes += `<polygon points="${pts}" fill="none" stroke="${GOLD_DARK}" stroke-width="1" opacity="0.08"/>`;
    }
  }
  return hexes;
}

const rows = [
  ["level", "18 · scout"],
  ["words learned", "37"],
  ["problems solved", "142"],
  ["best streak", "14"],
];

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>
  ${honeycomb()}

  <text x="56" y="92" font-family="JetBrains Mono" font-weight="700" font-size="46" fill="${GOLD}">hivemind</text>
  <text x="56" y="124" font-family="JetBrains Mono" font-size="17" fill="${MUTED}">feed your bee some homework — it grows smarter the more you teach it</text>

  <rect x="56" y="168" width="480" height="380" rx="10" fill="${PANEL}" stroke="${BORDER}"/>
  <text x="80" y="204" font-family="JetBrains Mono" font-weight="700" font-size="13" fill="${GOLD}">YOUR BEE</text>
  ${rows
    .map(
      ([k, v], i) => `
    <text x="80" y="${252 + i * 44}" font-family="JetBrains Mono" font-size="15" fill="${MUTED}">${k}</text>
    <text x="512" y="${252 + i * 44}" text-anchor="end" font-family="JetBrains Mono" font-weight="700" font-size="17" fill="${TEXT}">${v}</text>`,
    )
    .join("")}
  <rect x="80" y="440" width="432" height="10" rx="5" fill="#241f14" stroke="${BORDER}"/>
  <rect x="80" y="440" width="300" height="10" rx="5" fill="${GOLD}"/>
  <text x="80" y="476" font-family="JetBrains Mono" font-size="12" fill="${MUTED}">xp to next level</text>

  <rect x="80" y="500" width="432" height="30" rx="6" fill="rgba(244,183,49,0.10)" stroke="${GOLD_DARK}"/>
  <text x="96" y="520" font-family="JetBrains Mono" font-weight="700" font-size="13" fill="${GOLD}">the whole swarm is on the leaderboard</text>

  ${beeSvg(880, 330, 210)}

  <text x="56" y="600" font-family="JetBrains Mono" font-size="16" fill="${MUTED}">math + vocabulary quizzes, a growing bee, a shared leaderboard.</text>
  <text x="${W - 56}" y="600" text-anchor="end" font-family="JetBrains Mono" font-size="16" fill="${GOLD}">hivemind.bisks.net</text>
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
