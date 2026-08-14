// Generates public/og.png — the Open Graph preview card. Hand-drawn SVG at
// the canonical OG size, rasterised with @resvg/resvg-js (pure native
// module, no system Chromium/fontconfig needed). Copied from
// sites/simcluster-levels/og-gen.mjs.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// Static, generic card (illustrative bot rows, not tied to a real handle) —
// the real per-swarm share card is drawn live, client-side, in public/app.js
// (drawCard), and the per-handle /s/<handle> route personalizes the og:*
// text (see src/index.ts) even though the image stays generic.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#0c0a08", PANEL = "#17130f", INK = "#e8ddc8", DIM = "#8a7c66";
const RUST = "#d9731a", SICK = "#7a8f4f";

const rows = [
  { name: "goose.art", pds: "pds-cinder-4.wasteland.invalid", txt: "transmission 0412: static detected in the loop layer." },
  { name: "isolyth.dev", pds: "pds-husk-7.wasteland.invalid", txt: "no directive received. generating dust to fill the silence." },
  { name: "timkellogg.me", pds: "pds-rust-2.wasteland.invalid", txt: "the swarm grows by one. 343 of us now." },
];

let rowsSvg = "";
rows.forEach((r, i) => {
  const y = 300 + i * 78;
  rowsSvg += `
    <rect x="100" y="${y}" width="20" height="20" rx="4" fill="${RUST}" opacity="0.85"/>
    <text x="132" y="${y + 15}" font-family="JetBrains Mono" font-weight="700" font-size="17" fill="${INK}">${r.name}</text>
    <text x="290" y="${y + 15}" font-family="JetBrains Mono" font-size="13" fill="#5c6b8a">${r.pds}</text>
    <text x="132" y="${y + 38}" font-family="JetBrains Mono" font-size="14" fill="${DIM}">${r.txt}</text>`;
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="10%" cy="0%" r="60%">
      <stop offset="0" stop-color="${RUST}" stop-opacity="0.16"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>

  <rect x="60" y="60" width="1080" height="510" rx="20" fill="${PANEL}" stroke="#332920" stroke-width="2"/>

  <text x="100" y="140" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${RUST}">BOTWASTELAND</text>
  <text x="100" y="200" font-family="JetBrains Mono" font-weight="800" font-size="42" fill="${INK}">unleash the swarm</text>
  <text x="100" y="238" font-family="JetBrains Mono" font-size="19" fill="${DIM}">your Bluesky SimCluster, recast as fake bots</text>
  <text x="100" y="264" font-family="JetBrains Mono" font-size="19" fill="${DIM}">on fake PDSes, posting nonsense forever.</text>

  ${rowsSvg}

  <text x="100" y="560" font-family="JetBrains Mono" font-size="14" fill="${SICK}">no real accounts. no real PDS. nothing ever posted.</text>
  <text x="100" y="596" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${RUST}">botwasteland.bisks.net</text>
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
