// Generates public/og.png — the static Open Graph preview card for the bare
// norvidpot link (per-entry shares get personalized title/description text
// via src/index.ts, but reuse this same image). Hand-drawn SVG, rasterised
// with @resvg/resvg-js. Same recipe as sites/impostorbel/og-gen.mjs.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#161210", FG = "#e9e0d0", DIM = "#a99b84", LINK = "#c98a4b", GOLD = "#f0d060";
const BORDER = "#3c332a", CARD = "#211b17";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const F = "JetBrains Mono";
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect x="0" y="0" width="${W}" height="86" fill="${CARD}" stroke="${BORDER}" stroke-width="2"/>
  <text x="56" y="58" font-family="${F}" font-weight="700" font-size="36" fill="${FG}">Norvidpot</text>
  <text x="330" y="58" font-family="${F}" font-size="18" fill="${DIM}">a serious account</text>

  <line x1="56" y1="130" x2="${W - 56}" y2="130" stroke="${BORDER}" stroke-width="1.5"/>
  <text x="56" y="116" font-family="${F}" font-size="16" fill="${DIM}">A somber collected edition of @norvid-studies.bsky.social's 100 most-liked posts</text>

  <rect x="56" y="160" width="${W - 112}" height="170" rx="6" fill="${CARD}" stroke="${BORDER}"/>
  <text x="84" y="200" font-family="${F}" font-weight="700" font-size="21" fill="${FG}">"I would have prompted 'do 2 breakthroughs' but that's</text>
  <text x="84" y="228" font-family="${F}" font-weight="700" font-size="21" fill="${FG}">just the type of prompt beast that I am"</text>
  <text x="84" y="262" font-family="${F}" font-size="16" fill="${DIM}">He had wanted, in his heart, two breakthroughs where the world</text>
  <text x="84" y="286" font-family="${F}" font-size="16" fill="${DIM}">in its meanness allots most men none at all...</text>
  <text x="84" y="314" font-family="${F}" font-size="14" fill="${DIM}">149 likes</text>

  <rect x="56" y="352" width="${W - 112}" height="40" rx="3" fill="#2b2a10" stroke="#c9a227" stroke-width="2" stroke-dasharray="6,4"/>
  <text x="76" y="378" font-family="${F}" font-weight="700" font-size="16" fill="${GOLD}">&gt;&gt; a word from our sponsor: $BRKTHRU is now live &lt;&lt;</text>

  <text x="56" y="440" font-family="${F}" font-size="16" fill="${DIM}">Steinbeck-and-Dostoevsky pastiche prose. Tone broken every 6th entry.</text>
  <text x="56" y="466" font-family="${F}" font-size="16" fill="${DIM}">100 entries, ranked by likes.</text>

  <text x="56" y="${H - 60}" font-family="${F}" font-weight="700" font-size="24" fill="${LINK}">bisks.net/norvidpot</text>
  <text x="56" y="${H - 28}" font-family="${F}" font-size="15" fill="${DIM}">built by @buildthis.bisks.net, asked for by @abeliansoup.bsky.social</text>
</svg>`;

const fontPath = fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url));
const r = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: F },
});
const png = r.render().asPng();
const out = new URL("./public/og.png", import.meta.url).pathname;
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");
