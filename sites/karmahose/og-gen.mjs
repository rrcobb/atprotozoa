// Generates public/og.png — the Open Graph preview card for karmahose.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium/fontconfig needed — font is
// bundled in ./fonts and loaded explicitly). Copied from sites/socialcredit/og-gen.mjs.
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
const BG = "#fffdf8", INK = "#14171a", MUTED = "#6b6b6b", FAINT = "#e2ddd0";
const ACCENT = "#1a5fd0", UP = "#17795a", DOWN = "#c0392b";

// A little scrolling-feed panel on the right: arbitrary names, arbitrary
// deltas — the whole point of the bot.
const rows = [
  { name: "socialcredit", score: "+41", color: UP },
  { name: "mormonism mentioned in a realistic context", score: "+7", color: UP },
  { name: "gulls", score: "+3", color: UP },
  { name: "airport wifi", score: "−12", color: DOWN },
  { name: "reply guys", score: "−4", color: DOWN },
];

const panelX = 660, panelY = 96, panelW = 470, rowH = 82;
let rowsSvg = "";
rows.forEach((r, i) => {
  const y = panelY + i * rowH;
  const label = r.name.length > 30 ? r.name.slice(0, 29) + "…" : r.name;
  rowsSvg += `
  <text x="${panelX}" y="${y + 18}" font-family="JetBrains Mono" font-size="17" fill="${INK}">${label}</text>
  <text x="${panelX + panelW}" y="${y + 18}" text-anchor="end" font-family="JetBrains Mono" font-weight="800" font-size="22" fill="${r.color}">${r.score}</text>
  ${i > 0 ? `<line x1="${panelX}" y1="${y - 14}" x2="${panelX + panelW}" y2="${y - 14}" stroke="${FAINT}" stroke-width="2"/>` : ""}`;
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>

  <text x="64" y="140" font-family="JetBrains Mono" font-weight="800" font-size="62" fill="${INK}">karmahose</text>
  <text x="64" y="184" font-family="JetBrains Mono" font-size="21" fill="${MUTED}">points for <tspan fill="${ACCENT}">anything</tspan>, forever</text>

  <text x="64" y="260" font-family="JetBrains Mono" font-size="17" fill="${MUTED}">post anything ending in</text>
  <text x="64" y="286" font-family="JetBrains Mono" font-size="17" fill="${INK}" font-weight="700">"&lt;name&gt; <tspan fill="${UP}">+1</tspan>" or "&lt;name&gt; <tspan fill="${DOWN}">-1</tspan>"</text>
  <text x="64" y="322" font-family="JetBrains Mono" font-size="17" fill="${MUTED}">and it joins a running global tally —</text>
  <text x="64" y="348" font-family="JetBrains Mono" font-size="17" fill="${MUTED}">no signup, no target, watched live</text>
  <text x="64" y="374" font-family="JetBrains Mono" font-size="17" fill="${MUTED}">off the Bluesky firehose.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT}">karmahose.bisks.net</text>

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
