// Generates public/og.png — the Open Graph preview card for toroidarium, so a
// shared link auto-renders a picture of the tank in Bluesky / other unfurlers.
//
// Hand-draws a representative "screenshot" of the aquarium as an SVG (fish
// swimming, a couple mid-wrap at the left/right seam to sell the toroidal
// wraparound, bubbles) at the canonical OG size, then rasterises it with
// resvg (no live data, no network — deterministic so the card is stable
// across builds).
//
//   node og-gen.mjs   # writes ./og.svg
//   npx --yes @resvg/resvg-js-cli --font-file fonts/JetBrainsMono.ttf \
//     --font-default-family "JetBrains Mono" og.svg public/og.png
//
// (resvg needs an explicit font file — this sandbox has none installed via
// fontconfig, so text silently disappears without --font-file. fonts/ here
// is copied from sites/didscope/fonts/, generation-time only — nothing in
// public/ references it, the live page uses the system mono font stack.)
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand (and
// the resvg step above) if you change the artwork.

import { writeFileSync } from "node:fs";

const W = 1200, H = 630;

const INK = "#eaf6fb", MUTED = "#7fb2c4", ACCENT = "#34e0c4", GOLD = "#ffd166";
const HUES = [190, 265, 20, 330, 150, 210];

// tiny seeded RNG so the layout is identical every run
let seed = 4242;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

function fish(x, y, r, hue, flip) {
  const s = flip ? -1 : 1;
  const body = typeof hue === "number" ? `hsl(${hue} 65% 58%)` : hue;
  const fin = typeof hue === "number" ? `hsl(${hue} 65% 42%)` : hue;
  return `
  <g transform="translate(${x} ${y}) scale(${s} 1)">
    <path d="M ${-r * 1.6} 0 L ${-r * 2.6} ${-r * 0.9} L ${-r * 2.6} ${r * 0.9} Z" fill="${fin}"/>
    <ellipse cx="0" cy="0" rx="${r}" ry="${r * 0.68}" fill="${body}"/>
    <path d="M ${r * 0.15} ${-r * 0.55} Q ${r * 0.65} ${-r * 0.95} ${r * 0.55} ${-r * 0.15} Z" fill="${fin}" opacity="0.85"/>
    <circle cx="${r * 0.62}" cy="${-r * 0.08}" r="${r * 0.11}" fill="#04121a"/>
  </g>`;
}

function bubble(x, y, r, o) {
  return `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="rgba(234,246,251,${o})" stroke-width="2"/>`;
}

const positions = [
  [140, 190, 30, HUES[0], false],
  [1080, 150, 26, HUES[1], true],
  [60, 420, 22, HUES[2], false],
  [1150, 460, 24, HUES[3], true],
  [420, 500, 20, HUES[4], false],
  [780, 500, 28, HUES[5], true],
  [560, 260, 34, GOLD, false],
  [900, 330, 18, HUES[1], false],
  [260, 300, 20, HUES[3], true],
];
let fishes = "";
for (const [x, y, r, hue, flip] of positions) fishes += fish(x, y, r, hue, flip);

let bubbles = "";
for (let i = 0; i < 26; i++) {
  bubbles += bubble(rnd() * W, rnd() * H, 3 + rnd() * 9, 0.15 + rnd() * 0.25);
}

// dashed seam markers at the left/right edges — the visual cue that a fish
// crossing one re-enters the other (the toroidal wrap the whole site is built
// around, see notes in public/index.html).
const seam = (x) =>
  `<line x1="${x}" y1="20" x2="${x}" y2="${H - 20}" stroke="${GOLD}" stroke-width="3" stroke-dasharray="10 10" opacity="0.55"/>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="water" x1="0" y1="0" x2="0" y2="${H}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#0b2530"/>
      <stop offset="1" stop-color="#04121a"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#water)"/>
  ${seam(6)}
  ${seam(W - 6)}
  ${bubbles}
  ${fishes}

  <text x="60" y="96" font-family="ui-monospace, monospace" font-weight="800"
    font-size="54" fill="${ACCENT}">toroidarium</text>
  <text x="60" y="136" font-family="ui-monospace, monospace" font-size="20"
    fill="${INK}">your Bluesky moots, swimming on a wraparound tank</text>

  <text x="60" y="${H - 48}" font-family="ui-monospace, monospace" font-size="16"
    fill="${MUTED}">no walls · exit right, re-enter left · exit bottom, re-enter top</text>
  <text x="${W - 60}" y="${H - 48}" text-anchor="end" font-family="ui-monospace, monospace"
    font-size="16" fill="${ACCENT}">toroidarium.bisks.net</text>
</svg>`;

writeFileSync(new URL("./og.svg", import.meta.url), svg);
console.log("wrote og.svg — now run:\n  npx --yes @resvg/resvg-js-cli og.svg public/og.png");
