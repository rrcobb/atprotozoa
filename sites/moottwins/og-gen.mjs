// Generates public/og.png — the Open Graph preview card for moottwins, so a
// shared link auto-renders a picture of the idea in Bluesky / other
// unfurlers: two generic avatar silhouettes that look almost identical, a
// dashed "compare" bracket between them, and a mnemonic line.
//
//   node og-gen.mjs        # writes ./public/og.png
//
// No live data, no network — deterministic so the card is stable across
// builds. Rendered with @resvg/resvg-js (pure SVG rasterizer, no browser)
// instead of the headless-Chromium screenshot most other sites' og-gen.mjs
// use, because the card is plain SVG with no HTML/CSS layout to speak of —
// same dependency sites/receipts already carries. fonts/JetBrainsMono.ttf is
// copied from sites/receipts/fonts (copy, don't abstract) so the card
// doesn't depend on whatever fonts happen to be installed system-wide.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const INK = "#111111", MUTED = "#6b6b6b", ACCENT = "#1a5fd0", FAINT = "#e4e4e4", FAINTBG = "#f6f6f6";

// A generic rounded-silhouette "avatar" — head + shoulders, no identity, so
// the card never implies it's showing anyone's real photo.
function silhouette(cx, cy, r, fill) {
  return `
  <g>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="${FAINTBG}" stroke="${FAINT}" stroke-width="2"/>
    <clipPath id="clip-${cx}"><circle cx="${cx}" cy="${cy}" r="${r - 2}"/></clipPath>
    <g clip-path="url(#clip-${cx})">
      <circle cx="${cx}" cy="${cy - r * 0.18}" r="${r * 0.42}" fill="${fill}"/>
      <ellipse cx="${cx}" cy="${cy + r * 0.95}" rx="${r * 0.85}" ry="${r * 0.75}" fill="${fill}"/>
    </g>
  </g>`;
}

const cy = 300, r = 108;
const cxA = 430, cxB = 770;
const boxY = cy + r + 64, boxH = 64;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#ffffff"/>

  <text x="60" y="76" font-family="JetBrains Mono" font-weight="700" font-size="40" fill="${INK}">moottwins</text>
  <text x="60" y="112" font-family="JetBrains Mono" font-size="19" fill="${MUTED}">the mutuals whose pfps you keep mixing up</text>

  ${silhouette(cxA, cy, r, "#9fb6e8")}
  ${silhouette(cxB, cy, r, "#9fb6e8")}

  <line x1="${cxA + r + 14}" y1="${cy}" x2="${cxB - r - 14}" y2="${cy}" stroke="${ACCENT}" stroke-width="3" stroke-dasharray="8 8"/>
  <text x="${(cxA + cxB) / 2}" y="${cy - 18}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="28" fill="${ACCENT}">92% alike</text>

  <text x="${cxA}" y="${cy + r + 38}" text-anchor="middle" font-family="JetBrains Mono" font-size="18" fill="${MUTED}">@handle-one</text>
  <text x="${cxB}" y="${cy + r + 38}" text-anchor="middle" font-family="JetBrains Mono" font-size="18" fill="${MUTED}">@handle-two</text>

  <rect x="80" y="${boxY}" width="${W - 160}" height="${boxH}" rx="10" fill="${FAINTBG}" stroke="${FAINT}"/>
  <text x="${W / 2}" y="${boxY + boxH / 2 + 7}" text-anchor="middle" font-family="JetBrains Mono" font-size="19" fill="${INK}">“the warmer one is @handle-one — @handle-two is the cooler one”</text>

  <text x="${W - 60}" y="${H - 30}" text-anchor="end" font-family="JetBrains Mono" font-size="16" fill="${ACCENT}">moottwins.bisks.net</text>
</svg>`;

const fontPath = fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url));
const rsvg = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
});
const png = rsvg.render().asPng();
const out = new URL("./public/og.png", import.meta.url).pathname;
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");
