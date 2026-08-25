// Generates public/og.png — the Open Graph preview card for mootgrinder, so
// a shared link renders a little grinder spilling colored sand instead of a
// bare URL. Hand-drawn SVG, rasterised with @resvg/resvg-js (pure native
// module, no system Chromium/fontconfig needed — font bundled in ./fonts).
// Copied pattern from sites/phonepile/og-gen.mjs / sites/didscope/og-gen.mjs.
//
//   node og-gen.mjs   # writes ./public/og.png (node_modules/@resvg already vendored here)

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#130d0a", FG = "#f3e9df", DIM = "#a99785";
const ACCENT = "#e0a458", ACCENT2 = "#c97b3d";

// a scatter of little "pixel grains" — the pfp turning into sand.
const GRAIN_COLORS = ["#e0a458", "#c97b3d", "#8fd18a", "#7aa8e0", "#e07a9a", "#f3e9df", "#5a4634", "#c9985a"];

function rngGrains(cx, cy, n, spreadX, spreadY, seed) {
  let s = seed;
  const rnd = () => {
    s = (s * 1103515245 + 12345) >>> 0;
    return (s >>> 8) / 0xffffff;
  };
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = rnd();
    const px = cx + (rnd() - 0.5) * spreadX * (0.3 + 0.7 * t);
    const py = cy + spreadY * t * (0.5 + 0.5 * rnd());
    const size = 6 + rnd() * 10;
    out.push([px, py, size, GRAIN_COLORS[Math.floor(rnd() * GRAIN_COLORS.length)]]);
  }
  return out;
}

const grains = rngGrains(900, 330, 140, 420, 220, 42);
const grainsSvg = grains
  .map(([x, y, s, c]) => `<rect x="${(x - s / 2).toFixed(1)}" y="${(y - s / 2).toFixed(1)}" width="${s.toFixed(1)}" height="${s.toFixed(1)}" fill="${c}" opacity="0.92"/>`)
  .join("\n    ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="10%" cy="0%" r="65%">
      <stop offset="0" stop-color="#2a1c10"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="95%" cy="85%" r="60%">
      <stop offset="0" stop-color="#241a30"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${ACCENT}"/>
      <stop offset="1" stop-color="${ACCENT2}"/>
    </linearGradient>
    <linearGradient id="body" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1c1c1c"/>
      <stop offset="1" stop-color="#0a0a0a"/>
    </linearGradient>
    <radialGradient id="floor" cx="50%" cy="30%" r="70%">
      <stop offset="0" stop-color="#20140c"/>
      <stop offset="1" stop-color="${BG}"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <ellipse cx="900" cy="470" rx="340" ry="150" fill="url(#floor)"/>

  <!-- grinder body -->
  <rect x="770" y="140" width="220" height="240" rx="18" fill="url(#body)" stroke="#000" stroke-width="2"/>
  <!-- hopper -->
  <polygon points="800,90 960,90 940,150 820,150" fill="#2a2a2a" stroke="#000" stroke-width="2"/>
  <rect x="812" y="60" width="136" height="34" rx="8" fill="#171717" stroke="#000" stroke-width="2"/>
  <!-- dial -->
  <circle cx="880" cy="260" r="30" fill="#151515" stroke="${ACCENT}" stroke-width="3"/>
  <rect x="877" y="234" width="6" height="18" fill="${ACCENT}"/>
  <!-- spout -->
  <polygon points="850,380 910,380 895,420 865,420" fill="#0a0a0a" stroke="#000" stroke-width="2"/>

  <!-- the sand pile -->
  ${grainsSvg}

  <text x="64" y="196" font-family="JetBrains Mono" font-weight="800" font-size="80" fill="url(#title)">moot<tspan fill="${FG}">grinder</tspan></text>
  <text x="66" y="252" font-family="JetBrains Mono" font-size="23" fill="${DIM}">drag your moots' pfps into a coffee grinder.</text>
  <text x="66" y="284" font-family="JetBrains Mono" font-size="23" fill="${DIM}">real falling sand, one grain per pixel.</text>

  <text x="66" y="348" font-family="JetBrains Mono" font-size="17" fill="${DIM}">reads the public AppView, drag-and-drop,</text>
  <text x="66" y="374" font-family="JetBrains Mono" font-size="17" fill="${DIM}">a live cellular-automaton sand sim — poke the pile.</text>

  <text x="66" y="560" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${ACCENT2}">mootgrinder.bisks.net</text>
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
