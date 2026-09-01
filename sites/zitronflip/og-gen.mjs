// Generates public/og.png — the Open Graph preview card for zitronflip.
//
// A static "oracle card": a crystal ball with a crossed-out doom-take inside
// it and the flipped prophecy below. Deterministic, no live state — same
// approach as sites/cancrusher/og-gen.mjs. Rasterised with @resvg/resvg-js.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const INK = "#f3ecff", MUTED = "#a595c2", GOLD = "#ffcf4d", PINK = "#ff5da2";

const cx = 900, cy = 330, r = 190;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="0.72" cy="0.4" r="0.9">
      <stop offset="0" stop-color="#2a1f45"/>
      <stop offset="1" stop-color="#120e1a"/>
    </radialGradient>
    <radialGradient id="ball" cx="0.35" cy="0.3" r="0.8">
      <stop offset="0" stop-color="#4a3a72"/>
      <stop offset="0.6" stop-color="#241a3d"/>
      <stop offset="1" stop-color="#150f24"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>

  <text x="60" y="120" font-family="JetBrains Mono" font-weight="800" font-size="60" fill="${INK}">ZITRON<tspan fill="${GOLD}">FLIP</tspan></text>
  <text x="60" y="160" font-family="JetBrains Mono" font-weight="600" font-size="23" fill="${MUTED}">say the opposite of the doom take. become a prophet.</text>

  <rect x="56" y="200" width="590" height="90" rx="10" fill="#1a1330" stroke="#35284f" stroke-width="2"/>
  <text x="76" y="235" font-family="JetBrains Mono" font-size="19" fill="${MUTED}">"generative AI has peaked and cannot improve"</text>
  <text x="76" y="266" font-family="JetBrains Mono" font-weight="700" font-size="19" fill="#ff6b6b">— WRONG. every single time.</text>

  <rect x="56" y="310" width="590" height="90" rx="10" fill="#1a1330" stroke="${GOLD}" stroke-width="2"/>
  <text x="76" y="345" font-family="JetBrains Mono" font-size="19" fill="${INK}">guaranteed opposite: it ships, it improves,</text>
  <text x="76" y="374" font-family="JetBrains Mono" font-weight="700" font-size="19" fill="${GOLD}">and someone gets very rich. bet on it.</text>

  <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#ball)" stroke="${PINK}" stroke-width="3" opacity="0.9"/>
  <ellipse cx="${cx - 60}" cy="${cy - 70}" rx="40" ry="22" fill="#ffffff" opacity="0.18"/>
  <text x="${cx}" y="${cy + 18}" font-family="JetBrains Mono" font-weight="800" font-size="46" fill="${GOLD}" text-anchor="middle">100%</text>
  <text x="${cx}" y="${cy + 50}" font-family="JetBrains Mono" font-size="18" fill="${INK}" text-anchor="middle" opacity="0.85">WRONG SO FAR</text>
  <rect x="${cx - 150}" y="${cy + r + 10}" width="300" height="22" rx="6" fill="#000" opacity="0.25"/>

  <text x="60" y="${H - 46}" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${PINK}">zitronflip.bisks.net</text>
</svg>`;

const fontPath = fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url));
const rr = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
});
const png = rr.render().asPng();
const out = new URL("./public/og.png", import.meta.url).pathname;
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");
