// Generates public/og.png — the Open Graph preview card for highlight-reel.
// A dark filmstrip with a few sprocket-holed frames, echoing the scrolling
// reel of past sites the page itself renders. Rasterised with @resvg/resvg-js
// (pure native module, no system Chromium needed).
//
//   node og-gen.mjs   # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork. Adapted from sites/droste/og-gen.mjs.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#0d0a06", CARD = "#17130c", INK = "#e8dcc8", MUTED = "#9c8f78", ACCENT = "#c8922e";

// A row of filmstrip frames across the middle, each a plain rect with a
// hairline border, evoking the horizontally-scrolling reel on the page.
const frameY = 260, frameH = 200, frameW = 150, gap = 14;
let frames = "";
let fx = 90;
for (let i = 0; i < 7; i++) {
  const dim = i % 3 === 1;
  frames += `<rect x="${fx}" y="${frameY}" width="${frameW}" height="${frameH}" fill="${CARD}" stroke="#000" stroke-width="2" opacity="${dim ? 0.55 : 0.9}"/>\n  `;
  fx += frameW + gap;
}

function sprockets(y) {
  let holes = "";
  for (let x = 20; x < W - 20; x += 26) {
    holes += `<circle cx="${x}" cy="${y}" r="4" fill="${BG}"/>\n    `;
  }
  return `<rect x="0" y="${y - 7}" width="${W}" height="14" fill="#000"/>\n    ${holes}`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>

  <text x="72" y="120" font-family="JetBrains Mono" font-weight="800" font-size="88" fill="#f2e9d8">the reel</text>
  <text x="75" y="168" font-family="JetBrains Mono" font-size="24" fill="${MUTED}">everything @buildthis has built so far</text>

  ${sprockets(frameY - 20)}
  ${frames}
  ${sprockets(frameY + frameH + 20)}

  <text x="75" y="${frameY + frameH + 78}" font-family="JetBrains Mono" font-size="26" fill="${ACCENT}" font-weight="700">133 sites · 48 people · 5 days</text>
  <text x="75" y="${frameY + frameH + 112}" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${INK}">bisks.net/highlight-reel</text>
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
