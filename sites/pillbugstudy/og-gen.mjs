// Generates public/og.png — the Open Graph preview card for pillbugstudy.
//
// Hand-drawn SVG "screenshot": a keyhole-shaped clip onto a small dim study
// scene (desk, lamp, a hunched pillbug silhouette) plus the title copy.
// No live AppView data — deterministic so the card is stable across builds,
// same call as sites/beatupbuddy/og-gen.mjs (the live avatar only shows up
// once you're actually on the page).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const INK = "#f2e9e2", MUTED = "#8a7d8f", GOLD = "#e8c27a", TEAR = "#7fc8e8";

// keyhole box: same 5:7 polygon math as public/index.html's CSS clip-path,
// just converted from percentages to this box's absolute px.
const boxX = 830, boxY = 84, boxW = 300, boxH = 420;
const pct = (px, py) => [boxX + (px / 100) * boxW, boxY + (py / 100) * boxH];
const pts = [
  [68, 30], [65.6, 23.5], [59, 18.7], [50, 17], [41, 18.7], [34.4, 23.5],
  [32, 30], [34.4, 36.5], [41, 41.3], [30, 95], [70, 95], [59, 41.3], [65.6, 36.5],
].map(([px, py]) => pct(px, py).join(","));
const keyholePoints = pts.join(" ");

const cx = boxX + boxW / 2;
const deskY = boxY + boxH * 0.78;
const pbW = boxW * 0.66, pbX = cx - pbW / 2, pbTop = boxY + boxH * 0.46;

const plates = [0, 1, 2, 3]
  .map((i) => {
    const y = pbTop + i * (boxH * 0.085);
    const w = pbW - i * 6;
    const x = cx - w / 2;
    return `<rect x="${x}" y="${y}" width="${w}" height="${boxH * 0.11}" rx="${w * 0.32}" fill="#403a4d" stroke="#23202c" stroke-width="2.5"/>`;
  })
  .join("");

const headR = boxW * 0.15;
const headCx = cx;
const headCy = deskY - headR * 0.5;

const scene = `
  <clipPath id="keyholeClip"><polygon points="${keyholePoints}"/></clipPath>
  <g clip-path="url(#keyholeClip)">
    <rect x="${boxX - 20}" y="${boxY - 20}" width="${boxW + 40}" height="${boxH + 40}" fill="#0d0812"/>
    <circle cx="${cx}" cy="${boxY + boxH * 0.3}" r="${boxW * 0.7}" fill="#241a30" opacity="0.55"/>
    <rect x="${boxX}" y="${boxY}" width="${boxW * 0.16}" height="${boxH * 0.5}" fill="#1c1420"/>
    <rect x="${boxX + boxW - boxW * 0.16}" y="${boxY}" width="${boxW * 0.16}" height="${boxH * 0.5}" fill="#1c1420"/>
    <rect x="${cx - boxW * 0.13}" y="${boxY + boxH * 0.06}" width="${boxW * 0.26}" height="${boxH * 0.18}" fill="#171238" stroke="#3a2f4a" stroke-width="2"/>
    <circle cx="${cx + boxW * 0.06}" cy="${boxY + boxH * 0.11}" r="${boxW * 0.045}" fill="#e6d9c2" opacity="0.8"/>
    <rect x="${boxX + boxW * 0.08}" y="${deskY}" width="${boxW * 0.84}" height="${boxH * 0.2}" rx="6" fill="#3a2818"/>
    <rect x="${boxX + boxW * 0.08}" y="${deskY}" width="${boxW * 0.84}" height="5" fill="#6b4a2a"/>
    <circle cx="${boxX + boxW * 0.22}" cy="${deskY - 10}" r="${boxW * 0.22}" fill="#ffd28c" opacity="0.18"/>
    ${plates}
    <circle cx="${headCx}" cy="${headCy}" r="${headR}" fill="#3c3648" stroke="#23202c" stroke-width="3"/>
    <path d="M ${headCx - headR * 0.5} ${headCy + headR * 0.35} q ${headR * 0.5} ${headR * 0.55} ${headR} 0" stroke="#0d0812" stroke-width="3" fill="none" stroke-linecap="round"/>
    <circle cx="${headCx - headR * 0.35}" cy="${headCy - headR * 0.05}" r="${headR * 0.12}" fill="#0d0812"/>
    <circle cx="${headCx + headR * 0.35}" cy="${headCy - headR * 0.05}" r="${headR * 0.12}" fill="#0d0812"/>
    <path d="M ${headCx - headR * 0.4} ${headCy + headR * 0.1} l -5 20 l 10 0 z" fill="${TEAR}"/>
    <path d="M ${headCx + headR * 0.32} ${headCy + headR * 0.15} l -4 16 l 8 0 z" fill="${TEAR}"/>
  </g>
  <polygon points="${keyholePoints}" fill="none" stroke="#000" stroke-width="10" opacity="0.6"/>
`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#050308"/>
  ${scene}

  <text x="60" y="230" font-family="JetBrains Mono" font-weight="800" font-size="58" fill="${INK}">THE <tspan fill="${GOLD}">KEYHOLE</tspan></text>
  <text x="60" y="278" font-family="JetBrains Mono" font-weight="700" font-size="27" fill="${GOLD}">into @isolyth.dev's study</text>
  <text x="60" y="330" font-family="JetBrains Mono" font-size="20" fill="${MUTED}">they're a giant pillbug now. hunched over the desk.</text>
  <text x="60" y="358" font-family="JetBrains Mono" font-size="20" fill="${MUTED}">crying about their sins — their own posts, one at a time.</text>

  <text x="60" y="${H - 50}" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${GOLD}">pillbugstudy.bisks.net</text>
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
