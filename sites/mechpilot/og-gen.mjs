// Generates public/og.png — the Open Graph preview card for mechpilot, so a
// shared link auto-renders a picture of a sample mech-pilot card in Bluesky /
// other unfurlers. Hand-drawn SVG at the canonical OG size, rasterised with
// @resvg/resvg-js (pure native module, no system Chromium needed — this box
// has no fontconfig/system fonts either, so the font is bundled in ./fonts
// and loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// A generic sample card (not tied to any real handle) — mirrors the VANGUARD
// class from public/index.html's drawMech, at a smaller scale, as a static
// fallback for the bare link. Real per-handle cards are drawn live,
// client-side, on the canvas (buildShareCard's cousin, drawCard).
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#070a10", FG = "#e8f1fb", DIM = "#9fb2c8";
const ACCENT = "#ffb238", ACCENT2 = "#4ce0ff";
const HULL = "#8a2f2f", PANEL = "#3a1414";
const CARD = "#111823", BORDER = "#263243";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ---- sample mech (VANGUARD), scaled down to fit the OG card's art viewport ---
const cardX = 660, cardY = 50, cardW = 490, cardH = 530;
const vpY = cardY + 88, vpH = cardH - 88 - 190; // must match the art-viewport rect drawn below
const s = 0.42; // scale factor vs. the full-size canvas drawMech proportions — small
                // enough that the head/antenna clear the top of the art viewport
const groundX = cardX + cardW / 2;
const groundY = vpY + vpH - 16;
const stanceGap = 45 * s;

function poly(pts) {
  return `<polygon points="${pts.map((p) => p.join(",")).join(" ")}" />`;
}

let mech = "";
// ground glow
mech += `<ellipse cx="${groundX}" cy="${groundY}" rx="${130 * s}" ry="${22 * s}" fill="${ACCENT2}" opacity="0.25"/>`;
// legs
for (const side of [-1, 1]) {
  const fx = groundX + side * stanceGap;
  mech += `<rect x="${fx - 20 * s}" y="${groundY - 26 * s}" width="${40 * s}" height="${26 * s}" rx="4" fill="${PANEL}"/>`;
  mech += `<polygon points="${fx - 22 * s},${groundY - 26 * s} ${fx + 22 * s},${groundY - 26 * s} ${fx + 16 * s},${groundY - 230 * s} ${fx - 16 * s},${groundY - 230 * s}" fill="${HULL}"/>`;
  mech += `<circle cx="${fx}" cy="${groundY - 130 * s}" r="${13 * s}" fill="${PANEL}"/>`;
}
// hips
mech += `<rect x="${groundX - 70 * s}" y="${groundY - 265 * s}" width="${140 * s}" height="${38 * s}" rx="6" fill="${PANEL}"/>`;
// torso
const tTop = groundY - 425 * s, tBot = groundY - 258 * s;
mech += poly([
  [groundX - 80 * s, tTop + 25 * s], [groundX + 80 * s, tTop + 25 * s],
  [groundX + 95 * s, tBot], [groundX - 95 * s, tBot],
]).replace("/>", ` fill="${HULL}" stroke="${PANEL}" stroke-width="2"/>`);
// core light
mech += `<circle cx="${groundX}" cy="${tTop + 95 * s}" r="${16 * s}" fill="${ACCENT2}"/>`;
// shoulders + arms + blade (right side only, VANGUARD)
const shoulderY = tTop + 30 * s;
for (const side of [-1, 1]) {
  const sx = groundX + side * 105 * s;
  if (side === 1) {
    mech += poly([[sx - 26 * s, shoulderY - 28 * s], [sx + 40 * s, shoulderY - 44 * s], [sx + 46 * s, shoulderY + 10 * s], [sx - 26 * s, shoulderY + 26 * s]]).replace("/>", ` fill="${PANEL}"/>`);
  } else {
    mech += `<circle cx="${sx}" cy="${shoulderY}" r="${26 * s}" fill="${PANEL}"/>`;
  }
  const handX = sx + side * 18 * s, handY = shoulderY + 130 * s;
  mech += poly([[sx - 16 * s, shoulderY], [sx + 16 * s, shoulderY], [handX + 14 * s, handY], [handX - 14 * s, handY]]).replace("/>", ` fill="${HULL}"/>`);
  mech += `<circle cx="${handX}" cy="${handY}" r="${14 * s}" fill="${PANEL}"/>`;
  if (side === 1) {
    mech += poly([[handX - 6 * s, handY - 10 * s], [handX + 14 * s, handY - 130 * s], [handX + 22 * s, handY - 130 * s], [handX + 10 * s, handY - 6 * s]]).replace("/>", ` fill="${ACCENT}"/>`);
  }
}
// head + visor
const headCX = groundX, headCY = tTop - 20 * s, headR = 54 * s;
mech += `<circle cx="${headCX}" cy="${headCY}" r="${headR}" fill="${PANEL}" stroke="${HULL}" stroke-width="4"/>`;
const visorW = 82 * s, visorH = 40 * s, visorX = headCX - visorW / 2, visorY = headCY - visorH / 2 + 3 * s;
mech += `<rect x="${visorX}" y="${visorY}" width="${visorW}" height="${visorH}" rx="8" fill="#0b0f14" stroke="${ACCENT2}" stroke-width="2"/>`;
mech += `<text x="${headCX}" y="${visorY + visorH / 2 + 6}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="${16 * s + 6}" fill="${ACCENT2}">M</text>`;
// antenna
mech += `<line x1="${headCX}" y1="${headCY - headR + 4}" x2="${headCX}" y2="${headCY - headR - 16}" stroke="${PANEL}" stroke-width="2"/>`;
mech += `<circle cx="${headCX}" cy="${headCY - headR - 16}" r="3" fill="${ACCENT}"/>`;

