// Generates public/og.png — the static Open Graph preview card for
// quadsunset.bisks.net. Hand-drawn SVG (a snapshot of the live scene's look:
// twilight sky, sea reflections, two close warm suns + two smaller cool
// ones), rasterised with @resvg/resvg-js. Borrows resvg + JetBrains Mono
// from sites/skyclone (build-time only, not a runtime dependency here) —
// same recipe as sites/rural-solar/og-gen.mjs.
//
//   node og-gen.mjs   # writes ./public/og.png

import { Resvg } from "../skyclone/node_modules/@resvg/resvg-js/index.js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const fontPath = fileURLToPath(new URL("../skyclone/fonts/JetBrainsMono.ttf", import.meta.url));

const W = 1200, H = 630;
const HORIZON = H * 0.62;

function sunGroup(cx, cy, r, core, mid, edge, glow) {
  return `
  <g>
    <circle cx="${cx}" cy="${cy}" r="${r * 5}" fill="url(#glow-${cx}-${cy})" />
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#disk-${cx}-${cy})" />
  </g>
  <radialGradient id="glow-${cx}-${cy}" cx="50%" cy="50%" r="50%">
    <stop offset="0%" stop-color="${glow}" stop-opacity="0.55" />
    <stop offset="45%" stop-color="${glow}" stop-opacity="0.15" />
    <stop offset="100%" stop-color="${glow}" stop-opacity="0" />
  </radialGradient>
  <radialGradient id="disk-${cx}-${cy}" cx="38%" cy="35%" r="65%">
    <stop offset="0%" stop-color="${core}" />
    <stop offset="60%" stop-color="${mid}" />
    <stop offset="100%" stop-color="${edge}" />
  </radialGradient>`;
}

function hillPath() {
  let d = `M0 ${H}`;
  const steps = 48;
  for (let i = 0; i <= steps; i++) {
    const xf = i / steps;
    const x = xf * 2000;
    const y = HORIZON - (10 * Math.sin(x * 0.0031 + 1.4) + 6 * Math.sin(x * 0.0071 + 3.1) + 3 * Math.sin(x * 0.017 + 0.6)) * (H / 900);
    d += ` L${(xf * W).toFixed(1)} ${y.toFixed(1)}`;
  }
  d += ` L${W} ${H} Z`;
  return d;
}

function reflection(cx, glow, alpha) {
  let rects = "";
  for (let ry = HORIZON; ry < H; ry += 6) {
    const t = (ry - HORIZON) / (H - HORIZON);
    const a = (alpha * (1 - t * 0.85)).toFixed(3);
    const rw = 46 * (1 - t * 0.3);
    rects += `<rect x="${(cx - rw / 2).toFixed(1)}" y="${ry}" width="${rw.toFixed(1)}" height="3" fill="${glow}" opacity="${a}" />`;
  }
  return rects;
}

const stars = Array.from({ length: 90 }, () => ({
  x: Math.random() * W,
  y: Math.random() * HORIZON * 0.85,
  r: Math.random() * 1.1 + 0.3,
  o: (Math.random() * 0.5 + 0.35).toFixed(2),
})).map((s) => `<circle cx="${s.x.toFixed(1)}" cy="${s.y.toFixed(1)}" r="${s.r.toFixed(2)}" fill="#f5f2ff" opacity="${s.o}" />`).join("");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0b0c22" />
      <stop offset="55%" stop-color="#241b3f" />
      <stop offset="100%" stop-color="#ff9a5c" />
    </linearGradient>
    <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#241733" />
      <stop offset="100%" stop-color="#050512" />
    </linearGradient>
  </defs>

  <rect width="${W}" height="${HORIZON}" fill="url(#sky)" />
  ${stars}
  <rect y="${HORIZON}" width="${W}" height="${H - HORIZON}" fill="url(#sea)" />

  ${reflection(430, "#ffb15c", 0.4)}
  ${reflection(470, "#ff8b52", 0.3)}

  ${sunGroup(900, 190, 15, "#eaf3ff", "#9fc3ff", "#5f86c9", "#9fc3ff")}
  ${sunGroup(940, 215, 11, "#dbeaff", "#7fa8f2", "#4a6cc4", "#7fa8f2")}
  ${sunGroup(430, 330, 34, "#fff3d6", "#ffb15c", "#c9601f", "#ffb15c")}
  ${sunGroup(470, 350, 25, "#ffe2b0", "#ff8b52", "#a83318", "#ff8b52")}

  <path d="${hillPath()}" fill="#02030a" />
  <path d="${hillPath()}" fill="none" stroke="#ffcf9a" stroke-opacity="0.35" stroke-width="1.5" />

  <rect x="0" y="${H - 118}" width="${W}" height="118" fill="rgba(5,5,12,0.55)" />
  <text x="60" y="${H - 68}" font-family="JetBrains Mono" font-weight="700" font-size="46" fill="#ffe4ad">quadsunset</text>
  <text x="60" y="${H - 32}" font-family="JetBrains Mono" font-size="19" fill="#ded3bd">sunset(s) from a planet in a real four-star system — quadsunset.bisks.net</text>
</svg>`;

const resvg = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
});
const png = resvg.render().asPng();
const out = fileURLToPath(new URL("./public/og.png", import.meta.url));
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");
