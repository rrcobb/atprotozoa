// Generates public/og.png — the static Open Graph preview card for the bare
// /likeclusters link, so a share unfurls as a real picture instead of a
// blank card. Same look as the on-page superfan cards + the live share-card
// canvas (buildShareCard in public/index.html): plain black-on-white, mono,
// blue accent. A fabricated sample list, not tied to any real account —
// per-query share cards stay client-side (canvas, downloadable/shareable);
// this is just the generic fallback. Rasterised with @resvg/resvg-js (pure
// native module, no system Chromium needed — font bundled in ./fonts and
// loaded explicitly, since this box has no fontconfig/system fonts).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run by hand if the
// artwork changes. Adapted from sites/metamoots/og-gen.mjs.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#ffffff", INK = "#111111", MUTED = "#6b6b6b", FAINT = "#e4e4e4", ACCENT = "#1a5fd0";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Fabricated sample rows — plausible but fake, so this reads as an example
// result, not a real crawl.
const ROWS = [
  { name: "moth.enjoyer", handle: "@moth-enjoyer", tag: "#mothposting", pct: 92 },
  { name: "quietloomer", handle: "@quietloomer.bsky.social", tag: "sourdough", pct: 81 },
  { name: "second_breakfast", handle: "@second-breakfast", tag: "#longreads", pct: 68 },
];

const rowH = 100;
const startY = 258;

const rowsSvg = ROWS.map((r, i) => {
  const y = startY + i * rowH;
  return `
    <line x1="60" y1="${y + rowH - 18}" x2="${W - 60}" y2="${y + rowH - 18}" stroke="${FAINT}" stroke-width="1"/>
    <circle cx="82" cy="${y + 14}" r="22" fill="${FAINT}"/>
    <text x="122" y="${y + 8}" font-family="JetBrains Mono" font-weight="700" font-size="26" fill="${INK}">${esc(r.name)}</text>
    <text x="122" y="${y + 32}" font-family="JetBrains Mono" font-size="18" fill="${MUTED}">${esc(r.handle)}  only likes ${esc(r.tag)}</text>
    <text x="${W - 60}" y="${y + 18}" text-anchor="end" font-family="JetBrains Mono" font-weight="800" font-size="28" fill="${ACCENT}">${r.pct}%</text>
  `;
}).join("\n");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>

  <text x="60" y="96" font-family="JetBrains Mono" font-weight="800" font-size="58" fill="${ACCENT}">likeclusters</text>
  <text x="60" y="138" font-family="JetBrains Mono" font-size="24" fill="${MUTED}">who likes which topic</text>
  <text x="60" y="182" font-family="JetBrains Mono" font-size="19" fill="${MUTED}">reads an account's posts, samples their likers, and groups them —</text>
  <text x="60" y="206" font-family="JetBrains Mono" font-size="19" fill="${MUTED}">the moot who only ever likes one topic cluster.</text>

  <text x="${W - 60}" y="50" text-anchor="end" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${ACCENT}">bisks.net/likeclusters</text>

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
