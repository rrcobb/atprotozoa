// Generates public/og.png — the Open Graph preview card for SkeetIn, so a
// shared link auto-renders a picture of the LinkedIn-style feed in Bluesky /
// other unfurlers. Hand-drawn SVG at the canonical OG size, rasterised with
// @resvg/resvg-js (pure native module, no system Chromium needed — this box
// has no fontconfig/system fonts either, so the font is bundled in ./fonts
// and loaded explicitly). Only mono is bundled repo-wide, so the card leans
// on LinkedIn's color language (blue-on-white, card chrome) rather than its
// actual sans-serif typography.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// A generic sample post (not tied to any real handle) — this is the static
// fallback card for the bare link. Per-profile share cards use the same
// generic image; only the title/description text varies (see src/index.ts).
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BLUE = "#0a66c2";
const BG = "#f4f2ee";
const CARD = "#ffffff";
const BORDER = "#dcdad6";
const TEXT = "#1a1a1a";
const TEXT2 = "#5a5a5a";
const TEXT3 = "#8a8a8a";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const cardX = 560, cardY = 90, cardW = 560, cardH = 450;

const postLines = [
  "Thrilled to announce I posted a normal amount",
  "today. Humbled, honestly. #synergy #timeline",
  "#blessed",
];

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>

  <!-- left: wordmark + pitch -->
  <rect x="64" y="72" width="76" height="76" rx="14" fill="${BLUE}"/>
  <text x="102" y="126" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="46" fill="#fff">Sk</text>
  <text x="156" y="122" font-family="JetBrains Mono" font-weight="800" font-size="52" fill="${BLUE}">SkeetIn</text>

  <text x="64" y="210" font-family="JetBrains Mono" font-size="24" fill="${TEXT}">Bluesky, but it's LinkedIn.</text>
  <text x="64" y="256" font-family="JetBrains Mono" font-size="18" fill="${TEXT2}">Enter a handle. Watch their skeets</text>
  <text x="64" y="286" font-family="JetBrains Mono" font-size="18" fill="${TEXT2}">become a professional feed —</text>
  <text x="64" y="316" font-family="JetBrains Mono" font-size="18" fill="${TEXT2}">likes become Endorsements,</text>
  <text x="64" y="346" font-family="JetBrains Mono" font-size="18" fill="${TEXT2}">reposts become Reposts.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${BLUE}">skeetin.bisks.net</text>

  <!-- right: mock post card -->
  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="10" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>

  <circle cx="${cardX + 56}" cy="${cardY + 56}" r="28" fill="#ccd6dd"/>
  <text x="${cardX + 56}" y="${cardY + 64}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${TEXT2}">TS</text>
  <text x="${cardX + 98}" y="${cardY + 48}" font-family="JetBrains Mono" font-weight="700" font-size="18" fill="${TEXT}">Taylor Skeeter</text>
  <text x="${cardX + 98}" y="${cardY + 70}" font-family="JetBrains Mono" font-size="14" fill="${TEXT2}">Senior Vibes Engineer at Bluesky PBC</text>
  <text x="${cardX + 98}" y="${cardY + 90}" font-family="JetBrains Mono" font-size="13" fill="${TEXT3}">3h</text>

  ${postLines.map((l, i) => `<text x="${cardX + 32}" y="${cardY + 138 + i * 28}" font-family="JetBrains Mono" font-size="17" fill="${TEXT}">${esc(l)}</text>`).join("\n  ")}

  <line x1="${cardX + 32}" y1="${cardY + 250}" x2="${cardX + cardW - 32}" y2="${cardY + 250}" stroke="${BORDER}" stroke-width="1"/>

  <circle cx="${cardX + 44}" cy="${cardY + 280}" r="9" fill="${BLUE}"/>
  <circle cx="${cardX + 58}" cy="${cardY + 280}" r="9" fill="#df704b"/>
  <text x="${cardX + 76}" y="${cardY + 285}" font-family="JetBrains Mono" font-size="15" fill="${TEXT2}">2,401</text>

  <line x1="${cardX + 32}" y1="${cardY + 320}" x2="${cardX + cardW - 32}" y2="${cardY + 320}" stroke="${BORDER}" stroke-width="1"/>

  <text x="${cardX + 60}" y="${cardY + 360}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="15" fill="${TEXT2}">Like</text>
  <text x="${cardX + 200}" y="${cardY + 360}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="15" fill="${TEXT2}">Comment</text>
  <text x="${cardX + 350}" y="${cardY + 360}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="15" fill="${TEXT2}">Repost</text>
  <text x="${cardX + 480}" y="${cardY + 360}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="15" fill="${TEXT2}">Send</text>
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