// ---- sample stat bars -------------------------------------------------------
const stats = [
  ["ARM", 62, "#7cc2ff"],
  ["SPD", 71, "#7cff9f"],
  ["FIRE", 54, "#ff8a6e"],
  ["SYNC", 45, "#e08aff"],
];
let statsSvg = "";
let sy = cardY + cardH - 168;
const barX0 = cardX + 40, barW = cardW - 80 - 62 - 40;
for (const [label, value, color] of stats) {
  statsSvg += `<text x="${cardX + 40}" y="${sy + 15}" font-family="JetBrains Mono" font-weight="700" font-size="15" fill="${DIM}">${label}</text>`;
  statsSvg += `<rect x="${cardX + 102}" y="${sy}" width="${barW}" height="18" rx="5" fill="#1a2230"/>`;
  statsSvg += `<rect x="${cardX + 102}" y="${sy}" width="${(barW * value) / 99}" height="18" rx="5" fill="${color}"/>`;
  statsSvg += `<text x="${cardX + cardW - 40}" y="${sy + 15}" text-anchor="end" font-family="JetBrains Mono" font-weight="700" font-size="15" fill="${FG}">${value}</text>`;
  sy += 36;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="15%" cy="-10%" r="60%">
      <stop offset="0" stop-color="#16324a"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="95%" cy="0%" r="55%">
      <stop offset="0" stop-color="#3a2a12"/>
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

  <!-- left: wordmark + pitch -->
  <text x="64" y="150" font-family="JetBrains Mono" font-weight="800" font-size="66" fill="url(#title)">mechpilot</text>
  <text x="64" y="200" font-family="JetBrains Mono" font-size="21" fill="${DIM}">your handle, piloting</text>
  <text x="64" y="228" font-family="JetBrains Mono" font-size="21" fill="${DIM}">a <tspan fill="${ACCENT2}">mech</tspan></text>

  <text x="64" y="300" font-family="JetBrains Mono" font-size="17" fill="${DIM}">Enter a Bluesky handle. Get a real</text>
  <text x="64" y="326" font-family="JetBrains Mono" font-size="17" fill="${DIM}">mech-pilot card: callsign, class,</text>
  <text x="64" y="352" font-family="JetBrains Mono" font-size="17" fill="${DIM}">and stats built from the account —</text>
  <text x="64" y="378" font-family="JetBrains Mono" font-size="17" fill="${DIM}">followers, posts, sortie tempo.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT2}">mechpilot.bisks.net</text>

  <!-- right: sample card -->
  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="18" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>
  <text x="${cardX + cardW / 2}" y="${cardY + 46}" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="26" fill="${FG}">IRON WOLF</text>
  <text x="${cardX + cardW / 2}" y="${cardY + 70}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="14" fill="${ACCENT}">VANGUARD · arc blade</text>
  <rect x="${cardX + 24}" y="${vpY}" width="${cardW - 48}" height="${vpH}" rx="10" fill="#080b11"/>
  ${mech}
  ${statsSvg}
  <text x="${cardX + 40}" y="${cardY + cardH - 20}" font-family="JetBrains Mono" font-weight="700" font-size="15" fill="${DIM}">@yourhandle.bsky.social</text>
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
