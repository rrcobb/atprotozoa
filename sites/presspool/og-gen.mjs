// Generates public/og.png — the Open Graph preview card for presspool, so a
// shared link auto-renders a picture of the button + odds board in Bluesky /
// other unfurlers.
//
// Hand-drawn SVG at the canonical OG size: a small red DO NOT PRESS button
// (echoing dontpressit's artwork, the site this bets on) plus wordmark and
// pitch on the left, a sample time-bucket odds card on the right (generic
// placeholder buckets/odds, not real bets — the real market is rendered
// live, client-side, in public/index.html). Rasterised with @resvg/resvg-js
// (pure native module, no system Chromium/fontconfig needed — the font is
// bundled in ./fonts and loaded explicitly).
//
//   node og-gen.mjs   # writes ./public/og.png (node_modules + fonts copied
//                      # in from sites/guestbet, which already vendors this)
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork. Adapted from sites/guestbet/og-gen.mjs.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#0a0e14", INK = "#eef2f7", MUTED = "#8b98a8";
const ACCENT = "#4da3ff", GOOD = "#59d38c";
const RED = "#e0261f", REDDARK = "#3a1210";
const CARD = "#10151d", BORDER = "rgba(238,242,247,0.14)";

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

const cardX = 660, cardY = 118, cardW = 480, cardH = 400;
const rows = [
  { name: "within the hour", odds: "9.4x" },
  { name: "this week", odds: "2.1x" },
  { name: "180+ days (maybe never)", odds: "1.6x" },
];

let rowsSvg = "";
rows.forEach((r, i) => {
  const y = cardY + 92 + i * 96;
  rowsSvg += `
    <text x="${cardX + 40}" y="${y}" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${INK}">${esc(r.name)}</text>
    <rect x="${cardX + 40}" y="${y + 18}" width="${cardW - 80}" height="1" fill="${BORDER}"/>
    <text x="${cardX + cardW - 40}" y="${y}" text-anchor="end" font-family="JetBrains Mono" font-weight="800" font-size="24" fill="${GOOD}">${r.odds}</text>`;
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="10%" cy="0%" r="60%">
      <stop offset="0" stop-color="#3a1015"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>

  <circle cx="98" cy="100" r="58" fill="${RED}"/>
  <circle cx="98" cy="100" r="58" fill="none" stroke="${REDDARK}" stroke-width="8"/>
  <text x="98" y="107" font-family="JetBrains Mono" font-weight="800" font-size="15" fill="#ffffff" text-anchor="middle">DO NOT</text>
  <text x="98" y="122" font-family="JetBrains Mono" font-weight="800" font-size="13" fill="#ffffff" text-anchor="middle">PRESS</text>

  <text x="180" y="118" font-family="JetBrains Mono" font-weight="800" font-size="52" fill="${INK}">press<tspan fill="${RED}">pool</tspan></text>

  <text x="64" y="200" font-family="JetBrains Mono" font-size="20" fill="${MUTED}">a betting market on when the one shared</text>
  <text x="64" y="228" font-family="JetBrains Mono" font-size="20" fill="${MUTED}">"do not press this button" button finally</text>
  <text x="64" y="256" font-family="JetBrains Mono" font-size="20" fill="${MUTED}">gets pressed. we don't want you to.</text>

  <text x="64" y="336" font-family="JetBrains Mono" font-size="17" fill="${MUTED}">Bet play money on a time bucket. Odds</text>
  <text x="64" y="362" font-family="JetBrains Mono" font-size="17" fill="${MUTED}">move live, pari-mutuel. No account.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT}">presspool.bisks.net</text>

  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="18" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>
  <text x="${cardX + 40}" y="${cardY + 42}" font-family="JetBrains Mono" font-weight="700" font-size="13" letter-spacing="2" fill="${RED}">WHEN WILL IT BE PRESSED</text>
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
