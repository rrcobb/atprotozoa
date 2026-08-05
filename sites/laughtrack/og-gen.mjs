// Generates public/og.png — the Open Graph preview card for laughtrack, so a
// shared link auto-renders a picture of a scoreboard in Bluesky / other
// unfurlers. Hand-drawn SVG at the canonical OG size, rasterised with
// @resvg/resvg-js (pure native module, no system Chromium needed — this box
// has no fontconfig/system fonts either, so the font is bundled in ./fonts
// and loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// A generic sample post/score (not tied to any real handle) — this is the
// static fallback card for the bare link. Per-scan share cards are generated
// live, client-side, in public/index.html (buildShareCard).
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#0d0a06", FG = "#fff3dc", DIM = "#b8a685";
const ACCENT = "#ffcc33", ACCENT2 = "#ff8a3d", CARD = "#1a140b", BORDER = "#38291a";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function wrapLines(text, maxChars) {
  const words = text.split(" ");
  const lines = [];
  let line = "";
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (line && test.length > maxChars) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

const score = "17";
const postText = "“normalize replying to your own tweets with the sequel nobody asked for”";
const chips = ["lol ×6", "haha ×4", "lmao ×3", "omg ×2"];

const postLines = wrapLines(postText, 34);

const cardX = 470, cardY = 60, cardW = 668, cardH = 510;

let y = cardY + 60;
const labelY = y;
y += 100;
const scoreY = y;
y += 40;
const subLabelY = y;
y += 56;
const postStartY = y;
const postLineH = 32;
y += postLines.length * postLineH + 40;
const chipsY = y;

const postSvg = postLines
  .map((l, i) => `<text x="${cardX + cardW / 2}" y="${postStartY + i * postLineH}" text-anchor="middle" font-family="JetBrains Mono" font-size="22" fill="${FG}">${esc(l)}</text>`)
  .join("\n    ");

let chipX = cardX + 48;
const chipY = chipsY;
const chipSvg = chips
  .map((c) => {
    const width = c.length * 12 + 32;
    const rect = `<rect x="${chipX}" y="${chipY - 26}" width="${width}" height="38" rx="19" fill="${BG}" stroke="${BORDER}"/><text x="${chipX + width / 2}" y="${chipY}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="16" fill="${ACCENT}">${esc(c)}</text>`;
    chipX += width + 12;
    return rect;
  })
  .join("\n    ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="20%" cy="-10%" r="60%">
      <stop offset="0" stop-color="#3a2a08"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="90%" cy="10%" r="55%">
      <stop offset="0" stop-color="#3a1a08"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${ACCENT}"/>
      <stop offset="1" stop-color="${ACCENT2}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <!-- left: wordmark + pitch -->
  <text x="64" y="140" font-family="JetBrains Mono" font-weight="800" font-size="64" fill="url(#title)">laughtrack</text>
  <text x="64" y="188" font-family="JetBrains Mono" font-size="21" fill="${DIM}">find someone's <tspan fill="${ACCENT2}">funniest post</tspan></text>
  <text x="64" y="216" font-family="JetBrains Mono" font-size="21" fill="${DIM}">by the replies, not the likes</text>

  <text x="64" y="290" font-family="JetBrains Mono" font-size="17" fill="${DIM}">Enter a Bluesky handle. It reads</text>
  <text x="64" y="316" font-family="JetBrains Mono" font-size="17" fill="${DIM}">every reply to their recent posts</text>
  <text x="64" y="342" font-family="JetBrains Mono" font-size="17" fill="${DIM}">and counts lol/haha/omg/lmao/rofl.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT2}">laughtrack.bisks.net</text>

  <!-- right: sample scoreboard card -->
  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="18" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>

  <text x="${cardX + cardW / 2}" y="${labelY}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="15" letter-spacing="2" fill="${DIM}">LAUGH SCORE</text>
  <text x="${cardX + cardW / 2}" y="${scoreY}" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="88" fill="${ACCENT}">${score}</text>
  <text x="${cardX + cardW / 2}" y="${subLabelY}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="16" fill="${ACCENT2}">across 9 replies</text>

  ${postSvg}

  ${chipSvg}
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
