// Generates public/og.png — the Open Graph preview card for relegation, so a
// shared link auto-renders a picture of the league table in Bluesky / other
// unfurlers.
//
// Hand-draws a representative "screenshot" of a league table as an SVG — a
// couple of green promotion rows with long engagement bars, a couple of red
// relegation rows with short/zero bars — at the canonical OG size, then
// rasterises it with @resvg/resvg-js (pure native module, no system Chromium
// needed — this box has no fontconfig/system fonts either, so the font is
// bundled in ./fonts and loaded explicitly). Copied from
// sites/innercircle/og-gen.mjs (copy, don't abstract).
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

const INK = "#111111", MUTED = "#6b6b6b";
const GOOD = "#1f8a4c", GOOD_BG = "#e7f5ec";
const BAD = "#c0392b", BAD_BG = "#fbeaea";
const FAINT = "#e4e4e4", FAINTBG = "#f6f6f6";
const TINTS = ["#1a5fd0", "#8e44ad", "#e0a400", "#0f9b9b", "#2c8c3c", "#d81e6a"];

// tiny seeded RNG so the layout is identical every run
let seed = 4242;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

const tableX = 560, tableY = 120, rowH = 62, rowW = 560;
const ROWS = [
  { zone: "good", bar: 0.92, tag: "call-up" },
  { zone: "good", bar: 0.74, tag: "call-up" },
  { zone: "neutral", bar: 0.4, tag: "" },
  { zone: "bad", bar: 0.1, tag: "relegate" },
  { zone: "bad", bar: 0.0, tag: "relegate" },
];

let tableSvg = "";
ROWS.forEach((row, i) => {
  const y = tableY + i * (rowH + 6);
  const bg = row.zone === "good" ? GOOD_BG : row.zone === "bad" ? BAD_BG : "#ffffff";
  const stroke = row.zone === "good" ? GOOD : row.zone === "bad" ? BAD : FAINT;
  const barColor = row.zone === "good" ? GOOD : row.zone === "bad" ? BAD : MUTED;
  tableSvg += `<rect x="${tableX}" y="${y}" width="${rowW}" height="${rowH}" rx="8" fill="${bg}" stroke="${stroke}"/>`;
  // avatar dot
  tableSvg += `<circle cx="${tableX + 34}" cy="${y + rowH / 2}" r="14" fill="${TINTS[i % TINTS.length]}"/>`;
  // name bar (stand-in for a handle)
  const nameW = 90 + rnd() * 60;
  tableSvg += `<rect x="${tableX + 62}" y="${y + 16}" width="${nameW}" height="10" rx="3" fill="${INK}" opacity="0.75"/>`;
  // engagement bar
  const barMaxW = 300, barW = Math.max(4, row.bar * barMaxW);
  tableSvg += `<rect x="${tableX + 62}" y="${y + 34}" width="${barMaxW}" height="10" rx="5" fill="${FAINTBG}"/>`;
  tableSvg += `<rect x="${tableX + 62}" y="${y + 34}" width="${barW}" height="10" rx="5" fill="${barColor}"/>`;
  // tag chip
  if (row.tag) {
    const chipW = row.tag.length * 8 + 20;
    const chipX = tableX + rowW - chipW - 14;
    tableSvg += `<rect x="${chipX}" y="${y + 20}" width="${chipW}" height="22" rx="11" fill="${barColor}"/>`;
    tableSvg += `<text x="${chipX + chipW / 2}" y="${y + 35}" text-anchor="middle" font-family="JetBrains Mono" font-size="12" fill="#ffffff">${row.tag}</text>`;
  }
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#ffffff"/>

  <!-- wordmark -->
  <text x="64" y="90" font-family="JetBrains Mono" font-weight="700"
    font-size="42" fill="${INK}">relegation</text>
  <text x="64" y="128" font-family="JetBrains Mono" font-size="18"
    fill="${MUTED}">who's getting dropped</text>
  <text x="64" y="152" font-family="JetBrains Mono" font-size="18"
    fill="${MUTED}">from your mutuals</text>

  <!-- blurb on the left -->
  <text x="64" y="230" font-family="JetBrains Mono" font-size="17" fill="${INK}">Sign in. It reads</text>
  <text x="64" y="260" font-family="JetBrains Mono" font-size="17" fill="${INK}">your whole post</text>
  <text x="64" y="290" font-family="JetBrains Mono" font-size="17" fill="${INK}">history for who</text>
  <text x="64" y="320" font-family="JetBrains Mono" font-size="17" fill="${INK}">actually likes and</text>
  <text x="64" y="350" font-family="JetBrains Mono" font-size="17" fill="${INK}">replies — then ranks</text>
  <text x="64" y="380" font-family="JetBrains Mono" font-size="17" fill="${INK}">moots vs. followers.</text>

  <rect x="56" y="440" width="18" height="18" rx="9" fill="${GOOD_BG}" stroke="${GOOD}"/>
  <text x="86" y="454" font-family="JetBrains Mono" font-size="14" fill="${MUTED}">promotion candidate</text>
  <rect x="56" y="470" width="18" height="18" rx="9" fill="${BAD_BG}" stroke="${BAD}"/>
  <text x="86" y="484" font-family="JetBrains Mono" font-size="14" fill="${MUTED}">relegation zone</text>

  <!-- the league table -->
  ${tableSvg}

  <!-- footer strip -->
  <text x="64" y="600" font-family="JetBrains Mono" font-size="16"
    fill="${MUTED}">sign in · least likes/replies get relegated · top followers get called up</text>
  <text x="${W - 64}" y="600" text-anchor="end" font-family="JetBrains Mono"
    font-size="16" fill="#1a5fd0">relegation.bisks.net</text>
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
