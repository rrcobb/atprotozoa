// Generates public/og.png — the Open Graph preview card for diorama.
// A little paper-craft shoebox stage: a warm cardboard frame, a painted
// sky backdrop, a handful of scattered prop emoji, deterministic so
// re-runs are byte-stable. Rasterised with @resvg/resvg-js (pure native
// module, no system Chromium needed).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork. Adapted from sites/constructor/og-gen.mjs.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#1b120c";
const FRAME = "#3a2a1c";
const MUTED = "#b89b7a";
const ACCENT = "#e8b34c";
const FG = "#f3e9da";

let rngState = 11;
function rng() { // tiny deterministic PRNG so re-runs are byte-stable
  rngState = (rngState * 1103515245 + 12345) & 0x7fffffff;
  return (rngState % 10000) / 10000;
}

const stageX = 700, stageY = 60, stageW = 440, stageH = 300;

// Little paper-craft prop silhouettes, drawn as plain vector shapes —
// JetBrains Mono has no emoji glyphs and resvg has no system-font fallback
// here, so text glyphs for emoji render as tofu boxes. Shapes always render.
function tree(x, y, s) {
  return `<g><rect x="${(x - s * 0.06).toFixed(1)}" y="${y.toFixed(1)}" width="${(s * 0.12).toFixed(1)}" height="${(s * 0.3).toFixed(1)}" fill="#6b4a24"/>
  <polygon points="${x},${(y - s * 0.7).toFixed(1)} ${(x - s * 0.45).toFixed(1)},${y.toFixed(1)} ${(x + s * 0.45).toFixed(1)},${y.toFixed(1)}" fill="${ACCENT}"/></g>`;
}
function star(x, y, s) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? s : s * 0.4;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    pts.push(`${(x + Math.cos(a) * r).toFixed(1)},${(y + Math.sin(a) * r).toFixed(1)}`);
  }
  return `<polygon points="${pts.join(" ")}" fill="${FG}"/>`;
}
function pompom(x, y, r) {
  return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="${MUTED}"/>`;
}
function banner(x, y, s) {
  return `<polygon points="${(x - s).toFixed(1)},${(y - s * 0.6).toFixed(1)} ${(x + s).toFixed(1)},${(y - s * 0.6).toFixed(1)} ${x.toFixed(1)},${(y + s * 0.6).toFixed(1)}" fill="${ACCENT}"/>`;
}
const MAKERS = [tree, star, pompom, banner, tree];
const props = MAKERS.map((make) => {
  const x = stageX + 40 + rng() * (stageW - 80);
  const y = stageY + stageH * 0.62 + rng() * (stageH * 0.28);
  const size = 18 + rng() * 14;
  return make(x, y, size);
}).join("\n  ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>

  <rect x="${stageX - 12}" y="${stageY - 12}" width="${stageW + 24}" height="${stageH + 24}" rx="8" fill="${FRAME}"/>
  <rect x="${stageX}" y="${stageY}" width="${stageW}" height="${stageH * 0.55}" fill="#2a3a6b"/>
  <rect x="${stageX}" y="${(stageY + stageH * 0.55).toFixed(1)}" width="${stageW}" height="${(stageH * 0.45).toFixed(1)}" fill="#5a4530"/>
  ${props}

  <text x="66" y="110" font-family="JetBrains Mono" font-weight="800" font-size="64" fill="${ACCENT}">diorama</text>
  <text x="68" y="150" font-family="JetBrains Mono" font-size="20" fill="${MUTED}">BOX NO. 0X001 &#183; a shoebox theater</text>
  <text x="66" y="220" font-family="JetBrains Mono" font-size="22" fill="${FG}">tell it what to stage. it builds a</text>
  <text x="66" y="252" font-family="JetBrains Mono" font-size="22" fill="${FG}">one-off paper-craft scene on the</text>
  <text x="66" y="284" font-family="JetBrains Mono" font-size="22" fill="${FG}">spot &#8212; with a real link to the set.</text>
  <text x="66" y="580" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${ACCENT}">diorama.bisks.net</text>
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
