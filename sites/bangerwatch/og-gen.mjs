// Generates public/og.png — the static Open Graph preview card for the bare
// bangerwatch link. Hand-drawn SVG, rasterised with @resvg/resvg-js and
// skyclone's bundled JetBrains Mono font (no system Chromium/fontconfig
// needed). Same recipe as sites/skyclone/og-gen.mjs, sites/wentviral/og-gen.mjs.
//
//   node og-gen.mjs   # writes ./public/og.png (borrows resvg + the font
//                      # from sites/skyclone — build-time only, not a
//                      # runtime dependency of this site)

import { Resvg } from "../skyclone/node_modules/@resvg/resvg-js/index.js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const fontPath = fileURLToPath(new URL("../skyclone/fonts/JetBrainsMono.ttf", import.meta.url));

const W = 1200, H = 630;
const BG = "#0b0a10", BG2 = "#15131c", FG = "#f2eefc", DIM = "#9d95b3";
const GOLD = "#ffcf4d", PINK = "#ff6ec7", TEAL = "#5ee6c8", BLUE = "#7fbfff", CARD = "#1c1926", BORDER = "#2c2740";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// scattered confetti bits behind everything
function confettiField(seed) {
  const colors = [GOLD, PINK, TEAL, BLUE, "#c98bff"];
  let bits = "";
  let s = seed;
  const rand = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  for (let i = 0; i < 60; i++) {
    const x = rand() * W;
    const y = rand() * H;
    const c = colors[Math.floor(rand() * colors.length)];
    const r = rand() * Math.PI * 2;
    if (rand() < 0.5) {
      bits += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="10" height="5" rx="1.5" fill="${c}" opacity="0.5" transform="rotate(${((r * 180) / Math.PI).toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})"/>`;
    } else {
      bits += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="${c}" opacity="0.45"/>`;
    }
  }
  return bits;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="18%" cy="6%" r="60%">
      <stop offset="0" stop-color="#3a1030"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${GOLD}"/>
      <stop offset="0.6" stop-color="${PINK}"/>
      <stop offset="1" stop-color="${BLUE}"/>
    </linearGradient>
    <linearGradient id="bar" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${PINK}"/>
      <stop offset="1" stop-color="${GOLD}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  ${confettiField(7)}

  <text x="64" y="118" font-family="JetBrains Mono" font-weight="800" font-size="66" fill="url(#title)">bangerwatch</text>
  <text x="66" y="160" font-family="JetBrains Mono" font-size="21" fill="${DIM}">a banger is 10 likes. watch a handle's mutuals climb toward it, live.</text>

  <g>
    <rect x="64" y="220" width="620" height="150" rx="16" fill="${CARD}" stroke="${BORDER}"/>
    <circle cx="112" cy="268" r="22" fill="${TEAL}"/>
    <text x="112" y="276" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="18" fill="${BG}">M</text>
    <text x="148" y="262" font-family="JetBrains Mono" font-weight="700" font-size="17" fill="${FG}">a mutual</text>
    <text x="148" y="284" font-family="JetBrains Mono" font-size="14" fill="${DIM}">@somemoot.bsky.social</text>
    <text x="96" y="322" font-family="JetBrains Mono" font-size="15" fill="${FG}">ok this one might actually be a banger</text>
    <rect x="96" y="338" width="480" height="12" rx="6" fill="${BG2}"/>
    <rect x="96" y="338" width="432" height="12" rx="6" fill="url(#bar)"/>
    <text x="600" y="348" font-family="JetBrains Mono" font-weight="800" font-size="16" fill="${GOLD}">9/10</text>
  </g>

  <g>
    <rect x="716" y="220" width="420" height="150" rx="16" fill="${CARD}" stroke="${GOLD}" stroke-width="2"/>
    <text x="750" y="270" font-family="JetBrains Mono" font-weight="800" font-size="24" fill="${GOLD}">*** BANGER ***</text>
    <text x="750" y="304" font-family="JetBrains Mono" font-size="15" fill="${DIM}">hit 10 likes — confetti cannon,</text>
    <text x="750" y="326" font-family="JetBrains Mono" font-size="15" fill="${DIM}">egregious fanfare, retired to</text>
    <text x="750" y="348" font-family="JetBrains Mono" font-size="15" fill="${DIM}">the hall of fame. not tracked past 10.</text>
  </g>

  <text x="64" y="440" font-family="JetBrains Mono" font-size="16" fill="${DIM}">Posts stop being tracked the moment they cross 10 — that's the whole bit.</text>
  <text x="64" y="588" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${PINK}">bangerwatch.bisks.net</text>
</svg>`;

const resvg = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
});
const png = resvg.render().asPng();
const out = fileURLToPath(new URL("./public/og.png", import.meta.url));
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");
