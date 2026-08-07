// Generates public/og.png — the static Open Graph preview card for the bare
// bskyxp link. Per-profile/per-post shares get their own dynamic og:image
// server-side (see src/index.ts) — this is just the generic fallback.
// Hand-drawn SVG, rasterised with @resvg/resvg-js (no system Chromium/
// fontconfig needed — the font is bundled in ./fonts). Same recipe as
// sites/skyclone/og-gen.mjs. Emoji glyphs don't rasterise reliably without a
// bundled color-emoji font, so the fake "window" below uses plain shapes
// (squares/bars) to stand in for the real icon-tile grid instead of emoji.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const SILVER = "#ece9d8", SILVER_DARK = "#d8d3c2";
const BLUE_DEEP = "#0d3fae", BLUE = "#2a66c8", BLUE_LIGHT = "#5b9bff";
const INK_DIM = "#52504a";

function iconTile(x, y, accent) {
  return `<g>
    <rect x="${x}" y="${y}" width="46" height="46" fill="#fff" stroke="#6b6b6b" stroke-width="2"/>
    <rect x="${x + 12}" y="${y + 12}" width="22" height="22" rx="3" fill="${accent}"/>
    <rect x="${x + 3}" y="${y + 54}" width="40" height="6" rx="2" fill="${INK_DIM}" opacity="0.55"/>
  </g>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="desktop" cx="30%" cy="-10%" r="90%">
      <stop offset="0" stop-color="#6ba8f0"/>
      <stop offset="45%" stop-color="#2f6fd6"/>
      <stop offset="100%" stop-color="#1449ad"/>
    </radialGradient>
    <linearGradient id="titlebar" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#4c8df0"/>
      <stop offset="0.1" stop-color="#1f5fd6"/>
      <stop offset="0.45" stop-color="#1a56cc"/>
      <stop offset="0.7" stop-color="#0d3fae"/>
      <stop offset="1" stop-color="#123f9e"/>
    </linearGradient>
    <linearGradient id="toolbar" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f6f4ec"/>
      <stop offset="1" stop-color="#dcd7c6"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#desktop)"/>

  <text x="60" y="76" font-family="JetBrains Mono" font-weight="800" font-size="46" fill="#ffffff">Bluesky Social</text>
  <text x="60" y="108" font-family="JetBrains Mono" font-size="18" fill="#dce6fb">a real, working Bluesky client — skinned entirely as a Windows-XP desktop launcher</text>

  <!-- fake app window -->
  <g>
    <rect x="60" y="150" width="720" height="410" rx="9" fill="${SILVER}" stroke="#0a2f80" stroke-width="2"/>
    <rect x="60" y="150" width="720" height="34" rx="9" fill="url(#titlebar)"/>
    <rect x="60" y="167" width="720" height="17" fill="url(#titlebar)"/>
    <text x="78" y="173" font-family="JetBrains Mono" font-weight="700" font-size="15" fill="#ffffff">Bluesky Social</text>
    <rect x="744" y="158" width="18" height="16" rx="2" fill="#6fabf6" stroke="#0a3a91"/>
    <rect x="726" y="158" width="14" height="16" rx="2" fill="#6fabf6" stroke="#0a3a91"/>
    <rect x="708" y="158" width="14" height="16" rx="2" fill="#f6968a" stroke="#8a1f14"/>

    <rect x="60" y="184" width="720" height="30" fill="url(#toolbar)"/>
    <rect x="72" y="192" width="70" height="14" rx="2" fill="${BLUE_LIGHT}" opacity="0.5"/>
    <rect x="150" y="192" width="60" height="14" rx="2" fill="#fff" opacity="0.6"/>
    <rect x="218" y="192" width="90" height="14" rx="2" fill="#fff" opacity="0.6"/>

    <!-- three columns: explore rail / icon grid / notif rail -->
    <line x1="150" y1="214" x2="150" y2="560" stroke="${SILVER_DARK}" stroke-width="2"/>
    <line x1="690" y1="214" x2="690" y2="560" stroke="${SILVER_DARK}" stroke-width="2"/>

    <text x="76" y="240" font-family="JetBrains Mono" font-style="italic" font-weight="800" font-size="15" fill="#1a7a1a">• Explore</text>
    ${iconTile(85, 260, BLUE)}
    ${iconTile(85, 340, "#c8264a")}

    <text x="172" y="240" font-family="JetBrains Mono" font-style="italic" font-weight="800" font-size="15" fill="#1a7a1a">• Your Timeline</text>
    ${iconTile(180, 258, "#0d7a2f")}
    ${iconTile(260, 258, "#c8264a")}
    ${iconTile(340, 258, "#8a1a9e")}
    ${iconTile(420, 258, BLUE)}
    ${iconTile(500, 258, "#c8960c")}

    <text x="172" y="358" font-family="JetBrains Mono" font-style="italic" font-weight="800" font-size="15" fill="#1a7a1a">• Post &amp; Connect</text>
    ${iconTile(180, 376, "#c8264a")}
    ${iconTile(260, 376, "#0d7a2f")}
    ${iconTile(340, 376, BLUE)}

    <text x="172" y="474" font-family="JetBrains Mono" font-style="italic" font-weight="800" font-size="15" fill="#8a1a9e">• Discover</text>
    ${iconTile(180, 492, "#c8960c")}
    ${iconTile(260, 492, BLUE)}

    <text x="704" y="240" font-family="JetBrains Mono" font-style="italic" font-weight="800" font-size="14" fill="#1a7a1a">• Notif.</text>
    ${iconTile(704, 258, "#0d7a2f")}
  </g>

  <text x="820" y="200" font-family="JetBrains Mono" font-weight="700" font-size="17" fill="#ffffff">Real login. Real posts.</text>
  <text x="820" y="228" font-family="JetBrains Mono" font-size="15" fill="#dce6fb">Real atproto OAuth (PKCE + DPoP),</text>
  <text x="820" y="252" font-family="JetBrains Mono" font-size="15" fill="#dce6fb">straight to your own PDS — bskyxp</text>
  <text x="820" y="276" font-family="JetBrains Mono" font-size="15" fill="#dce6fb">never sees your password.</text>

  <text x="820" y="322" font-family="JetBrains Mono" font-weight="700" font-size="17" fill="#ffffff">Every write is genuine.</text>
  <text x="820" y="350" font-family="JetBrains Mono" font-size="15" fill="#dce6fb">Posting, replying, liking,</text>
  <text x="820" y="374" font-family="JetBrains Mono" font-size="15" fill="#dce6fb">reposting, blocking — real</text>
  <text x="820" y="398" font-family="JetBrains Mono" font-size="15" fill="#dce6fb">records on your own repo.</text>

  <rect x="820" y="470" width="320" height="56" rx="3" fill="${SILVER}" stroke="#0a2f80" stroke-width="2"/>
  <text x="840" y="505" font-family="JetBrains Mono" font-weight="800" font-size="21" fill="${BLUE_DEEP}">bskyxp.bisks.net</text>

  <text x="60" y="600" font-family="JetBrains Mono" font-size="14" fill="#dce6fb" opacity="0.85">not affiliated with Bluesky PBC · part of the atprotozoa garden</text>
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
