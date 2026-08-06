// Generates public/og.png — the Open Graph preview card for bouquet, so a
// shared link auto-renders a little wrapped bouquet in Bluesky / other
// unfurlers. Hand-drawn SVG at the canonical OG size, rasterised with
// @resvg/resvg-js (pure native module, no system Chromium needed — this box
// has no fontconfig/system fonts either, so the font is bundled in ./fonts
// and loaded explicitly). Same recipe as sites/didscope/og-gen.mjs.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// A generic sample bouquet (not tied to any real sent bouquet) — this is the
// static fallback card for the bare link. Per-bouquet share cards still use
// this same generic image (see notes/45-sharing-and-virality.md tier 1); the
// personalization for a real /s/<code> link is in the og:title/description
// text, stamped server-side by src/index.ts, not in the image.
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork. The flower-drawing helpers (ring/fan/shade) are a
// deliberate duplicate of the ones in public/index.html — same reasoning as
// sites/didscope's og-gen.mjs: server-side art asset generation, not a
// shared package.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#1b0f16", FG = "#fbeef2", DIM = "#c9a3b5";
const ACCENT = "#ff5c8a", ACCENT2 = "#ffd166";

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
function shade(hex, pct) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const amt = Math.round(2.55 * pct);
  r = clamp(r + amt, 0, 255); g = clamp(g + amt, 0, 255); b = clamp(b + amt, 0, 255);
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}
function ring(cx, cy, count, len, width, color, offset = 0) {
  let out = "";
  for (let i = 0; i < count; i++) {
    const a = offset + i * (360 / count);
    out += `<ellipse cx="${cx}" cy="${(cy - len / 2).toFixed(1)}" rx="${(width / 2).toFixed(1)}" ry="${(len / 2).toFixed(1)}" fill="${color}" transform="rotate(${a.toFixed(1)} ${cx} ${cy})"/>`;
  }
  return out;
}
function fan(cx, cy, angles, len, width, color) {
  return angles.map((a) => `<ellipse cx="${cx}" cy="${(cy - len / 2).toFixed(1)}" rx="${(width / 2).toFixed(1)}" ry="${(len / 2).toFixed(1)}" fill="${color}" transform="rotate(${a} ${cx} ${cy})"/>`).join("");
}
function headRose(cx, cy, c) {
  return ring(cx, cy, 8, 26, 17, c, 4) + ring(cx, cy, 6, 17, 13, shade(c, -12), 24) + ring(cx, cy, 4, 9, 8, shade(c, -24), 44) + `<circle cx="${cx}" cy="${cy}" r="3.2" fill="${shade(c, -34)}"/>`;
}
function headTulip(cx, cy, c) {
  return fan(cx, cy, [-17, 0, 17], 36, 19, c) + fan(cx, cy, [-8, 8], 26, 12, shade(c, -10));
}
function headDaisy(cx, cy, c) {
  return ring(cx, cy, 12, 26, 7.5, c) + `<circle cx="${cx}" cy="${cy}" r="7.5" fill="#ffe7a0"/>`;
}
function headSunflower(cx, cy, c) {
  return ring(cx, cy, 16, 22, 6.5, c) + `<circle cx="${cx}" cy="${cy}" r="13" fill="#5b3a1e"/>` + ring(cx, cy, 8, 5, 3, "#3d2814", 22);
}
function headBlossom(cx, cy, c) {
  return ring(cx, cy, 5, 16, 16, c) + ring(cx, cy, 6, 4, 2.6, "#d94f7a", 30) + `<circle cx="${cx}" cy="${cy}" r="3" fill="#ffe7a0"/>`;
}

// five stems fanned above a shared base, same math as renderBouquetSVG in
// public/index.html but with fixed, hand-picked flower/color choices.
const baseX = 880, baseY = 560;
const stems = [
  { angle: -46, len: 220, head: headTulip, color: "#ffb37b" },
  { angle: -22, len: 250, head: headRose, color: "#e0294f" },
  { angle: 0, len: 270, head: headDaisy, color: "#fdfaf6" },
  { angle: 22, len: 250, head: headSunflower, color: "#ffd23f" },
  { angle: 46, len: 220, head: headBlossom, color: "#ff8fc4" },
];

let stemsSvg = "";
stems.forEach((s, i) => {
  const rad = (s.angle * Math.PI) / 180;
  const hx = baseX + s.len * Math.sin(rad);
  const hy = baseY - s.len * Math.cos(rad);
  const midx = (baseX + hx) / 2 + (i % 2 === 0 ? 14 : -14);
  const midy = (baseY + hy) / 2;
  stemsSvg += `<path d="M ${baseX} ${baseY} Q ${midx.toFixed(1)} ${midy.toFixed(1)} ${hx.toFixed(1)} ${hy.toFixed(1)}" fill="none" stroke="#3f7d4c" stroke-width="6" stroke-linecap="round"/>`;
  stemsSvg += `<ellipse cx="${midx.toFixed(1)}" cy="${(midy + 8).toFixed(1)}" rx="16" ry="7" fill="#4c9a5c" transform="rotate(${(s.angle * 0.6).toFixed(1)} ${midx.toFixed(1)} ${midy.toFixed(1)})"/>`;
  stemsSvg += s.head(hx.toFixed(1), hy.toFixed(1), s.color);
});

const wrapHex = "#c9a274";
const wrapSvg = `<path d="M ${baseX - 130} 350 Q ${baseX - 190} 470 ${baseX} 585 Q ${baseX + 190} 470 ${baseX + 130} 350 Q ${baseX} 320 ${baseX - 130} 350 Z" fill="${wrapHex}" stroke="rgba(0,0,0,0.15)" stroke-width="2"/>`;
const ribbonHex = "#d4af37";
const ribbonSvg = `
  <rect x="${baseX - 60}" y="440" width="120" height="22" rx="6" fill="${ribbonHex}"/>
  <path d="M ${baseX} 451 L ${baseX - 48} 415 L ${baseX - 34} 458 Z" fill="${ribbonHex}"/>
  <path d="M ${baseX} 451 L ${baseX + 48} 415 L ${baseX + 34} 458 Z" fill="${ribbonHex}"/>
  <circle cx="${baseX}" cy="451" r="10" fill="${shade(ribbonHex, -15)}"/>
`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="15%" cy="-10%" r="60%">
      <stop offset="0" stop-color="#4a1f36"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="95%" cy="0%" r="55%">
      <stop offset="0" stop-color="#2a1f4a"/>
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

  <text x="64" y="150" font-family="JetBrains Mono" font-weight="800" font-size="60" fill="url(#title)">bouquet</text>
  <text x="64" y="212" font-family="JetBrains Mono" font-size="24" fill="${FG}">send someone flowers,</text>
  <text x="64" y="248" font-family="JetBrains Mono" font-size="24" fill="${FG}">with a secret tucked inside</text>

  <text x="64" y="320" font-family="JetBrains Mono" font-size="17" fill="${DIM}">Build a bunch, hide a note in it,</text>
  <text x="64" y="346" font-family="JetBrains Mono" font-size="17" fill="${DIM}">send the link to a friend</text>
  <text x="64" y="372" font-family="JetBrains Mono" font-size="17" fill="${DIM}">or a secret crush.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT2}">bouquet.bisks.net</text>

  ${stemsSvg}
  ${wrapSvg}
  ${ribbonSvg}
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
