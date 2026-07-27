// Generates public/og.png — the static Open Graph preview card for the bare
// wentviral link. Per-post shares get their own dynamic og:title/description
// stamped server-side (see src/index.ts) — this is just the generic
// fallback. Hand-drawn SVG, rasterised with @resvg/resvg-js and skyclone's
// bundled JetBrains Mono font (no system Chromium/fontconfig needed). Same
// recipe as sites/skyclone/og-gen.mjs and sites/didscope/og-gen.mjs.
//
//   node og-gen.mjs   # writes ./public/og.png (borrows resvg + the font
//                      # from sites/skyclone — build-time only, not a
//                      # runtime dependency of this site)

import { Resvg } from "../skyclone/node_modules/@resvg/resvg-js/index.js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const fontPath = fileURLToPath(new URL("../skyclone/fonts/JetBrainsMono.ttf", import.meta.url));

const W = 1200, H = 630;
const BG = "#07070a", FG = "#ece7f5", DIM = "#9a8eae";
const ACCENT = "#ff5d8f", ACCENT2 = "#ffb84f", CARD = "#150f1a", BORDER = "#2a2233", LIKE = "#ff5d8f";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function post(x, y, w, name, handle, text, color, likes) {
  return `
  <g>
    <rect x="${x}" y="${y}" width="${w}" height="118" rx="14" fill="${CARD}" stroke="${BORDER}"/>
    <circle cx="${x + 38}" cy="${y + 38}" r="19" fill="${color}"/>
    <text x="${x + 38}" y="${y + 44}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="15" fill="${BG}">${esc(name[0])}</text>
    <text x="${x + 68}" y="${y + 34}" font-family="JetBrains Mono" font-weight="700" font-size="15" fill="${FG}">${esc(name)}</text>
    <text x="${x + 68}" y="${y + 53}" font-family="JetBrains Mono" font-size="13" fill="${DIM}">${esc(handle)}</text>
    <text x="${x + 38}" y="${y + 86}" font-family="JetBrains Mono" font-size="14" fill="${FG}">${esc(text)}</text>
    <text x="${x + 38}" y="${y + 106}" font-family="JetBrains Mono" font-size="12" fill="${LIKE}">${likes} likes</text>
  </g>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="15%" cy="0%" r="55%">
      <stop offset="0" stop-color="#3a1d2c"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${ACCENT}"/>
      <stop offset="1" stop-color="${ACCENT2}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>

  <rect x="60" y="52" width="30" height="30" rx="8" fill="url(#title)" transform="rotate(45 75 67)"/>
  <text x="112" y="98" font-family="JetBrains Mono" font-weight="800" font-size="54" fill="url(#title)">wentviral</text>
  <text x="64" y="150" font-family="JetBrains Mono" font-size="21" fill="${DIM}">write a fake post. watch it blow up. nothing is real.</text>

  ${post(64, 200, 520, "You", "@you.viral.fake", "just tried wentviral and now I understand", ACCENT, "4.2K")}
  ${post(616, 240, 520, "Feral Shrimp", "@feralshrimp.viral.fake", "wait this is unhinged", ACCENT2, "312")}
  ${post(64, 340, 520, "Unhinged Moth", "@unhinged921.viral.fake", "the way this lives in my head now", "#6fc3ff", "88")}
  ${post(616, 400, 520, "Local Goblin", "@localgoblin.viral.fake", "quote posting because the replies aren't enough", "#7ee787", "540")}

  <text x="64" y="588" font-family="JetBrains Mono" font-size="16" fill="${DIM}">bisks.net/wentviral · a fake bluesky compose box</text>
</svg>`;

const resvg = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
});
const png = resvg.render().asPng();
const out = fileURLToPath(new URL("./public/og.png", import.meta.url));
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");
