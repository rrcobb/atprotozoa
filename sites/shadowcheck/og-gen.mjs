// Generates public/og.png — the Open Graph preview card for shadowcheck, so a
// shared link auto-renders a picture of the redacted-stamp look in Bluesky /
// other unfurlers. Hand-drawn SVG at the canonical OG size, rasterised with
// @resvg/resvg-js (pure native module, no system Chromium needed — this box
// has no fontconfig/system fonts either, so the font is bundled in ./fonts
// and loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// A generic sample verdict (not tied to any real handle) — this is the static
// fallback card for the bare link. Per-handle share cards are generated live,
// client-side, in public/index.html (buildShareCard).
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#08090a", FG = "#eef1f2", DIM = "#8b9599";
const ACCENT = "#ff3b3b", ACCENT2 = "#5eead4";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="15%" cy="-10%" r="60%">
      <stop offset="0" stop-color="#2a0808"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="90%" cy="5%" r="55%">
      <stop offset="0" stop-color="#071a18"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <!-- faint all-seeing-eye watermark, corrupt-governance seal vibe -->
  <g transform="translate(870, 175) scale(1.9) rotate(-6)" opacity="0.07" stroke="${ACCENT2}" fill="none">
    <polygon points="0,-58 58,46 -58,46" stroke-width="3"/>
    <circle cx="0" cy="6" r="20" stroke-width="2.5"/>
    <circle cx="0" cy="6" r="8" fill="${ACCENT2}" stroke="none"/>
  </g>

  <text x="60" y="96" font-family="JetBrains Mono" font-weight="800" font-size="48" fill="${FG}">shadowcheck</text>
  <text x="60" y="140" font-family="JetBrains Mono" font-size="20" fill="${DIM}">are you shadowbanned?</text>

  <rect x="59" y="196" width="22" height="18" rx="2" fill="${DIM}"/>
  <text x="90" y="213" font-family="JetBrains Mono" font-size="15" fill="${DIM}" letter-spacing="1">EYES ONLY</text>
  <text x="60" y="246" font-family="JetBrains Mono" font-size="17" fill="${DIM}">the criteria are</text>
  <rect x="60" y="258" width="230" height="22" rx="2" fill="#000"/>
  <text x="60" y="298" font-family="JetBrains Mono" font-size="17" fill="${DIM}">we don't publish how we know.</text>
  <text x="60" y="324" font-family="JetBrains Mono" font-size="17" fill="${DIM}">we just know.</text>

  <g transform="translate(600, 460) rotate(-3)">
    <rect x="-260" y="-110" width="520" height="220" rx="10" fill="none" stroke="${ACCENT}" stroke-width="8"/>
    <text x="0" y="30" text-anchor="middle" font-family="JetBrains Mono" font-weight="900" font-size="110" fill="${ACCENT}">YES</text>
  </g>

  <text x="60" y="${H - 40}" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT2}">shadowcheck.bisks.net</text>
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
