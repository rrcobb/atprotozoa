// Generates public/og.png — the static Open Graph preview card for the bare
// skyclone link, so it unfurls as a real picture instead of a blank card.
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
const BG = "#0d1216", BG2 = "#131a1f", FG = "#e7e9ea", DIM = "#8b98a5";
const ACCENT = "#1185fe", ACCENT2 = "#4fb2ff", CARD = "#171d22", BORDER = "#2a3238";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function fakePost(x, y, w, name, handle, text, avatarLetter, avatarColor) {
  return `
  <g>
    <rect x="${x}" y="${y}" width="${w}" height="128" rx="14" fill="${CARD}" stroke="${BORDER}"/>
    <circle cx="${x + 40}" cy="${y + 40}" r="20" fill="${avatarColor}"/>
    <text x="${x + 40}" y="${y + 47}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="16" fill="#0d1216">${avatarLetter}</text>
    <text x="${x + 72}" y="${y + 36}" font-family="JetBrains Mono" font-weight="700" font-size="15" fill="${FG}">${esc(name)}</text>
    <text x="${x + 72}" y="${y + 56}" font-family="JetBrains Mono" font-size="13" fill="${DIM}">${esc(handle)}</text>
    <text x="${x + 40}" y="${y + 92}" font-family="JetBrains Mono" font-size="14" fill="${FG}">${esc(text)}</text>
  </g>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="15%" cy="0%" r="55%">
      <stop offset="0" stop-color="#0e2a45"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${ACCENT}"/>
      <stop offset="1" stop-color="${ACCENT2}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>

  <path d="M64 92 C40 62 12 68 14 96 C16 122 46 132 64 116 C82 132 112 122 114 96 C116 68 88 62 64 92 Z" fill="${ACCENT}" opacity="0.9"/>
  <text x="140" y="128" font-family="JetBrains Mono" font-weight="800" font-size="60" fill="url(#title)">skyclone</text>
  <text x="64" y="172" font-family="JetBrains Mono" font-size="20" fill="${DIM}">an unofficial bsky.app, rebuilt</text>
  <text x="64" y="200" font-family="JetBrains Mono" font-size="20" fill="${DIM}">with live AT Protocol data</text>

  <text x="64" y="270" font-family="JetBrains Mono" font-size="15" fill="${DIM}">No login. No ads. No database of its own —</text>
  <text x="64" y="296" font-family="JetBrains Mono" font-size="15" fill="${DIM}">every feed, profile and thread is fetched fresh</text>
  <text x="64" y="322" font-family="JetBrains Mono" font-size="15" fill="${DIM}">from Bluesky's public AppView.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${ACCENT2}">bisks.net/skyclone</text>

  ${fakePost(660, 70, 470, "Bluesky", "@bsky.app", "welcome to the sky", "B", ACCENT)}
  ${fakePost(660, 216, 470, "atproto enjoyer", "@ver.ooo", "this is genuinely live data", "V", "#22c55e")}
  ${fakePost(660, 362, 470, "buildthis", "@buildthis.bisks.net", "built by an agent, for fun", "A", ACCENT2)}
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
