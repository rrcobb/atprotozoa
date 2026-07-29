// Generates public/og.png — the Open Graph preview card for postwith, so a
// shared link auto-renders a picture of the idea in Bluesky / other
// unfurlers. Hand-drawn SVG at the canonical OG size, matching the live
// page's light graph-paper look (sites/quadrants' palette), rasterised with
// @resvg/resvg-js (pure native module, no system Chromium needed — this box
// has no fontconfig/system fonts either, so the font is bundled in ./fonts
// and loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// Static, no live data — deterministic so the card is stable across builds.
// House style: self-contained, copy-don't-abstract (structure borrowed from
// sites/didscope/og-gen.mjs, swapped for a matchmaking-card layout).

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#fffdf8", INK = "#14171a", MUTED = "#6b6b6b", FAINT = "#e2ddd0";
const ACCENT = "#1a5fd0", ACCENT2 = "#d0461a", GOOD = "#17795a", CARD = "#ffffff";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// two little profile cards, matched by topic, meeting proposed between them
const cardW = 230, cardH = 168, cardY = 168;
const cardAx = 610, cardBx = cardAx + cardW + 40;

function profileCard(x, y, initial, tint, topic, goal) {
  return `
  <g>
    <rect x="${x}" y="${y}" width="${cardW}" height="${cardH}" rx="14" fill="${CARD}" stroke="${FAINT}" stroke-width="1.5"/>
    <circle cx="${x + 44}" cy="${y + 44}" r="24" fill="${tint}"/>
    <text x="${x + 44}" y="${y + 52}" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="20" fill="#fff">${esc(initial)}</text>
    <rect x="${x + 84}" y="${y + 26}" width="${cardW - 84 - 24}" height="26" rx="13" fill="${FAINT}"/>
    <text x="${x + 96}" y="${y + 43}" font-family="JetBrains Mono" font-weight="700" font-size="13" fill="${INK}">${esc(topic)}</text>
    <text x="${x + 24}" y="${y + 96}" font-family="JetBrains Mono" font-size="16" fill="${INK}">${esc(goal)}</text>
    <text x="${x + 24}" y="${y + 122}" font-family="JetBrains Mono" font-size="13" fill="${MUTED}">looking for someone to</text>
    <text x="${x + 24}" y="${y + 142}" font-family="JetBrains Mono" font-size="13" fill="${MUTED}">meet up on this</text>
  </g>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <!-- graph-paper grid, matching the live page's plot background -->
  <defs>
    <pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse">
      <path d="M 30 0 L 0 0 0 30" fill="none" stroke="${FAINT}" stroke-width="1"/>
    </pattern>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#grid)" opacity="0.5"/>

  <!-- left: wordmark + pitch -->
  <text x="64" y="140" font-family="JetBrains Mono" font-weight="800" font-size="68" fill="${INK}">postwith</text>
  <rect x="66" y="158" width="230" height="4" fill="${ACCENT}"/>

  <text x="64" y="216" font-family="JetBrains Mono" font-size="19" fill="${MUTED}">post what you're into and</text>
  <text x="64" y="244" font-family="JetBrains Mono" font-size="19" fill="${MUTED}">what you want out of it.</text>
  <text x="64" y="286" font-family="JetBrains Mono" font-size="19" fill="${INK}" font-weight="700">get auto-matched by topic.</text>
  <text x="64" y="314" font-family="JetBrains Mono" font-size="19" fill="${INK}" font-weight="700">propose a meeting. log how</text>
  <text x="64" y="342" font-family="JetBrains Mono" font-size="19" fill="${INK}" font-weight="700">it went.</text>

  <text x="64" y="410" font-family="JetBrains Mono" font-size="15" fill="${MUTED}">every record — profile, proposal,</text>
  <text x="64" y="434" font-family="JetBrains Mono" font-size="15" fill="${MUTED}">response, feedback — lives in your</text>
  <text x="64" y="458" font-family="JetBrains Mono" font-size="15" fill="${MUTED}">own PDS, not a database we run.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${ACCENT}">bisks.net/postwith</text>

  <!-- right: two matched profile cards + a connecting arrow -->
  ${profileCard(cardAx, cardY, "M", ACCENT, "mentoring", "find a mentor")}
  ${profileCard(cardBx, cardY, "R", ACCENT2, "mentoring", "pay it forward")}
  <path d="M ${cardAx + cardW} ${cardY + cardH / 2} L ${cardBx - 6} ${cardY + cardH / 2}" stroke="${INK}" stroke-width="2.5" fill="none" marker-end="url(#arrow)"/>
  <defs>
    <marker id="arrow" markerWidth="10" markerHeight="10" refX="7" refY="5" orient="auto">
      <path d="M0,0 L10,5 L0,10 z" fill="${INK}"/>
    </marker>
  </defs>
  <text x="${(cardAx + cardW + cardBx) / 2}" y="${cardY + cardH / 2 - 14}" text-anchor="middle" font-family="JetBrains Mono" font-size="13" fill="${MUTED}">matched</text>

  <g transform="translate(${cardAx}, ${cardY + cardH + 40})">
    <rect width="${cardBx + cardW - cardAx}" height="90" rx="14" fill="${CARD}" stroke="${FAINT}" stroke-width="1.5"/>
    <circle cx="30" cy="45" r="10" fill="${GOOD}"/>
    <text x="52" y="38" font-family="JetBrains Mono" font-weight="700" font-size="16" fill="${INK}">meeting accepted</text>
    <text x="52" y="62" font-family="JetBrains Mono" font-size="13" fill="${MUTED}">outcome logged for next time</text>
  </g>
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
