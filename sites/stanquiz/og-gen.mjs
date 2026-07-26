// Generates public/og.png — the Open Graph preview card for stanquiz, so a
// shared link auto-renders a picture of the quiz result in Bluesky / other
// unfurlers.
//
// Hand-drawn SVG at the canonical OG size: a faint scatter of pink/gold dots
// behind the wordmark, a sample result card on the right (a generic score,
// not tied to any real handle — per-quiz share cards are generated live,
// client-side, in public/index.html's buildShareCard). Rasterised with
// @resvg/resvg-js (pure native module, no system Chromium/fontconfig
// needed — the font is bundled in ./fonts and loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork. Adapted from sites/simclustered/og-gen.mjs.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#05060a", INK = "#eaf2fb", MUTED = "#90a2b8";
const PINK = "#ff7ab8", GOLD = "#ffd166", GOOD = "#59d38c";
const CARD = "#0c0f18", BORDER = "rgba(234,242,251,0.14)";

// tiny seeded RNG so the layout is identical every run
let seed = 4242;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

// a loose scatter of dots, faint, behind the left-side wordmark
function scatter(cx, cy, r, n) {
  let dots = "";
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2;
    const rr = Math.sqrt(rnd()) * r;
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr * 0.8;
    dots += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(rnd() * 2.4 + 1.2).toFixed(1)}" fill="${PINK}" opacity="0.5"/>`;
  }
  return dots;
}

const bgDots = scatter(230, 420, 260, 30);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="bg" cx="20%" cy="15%" r="65%">
      <stop offset="0" stop-color="#3a1030"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  ${bgDots}

  <text x="60" y="140" font-family="JetBrains Mono" font-weight="800" font-size="58" fill="${PINK}">stan<tspan fill="${GOLD}">quiz</tspan></text>
  <text x="60" y="188" font-family="JetBrains Mono" font-size="21" fill="${MUTED}">how well do you actually know @cee.wtf?</text>

  <text x="60" y="270" font-family="JetBrains Mono" font-size="17" fill="${MUTED}">20 questions. zero jokey ones. every</text>
  <text x="60" y="296" font-family="JetBrains Mono" font-size="17" fill="${MUTED}">answer lives in their real public</text>
  <text x="60" y="322" font-family="JetBrains Mono" font-size="17" fill="${MUTED}">profile: real bio, real posts, real</text>
  <text x="60" y="348" font-family="JetBrains Mono" font-size="17" fill="${MUTED}">avatar, real follows.</text>

  <text x="60" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${GOLD}">bisks.net/games/stanquiz</text>

  <!-- right: sample result card -->
  <rect x="660" y="80" width="480" height="470" rx="18" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>
  <text x="900" y="220" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="88" fill="${GOLD}">85%</text>
  <text x="900" y="270" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="30" fill="${INK}">unhinged superfan</text>
  <text x="900" y="300" text-anchor="middle" font-family="JetBrains Mono" font-size="16" fill="${MUTED}">17/20 correct — real questions, real profile</text>

  <line x1="712" y1="340" x2="1088" y2="340" stroke="${BORDER}" stroke-width="1" stroke-dasharray="3,4"/>
  <text x="900" y="380" text-anchor="middle" font-family="JetBrains Mono" font-size="15" fill="${GOOD}">[y] which of these is their real bio?</text>
  <text x="900" y="412" text-anchor="middle" font-family="JetBrains Mono" font-size="15" fill="${MUTED}">[y] spot the real avatar</text>
  <text x="900" y="444" text-anchor="middle" font-family="JetBrains Mono" font-size="15" fill="${MUTED}">[n] which post did they actually write?</text>
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
