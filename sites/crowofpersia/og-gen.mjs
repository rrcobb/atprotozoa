// Generates public/og.png — the Open Graph preview card for crowofpersia, so
// a shared link auto-renders a picture of the dungeon in Bluesky / other
// unfurlers.
//
// Hand-draws a "screenshot" of the game as an SVG at the canonical OG size —
// a torch-lit sandstone corridor, a turbaned guard mid-stagger, and the crow
// pecking — with a seeded RNG so the layout is identical across builds (no
// live data, no network).
//
//   node og-gen.mjs   # writes ./og.svg
//   npx --yes @resvg/resvg-js-cli --font-file fonts/JetBrainsMono.ttf \
//     --font-default-family "JetBrains Mono" og.svg public/og.png
//
// (resvg needs an explicit font file — this sandbox has none installed via
// fontconfig, so text silently disappears without --font-file. fonts/ here
// is copied from sites/simclash/fonts/, generation-time only — nothing in
// public/ references it, the live page uses the system mono font stack.)
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand (and
// the resvg step above) if you change the artwork.

import { writeFileSync } from "node:fs";

const W = 1200, H = 630;

const SAND = "#3a2c1a", SAND_LIGHT = "#c9a15c", SAND_DARK = "#2a2016";
const INK = "#f2e9d8", MUTED = "#a3937a", GOLD = "#d4af37";
const GUARD_BLUE = "#2c4d7a", GUARD_DARK = "#20324a";

let seed = 4242;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

// brick wall backdrop
function bricks() {
  let out = "";
  const rowH = 44;
  for (let y = -rowH; y < H + rowH; y += rowH) {
    const offset = ((y / rowH) | 0) % 2 === 0 ? 0 : 60;
    out += `<rect x="0" y="${y}" width="${W}" height="${rowH}" fill="${SAND_DARK}"/>`;
    for (let x = -60 + offset; x < W + 120; x += 120) {
      out += `<rect x="${x}" y="${y}" width="116" height="${rowH - 4}" rx="3" fill="${SAND}" stroke="rgba(0,0,0,0.35)"/>`;
    }
  }
  return out;
}

function torch(x, y) {
  return `
    <rect x="${x - 3}" y="${y}" width="6" height="20" fill="#3a2a1a"/>
    <circle cx="${x}" cy="${y - 10}" r="26" fill="url(#glow)"/>
    <ellipse cx="${x}" cy="${y - 10}" rx="5" ry="11" fill="#ffb347"/>
    <ellipse cx="${x}" cy="${y - 12}" rx="2.5" ry="6" fill="#fff1c2"/>`;
}

// crow, mid-lunge, facing right
function crow(x, y) {
  return `
    <g transform="translate(${x},${y})">
      <path d="M -4 -46 Q -34 -40 -30 -8 Q -18 -16 -4 -18 Z" fill="#14161c"/>
      <ellipse cx="0" cy="-32" rx="24" ry="30" fill="#1c1f27"/>
      <circle cx="20" cy="-58" r="17" fill="#1c1f27"/>
      <ellipse cx="-6" cy="-40" rx="11" ry="17" fill="#343a4a" opacity="0.7"/>
      <path d="M 34 -60 L 62 -55 L 34 -49 Z" fill="#f2a93b"/>
      <circle cx="25" cy="-62" r="3.4" fill="#ffe9b0"/>
      <line x1="-6" y1="-2" x2="-6" y2="10" stroke="#e0a24a" stroke-width="4"/>
      <line x1="8" y1="-2" x2="8" y2="10" stroke="#e0a24a" stroke-width="4"/>
    </g>`;
}

// staggering guard, hit, facing left
function guard(x, y) {
  return `
    <g transform="translate(${x},${y}) rotate(-12)">
      <rect x="-18" y="-30" width="13" height="30" fill="${GUARD_DARK}"/>
      <rect x="5" y="-30" width="13" height="30" fill="${GUARD_DARK}"/>
      <path d="M -22 -30 L 22 -30 L 18 -72 L -18 -72 Z" fill="${GUARD_BLUE}" stroke="${GOLD}" stroke-width="3"/>
      <rect x="-21" y="-38" width="42" height="6" fill="${GOLD}"/>
      <rect x="18" y="-68" width="7" height="44" fill="#c7cdd6"/>
      <rect x="12" y="-26" width="20" height="6" fill="#8a6a2a"/>
      <ellipse cx="0" cy="-80" rx="22" ry="15" fill="#e8ecf2"/>
      <rect x="-20" y="-80" width="40" height="9" fill="#e8ecf2"/>
      <circle cx="0" cy="-80" r="16" fill="#c98a4a"/>
      <path d="M -16 -84 Q 0 -68 16 -84 L 16 -70 Q 0 -60 -16 -70 Z" fill="#7a4a20"/>
      <circle cx="-6" cy="-82" r="2.2" fill="#1a1300"/>
      <path d="M -10 -74 q 10 6 20 0" stroke="#1a1300" stroke-width="1.6" fill="none"/>
    </g>`;
}

let sparks = "";
for (let i = 0; i < 10; i++) {
  const x = 660 + (rnd() - 0.5) * 90;
  const y = 500 + (rnd() - 0.5) * 70;
  sparks += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(rnd() * 3 + 1.2).toFixed(1)}" fill="${GOLD}"/>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#ffcf7a" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#ffcf7a" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="vign" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#000" stop-opacity="0.55"/>
      <stop offset="0.35" stop-color="#000" stop-opacity="0.05"/>
      <stop offset="0.75" stop-color="#000" stop-opacity="0.05"/>
      <stop offset="1" stop-color="#000" stop-opacity="0.6"/>
    </linearGradient>
    <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0a0603"/>
      <stop offset="1" stop-color="#1a120a"/>
    </linearGradient>
  </defs>

  ${bricks()}
  <rect x="0" y="500" width="${W}" height="${H - 500}" fill="url(#floor)"/>
  <rect x="0" y="496" width="${W}" height="6" fill="#c9a15c" opacity="0.8"/>

  ${torch(150, 210)}
  ${torch(1050, 210)}

  ${sparks}
  ${guard(700, 500)}
  ${crow(560, 500)}

  <rect x="0" y="0" width="${W}" height="${H}" fill="url(#vign)"/>

  <text x="60" y="110" font-family="JetBrains Mono, monospace" font-weight="800"
    font-size="60" fill="${INK}">crow<tspan fill="${GOLD}">ofpersia</tspan></text>
  <text x="60" y="150" font-family="JetBrains Mono, monospace" font-size="21"
    fill="${MUTED}">a Prince-of-Persia dungeon — pecked, not dueled</text>

  <text x="60" y="${H - 46}" font-family="JetBrains Mono, monospace" font-size="16"
    fill="${MUTED}">guards wear @norvid-studies.bsky.social's real follows</text>
  <text x="${W - 60}" y="${H - 46}" text-anchor="end" font-family="JetBrains Mono, monospace"
    font-size="16" fill="${GOLD}">bisks.net/games/crowofpersia</text>
</svg>`;

writeFileSync(new URL("./og.svg", import.meta.url), svg);
console.log("wrote og.svg — now run:\n  npx --yes @resvg/resvg-js-cli --font-file fonts/JetBrainsMono.ttf --font-default-family \"JetBrains Mono\" og.svg public/og.png");
