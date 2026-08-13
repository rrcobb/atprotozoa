// Generates public/og.png — the Open Graph preview card for cloud chamber.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium / fontconfig needed — the font is
// bundled in ./fonts and loaded explicitly). Copied from
// sites/dosimeter/og-gen.mjs.
//
//   node og-gen.mjs   # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run by hand if the
// artwork changes.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#05070c", INK = "#e9f3ff", DIM = "#7f93ad", ACCENT = "#7fe0ff";

// Eight species, drawn as short curved/straight tracks fanning from a shared
// vertex — same palette as SPECIES in public/app.js.
const TRACKS = [
  { color: "#d6e4ff", d: "M 900 430 C 980 380, 1050 340, 1120 300", w: 2 }, // muon
  { color: "#ff96d2", d: "M 900 430 C 950 380, 940 300, 870 250", w: 1.6 }, // electron
  { color: "#96ffd6", d: "M 900 430 C 950 460, 990 520, 950 590", w: 1.6 }, // positron
  { color: "#ffcd78", d: "M 900 430 C 830 400, 760 360, 690 310", w: 4 }, // proton
  { color: "#ff8c6e", d: "M 900 430 C 860 450, 820 460, 780 465", w: 7 }, // alpha
  { color: "#ffffff", d: "M 900 430 L 1080 470", w: 2 }, // gamma
  { color: "#82afff", d: "M 900 430 L 760 470", w: 1, dash: "4 6" }, // neutrino
  { color: "#e6befF", d: "M 900 430 C 850 470, 820 500, 800 520 M 800 520 C 770 545, 740 555, 700 560 M 800 520 C 800 555, 810 585, 820 615", w: 1.6 }, // kaon V-decay
];

const tracksSvg = TRACKS.map(
  (t) =>
    `<path d="${t.d}" fill="none" stroke="${t.color}" stroke-width="${t.w}" stroke-linecap="round" ${t.dash ? `stroke-dasharray="${t.dash}"` : ""} opacity="0.9" style="filter:url(#glow)"/>`,
).join("\n  ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="vig" cx="72%" cy="62%" r="65%">
      <stop offset="0" stop-color="#0d1830"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="2.2" result="b"/>
      <feMerge>
        <feMergeNode in="b"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#vig)"/>

  ${tracksSvg}
  <circle cx="900" cy="430" r="4" fill="${ACCENT}" style="filter:url(#glow)"/>

  <text x="64" y="150" font-family="JetBrains Mono" font-weight="800" font-size="66" fill="${INK}">cloud chamber</text>
  <text x="64" y="196" font-family="JetBrains Mono" font-size="22" fill="${ACCENT}">the bluesky firehose as cosmic rays</text>

  <text x="64" y="290" font-family="JetBrains Mono" font-size="19" fill="${DIM}">every post is a detection event, sorted into</text>
  <text x="64" y="318" font-family="JetBrains Mono" font-size="19" fill="${DIM}">8 particle species by what it carries —</text>
  <text x="64" y="346" font-family="JetBrains Mono" font-size="19" fill="${DIM}">each leaves its own fading vapor trail.</text>

  <text x="64" y="420" font-family="JetBrains Mono" font-size="17" fill="${DIM}">muon · electron · positron · proton</text>
  <text x="64" y="448" font-family="JetBrains Mono" font-size="17" fill="${DIM}">alpha · gamma · neutrino · kaon</text>

  <text x="64" y="580" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${ACCENT}">cloudchamber.bisks.net</text>
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
