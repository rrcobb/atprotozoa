// Generates public/og.png — the Open Graph preview card for whodatninja. A
// mock of the game itself: a mystery pfp circle (drawn flat, no real
// avatars — this runs with no network) over a row of @handle choice
// buttons. Rasterised with @resvg/resvg-js (pure native module, no system
// Chromium needed) — copied from sites/mootspy/og-gen.mjs.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#0c0d0b";
const INK = "#eae7d8", MUTED = "#8a8a78", FAINT = "#2a2c22";
const ACCENT = "#e0a400", GOOD = "#39d67a";

const CHOICES = ["@norvid-studies", "@gracekind.net", "@ver.ooo", "@atprotozoa"];
const RIGHT_INDEX = 1;

const cx = 220, cy = 340, r = 90;
const listX = 480, listY = 210, itemW = 640, itemH = 78, itemGap = 16;

let choiceRects = "";
CHOICES.forEach((label, i) => {
  const y = listY + i * (itemH + itemGap);
  const isRight = i === RIGHT_INDEX;
  const stroke = isRight ? GOOD : FAINT;
  const sw = isRight ? 4 : 2;
  const fill = isRight ? "rgba(57,214,122,0.12)" : "#14160f";
  const textColor = isRight ? GOOD : INK;
  choiceRects += `
    <rect x="${listX}" y="${y}" width="${itemW}" height="${itemH}" rx="8" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>
    <text x="${listX + 32}" y="${y + itemH / 2 + 9}" font-family="JetBrains Mono" font-weight="700" font-size="27" fill="${textColor}">${label}</text>`;
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="12%" cy="-10%" r="55%">
      <stop offset="0" stop-color="${ACCENT}" stop-opacity="0.16"/>
      <stop offset="1" stop-color="${ACCENT}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="95%" cy="0%" r="50%">
      <stop offset="0" stop-color="${GOOD}" stop-opacity="0.10"/>
      <stop offset="1" stop-color="${GOOD}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <text x="60" y="96" font-family="JetBrains Mono" font-weight="800" font-size="52" fill="${ACCENT}">who dat ninja</text>
  <text x="60" y="140" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${INK}">guess the handle behind the pfp</text>

  <circle cx="${cx}" cy="${cy}" r="${r}" fill="${FAINT}" stroke="${MUTED}" stroke-width="4"/>
  <text x="${cx}" y="${cy + 30}" font-family="JetBrains Mono" font-weight="900" font-size="90" fill="#55584a" text-anchor="middle">?</text>
  <text x="${cx}" y="${cy + r + 46}" font-family="JetBrains Mono" font-size="18" fill="${MUTED}" text-anchor="middle">no display names</text>

  ${choiceRects}

  <text x="60" y="574" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${ACCENT}">whodatninja.bisks.net</text>
</svg>`;

const fontPath = fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url));
const r_ = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
});
const png = r_.render().asPng();
const out = new URL("./public/og.png", import.meta.url).pathname;
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");
