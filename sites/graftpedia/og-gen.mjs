// Generates public/og.png — the static Open Graph preview card for
// GraftPedia. Hand-drawn SVG at the canonical OG size, rasterised with
// @resvg/resvg-js (no system fonts in this box, so DejaVu Serif is bundled in
// ./fonts and loaded explicitly). Copied and trimmed from
// sites/splicepedia/og-gen.mjs, reskinned to highlight grafted PHRASES within
// a sentence (splicepedia highlights whole sentences; wordsplice highlights
// single words) — each colored run is one grafted chunk, tagged with the
// unrelated article it was cut from.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#ffffff", INK = "#202122", MUTED = "#54595d", BORDER = "#a2a9b1", BOXBG = "#f8f9fa";
const RED = "#ab1f24", GOLD = "#b8710a", BLUE = "#0645ad";

// One sentence, broken into runs: plain skeleton text plus grafted phrases
// (each tagged with its real, unrelated source article) — sells the "syntax
// tree semantic vandalism" pitch at a glance, the way splicepedia's card
// sells whole-sentence splicing and wordsplice's sells word clippings.
const runs = [
  { text: "The reign of ", graft: false },
  { text: "a keystone species in wetland restoration", graft: true, source: "North American beaver", color: BLUE },
  { text: " ended abruptly when it ", graft: false },
  { text: "was later adapted into a widely exported instant noodle format", graft: true, source: "Kimchi-jjigae", color: GOLD },
  { text: ".", graft: false },
];

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Rough character-per-line budget for wrapping, good enough for a hand-rolled
// SVG card (no real text measurement available at generation time). Coloring
// grafted phrases by fill (rather than a background rect) sidesteps needing
// accurate glyph widths at all — a single <text> per line with <tspan>s
// flows naturally, so word spacing comes from the real font, not a guess.
const FONT_SIZE = 25;
const LINE_H = 42;
const TEXT_X = 96;
const CHARS_PER_LINE = 58;

function wrapRuns(runs) {
  const lines = [[]];
  let lineLen = 0;
  for (const run of runs) {
    const words = run.text.split(/(?<=\s)/).filter(Boolean);
    for (const w of words) {
      if (lineLen + w.length > CHARS_PER_LINE && lineLen > 0) { lines.push([]); lineLen = 0; }
      lines[lines.length - 1].push({ ...run, text: w });
      lineLen += w.length;
    }
  }
  return lines;
}

const lines = wrapRuns(runs);
const graftTags = [];
const bodySvg = lines
  .map((line, li) => {
    const y = 300 + li * LINE_H;
    const tspans = line
      .map((run) => {
        if (run.graft && !graftTags.some((t) => t.source === run.source)) graftTags.push({ source: run.source, color: run.color });
        const fill = run.graft ? run.color : INK;
        const weight = run.graft ? ' font-weight="700"' : "";
        return `<tspan fill="${fill}"${weight}>${esc(run.text)}</tspan>`;
      })
      .join("");
    return `<text x="${TEXT_X}" y="${y}" xml:space="preserve" font-family="DejaVu Serif" font-size="${FONT_SIZE}">${tspans}</text>`;
  })
  .join("\n");

const tagRows = graftTags
  .map((t, i) => `<text x="${TEXT_X}" y="${300 + lines.length * LINE_H + 34 + i * 26}" font-family="DejaVu Serif" font-weight="700" font-size="15" fill="${t.color}">grafted from “${esc(t.source)}”</text>`)
  .join("\n");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect x="0" y="0" width="${W}" height="10" fill="${INK}"/>

  <text x="64" y="150" font-family="DejaVu Serif" font-weight="700" font-size="80" fill="${INK}">GraftPedia</text>
  <text x="68" y="192" font-family="DejaVu Serif" font-size="26" fill="${MUTED}">syntax-tree semantic vandalism</text>

  <line x1="64" y1="222" x2="${W - 64}" y2="222" stroke="${BORDER}" stroke-width="2"/>

  <rect x="64" y="255" width="${W - 128}" height="245" rx="8" fill="${BOXBG}" stroke="${BORDER}" stroke-width="1.5"/>
  ${bodySvg}
  ${tagRows}

  <text x="96" y="536" font-family="DejaVu Serif" font-size="20" fill="${MUTED}">Every phrase is real. The grammar is perfect. Nothing belongs together.</text>

  <text x="64" y="590" font-family="DejaVu Serif" font-weight="700" font-size="26" fill="${RED}">graftpedia.bisks.net</text>
</svg>`;

const fontRegular = fileURLToPath(new URL("./fonts/DejaVuSerif.ttf", import.meta.url));
const fontBold = fileURLToPath(new URL("./fonts/DejaVuSerif-Bold.ttf", import.meta.url));
const r = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontRegular, fontBold], loadSystemFonts: false, defaultFontFamily: "DejaVu Serif" },
});
const png = r.render().asPng();
const out = fileURLToPath(new URL("./public/og.png", import.meta.url));
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");
