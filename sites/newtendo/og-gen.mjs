// Generates public/og.png — the generic Open Graph preview card for the bare
// newtendo.bisks.net link. A row of cartridges pulled from the real library
// (public/data/games.json, regenerate that first via gen-games.mjs), not a
// specific pick — per-cartridge share cards are drawn live, client-side, in
// public/index.html (drawCard). Same resvg approach as sites/didscope.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
import { Resvg } from "@resvg/resvg-js";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#1c1c20", SHELL = "#2b2b30", PAPER = "#f2efe4", RED = "#e8433f", MUTED = "#8b8879";
const COLORS = ["#e8433f", "#1a5fd0", "#2a9d5c", "#e8a63f", "#7a3fe8", "#3fc4e8", "#e83fa0"];

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}
function initials(title) {
  return title.split(/[\s-]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
}

const games = JSON.parse(readFileSync(new URL("./public/data/games.json", import.meta.url)));
// A fixed, hand-picked sample so the static card doesn't churn every regen —
// pick a spread across the alphabet rather than the literal first five.
const sampleNames = ["pacmoot", "mootkombat", "sokobisks", "spaceghost", "moottris"];
const sample = sampleNames.map((n) => games.find((g) => g.name === n)).filter(Boolean);
while (sample.length < 5 && games.length) sample.push(games[sample.length % games.length]);

const cartW = 168, cartH = 220, gap = 26;
const totalW = sample.length * cartW + (sample.length - 1) * gap;
const startX = (W - totalW) / 2;
const cartY = 300;

const carts = sample
  .map((g, i) => {
    const x = startX + i * (cartW + gap);
    const color = COLORS[hashStr(g.name) % COLORS.length];
    const rot = i % 2 === 0 ? -3 : 3;
    return `
    <g transform="rotate(${rot} ${x + cartW / 2} ${cartY + cartH / 2})">
      <rect x="${x}" y="${cartY}" width="${cartW}" height="${cartH}" rx="10" fill="#d8d4c8"/>
      <path d="M ${x} ${cartY + 70} L ${x} ${cartY + 10} Q ${x} ${cartY} ${x + 10} ${cartY} L ${x + cartW - 10} ${cartY} Q ${x + cartW} ${cartY} ${x + cartW} ${cartY + 10} L ${x + cartW} ${cartY + 70} Z" fill="${color}"/>
      <text x="${x + cartW / 2}" y="${cartY + 48}" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="30" fill="#ffffff">${esc(initials(g.title))}</text>
      <text x="${x + cartW / 2}" y="${cartY + 110}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="16" fill="#17171a">${esc(g.title.length > 16 ? g.title.slice(0, 15) + "…" : g.title)}</text>
    </g>`;
  })
  .join("\n");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="50%" cy="0%" r="70%">
      <stop offset="0" stop-color="#3a2020"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect x="0" y="0" width="${W}" height="8" fill="${RED}"/>

  <text x="${W / 2}" y="120" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="76" fill="${PAPER}">NEWTENDO</text>
  <text x="${W / 2}" y="164" text-anchor="middle" font-family="JetBrains Mono" font-size="20" letter-spacing="4" fill="${RED}">ENTERTAINMENT SYSTEM</text>
  <text x="${W / 2}" y="210" text-anchor="middle" font-family="JetBrains Mono" font-size="19" fill="${MUTED}">every bisks.net game, shelved as a cartridge</text>

  ${carts}

  <text x="${W / 2}" y="${H - 40}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${RED}">newtendo.bisks.net</text>
</svg>`;

const fontPath = fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url));
const r = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
});
const png = r.render().asPng();
const out = fileURLToPath(new URL("./public/og.png", import.meta.url));
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");
