// Generates public/og.png — the Open Graph preview card for verbosity, so a
// shared link auto-renders a picture of the histogram in Bluesky / other
// unfurlers. Hand-drawn SVG at the canonical OG size, matching the live
// page's dark blue/orange look, rasterised with @resvg/resvg-js (pure native
// module, no system Chromium needed — this box has no fontconfig/system
// fonts either, so the font is bundled in ./fonts and loaded explicitly).
//
//   cp -r ../didscope/node_modules .   # one-time, not a project dependency (gitignored)
//   node og-gen.mjs                    # writes ./public/og.png
//
// A generic sample distribution (not tied to any real handle) — this is the
// static fallback card for the bare link. Per-handle share cards are
// generated live, client-side, in public/index.html (buildShareCard).
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#070b14", FG = "#eef3fb", DIM = "#93a3bd", MUTED = "#5f6d85";
const ACCENT = "#3987e5", HIGHLIGHT = "#d95926", CARD = "#101a2c", BORDER = "#22314c";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// A representative sample histogram for the generic card.
const BUCKETS = [
  { label: "0–49", count: 18 },
  { label: "50–99", count: 34 },
  { label: "100–149", count: 41 },
  { label: "150–199", count: 29 },
  { label: "200–249", count: 22 },
  { label: "250–299", count: 15 },
  { label: "300", count: 9 },
];
const maxCount = Math.max(...BUCKETS.map((b) => b.count));

const cardX = 60, cardY = 220, cardW = W - 120, cardH = H - 280;

// headline stats row
const stats = [
  ["9", "hit exactly 300", HIGHLIGHT],
  ["5.3%", "of posts maxed out", HIGHLIGHT],
  ["148", "avg. length", ACCENT],
];
const colW = cardW / 3;
const statsValY = cardY + 68, statsLblY = cardY + 96;
const statsSvg = stats
  .map(([val, label, color], i) => {
    const cx = cardX + colW * i + colW / 2;
    return `
    <text x="${cx}" y="${statsValY}" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="42" fill="${color}">${esc(val)}</text>
    <text x="${cx}" y="${statsLblY}" text-anchor="middle" font-family="JetBrains Mono" font-size="14" fill="${MUTED}">${esc(label)}</text>`;
  })
  .join("\n");

// mini histogram
const chartX = cardX + 48, chartY = cardY + 128, chartW = cardW - 96, chartH = 90;
const gap = 10;
const barW = (chartW - gap * (BUCKETS.length - 1)) / BUCKETS.length;
const chartSvg = BUCKETS.map((b, i) => {
  const bx = chartX + i * (barW + gap);
  const bh = Math.max(3, (b.count / maxCount) * chartH);
  const color = b.label === "300" ? HIGHLIGHT : ACCENT;
  return `
    <rect x="${bx}" y="${chartY + chartH - bh}" width="${barW}" height="${bh}" rx="4" fill="${color}"/>
    <text x="${bx + barW / 2}" y="${chartY + chartH + 20}" text-anchor="middle" font-family="JetBrains Mono" font-size="12" fill="${MUTED}">${esc(b.label)}</text>`;
}).join("\n");

const verdict = "Measured";
const blurb = "you say what you mean and roughly nothing more.";
const verdictY = cardY + 300, blurbY = cardY + 326;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="15%" cy="-10%" r="60%">
      <stop offset="0" stop-color="#12264a"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="90%" cy="0%" r="55%">
      <stop offset="0" stop-color="#2a1a3a"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${ACCENT}"/>
      <stop offset="1" stop-color="${HIGHLIGHT}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <text x="60" y="100" font-family="JetBrains Mono" font-weight="800" font-size="52" fill="url(#title)">verbosity</text>
  <text x="60" y="150" font-family="JetBrains Mono" font-size="21" fill="${DIM}">how much of the 300-character</text>
  <text x="60" y="178" font-family="JetBrains Mono" font-size="21" fill="${DIM}">limit do you actually use?</text>

  <text x="60" y="240" font-family="JetBrains Mono" font-size="17" fill="${DIM}">Enter a Bluesky handle. Get a length</text>
  <text x="60" y="266" font-family="JetBrains Mono" font-size="17" fill="${DIM}">histogram of their whole post history,</text>
  <text x="60" y="292" font-family="JetBrains Mono" font-size="17" fill="${DIM}">how often they hit the cap, and more.</text>

  <text x="60" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT}">verbosity.bisks.net</text>

  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="18" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>
  ${statsSvg}
  ${chartSvg}
  <text x="${cardX + 48}" y="${verdictY}" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${FG}">${esc(verdict)}</text>
  <text x="${cardX + 48}" y="${blurbY}" font-family="JetBrains Mono" font-size="15" fill="${MUTED}">${esc(blurb)}</text>
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
