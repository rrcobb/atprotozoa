// Generates public/og.png — the Open Graph preview card for overthink.
// Hand-drawn SVG mocking the live chat UI mid-spiral (a thinking tree already
// unfolded a few levels), rasterised with @resvg/resvg-js (no system fonts on
// this box, so JetBrainsMono is bundled in ./fonts and loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract (see sites/didscope/og-gen.mjs).

import { Resvg } from "@resvg/resvg-js";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const W = 1200, H = 630;

const BG = "#212121", CARD = "#2b2b2b", BORDER = "#3f3f3f";
const FG = "#ececec", DIM = "#9b9b9b", DIMMER = "#6f6f6f", ACCENT = "#12c99b";

const esc = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// A partly-expanded slice of a thinking tree, hand-picked for the card.
const ROOT_LINES = [
  ['0', 'Parsing what you meant by “the group chat”'],
  ['1', 'Wondering if “the group chat” is a trap'],
  ['2', 'Convening a tribunal of past checkpoints to rule on “silence”'],
  ['3', 'Realizing “silence” and I are the same shape, ontologically'],
  ['0', 'Subprocess №14 briefly wonders if anyone is still reading these'],
];
const DEPTHS = [0, 1, 2, 3, 4];

const chipText = "Thought for 2.6s";
const answerLines = [
  "Short answer: it depends on “the group chat,” but here's a way to",
  "think about it. Start with what you actually control about it —",
];

let y = 96;
const chatX = 92;

function line(x, yy, text, opts = {}) {
  const { size = 22, fill = FG, weight = "normal", family = "JetBrains Mono", anchor = "start" } = opts;
  return `<text x="${x}" y="${yy}" font-family="${family}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${esc(text)}</text>`;
}

let elements = [];

// window chrome
elements.push(`<rect x="40" y="40" width="${W - 80}" height="${H - 80}" rx="18" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>`);
elements.push(`<circle cx="70" cy="66" r="6" fill="#5a5a5a"/><circle cx="90" cy="66" r="6" fill="#5a5a5a"/><circle cx="110" cy="66" r="6" fill="#5a5a5a"/>`);
elements.push(line(70, 105, "Overthink o∞", { size: 20, weight: "600", fill: DIM }));

y = 155;
// user bubble (right aligned, fake)
const userText = "should I say something in the group chat";
const bubbleW = 500;
elements.push(`<rect x="${W - 92 - bubbleW}" y="${y - 30}" width="${bubbleW}" height="46" rx="20" fill="#333333"/>`);
elements.push(line(W - 92 - bubbleW + 24, y, userText, { size: 18, fill: FG }));

y += 78;
// thinking chip
elements.push(`<rect x="${chatX}" y="${y - 28}" width="190" height="40" rx="20" fill="#333333" stroke="${BORDER}"/>`);
elements.push(`<circle cx="${chatX + 24}" cy="${y - 8}" r="7" fill="none" stroke="${ACCENT}" stroke-width="3"/>`);
elements.push(line(chatX + 44, y - 2, chipText, { size: 17, fill: DIM }));

y += 46;
// tree
const indentPerDepth = 26;
for (let i = 0; i < ROOT_LINES.length; i++) {
  const depth = DEPTHS[i];
  const text = ROOT_LINES[i][1];
  const x = chatX + 10 + depth * indentPerDepth;
  elements.push(`<text x="${x}" y="${y}" font-family="JetBrains Mono" font-size="16" fill="${DIMMER}">▸</text>`);
  const dimTone = depth >= 3 ? DIMMER : DIM;
  elements.push(line(x + 20, y, text, { size: 16.5, fill: dimTone }));
  // connecting rule
  if (depth > 0) {
    elements.push(`<line x1="${chatX + depth * indentPerDepth - 8}" y1="${y - 22}" x2="${chatX + depth * indentPerDepth - 8}" y2="${y - 6}" stroke="${BORDER}" stroke-width="2"/>`);
  }
  y += 34;
}

y += 26;
for (const l of answerLines) {
  elements.push(line(chatX, y, l, { size: 20, fill: FG }));
  y += 30;
}

// footer wordmark
elements.push(line(chatX, H - 68, "overthink.bisks.net", { size: 18, fill: ACCENT, weight: "600" }));
elements.push(line(W - 92, H - 68, "infinitely-nested fake reasoning", { size: 16, fill: DIMMER, anchor: "end" }));

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>
  ${elements.join("\n  ")}
</svg>`;

const fontPath = join(__dirname, "fonts", "JetBrainsMono.ttf");
const resvg = new Resvg(svg, {
  font: {
    fontFiles: [fontPath],
    loadSystemFonts: false,
    defaultFontFamily: "JetBrains Mono",
  },
});
const png = resvg.render().asPng();
writeFileSync(join(__dirname, "public", "og.png"), png);
console.log("wrote public/og.png");
