// Generates public/og.png — the static Open Graph preview card for the bare
// /metamoots link, so a share unfurls as a real picture instead of a blank
// card. Same look as the on-page table + the live share-card canvas
// (buildShareCard in public/index.html): plain black-on-white, mono, blue
// accent. A fabricated sample list, not tied to any real account — per-query
// share cards stay client-side (canvas, downloadable/shareable); this is
// just the generic fallback. Rasterised with @resvg/resvg-js (pure native
// module, no system Chromium needed — font bundled in ./fonts and loaded
// explicitly, since this box has no fontconfig/system fonts).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run by hand if the
// artwork changes. Adapted from sites/didscope/og-gen.mjs.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#ffffff", INK = "#111111", MUTED = "#6b6b6b", FAINT = "#e4e4e4", ACCENT = "#1a5fd0";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Fabricated sample rows — plausible but fake, so this reads as an example
// result, not a real leaderboard.
const ROWS = [
  { rank: 1, name: "moth.enjoyer", handle: "@moth-enjoyer", score: 214, pct: 100 },
  { rank: 2, name: "quietloomer", handle: "@quietloomer.bsky.social", score: 176, pct: 82 },
  { rank: 3, name: "second_breakfast", handle: "@second-breakfast", score: 133, pct: 62 },
];

const rowH = 100;
const startY = 258;

const rowsSvg = ROWS.map((r, i) => {
  const y = startY + i * rowH;
  const barW = 210;
  const fillW = Math.max(10, (r.pct / 100) * barW);
  return `
    <line x1="60" y1="${y + rowH - 18}" x2="${W - 60}" y2="${y + rowH - 18}" stroke="${FAINT}" stroke-width="1"/>
    <text x="60" y="${y + 30}" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${MUTED}">${r.rank}</text>
    <circle cx="128" cy="${y + 18}" r="22" fill="${FAINT}"/>
    <text x="168" y="${y + 12}" font-family="JetBrains Mono" font-weight="700" font-size="26" fill="${INK}">${esc(r.name)}</text>
    <text x="168" y="${y + 42}" font-family="JetBrains Mono" font-size="18" fill="${MUTED}">${esc(r.handle)}</text>
    <rect x="${W - 60 - barW - 70}" y="${y - 2}" width="${barW}" height="10" rx="5" fill="${FAINT}"/>
    <rect x="${W - 60 - barW - 70}" y="${y - 2}" width="${fillW}" height="10" rx="5" fill="${ACCENT}"/>
    <text x="${W - 60}" y="${y + 8}" text-anchor="end" font-family="JetBrains Mono" font-weight="800" font-size="30" fill="${ACCENT}">${r.score}</text>
  `;
}).join("\n");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>

  <text x="60" y="96" font-family="JetBrains Mono" font-weight="800" font-size="58" fill="${ACCENT}">metamoots</text>
  <text x="60" y="138" font-family="JetBrains Mono" font-size="24" fill="${MUTED}">find your meta-mutuals</text>
  <text x="60" y="182" font-family="JetBrains Mono" font-size="19" fill="${MUTED}">you don't follow them, they don't follow you —</text>
  <text x="60" y="206" font-family="JetBrains Mono" font-size="19" fill="${MUTED}">but you both engage all the time.</text>

  <text x="${W - 60}" y="50" text-anchor="end" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${ACCENT}">bisks.net/metamoots</text>

  <line x1="60" y1="228" x2="${W - 60}" y2="228" stroke="${INK}" stroke-width="1.5"/>

  ${rowsSvg}
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
