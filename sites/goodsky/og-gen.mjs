// Generates public/og.png — the static Open Graph preview card for the bare
// goodsky link, so it unfurls as a real picture instead of a blank card.
// Per-profile/per-post shares get their own dynamic og:image server-side
// (see src/index.ts) — this is just the generic fallback. Hand-drawn SVG,
// rasterised with @resvg/resvg-js (no system Chromium/fontconfig needed —
// the font is bundled in ./fonts). Same recipe as sites/didscope/og-gen.mjs.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#07050a", BG2 = "#100b17", FG = "#ece7f5", DIM = "#9a8bb0";
const ACCENT = "#b388ff", ACCENT2 = "#7c5cd6", REPOST = "#7ee787", CARD = "#150f1e", BORDER = "#2c2338";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function fakePost(x, y, w, name, handle, text, avatarLetter, avatarColor) {
  return `
  <g>
    <rect x="${x}" y="${y}" width="${w}" height="128" rx="14" fill="${CARD}" stroke="${BORDER}"/>
    <circle cx="${x + 40}" cy="${y + 40}" r="20" fill="${avatarColor}"/>
    <text x="${x + 40}" y="${y + 47}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="16" fill="${BG}">${avatarLetter}</text>
    <text x="${x + 72}" y="${y + 36}" font-family="JetBrains Mono" font-weight="700" font-size="15" fill="${FG}">${esc(name)}</text>
    <text x="${x + 72}" y="${y + 56}" font-family="JetBrains Mono" font-size="13" fill="${DIM}">${esc(handle)}</text>
    <text x="${x + 40}" y="${y + 92}" font-family="JetBrains Mono" font-size="14" fill="${FG}">${esc(text)}</text>
  </g>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="15%" cy="0%" r="55%">
      <stop offset="0" stop-color="#241a3d"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${ACCENT}"/>
      <stop offset="1" stop-color="${ACCENT2}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>

  <g fill="none" stroke="${ACCENT}" stroke-width="4" stroke-linecap="round" opacity="0.9">
    <path d="M46 78 Q22 60 8 64"/>
    <path d="M46 88 Q18 84 4 90"/>
    <path d="M46 98 Q18 106 6 116"/>
    <path d="M46 106 Q24 122 12 132"/>
    <path d="M82 78 Q106 60 120 64"/>
    <path d="M82 88 Q110 84 124 90"/>
    <path d="M82 98 Q110 106 122 116"/>
    <path d="M82 106 Q104 122 116 132"/>
  </g>
  <ellipse cx="64" cy="104" rx="28" ry="22" fill="${ACCENT}" opacity="0.9"/>
  <circle cx="64" cy="72" r="17" fill="${ACCENT}" opacity="0.9"/>
  <text x="140" y="128" font-family="JetBrains Mono" font-weight="800" font-size="60" fill="url(#title)">goodsky</text>
  <text x="64" y="172" font-family="JetBrains Mono" font-size="20" fill="${DIM}">an unofficial bsky.app, with a</text>
  <text x="64" y="200" font-family="JetBrains Mono" font-size="20" fill="${DIM}">transparent quality filter on every feed</text>

  <text x="64" y="270" font-family="JetBrains Mono" font-size="15" fill="${DIM}">No AI magic, no black box — a small, legible</text>
  <text x="64" y="296" font-family="JetBrains Mono" font-size="15" fill="${DIM}">set of heuristics, adjustable, run entirely</text>
  <text x="64" y="322" font-family="JetBrains Mono" font-size="15" fill="${DIM}">in your browser against live AppView data.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${ACCENT}">goodsky.bisks.net</text>

  ${fakePost(660, 70, 470, "atproto enjoyer", "@ver.ooo", "this is genuinely live data", "V", REPOST)}
  ${fakePost(660, 216, 470, "buildthis", "@buildthis.bisks.net", "built by an agent, for a breakthrough", "A", ACCENT2)}
  <g opacity="0.4">
    ${fakePost(660, 362, 470, "spam bot", "@f0ll0w4f0ll0w", "RT THIS!! LIKE AND SHARE!!", "S", "#6b6178")}
  </g>
  <text x="1090" y="500" text-anchor="end" font-family="JetBrains Mono" font-size="12" fill="${DIM}">filtered</text>
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
