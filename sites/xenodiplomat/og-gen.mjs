// Generates public/og.png — the Open Graph preview card for xenodiplomat.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium/fontconfig needed — font bundled
// in ./fonts). Static sample card, not tied to any real playthrough; the
// live per-posting share card is generated client-side in public/index.html
// (buildShareCard).
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
const BG = "#05070f", FG = "#eef2ff", DIM = "#93a0c4";
const ACCENT = "#7dd3fc", ACCENT2 = "#ffd166", CARD = "#10142b", BORDER = "#2a3363";
const GOOD = "#7ee0a8", BAD = "#ff8a8a";

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

const rank = "Junior Attaché";
const pitchLines = wrapLines("Read their customs. Pick your response.", 34);
const pitchLines2 = wrapLines("Keep Earth's interstellar standing intact.", 34);

const breakdown = [
  { name: "Cerulean Communion", delta: 2 },
  { name: "Vex Choir", delta: -2 },
  { name: "Kroth Magnates", delta: 2 },
  { name: "Praetor Vine", delta: 0 },
];

let stars = "";
for (let i = 0; i < 50; i++) {
  const sx = Math.random() * W, sy = Math.random() * H, r = 0.5 + Math.random() * 1.2;
  const op = (0.3 + Math.random() * 0.5).toFixed(2);
  stars += `<circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="${r.toFixed(2)}" fill="#fff" opacity="${op}"/>\n  `;
}

const cardX = 470, cardY = 90, cardW = 668, cardH = 450;

let bY = cardY + 210;
const breakdownSvg = breakdown
  .map((b) => {
    const color = b.delta > 0 ? GOOD : b.delta < 0 ? BAD : DIM;
    const sign = b.delta > 0 ? "+" : "";
    const svg = `<text x="${cardX + 40}" y="${bY}" font-family="JetBrains Mono" font-weight="700" font-size="18" fill="${color}">${sign}${b.delta}</text>
  <text x="${cardX + 90}" y="${bY}" font-family="JetBrains Mono" font-size="18" fill="${FG}">${esc(b.name)}</text>`;
    bY += 34;
    return svg;
  })
  .join("\n  ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="20%" cy="-10%" r="60%">
      <stop offset="0" stop-color="#14204a"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${ACCENT}"/>
      <stop offset="1" stop-color="${ACCENT2}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  ${stars}

  <text x="64" y="140" font-family="JetBrains Mono" font-weight="800" font-size="60" fill="url(#title)">xenodiplomat</text>
  <text x="64" y="180" font-family="JetBrains Mono" font-size="19" fill="${DIM}">Earth's Diplomatic Corps needs a new</text>
  <text x="64" y="206" font-family="JetBrains Mono" font-size="19" fill="${DIM}">envoy. Weird aliens. Totally different</text>
  <text x="64" y="232" font-family="JetBrains Mono" font-size="19" fill="${DIM}">everything.</text>

  <text x="64" y="300" font-family="JetBrains Mono" font-size="17" fill="${DIM}">${esc(pitchLines[0] || "")}</text>
  <text x="64" y="326" font-family="JetBrains Mono" font-size="17" fill="${DIM}">${esc(pitchLines2[0] || "")}</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT}">xenodiplomat.bisks.net</text>

  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="18" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>
  <text x="${cardX + cardW / 2}" y="${cardY + 66}" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="38" fill="${ACCENT2}">${esc(rank)}</text>
  <text x="${cardX + cardW / 2}" y="${cardY + 118}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${GOOD}">standing: +2</text>

  <text x="${cardX + 40}" y="${cardY + 170}" font-family="JetBrains Mono" font-weight="700" font-size="13" fill="${DIM}">THIS POSTING</text>
  ${breakdownSvg}
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
