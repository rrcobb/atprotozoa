// Generates public/og.png — the Open Graph preview card for resetwatch, so a
// shared link auto-renders a picture of the status dial in Bluesky / other
// unfurlers.
//
// Hand-draws a representative "screenshot" as an SVG (a pulsing status dot,
// a big mono readout, and a horizontal timeline of dots standing in for past
// resets) at the canonical OG size, then rasterises it with resvg (no live
// data, no network — deterministic so the card is stable across builds).
//
//   node og-gen.mjs   # writes ./og.svg
//   npx --yes @resvg/resvg-js-cli --font-file fonts/JetBrainsMono.ttf \
//     --font-default-family "JetBrains Mono" og.svg public/og.png
//
// (fonts/ is copied from sites/simclash/fonts/, generation-time only —
// nothing in public/ references it, the live page uses the system mono
// font stack.)
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand (and
// the resvg step above) if you change the artwork.

import { writeFileSync } from "node:fs";

const W = 1200, H = 630;

const BG = "#05070a", BG2 = "#0a0d0b", INK = "#eef4ef", MUTED = "#8ea297";
const ACCENT = "#3ee08c", AMBER = "#f4b942", FAINT = "#213028";

let seed = 4242;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

// horizontal timeline of dots along the bottom third, mostly accent green
// with one amber "gap" standing in for a longer dry spell
const dotCount = 13;
const dotY = 470;
const startX = 90, endX = W - 90;
let dots = "", connectors = "";
for (let i = 0; i < dotCount; i++) {
  const x = startX + ((endX - startX) * i) / (dotCount - 1);
  const isAmber = i === 4 || i === 9;
  const color = isAmber ? AMBER : ACCENT;
  const r = i === dotCount - 1 ? 8 : 5 + rnd() * 2;
  if (i > 0) {
    const px = startX + ((endX - startX) * (i - 1)) / (dotCount - 1);
    connectors += `<line x1="${px.toFixed(1)}" y1="${dotY}" x2="${x.toFixed(1)}" y2="${dotY}" stroke="${FAINT}" stroke-width="2"/>`;
  }
  dots += `<circle cx="${x.toFixed(1)}" cy="${dotY}" r="${r.toFixed(1)}" fill="${color}" opacity="${isAmber ? 0.85 : 0.95}"/>`;
  if (i === dotCount - 1) {
    dots += `<circle cx="${x.toFixed(1)}" cy="${dotY}" r="16" fill="none" stroke="${color}" stroke-width="2" opacity="0.5"/>`;
  }
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="bg" cx="50%" cy="30%" r="80%">
      <stop offset="0" stop-color="${BG2}"/>
      <stop offset="0.65" stop-color="${BG}"/>
      <stop offset="1" stop-color="#020302"/>
    </radialGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="${ACCENT}" stop-opacity="0.28"/>
      <stop offset="1" stop-color="${ACCENT}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>

  <circle cx="600" cy="230" r="260" fill="url(#glow)"/>

  <circle cx="78" cy="72" r="9" fill="${ACCENT}"/>
  <text x="100" y="82" font-family="ui-monospace, monospace" font-weight="800"
    font-size="46" fill="${INK}">resetwatch</text>
  <text x="100" y="118" font-family="ui-monospace, monospace" font-size="19"
    fill="${MUTED}">usage-limit reset tracker</text>

  <text x="600" y="290" text-anchor="middle" font-family="ui-monospace, monospace"
    font-weight="800" font-size="96" fill="${INK}" letter-spacing="-2">4h 12m ago</text>
  <text x="600" y="335" text-anchor="middle" font-family="ui-monospace, monospace"
    font-size="21" fill="${MUTED}">since the last reset mention</text>

  ${connectors}
  ${dots}
  <text x="90" y="510" font-family="ui-monospace, monospace" font-size="16"
    fill="${MUTED}">past resets, oldest → newest</text>

  <text x="60" y="${H - 48}" font-family="ui-monospace, monospace" font-size="16"
    fill="${MUTED}">reads @thsottiaux-bot.eurosky.social's mirrored posts</text>
  <text x="${W - 60}" y="${H - 48}" text-anchor="end" font-family="ui-monospace, monospace"
    font-size="16" fill="${ACCENT}">resetwatch.bisks.net</text>
</svg>`;

writeFileSync(new URL("./og.svg", import.meta.url), svg);
console.log("wrote og.svg — now run:\n  npx --yes @resvg/resvg-js-cli --font-file fonts/JetBrainsMono.ttf --font-default-family \"JetBrains Mono\" og.svg public/og.png");
