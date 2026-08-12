// Generates public/og.png — the Open Graph preview card for vulnscope, so a
// shared link auto-renders a picture of a CVE advisory in Bluesky / other
// unfurlers. Hand-drawn SVG at the canonical OG size, matching the live
// page's terminal-security look, rasterised with @resvg/resvg-js (pure
// native module, no system Chromium needed — this box has no fontconfig /
// system fonts either, so the font is bundled in ./fonts and loaded
// explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// A generic sample advisory (not tied to any real handle) — this is the
// static fallback card for the bare link. Per-handle share cards are
// generated live, client-side, in public/app.js (buildShareCard), and
// per-handle OG tags are stamped server-side by src/index.ts's /s/<handle>.
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#0a0e0d", FG = "#e7f3ec", DIM = "#7f978f";
const ACCENT = "#ff5c5c", ACCENT2 = "#43ffa0", AMBER = "#ffb454", CARD = "#101815", BORDER = "#24332e";

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

const cveId = "CVE-2026-31337";
const cwe = "CWE-835";
const emoji = "\u{1F501}";
const vulnName = "Infinite Loop";
const tagline = "“the exit condition was never actually reachable”";
const findings = [
  "62% of your words repeat across your last posts",
  "0.11 grudge callbacks per post",
  "you follow 812, only 340 follow you back",
];

const taglineLines = wrapLines(tagline, 44);
const cardX = 470, cardY = 60, cardW = 668, cardH = 510;

let y = cardY + 66;
const badgeY = y;
y += 66;
const nameY = y;
y += 50;
const taglineStartY = y;
const taglineLineH = 26;
y += taglineLines.length * taglineLineH + 30;
const findingsLabelY = y;
y += 30;
const findingsStartY = y;
const findingLineH = 32;

const findingsSvg = findings
  .map(
    (f, i) =>
      `<text x="${cardX + 48}" y="${findingsStartY + i * findingLineH}" font-family="JetBrains Mono" font-size="16" fill="${FG}"><tspan fill="${ACCENT2}">+ </tspan>${esc(f)}</text>`,
  )
  .join("\n    ");

const taglineSvg = taglineLines
  .map(
    (l, i) =>
      `<text x="${cardX + cardW / 2}" y="${taglineStartY + i * taglineLineH}" text-anchor="middle" font-family="JetBrains Mono" font-style="italic" font-size="18" fill="${ACCENT2}">${esc(l)}</text>`,
  )
  .join("\n    ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="15%" cy="-10%" r="60%">
      <stop offset="0" stop-color="#1a3a2c"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="90%" cy="5%" r="55%">
      <stop offset="0" stop-color="#3a1414"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${ACCENT2}"/>
      <stop offset="1" stop-color="${ACCENT}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <!-- left: wordmark + pitch -->
  <text x="64" y="140" font-family="JetBrains Mono" font-weight="800" font-size="60" fill="url(#title)">vulnscope</text>
  <text x="64" y="186" font-family="JetBrains Mono" font-size="20" fill="${DIM}">what software <tspan fill="${ACCENT2}">vulnerability</tspan></text>
  <text x="64" y="214" font-family="JetBrains Mono" font-size="20" fill="${DIM}">are you?</text>

  <text x="64" y="288" font-family="JetBrains Mono" font-size="16" fill="${DIM}">Reads a handle's posts and outgoing</text>
  <text x="64" y="314" font-family="JetBrains Mono" font-size="16" fill="${DIM}">follows off their real atproto repo,</text>
  <text x="64" y="340" font-family="JetBrains Mono" font-size="16" fill="${DIM}">then files a CVE for their personality.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT2}">vulnscope.bisks.net</text>

  <!-- right: sample advisory card -->
  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="18" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>

  <text x="${cardX + 40}" y="${badgeY}" font-family="JetBrains Mono" font-weight="700" font-size="15" fill="${ACCENT2}">${cveId}  ·  ${cwe}</text>
  <text x="${cardX + cardW - 40}" y="${badgeY}" text-anchor="end" font-family="JetBrains Mono" font-weight="700" font-size="15" fill="${AMBER}">MEDIUM · CVSS 5.4</text>

  <text x="${cardX + cardW / 2}" y="${nameY}" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="42" fill="${FG}">${emoji}  ${esc(vulnName)}</text>

  ${taglineSvg}

  <line x1="${cardX + 48}" y1="${findingsLabelY - 22}" x2="${cardX + cardW - 48}" y2="${findingsLabelY - 22}" stroke="${BORDER}" stroke-width="1" stroke-dasharray="3,4"/>
  <text x="${cardX + 48}" y="${findingsLabelY}" font-family="JetBrains Mono" font-weight="700" font-size="13" letter-spacing="2" fill="${ACCENT2}">SCAN FINDINGS</text>
  ${findingsSvg}
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
