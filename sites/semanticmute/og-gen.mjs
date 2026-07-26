// Generates public/og.png — the Open Graph preview card for semanticmute, so
// a shared link auto-renders a picture of the idea in Bluesky / other
// unfurlers.
//
// Hand-drawn SVG at the canonical OG size: a crossed-out speech bubble
// (literal mute) surrounded by a fading cloud of related words (semantic
// mute) — the difference the site is built around. Rasterised with
// @resvg/resvg-js (pure native module, no system Chromium/fontconfig needed —
// the font is bundled in ./fonts and loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork. Adapted from sites/chimehose/og-gen.mjs.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#08090d", PANEL = "#10121b", INK = "#e8ecf3", MUTED = "#8a96ac";
const ACCENT = "#6ee7c8", MUTE = "#ff7a90";
const BORDER = "rgba(232,236,243,0.14)";

const words = [
  { w: "bivalve", x: 905, y: 150, s: 20, o: 0.85 },
  { w: "shellfish", x: 990, y: 210, s: 22, o: 0.95 },
  { w: "raw bar", x: 850, y: 260, s: 18, o: 0.6 },
  { w: "clam", x: 1030, y: 300, s: 16, o: 0.45 },
  { w: "mollusk", x: 930, y: 340, s: 17, o: 0.55 },
  { w: "scallop", x: 1020, y: 130, s: 15, o: 0.4 },
];

const wordsSvg = words
  .map(
    (t) =>
      `<text x="${t.x}" y="${t.y}" font-family="JetBrains Mono" font-size="${t.s}" fill="${ACCENT}" opacity="${t.o}">${t.w}</text>`,
  )
  .join("\n  ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="bgL" cx="20%" cy="30%" r="55%">
      <stop offset="0" stop-color="#3a1420"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="bgR" cx="82%" cy="35%" r="55%">
      <stop offset="0" stop-color="#0e3a30"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#bgL)"/>
  <rect width="${W}" height="${H}" fill="url(#bgR)"/>

  <!-- crossed-out speech bubble: the literal, one-word mute -->
  <path d="M120 130 h220 a26 26 0 0 1 26 26 v110 a26 26 0 0 1 -26 26 h-140 l-46 40 v-40 h-34 a26 26 0 0 1 -26 -26 v-110 a26 26 0 0 1 26 -26 z"
        fill="none" stroke="${MUTE}" stroke-width="6"/>
  <line x1="95" y1="120" x2="380" y2="330" stroke="${MUTE}" stroke-width="8" stroke-linecap="round"/>
  <text x="150" y="205" font-family="JetBrains Mono" font-weight="700" font-size="26" fill="${MUTE}" opacity="0.85">"oysters"</text>

  <!-- the semantic cloud it also catches -->
  ${wordsSvg}
  <line x1="380" y1="220" x2="850" y2="220" stroke="${MUTED}" stroke-width="2" stroke-dasharray="3 6" opacity="0.5"/>

  <text x="60" y="440" font-family="JetBrains Mono" font-weight="800" font-size="62" fill="${INK}">semantic<tspan fill="${MUTE}">mute</tspan></text>
  <text x="60" y="484" font-family="JetBrains Mono" font-size="23" fill="${MUTED}">mute a concept, not just a word</text>

  <rect x="60" y="520" width="1080" height="70" rx="12" fill="${PANEL}" stroke="${BORDER}" stroke-width="1.5"/>
  <text x="90" y="564" font-family="JetBrains Mono" font-size="19" fill="${INK}">a live Bluesky-firehose viewer that mutes by meaning, and shows its work</text>

  <text x="60" y="612" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT}">bisks.net/semanticmute</text>
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
