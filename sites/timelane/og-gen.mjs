// Generates public/og.png — the Open Graph preview for timelane. Recipe
// copied from sites/commonplace/og-gen.mjs (rasterised with @resvg/resvg-js,
// no system fontconfig needed).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const INK = "#12181f", PANEL = "#1b232c", PAPER = "#eef3f1", DIM = "#8fa39c";
const TEAL = "#2f8f7a", AMBER = "#e0a83e", CORAL = "#d9694f", BORDER = "#33424c";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${INK}"/>
  <rect x="40" y="40" width="${W - 80}" height="${H - 80}" rx="18" fill="${PANEL}" stroke="${BORDER}" stroke-width="2"/>

  <text x="90" y="170" font-family="JetBrains Mono" font-weight="800" font-size="80" fill="${PAPER}">timelane</text>
  <text x="90" y="216" font-family="JetBrains Mono" font-size="24" fill="${DIM}">boards of swimlanes of bars, events, segments &amp; markers</text>

  <!-- swimlane rows -->
  <rect x="90" y="260" width="1020" height="54" rx="10" fill="${INK}" stroke="${BORDER}"/>
  <rect x="112" y="273" width="640" height="28" rx="14" fill="${TEAL}"/>
  <rect x="770" y="273" width="120" height="28" rx="14" fill="${TEAL}" opacity="0.5"/>

  <rect x="90" y="326" width="1020" height="54" rx="10" fill="${INK}" stroke="${BORDER}"/>
  <rect x="170" y="339" width="300" height="28" rx="14" fill="${AMBER}"/>
  <rect x="490" y="339" width="460" height="28" rx="14" fill="${AMBER}" opacity="0.5"/>

  <rect x="90" y="392" width="1020" height="54" rx="10" fill="${INK}" stroke="${BORDER}"/>
  <rect x="112" y="405" width="420" height="28" rx="14" fill="${CORAL}"/>
  <rect x="560" y="405" width="220" height="28" rx="14" fill="${CORAL}" opacity="0.6"/>
  <circle cx="820" cy="419" r="8" fill="${PAPER}"/>

  <text x="90" y="480" font-family="JetBrains Mono" font-size="20" fill="${DIM}">tasks w/ overdue alerts · markdown inbox · outline view</text>
  <text x="90" y="510" font-family="JetBrains Mono" font-size="20" fill="${DIM}">per-lane share links · import/export · installable, offline, local-first</text>

  <text x="90" y="580" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${TEAL}">timelane.bisks.net</text>
</svg>`;

const fontPath = fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url));
const r = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
});
const png = r.render().asPng();
const out = fileURLToPath(new URL("./public/og.png", import.meta.url));
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");
