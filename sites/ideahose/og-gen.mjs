// Generates public/og.png — the Open Graph preview card for ideahose, so a
// shared link auto-renders a mock of the ranked backlog in Bluesky / other
// unfurlers, instead of a bare title/description.
//
// Hand-draws a representative "screenshot" of the leaderboard (three ranked
// rows with a mention badge, idea text, and reaction meta — same shapes as
// public/index.html's real .row markup) as an SVG at the canonical OG size,
// then rasterises it with @resvg/resvg-js (pure native module, no system
// Chromium needed — this box has no fontconfig/system fonts either, so the
// font is bundled in ./fonts and loaded explicitly). Copied from
// didscope/og-gen.mjs (copy, don't abstract).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// No live data, no network — deterministic so the card is stable across
// builds; the three sample ideas are illustrative, not pulled from the real
// tracker.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const INK = "#111111", MUTED = "#6b6b6b", FAINT = "#e4e4e4", FAINTBG = "#f6f6f6";
const ACCENT = "#1a5fd0", GOOD = "#1f8a4c";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const ROWS = [
  { rank: 1, mentions: 14, text: "someone should build a site that tracks how often mutuals quote-dunk each other", likes: 812, reposts: 96, tagged: true },
  { rank: 2, mentions: 9, text: "idea for a website: paste a thread, get the tl;dr as a single skeet", likes: 340, reposts: 41, tagged: false },
  { rank: 3, mentions: 6, text: "i wish there was a tool that turns your posting streak into a little garden", likes: 205, reposts: 18, tagged: false },
];

const ROW_X = 64;
const ROW_W = W - ROW_X * 2;
let rowsSvg = "";
let y = 300;
for (const r of ROWS) {
  const rowH = 92;
  rowsSvg += `<line x1="${ROW_X}" y1="${y}" x2="${ROW_X + ROW_W}" y2="${y}" stroke="${FAINT}" stroke-width="1.5"/>`;

  rowsSvg += `<text x="${ROW_X}" y="${y + 42}" font-family="JetBrains Mono" font-weight="700"
    font-size="26" fill="${MUTED}">${r.rank}</text>`;

  const bodyX = ROW_X + 56;

  // mention badge (pill)
  const badgeLabel = `mentioned ${r.mentions}×`;
  const badgeW = 30 + badgeLabel.length * 10.5;
  rowsSvg += `<rect x="${bodyX}" y="${y + 14}" width="${badgeW}" height="30" rx="15"
    fill="${FAINTBG}" stroke="${ACCENT}" stroke-width="1.5"/>`;
  rowsSvg += `<text x="${bodyX + badgeW / 2}" y="${y + 34}" text-anchor="middle"
    font-family="JetBrains Mono" font-weight="700" font-size="14" fill="${INK}">${esc(badgeLabel)}</text>`;

  let badgeEndX = bodyX + badgeW + 12;
  if (r.tagged) {
    const label = "already tagged @buildthis";
    const w = 24 + label.length * 8.6;
    rowsSvg += `<rect x="${badgeEndX}" y="${y + 14}" width="${w}" height="30" rx="15"
      fill="${FAINTBG}" stroke="${FAINT}" stroke-width="1.5"/>`;
    rowsSvg += `<text x="${badgeEndX + w / 2}" y="${y + 34}" text-anchor="middle"
      font-family="JetBrains Mono" font-size="12.5" fill="${ACCENT}">${esc(label)}</text>`;
    badgeEndX += w + 12;
  }

  const idea = r.text.length > 74 ? r.text.slice(0, 73) + "…" : r.text;
  rowsSvg += `<text x="${bodyX}" y="${y + 68}" font-family="JetBrains Mono" font-size="18.5"
    fill="${INK}">${esc(idea)}</text>`;

  const meta = `${r.likes.toLocaleString()} likes · ${r.reposts.toLocaleString()} reposts`;
  rowsSvg += `<text x="${bodyX}" y="${y + 90}" font-family="JetBrains Mono" font-size="14"
    fill="${MUTED}">${esc(meta)}</text>`;

  y += rowH;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#ffffff"/>

  <!-- live dot -->
  <circle cx="${ROW_X + 6}" cy="80" r="7" fill="${GOOD}"/>

  <!-- wordmark -->
  <text x="${ROW_X + 26}" y="90" font-family="JetBrains Mono" font-weight="700"
    font-size="42" fill="${INK}">ideahose</text>
  <text x="${ROW_X}" y="132" font-family="JetBrains Mono" font-size="19"
    fill="${MUTED}">a crowdsourced backlog for @buildthis, ranked from the live firehose</text>

  ${rowsSvg}

  <!-- footer strip -->
  <text x="${ROW_X}" y="${H - 40}" font-family="JetBrains Mono" font-size="16"
    fill="${MUTED}">watches every idea-shaped post, groups repeats, ranks by mentions + reactions</text>
  <text x="${W - ROW_X}" y="${H - 40}" text-anchor="end" font-family="JetBrains Mono"
    font-size="16" fill="${ACCENT}">ideahose.bisks.net</text>
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
