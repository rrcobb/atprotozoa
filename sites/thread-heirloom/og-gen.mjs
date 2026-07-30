// Generates public/og.png — the static Open Graph preview for the bare
// /thread-heirloom link (and the fallback image every /c/<code> card reuses
// too, since a per-card image would need per-card rendering infra this v1
// doesn't have yet). Same look as the on-page card (plain black-on-white,
// mono, blue accent). Rasterised with @resvg/resvg-js (pure native module,
// font bundled in ./fonts and loaded explicitly since this box has no
// fontconfig/system fonts). Copied and trimmed from sites/purge/og-gen.mjs
// (copy, don't abstract).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#ffffff", INK = "#111111", MUTED = "#6b6b6b", FAINT = "#e4e4e4", ACCENT = "#1a5fd0";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// A fabricated example card — plausible but fake, not tied to a real thread.
const REFERENTS = [
  ["the RFC", "the doc everyone's actually arguing about"],
  ["@moth.enjoyer", "first to push back"],
];
const CLAIM = "“the migration is safe if we backfill before the flag flips.”";
const UNRESOLVED = "nobody said what happens if the backfill is still running at flip time.";

const refY = 330;
const referentsSvg = REFERENTS.map((r, i) => {
  const y = refY + i * 54;
  return `
    <text x="60" y="${y}" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${INK}">${esc(r[0])}</text>
    <text x="60" y="${y + 24}" font-family="JetBrains Mono" font-size="17" fill="${MUTED}">${esc(r[1])}</text>
  `;
}).join("\n");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>

  <text x="60" y="96" font-family="JetBrains Mono" font-weight="800" font-size="54" fill="${ACCENT}">thread heirloom</text>
  <text x="60" y="138" font-family="JetBrains Mono" font-size="22" fill="${MUTED}">durable context cards for Bluesky threads</text>

  <text x="${W - 60}" y="50" text-anchor="end" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT}">bisks.net/thread-heirloom</text>

  <line x1="60" y1="176" x2="${W - 60}" y2="176" stroke="${INK}" stroke-width="1.5"/>

  <text x="60" y="216" font-family="JetBrains Mono" font-size="15" letter-spacing="1" fill="${MUTED}">CLAIM</text>
  <text x="60" y="248" font-family="JetBrains Mono" font-size="21" fill="${INK}">${esc(CLAIM)}</text>

  <text x="60" y="300" font-family="JetBrains Mono" font-size="15" letter-spacing="1" fill="${MUTED}">NAMED</text>
  ${referentsSvg}

  <text x="60" y="480" font-family="JetBrains Mono" font-size="15" letter-spacing="1" fill="${MUTED}">UNRESOLVED</text>
  <text x="60" y="512" font-family="JetBrains Mono" font-size="21" fill="${INK}">${esc(UNRESOLVED)}</text>

  <text x="60" y="590" font-family="JetBrains Mono" font-size="17" fill="${MUTED}">paste a thread URL. get named referents, claims, the sharpest</text>
  <text x="60" y="612" font-family="JetBrains Mono" font-size="17" fill="${MUTED}">disagreement, and the unresolved question — cited to the posts.</text>
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
