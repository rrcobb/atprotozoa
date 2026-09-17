// Generates public/og.png — the Open Graph preview card for duckpond, so a
// shared link auto-renders a picture of the game in Bluesky / other
// unfurlers.
//
// Hand-draws a representative "screenshot" of the pond scene as SVG (mama
// duck leading a line of avatar-headed ducklings, one straying toward the
// woods) at the canonical OG size, then rasterises it with resvg-js.
//
//   node og-gen.mjs        # writes ./public/og.png
//
// No live data, no network — deterministic so the card is stable across
// builds. Style and rasterise approach copied from innercircle/og-gen.mjs
// (copy, don't abstract).

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const W = 1200, H = 630;
const INK = "#16221a", MUTED = "#5f6b61", ACCENT = "#1a7a4c", GOLD = "#e08a1e";

let seed = 7331;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

const TINTS = ["#1a5fd0", "#1f8a4c", "#d81e6a", "#e0a400", "#8e44ad", "#c0392b"];
const SYL = ["mo", "ri", "no", "ce", "ab", "gr", "mi", "bo", "th", "el"];

function duck(x, y, r, bodyColor, tint, letter, facing = 0) {
  const bx = x + Math.cos(facing) * r * 0.55;
  const by = y + Math.sin(facing) * r * 0.1;
  return `
    <g>
      <ellipse cx="${x - r * 0.15}" cy="${y + r * 0.55}" rx="${r * 1.05}" ry="${r * 0.62}" fill="${bodyColor}"/>
      <polygon points="${x + r * 0.55},${y + r * 0.1} ${x + r * 1.15},${y} ${x + r * 0.55},${y - r * 0.28}" fill="${GOLD}"/>
      <circle cx="${x}" cy="${y}" r="${r * 0.72}" fill="${tint}"/>
      <text x="${x}" y="${y + r * 0.26}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700"
        font-size="${(r * 0.7).toFixed(1)}" fill="rgba(255,255,255,.92)">${letter}</text>
    </g>`;
}

// pond + woods background
let bg = `
  <rect width="${W}" height="${H}" fill="#eaf6e0"/>
  <ellipse cx="${W * 0.32}" cy="${H * 0.72}" rx="280" ry="150" fill="#7fb6d6"/>`;
for (let i = 0; i < 6; i++) {
  const tx = W - 90 - (i % 3) * 60;
  const ty = 60 + Math.floor(i / 3) * 260 + ((i * 41) % 40);
  bg += `<rect x="${tx - 4}" y="${ty + 18}" width="8" height="26" fill="#3a2a18"/>
    <circle cx="${tx}" cy="${ty}" r="34" fill="${i % 2 ? "#1f4d24" : "#255c2a"}"/>`;
}
bg += `<rect x="${W - 190}" y="0" width="190" height="${H}" fill="rgba(10,25,12,0.18)"/>
  <text x="${W - 50}" y="40" text-anchor="end" font-family="JetBrains Mono" font-size="15" fill="rgba(255,255,255,.85)">the woods</text>`;

// line of ducklings trailing mama, plus one stray peeling toward the woods
let line = "";
const lineCount = 6;
for (let i = lineCount; i >= 1; i--) {
  const x = 260 - i * 62;
  const y = 300 + Math.sin(i * 0.9) * 22;
  line += duck(x, y, 30, "#fff4cf", TINTS[i % TINTS.length], SYL[i % SYL.length].toUpperCase());
}
line += duck(260, 300, 40, "#ffffff", TINTS[0], "MA", 0.3); // mama, out front

const strayX = 760, strayY = 210;
const escortX = strayX + (W - 220 - strayX) * 0.4, escortY = strayY + 30;
const stray = `
  ${duck(escortX, escortY, 38, "#2a2f2a", "#2a2f2a", "", 0)}
  <circle cx="${escortX + 12}" cy="${escortY - 8}" r="2" fill="#ff5252"/>
  ${duck(strayX, strayY, 30, "#e9d17a", TINTS[3], SYL[7].toUpperCase(), -0.4)}
  <circle cx="${strayX}" cy="${strayY}" r="32" fill="none" stroke="${"#8a3b23"}" stroke-width="3"/>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  ${bg}
  ${line}
  ${stray}

  <rect x="0" y="0" width="520" height="150" fill="rgba(255,255,255,0.82)"/>
  <text x="40" y="60" font-family="JetBrains Mono" font-weight="800" font-size="46" fill="${INK}">duckpond</text>
  <text x="40" y="96" font-family="JetBrains Mono" font-size="19" fill="${MUTED}">keep your moots in a line</text>
  <text x="40" y="126" font-family="JetBrains Mono" font-size="16" fill="${MUTED}">honk before the woods get one</text>

  <text x="64" y="${H - 34}" font-family="JetBrains Mono" font-size="16" fill="${MUTED}">a handle's real mutuals, herded around a pond</text>
  <text x="${W - 64}" y="${H - 34}" text-anchor="end" font-family="JetBrains Mono" font-size="16" fill="${ACCENT}">duckpond.bisks.net</text>
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
