// Generates public/og.png — the Open Graph preview card for standard incite,
// so a shared link auto-renders a mock-up of the stale-publisher list in
// Bluesky / other unfurlers.
//
// Hand-draws a representative "screenshot" (a few mootcard rows, one flagged
// stale) as an SVG at the canonical OG size, then rasterises it with
// @resvg/resvg-js (pure native module, no system Chromium — this box has no
// fontconfig either, so the font is bundled in ./fonts and loaded
// explicitly). Copied from sites/dial-a-mutual/og-gen.mjs (copy, don't
// abstract), swapped for the mootcard-list artwork.
//
// The row data below is entirely made up — no real handle or publication
// name, so the card never states or implies anything about a specific
// account. It also only depicts states the app can actually produce: every
// row has a publication with a real last-post date, since a pub with zero
// posts is dropped before it ever reaches the results list.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// No live data, no network — deterministic so the card is stable across
// builds.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const INK = "#1c1a16", MUTED = "#6b6455", ACCENT = "#a8471f", GOOD = "#2f7a4f";
const BORDER = "#e2dcc9", CARD = "#ffffff", BG = "#fbfaf7";
const TINTS = ["#a8471f", "#2f7a4f", "#5566dd", "#8e44ad", "#c0392b"];

let seed = 4242; // seeded RNG so the layout is identical every run
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function avatarCircle(x, y, r, fill, label) {
  return `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/>
  <text x="${x}" y="${y + r * 0.32}" text-anchor="middle" font-family="JetBrains Mono"
    font-weight="700" font-size="${(r * 0.78).toFixed(1)}" fill="rgba(255,255,255,.92)">${esc(label)}</text>`;
}

const ROWS = [
  { name: "some.mutual", badge: "last post 54d ago", stale: true },
  { name: "another.mutual", badge: "last post 41d ago", stale: true },
  { name: "a.third.mutual", badge: "last post 6d ago", stale: false },
];

const cardX = 64, cardW = W - 128, cardY0 = 280, cardH = 82, cardGap = 16;

let rowsSvg = "";
ROWS.forEach((row, i) => {
  const y = cardY0 + i * (cardH + cardGap);
  const tint = TINTS[Math.floor(rnd() * TINTS.length)];
  const initial = row.name[0].toUpperCase();
  const badgeColor = row.stale ? ACCENT : GOOD;
  const badgeW = row.badge.length * 9 + 28;
  rowsSvg += `
  <rect x="${cardX}" y="${y}" width="${cardW}" height="${cardH}" rx="12" fill="${CARD}" stroke="${BORDER}" stroke-width="2"/>
  ${avatarCircle(cardX + 52, y + cardH / 2, 26, tint, initial)}
  <text x="${cardX + 96}" y="${y + cardH / 2 - 4}" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${INK}">${esc(row.name)}</text>
  <text x="${cardX + 96}" y="${y + cardH / 2 + 22}" font-family="JetBrains Mono" font-size="15" fill="${MUTED}">standard.site publication</text>
  <rect x="${cardX + cardW - badgeW - 24}" y="${y + cardH / 2 - 16}" width="${badgeW}" height="32" rx="16" fill="${CARD}" stroke="${badgeColor}" stroke-width="2"/>
  <text x="${cardX + cardW - badgeW / 2 - 24}" y="${y + cardH / 2 + 5}" text-anchor="middle" font-family="JetBrains Mono" font-size="14" fill="${badgeColor}">${esc(row.badge)}</text>`;
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>

  <text x="64" y="100" font-family="JetBrains Mono" font-weight="700" font-size="46" fill="${INK}">standard incite<tspan fill="${ACCENT}">!</tspan></text>
  <text x="64" y="140" font-family="JetBrains Mono" font-size="20" fill="${MUTED}">find the mutuals letting their standard.site publication go quiet</text>

  ${rowsSvg}

  <text x="64" y="600" font-family="JetBrains Mono" font-size="16" fill="${MUTED}">type a handle · every mutual's PDS checked · one-tap nudge</text>
  <text x="${W - 64}" y="600" text-anchor="end" font-family="JetBrains Mono" font-size="16" fill="${ACCENT}">standard-incite.bisks.net</text>
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
