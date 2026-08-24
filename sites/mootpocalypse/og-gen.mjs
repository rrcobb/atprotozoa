// Generates public/og.png — the static Open Graph preview card for
// mootpocalypse.bisks.net. Hand-drawn SVG, rasterised with @resvg/resvg-js.
// Borrows resvg + JetBrains Mono from sites/skyclone (build-time only, not a
// runtime dependency here) — same recipe as sites/quadsunset/og-gen.mjs.
//
//   node og-gen.mjs   # writes ./public/og.png

import { Resvg } from "../skyclone/node_modules/@resvg/resvg-js/index.js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const fontPath = fileURLToPath(new URL("../skyclone/fonts/JetBrainsMono.ttf", import.meta.url));

const W = 1200, H = 630;

function hashInt(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}
function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}
const rnd = seeded(hashInt("mootpocalypse-og"));

const zombies = Array.from({ length: 6 }, (_, i) => {
  const x = 140 + i * 165 + rnd() * 30;
  const y = 420 + rnd() * 120;
  const hue = Math.floor(rnd() * 360);
  return { x, y, hue };
})
  .map(
    (z) => `
  <g>
    <circle cx="${z.x}" cy="${z.y}" r="46" fill="hsl(${z.hue} 40% 30%)" />
    <circle cx="${z.x}" cy="${z.y}" r="46" fill="#3a5a2a" opacity="0.35" />
    <circle cx="${z.x}" cy="${z.y}" r="47" fill="none" stroke="#6f8a4a" stroke-width="3" />
  </g>`
  )
  .join("");

const rubble = Array.from({ length: 18 }, () => {
  const x = rnd() * W, y = rnd() * H, w = 30 + rnd() * 80, h = 20 + rnd() * 50;
  return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="rgba(60,70,45,0.28)" />`;
}).join("");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0f150b" />
      <stop offset="60%" stop-color="#1a2413" />
      <stop offset="100%" stop-color="#233018" />
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)" />
  ${rubble}
  <rect x="0" y="0" width="${W}" height="${H}" fill="none" stroke="rgba(216,74,74,0.25)" stroke-width="10" />
  ${zombies}
  <circle cx="960" cy="500" r="58" fill="#4a3a2a" />
  <circle cx="960" cy="500" r="58" fill="none" stroke="#eafcd8" stroke-width="4" />
  <text x="960" y="512" font-family="JetBrains Mono" font-size="46" text-anchor="middle" fill="#eafcd8">?</text>

  <text x="70" y="180" font-family="JetBrains Mono" font-weight="700" font-style="italic" font-size="72" fill="#eafcd8">mootpocalypse</text>
  <text x="70" y="228" font-family="JetBrains Mono" font-size="26" fill="#9fe08a">every zombie is a real unliked Bluesky post from a moot</text>
  <text x="70" y="270" font-family="JetBrains Mono" font-size="22" fill="#c4d3b8">like it for real to put it down &#8212; mootpocalypse.bisks.net</text>
</svg>`;

const resvg = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
});
const png = resvg.render().asPng();
const out = fileURLToPath(new URL("./public/og.png", import.meta.url));
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");
