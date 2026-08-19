// Generates public/og.png — the Open Graph preview card for hotwater, so a
// shared link auto-renders a picture of a certificate in Bluesky / other
// unfurlers. Hand-drawn SVG at the canonical OG size, matching the live
// page's parchment-patent look, rasterised with @resvg/resvg-js (pure native
// module, no system Chromium needed — this box has no fontconfig/system
// fonts either, so the font is bundled in ./fonts and loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// A generic sample certificate (not tied to any real handle) — this is the
// static fallback card for the bare link. Per-account certificates are
// generated live, client-side, in public/index.html (buildShareCard).
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#ece2c8", FG = "#2c2013", DIM = "#6b5c40";
const ACCENT = "#8b1e1e", ACCENT2 = "#1e5a3a", CARD = "#f6efdc", BORDER = "#cbb98a";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const findings = [
  ["FINDING #1 — EXISTENCE", "Subject maintains an active account on the protocol."],
  ["FINDING #2 — SOCIAL GRAPH", "Other accounts follow this one. Following is confirmed possible."],
  ["FINDING #3 — OUTPUT VOLUME", "Posts have been published, confirming continued use."],
];

const cardX = 470, cardY = 130, cardW = 668, cardH = 400;

let fy = cardY + 66;
const findingsSvg = findings
  .map(([label, body]) => {
    const s = `
    <text x="${cardX + 40}" y="${fy}" font-family="JetBrains Mono" font-weight="700" font-size="14" fill="${ACCENT2}">${esc(label)}</text>
    <text x="${cardX + 40}" y="${fy + 24}" font-family="JetBrains Mono" font-size="16" fill="${FG}">${esc(body)}</text>`;
    fy += 66;
    return s;
  })
  .join("\n");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="15%" cy="-10%" r="60%">
      <stop offset="0" stop-color="#d9c99a"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>

  <!-- left: wordmark + pitch -->
  <text x="64" y="150" font-family="JetBrains Mono" font-weight="800" font-size="60" fill="${ACCENT}">hotwater</text>
  <text x="64" y="192" font-family="JetBrains Mono" font-size="17" fill="${DIM}">Bureau of Redundant Discovery</text>

  <text x="64" y="256" font-family="JetBrains Mono" font-size="18" fill="${DIM}">Enter a handle. Receive a formal</text>
  <text x="64" y="284" font-family="JetBrains Mono" font-size="18" fill="${DIM}">certificate confirming facts you</text>
  <text x="64" y="312" font-family="JetBrains Mono" font-size="18" fill="${DIM}">already, personally, fully knew.</text>

  <circle cx="150" cy="440" r="70" fill="none" stroke="${ACCENT}" stroke-width="4" transform="rotate(-14 150 440)"/>
  <text x="150" y="432" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="15" fill="${ACCENT}" transform="rotate(-14 150 440)">CERTIFIED</text>
  <text x="150" y="452" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="15" fill="${ACCENT}" transform="rotate(-14 150 440)">NOT NEW</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT2}">hotwater.bisks.net</text>

  <!-- right: sample certificate card -->
  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="14" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>
  <line x1="${cardX + 32}" y1="${cardY + 40}" x2="${cardX + cardW - 32}" y2="${cardY + 40}" stroke="${BORDER}" stroke-width="2" stroke-dasharray="1,0"/>
  <text x="${cardX + cardW / 2}" y="${cardY + 30}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="13" letter-spacing="2" fill="${DIM}">CERTIFICATE OF DISCOVERY</text>

  ${findingsSvg}

  <text x="${cardX + cardW - 32}" y="${cardY + cardH - 26}" text-anchor="end" font-family="JetBrains Mono" font-weight="800" font-size="18" fill="${ACCENT}">0% NOVEL</text>
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
