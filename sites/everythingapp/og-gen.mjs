// Generates public/og.png — the Open Graph preview card for everythingapp.
// Deliberately mimics the site itself: a LinkedIn-blue top bar, a white post
// card, a locked life update, a reaction row. Same reason grindset went
// off-brand from the usual dark-terminal buildthis OG look — the site's own
// skin IS the joke, so the preview card should look like a real screenshot,
// not a generic dark card. Hand-drawn SVG, rasterised with @resvg/resvg-js
// (no system fontconfig on this box, so the font is bundled in ./fonts).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork. Adapted from sites/grindset/og-gen.mjs.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BLUE = "#0a66c2", BLUE_DARK = "#004182", INK = "#1d2226", MUTED = "#56687a";
const BG = "#f4f2ee", CARD = "#ffffff", BORDER = "#e0dfdc", GOLD = "#7a5900", GOLD_BG = "#eddc9e";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>

  <rect x="0" y="0" width="${W}" height="64" fill="${BLUE}"/>
  <text x="40" y="42" font-family="JetBrains Mono" font-weight="800" font-size="28" fill="#ffffff">in Everything</text>
  <text x="${W - 40}" y="42" text-anchor="end" font-family="JetBrains Mono" font-weight="700" font-size="16" fill="${GOLD_BG}">PREMIUM</text>

  <rect x="40" y="100" width="${W - 80}" height="470" rx="14" fill="${CARD}" stroke="${BORDER}"/>

  <circle cx="96" cy="160" r="30" fill="#cfe3f7"/>
  <text x="96" y="167" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="18" fill="${BLUE_DARK}">MO</text>
  <text x="140" y="152" font-family="JetBrains Mono" font-weight="800" font-size="22" fill="${INK}">Marcus Odell</text>
  <text x="140" y="176" font-family="JetBrains Mono" font-size="16" fill="${MUTED}">Head of Household (Contract, No Benefits)</text>

  <rect x="80" y="222" width="${W - 160}" height="180" rx="8" fill="${BG}"/>
  <text x="${W / 2}" y="270" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${MUTED}">[LOCKED] This life update is Member-Only.</text>
  <text x="${W / 2}" y="304" text-anchor="middle" font-family="JetBrains Mono" font-size="18" fill="${MUTED}">Custody, taxes, rations, healthcare — all gated</text>
  <text x="${W / 2}" y="330" text-anchor="middle" font-family="JetBrains Mono" font-size="18" fill="${MUTED}">behind Endorsements and a Premium tier.</text>
  <rect x="${W / 2 - 130}" y="352" width="260" height="42" rx="21" fill="${GOLD_BG}"/>
  <text x="${W / 2}" y="379" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="17" fill="${GOLD}">Unlock with Premium</text>

  <text x="80" y="440" font-family="JetBrains Mono" font-size="17" fill="${MUTED}">1,204 reactions   ·   88 comments · 14 reposts</text>

  <line x1="80" y1="460" x2="${W - 80}" y2="460" stroke="${BORDER}"/>

  <text x="80" y="500" font-family="JetBrains Mono" font-size="19" fill="${INK}">"LinkedIn becomes the everything app — how you socialize,</text>
  <text x="80" y="526" font-family="JetBrains Mono" font-size="19" fill="${INK}">how you get hired, how you do your taxes, if you get to</text>
  <text x="80" y="552" font-family="JetBrains Mono" font-size="19" fill="${INK}">keep your child, who gets to eat." — @fromthewestmeadow.com</text>

  <text x="80" y="${H - 40}" font-family="JetBrains Mono" font-weight="800" font-size="24" fill="${BLUE}">everythingapp.bisks.net</text>
  <text x="${W - 40}" y="${H - 40}" text-anchor="end" font-family="JetBrains Mono" font-size="15" fill="${MUTED}">a buildthis build</text>
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
