// Generates public/og.png — the Open Graph preview card for quine garden.
// A looping arrow (the self-reference motif) around the title, plus the
// five verified languages as a small manifest. Rasterised with
// @resvg/resvg-js (pure native module, no system Chromium needed).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Adapted from
// sites/droste/og-gen.mjs.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const INK = "#111111", MUTED = "#6b6b6b", ACCENT = "#1a5fd0", PAPER = "#ffffff", GOOD = "#17794a";

// A loop arrow: a circle with an open gap and an arrowhead chasing its own
// tail — the "output feeds back into input" shape.
const cx = 990, cy = 200, r = 110;
const loopPath = `M ${cx + r} ${cy} A ${r} ${r} 0 1 1 ${cx - r * 0.3} ${cy - r * 0.95}`;

const langs = ["JavaScript", "Python", "Perl", "Bash", "awk"];
const langRow = langs
  .map((l, i) => {
    const x = 68 + i * 145;
    return `<rect x="${x}" y="470" width="132" height="34" rx="17" fill="${PAPER}" stroke="${GOOD}" stroke-width="2"/>
  <text x="${x + 66}" y="493" font-family="JetBrains Mono" font-size="16" font-weight="700" fill="${GOOD}" text-anchor="middle">${l}</text>`;
  })
  .join("\n  ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${PAPER}"/>

  <!-- the loop: a self-reference arrow -->
  <path d="${loopPath}" fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>
  <path d="M ${cx - r * 0.3 - 26} ${cy - r * 0.95 - 8} L ${cx - r * 0.3} ${cy - r * 0.95} L ${cx - r * 0.3 + 10} ${cy - r * 0.95 - 30}" fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
  <text x="${cx}" y="${cy + 8}" font-family="JetBrains Mono" font-size="15" fill="${MUTED}" text-anchor="middle">output</text>
  <text x="${cx}" y="${cy + 28}" font-family="JetBrains Mono" font-size="15" fill="${MUTED}" text-anchor="middle">= source</text>

  <text x="66" y="230" font-family="JetBrains Mono" font-weight="800" font-size="76" fill="${INK}">quine garden</text>
  <text x="68" y="278" font-family="JetBrains Mono" font-size="23" fill="${MUTED}">programs whose entire output is their own source —</text>
  <text x="68" y="310" font-family="JetBrains Mono" font-size="23" fill="${MUTED}">five of them, run and byte-diffed before planting</text>

  <text x="68" y="440" font-family="JetBrains Mono" font-size="18" fill="${MUTED}">verified, not copied from memory:</text>
  ${langRow}

  <text x="68" y="580" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${ACCENT}">bisks.net/quine-garden</text>
</svg>`;

const fontPath = fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url));
const r_ = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
});
const png = r_.render().asPng();
const out = new URL("./public/og.png", import.meta.url).pathname;
writeFileSync(out, png);
console.log("wrote", out);
