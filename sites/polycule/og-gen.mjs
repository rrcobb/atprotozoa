// Generates public/og.png — the static Open Graph preview card for
// polycule.bisks.net, so a bare link (or a share link whose /p/<id> couldn't
// be resolved) still unfurls as a real picture instead of a blank card.
// Hand-drawn SVG at the canonical OG size, matching the live page's neon
// look, rasterised with @resvg/resvg-js (pure native module, no system
// Chromium — this box has no fontconfig/system fonts either, so the font is
// bundled in ./fonts and loaded explicitly). Per-graph share cards are drawn
// live, client-side, in public/index.html (buildShareCard); this is just
// the one generic fallback image.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract (adapted from
// sites/didscope/og-gen.mjs). Re-run this by hand if you change the artwork.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#0c0812", FG = "#f6ecff", DIM = "#b7a3d6";
const ACCENT = "#ff5fd1", TEAL = "#6ef2c9", CARD = "#1c1128", BORDER = "#3a2650";

// A sample cast for the static card (not tied to any real handle or account —
// same five in-universe placeholders public/index.html ships as "load
// example cast"). This sandbox has no emoji font available to resvg (see the
// loadSystemFonts note below), so the static card uses avatar-style initials
// instead of the live page's emoji — the live page and per-graph share cards
// (drawn client-side, in a real browser) still use the actual emoji.
const nodes = [
  { name: "didscope", color: "#ff5fd1", x: 260, y: 300 },
  { name: "receipts", color: "#ffd166", x: 520, y: 245 },
  { name: "sidenote", color: "#6ef2c9", x: 260, y: 420 },
  { name: "trigrams", color: "#7fb8ff", x: 560, y: 420 },
  { name: "chicken mode", color: "#ff8a3d", x: 850, y: 320 },
];
const edges = [
  { a: 0, b: 1, color: "#ff5fd1", dash: "" },
  { a: 1, b: 3, color: "#ff5a5a", dash: "6,3" },
  { a: 2, b: 0, color: "#ff8fd8", dash: "2,4" },
  { a: 4, b: 1, color: "#ffd166", dash: "1,3" },
  { a: 3, b: 2, color: "#6ef2c9", dash: "" },
];

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const edgeSvg = edges
  .map((e) => {
    const a = nodes[e.a], b = nodes[e.b];
    return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${e.color}" stroke-width="3" ${e.dash ? `stroke-dasharray="${e.dash}"` : ""}/>`;
  })
  .join("\n  ");

const nodeSvg = nodes
  .map(
    (n) => `
  <circle cx="${n.x}" cy="${n.y}" r="30" fill="${n.color}" stroke="rgba(0,0,0,0.35)" stroke-width="2"/>
  <text x="${n.x}" y="${n.y + 9}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="#180a22">${n.name[0].toUpperCase()}</text>
  <text x="${n.x}" y="${n.y + 54}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="16" fill="${FG}">${esc(n.name)}</text>`,
  )
  .join("\n  ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="15%" cy="-10%" r="60%">
      <stop offset="0" stop-color="#3a1a52"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="90%" cy="0%" r="55%">
      <stop offset="0" stop-color="#4a1230"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${ACCENT}"/>
      <stop offset="1" stop-color="${TEAL}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <text x="64" y="90" font-family="JetBrains Mono" font-weight="800" font-size="52" fill="url(#title)">polycule</text>
  <text x="64" y="128" font-family="JetBrains Mono" font-size="19" fill="${DIM}">draw your (fictional) agent dating graph</text>

  <rect x="64" y="165" width="${W - 128}" height="340" rx="18" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>
  ${edgeSvg}
  ${nodeSvg}

  <text x="64" y="548" font-family="JetBrains Mono" font-size="16" fill="${DIM}">no real gossip pre-loaded — you build the cast, drag the web, share what happens.</text>
  <text x="64" y="588" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${TEAL}">polycule.bisks.net</text>
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
