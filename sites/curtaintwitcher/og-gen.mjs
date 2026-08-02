// Generates public/og.png — the Open Graph preview card for curtaintwitcher,
// so a shared link auto-renders a mock feed post in Bluesky / other
// unfurlers. Hand-drawn SVG at the canonical OG size, rasterised with
// @resvg/resvg-js (pure native module, no system Chromium needed — this box
// has no fontconfig/system fonts either, so the font is bundled in ./fonts
// and loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// A generic sample post (one of the seed feed's real entries) — this is the
// static fallback card for the bare link. Per-post share cards use /p/<id>'s
// server-rendered og:title/og:description instead (see src/index.ts,
// renderPost) — this image is reused for all of them, only the text differs.
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork. Copied from sites/didscope/og-gen.mjs.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#eef2e8", FG = "#1c2a15", DIM = "#5a6b52";
const GREEN = "#1f7a3d", RED = "#b3261e", CARD = "#ffffff", BORDER = "#d7e0cb";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function wrapLines(text, maxChars) {
  const words = text.split(" ");
  const lines = [];
  let line = "";
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (line && test.length > maxChars) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

const postAuthor = "Dana W.";
const postTier = "Off The Grid";
const postText =
  "I am typing this from my neighbor's driveway because I do not trust my own wifi right now. Everything I said would happen has happened.";
const replyName = "Kevin, just walking the dog";
const replyText = "It's your own wifi. You're on your neighbor's driveway using their wifi to say you don't trust wifi.";
const realVotes = 1, unhingedVotes = 31;
const totalVotes = realVotes + unhingedVotes;
const realPct = Math.round((realVotes / totalVotes) * 100);

const postLines = wrapLines(postText, 40);
const replyLines = wrapLines(replyText, 42);

const cardX = 470, cardY = 70, cardW = 668, cardH = 490;

let y = cardY + 56;
const headY = y;
y += 26;
const badgeY = headY - 8;
y += 6;
const textStartY = y;
const textLineH = 26;
y += postLines.length * textLineH + 26;
const replyBoxY = y;
const replyLineH = 22;
const replyBoxH = 56 + replyLines.length * replyLineH;
y += replyBoxH + 34;
const barY = y;
y += 26;
const voteBtnY = y;

const postSvg = postLines
  .map((l, i) => `<text x="${cardX + 44}" y="${textStartY + i * textLineH}" font-family="JetBrains Mono" font-size="19" fill="${FG}">${esc(l)}</text>`)
  .join("\n    ");

const replySvg = replyLines
  .map((l, i) => `<text x="${cardX + 44 + 34}" y="${replyBoxY + 48 + i * replyLineH}" font-family="JetBrains Mono" font-size="14" fill="${DIM}">${esc(l)}</text>`)
  .join("\n    ");

const barW = cardW - 88;
const realW = Math.round((barW * realPct) / 100);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>

  <!-- left: curtains + eye mark, wordmark, pitch -->
  <rect x="48" y="56" width="46" height="90" rx="8" fill="${GREEN}" opacity="0.85"/>
  <rect x="104" y="56" width="46" height="90" rx="8" fill="${GREEN}" opacity="0.85"/>
  <circle cx="99" cy="101" r="17" fill="${BG}"/>
  <circle cx="99" cy="101" r="7" fill="${FG}"/>

  <text x="64" y="190" font-family="JetBrains Mono" font-weight="800" font-size="39" fill="${FG}">curtaintwitcher</text>
  <text x="64" y="222" font-family="JetBrains Mono" font-size="18" fill="${DIM}">everything is probably fine.</text>

  <text x="64" y="286" font-family="JetBrains Mono" font-size="17" fill="${DIM}">A fake Nextdoor where the block's</text>
  <text x="64" y="312" font-family="JetBrains Mono" font-size="17" fill="${DIM}">posts get more paranoid by the day.</text>
  <text x="64" y="338" font-family="JetBrains Mono" font-size="17" fill="${DIM}">Vote <tspan fill="${GREEN}" font-weight="700">REAL</tspan> or <tspan fill="${RED}" font-weight="700">UNHINGED</tspan>.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${GREEN}">curtaintwitcher.bisks.net</text>

  <!-- right: mock feed card -->
  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="16" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>
  <rect x="${cardX}" y="${cardY}" width="8" height="${cardH}" rx="4" fill="#6a1b9a"/>

  <circle cx="${cardX + 44 + 14}" cy="${headY - 6}" r="16" fill="#8d6e63"/>
  <text x="${cardX + 44 + 14}" y="${headY - 1}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="13" fill="#fff">DW</text>
  <text x="${cardX + 44 + 38}" y="${headY - 10}" font-family="JetBrains Mono" font-weight="700" font-size="16" fill="${FG}">${esc(postAuthor)}</text>
  <text x="${cardX + 44 + 38}" y="${headY + 8}" font-family="JetBrains Mono" font-size="12" fill="${DIM}">20m ago</text>
  <rect x="${cardX + cardW - 44 - 150}" y="${badgeY}" width="150" height="24" rx="12" fill="#6a1b9a"/>
  <text x="${cardX + cardW - 44 - 75}" y="${badgeY + 16}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="12" fill="#fff">${esc(postTier).toUpperCase()}</text>

  ${postSvg}

  <rect x="${cardX + 44}" y="${replyBoxY}" width="${cardW - 88}" height="${replyBoxH}" rx="10" fill="#f4f6f1"/>
  <circle cx="${cardX + 44 + 17}" cy="${replyBoxY + 21}" r="10" fill="#78909c"/>
  <text x="${cardX + 44 + 17}" y="${replyBoxY + 25}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="9" fill="#fff">K</text>
  <text x="${cardX + 44 + 34}" y="${replyBoxY + 24}" font-family="JetBrains Mono" font-weight="700" font-size="13" fill="${FG}">${esc(replyName)}</text>
  ${replySvg}

  <rect x="${cardX + 44}" y="${barY}" width="${barW}" height="9" rx="4.5" fill="${RED}"/>
  <rect x="${cardX + 44}" y="${barY}" width="${realW}" height="9" rx="4.5" fill="${GREEN}"/>

  <rect x="${cardX + 44}" y="${voteBtnY}" width="130" height="34" rx="17" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>
  <text x="${cardX + 44 + 65}" y="${voteBtnY + 22}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="13" fill="${FG}">REAL ${realVotes}</text>
  <rect x="${cardX + 44 + 142}" y="${voteBtnY}" width="168" height="34" rx="17" fill="${RED}" opacity="0.12" stroke="${RED}" stroke-width="1.5"/>
  <text x="${cardX + 44 + 142 + 84}" y="${voteBtnY + 22}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="13" fill="${RED}">UNHINGED ${unhingedVotes}</text>
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
