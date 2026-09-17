// Generates public/og.png — the Open Graph preview card for parodykit, so a
// shared link auto-renders a picture of the idea instead of a bare URL.
// Hand-drawn SVG at the canonical OG size, matching the live page's rubber-
// stamp/photocopy look, rasterised with @resvg/resvg-js (pure native module,
// no system Chromium needed — this box has no fontconfig/system fonts
// either, so the font is bundled in ./fonts and loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// A generic sample card (not tied to any real handle) — the real avatar and
// banner are generated live, client-side, in public/index.html.
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#f4ecd8", FG = "#241c14", DIM = "#7a6c54";
const ACCENT = "#c0392b", ACCENT2 = "#1c6b4f", CARD = "#fffaf0", BORDER = "#d8c9a3";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const cardX = 640, cardY = 70, cardW = 500, cardH = 490;
const bannerY = cardY + 40, bannerH = 90;
const bannerSplitX = cardX + Math.round((cardW - 80) * 0.8);
const avatarCx = cardX + 110, avatarCy = bannerY + bannerH + 20, avatarR = 70;
const badgeCx = avatarCx + avatarR * 0.72, badgeCy = avatarCy + avatarR * 0.72, badgeR = 26;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="10%" cy="-10%" r="60%">
      <stop offset="0" stop-color="#e8d9ae"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="100%" cy="0%" r="55%">
      <stop offset="0" stop-color="#ead6c8"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <clipPath id="avatarClip"><circle cx="${avatarCx}" cy="${avatarCy}" r="${avatarR}"/></clipPath>
    <clipPath id="badgeClip"><circle cx="${badgeCx}" cy="${badgeCy}" r="${badgeR}"/></clipPath>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <!-- left: wordmark + pitch -->
  <text x="64" y="150" font-family="JetBrains Mono" font-weight="800" font-size="66" fill="${FG}">parody<tspan fill="${ACCENT}">kit</tspan></text>
  <rect x="60" y="172" width="230" height="4" fill="${ACCENT}" transform="rotate(-1.5 175 174)"/>

  <text x="64" y="240" font-family="JetBrains Mono" font-size="19" fill="${DIM}">Point it at any Bluesky account.</text>
  <text x="64" y="268" font-family="JetBrains Mono" font-size="19" fill="${DIM}">Get a real avatar + banner built</text>
  <text x="64" y="296" font-family="JetBrains Mono" font-size="19" fill="${DIM}">from actual image files, and a</text>
  <text x="64" y="324" font-family="JetBrains Mono" font-size="19" fill="${DIM}">bio blended in their voice.</text>

  <text x="64" y="392" font-family="JetBrains Mono" font-weight="800" font-size="24" fill="${ACCENT2}">80% them, 20% you</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT}">parodykit.bisks.net</text>

  <!-- right: sample kit card -->
  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="18" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5" stroke-dasharray="6,5"/>

  <!-- banner: 80/20 split -->
  <rect x="${cardX + 40}" y="${bannerY}" width="${bannerSplitX - (cardX + 40)}" height="${bannerH}" rx="8" fill="#e0654f"/>
  <rect x="${bannerSplitX}" y="${bannerY}" width="${cardX + cardW - 40 - bannerSplitX}" height="${bannerH}" rx="8" fill="${ACCENT2}"/>
  <rect x="${bannerSplitX - 3}" y="${bannerY}" width="6" height="${bannerH}" fill="${ACCENT}"/>

  <!-- avatar + own-account badge -->
  <circle cx="${avatarCx}" cy="${avatarCy}" r="${avatarR + 5}" fill="${CARD}"/>
  <circle cx="${avatarCx}" cy="${avatarCy}" r="${avatarR}" fill="#e0654f"/>
  <circle cx="${avatarCx}" cy="${avatarCy}" r="${avatarR - 6}" fill="none" stroke="${ACCENT}" stroke-width="6"/>
  <circle cx="${badgeCx}" cy="${badgeCy}" r="${badgeR + 4}" fill="${CARD}"/>
  <circle cx="${badgeCx}" cy="${badgeCy}" r="${badgeR}" fill="${ACCENT2}"/>
  <circle cx="${badgeCx}" cy="${badgeCy}" r="${badgeR - 3}" fill="none" stroke="${ACCENT}" stroke-width="3"/>

  <text x="${cardX + 260}" y="${avatarCy - 12}" font-family="JetBrains Mono" font-weight="800" font-size="18" fill="${FG}">@someone.bsky.social</text>
  <text x="${cardX + 260}" y="${avatarCy + 16}" font-family="JetBrains Mono" font-size="14" fill="${DIM}">professional shitposter,</text>
  <text x="${cardX + 260}" y="${avatarCy + 38}" font-family="JetBrains Mono" font-size="14" fill="${DIM}">cats &amp; chaos</text>
  <text x="${cardX + 260}" y="${avatarCy + 60}" font-family="JetBrains Mono" font-size="14" fill="${ACCENT}">· not actually @you</text>

  <line x1="${cardX + 40}" y1="${avatarCy + avatarR + 40}" x2="${cardX + cardW - 40}" y2="${avatarCy + avatarR + 40}" stroke="${BORDER}" stroke-width="1" stroke-dasharray="3,4"/>
  <text x="${cardX + 40}" y="${avatarCy + avatarR + 76}" font-family="JetBrains Mono" font-weight="700" font-size="13" letter-spacing="2" fill="${DIM}">REAL IMAGE FILES · NO AI</text>
  <text x="${cardX + 40}" y="${avatarCy + avatarR + 104}" font-family="JetBrains Mono" font-size="14" fill="${DIM}">avatar.png · banner.png · bio</text>
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
