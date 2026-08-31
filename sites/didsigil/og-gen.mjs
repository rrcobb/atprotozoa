// Generates public/og.png — the generic (not per-handle; this is a
// client-only site, no server render) Open Graph preview card, a static
// kaleidoscope built with the same rotate+mirror recipe as public/lib/sigil.js
// but re-expressed in SVG since resvg has no <canvas>. Seeded fixed, not tied
// to any real DID — just a good-looking example sigil.
//
// Rasterised with @resvg/resvg-js (pure native module, no system
// Chromium/fontconfig needed — the font is bundled in ./fonts and loaded
// explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Adapted from
// sites/lavalamp/og-gen.mjs.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

// tiny seeded RNG so the layout is identical every run
let seed = 1337;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

const cx = 330, cy = 315, radius = 250;
const segments = 9, rings = 4, shapesPerRing = 3;
const hueBase = 262, hueSpread = 90;

function petalPoints(size) {
  // matches sigil.js's quadratic petal, flattened to a polygon for SVG
  const pts = [];
  const steps = 8;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const y = -size + t * 2 * size;
    const x = size * 0.6 * Math.sin(t * Math.PI);
    pts.push([x, y]);
  }
  return pts;
}

let shapesSvg = "";
const shapes = [];
const count = rings * shapesPerRing;
for (let i = 0; i < count; i++) {
  const ring = Math.floor(i / shapesPerRing);
  const rInner = (ring / rings) * radius * 0.94;
  const rOuter = ((ring + 1) / rings) * radius * 0.94;
  shapes.push({
    angle: rnd() * (((Math.PI * 2) / segments) / 2) * 0.9,
    rad: rInner + rnd() * (rOuter - rInner),
    size: (radius * 0.94 / rings) * (0.32 + rnd() * 0.5),
    hue: (hueBase + (rnd() - 0.5) * hueSpread + 360) % 360,
    light: 55 + rnd() * 25,
    sat: 65 + rnd() * 25,
    alpha: (0.6 + rnd() * 0.35).toFixed(2),
    kind: Math.floor(rnd() * 3),
    jitter: (rnd() - 0.5) * 0.5,
  });
}

function drawAt(angle, sh) {
  const x = cx + sh.rad * Math.cos(angle);
  const y = cy + sh.rad * Math.sin(angle);
  const rotDeg = ((angle + sh.jitter) * 180) / Math.PI;
  // resvg silently drops 4-arg hsla(...) fills to black — use hsl() plus a
  // separate fill-opacity/stroke-opacity attribute instead.
  // resvg's hsl() parser silently drops to black on a fractional hue degree
  // (e.g. "291.1") — integer degrees only.
  const color = `hsl(${Math.round(sh.hue)}, ${sh.sat.toFixed(0)}%, ${sh.light.toFixed(0)}%)`;
  if (sh.kind === 0) {
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(sh.size * 0.5).toFixed(1)}" fill="${color}" fill-opacity="${sh.alpha}"/>`;
  } else if (sh.kind === 1) {
    const pts = petalPoints(sh.size).map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(" ");
    return `<polygon points="${pts}" fill="${color}" fill-opacity="${sh.alpha}" transform="translate(${x.toFixed(1)},${y.toFixed(1)}) rotate(${rotDeg.toFixed(1)})"/>`;
  }
  return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(sh.size * 0.5).toFixed(1)}" fill="none" stroke="${color}" stroke-opacity="${sh.alpha}" stroke-width="${Math.max(1.5, sh.size * 0.15).toFixed(1)}"/>`;
}

for (let seg = 0; seg < segments; seg++) {
  const a0 = seg * ((Math.PI * 2) / segments);
  for (const sh of shapes) {
    shapesSvg += drawAt(a0 + sh.angle, sh);
    shapesSvg += drawAt(a0 - sh.angle, sh);
  }
}

const bgHue = (hueBase + 180) % 360;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="panelbg" cx="50%" cy="50%" r="70%">
      <stop offset="0" stop-color="hsl(${bgHue}, 40%, 11%)"/>
      <stop offset="1" stop-color="hsl(${bgHue}, 55%, 4%)"/>
    </radialGradient>
    <radialGradient id="backglow" cx="78%" cy="10%" r="60%">
      <stop offset="0" stop-color="#2a1240"/>
      <stop offset="1" stop-color="#08070c" stop-opacity="0"/>
    </radialGradient>
    <clipPath id="circleclip">
      <circle cx="${cx}" cy="${cy}" r="${radius}"/>
    </clipPath>
  </defs>

  <rect width="${W}" height="${H}" fill="#08070c"/>
  <rect width="${W}" height="${H}" fill="url(#backglow)"/>

  <g clip-path="url(#circleclip)">
    <circle cx="${cx}" cy="${cy}" r="${radius}" fill="url(#panelbg)"/>
    ${shapesSvg}
    <circle cx="${cx}" cy="${cy}" r="${(radius * 0.94 * 0.045).toFixed(1)}" fill="hsl(${hueBase}, 70%, 80%)" fill-opacity="0.9"/>
  </g>
  <circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="hsl(${hueBase}, 60%, 70%)" stroke-opacity="0.4" stroke-width="3"/>

  <text x="640" y="220" font-family="JetBrains Mono" font-weight="800" font-size="72" fill="#f1eef8">didsigil</text>
  <text x="640" y="266" font-family="JetBrains Mono" font-size="23" fill="#a49bc0">your identity, rendered as a sigil</text>

  <text x="640" y="336" font-family="JetBrains Mono" font-size="21" fill="#ff9ecf">every did:plc hashes into a seed</text>
  <text x="640" y="372" font-family="JetBrains Mono" font-size="21" fill="#a49bc0">the seed draws a kaleidoscope</text>
  <text x="640" y="408" font-family="JetBrains Mono" font-size="21" fill="#a49bc0">same identity, same sigil, every time</text>
  <text x="640" y="444" font-family="JetBrains Mono" font-size="21" fill="#a49bc0">nothing stored anywhere</text>

  <text x="640" y="560" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="#8f7bff">didsigil.bisks.net</text>
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
