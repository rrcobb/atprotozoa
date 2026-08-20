// Generates public/og.png — the static Open Graph preview card. Not tied to
// any real handle (per-generation thumbnails are drawn live, client-side, in
// public/app.js) — this is the generic "here's the idea" card a bare link
// unfurls to. Hand-drawn SVG at the canonical OG size, rasterised with
// @resvg/resvg-js (pure native module, no system Chromium/fontconfig needed —
// the font is bundled in ./fonts and loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork. Pattern copied from sites/didscope/og-gen.mjs.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// mock "thumbnail preview" card, right side — same visual language as a
// generated card (burst rays, big circle avatar, badge, arrow, all-caps text)
// but generic, not built from any real handle.
const cardX = 610, cardY = 90, cardW = 540, cardH = 450;
const avCX = cardX + cardW * 0.62, avCY = cardY + 330, avR = 110;

let rays = "";
for (let i = 0; i < 20; i++) {
  const a0 = (i / 20) * Math.PI * 2;
  const a1 = ((i + 0.5) / 20) * Math.PI * 2;
  const R = 500;
  const x0 = avCX + R * Math.cos(a0), y0 = avCY + R * Math.sin(a0);
  const x1 = avCX + R * Math.cos(a1), y1 = avCY + R * Math.sin(a1);
  rays += `<path d="M${avCX},${avCY} L${x0.toFixed(1)},${y0.toFixed(1)} A${R},${R} 0 0 1 ${x1.toFixed(1)},${y1.toFixed(1)} Z" fill="${i % 2 === 0 ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"}"/>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0c0a10"/>
      <stop offset="1" stop-color="#241019"/>
    </linearGradient>
    <linearGradient id="card" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ff5b1a"/>
      <stop offset="1" stop-color="#c40010"/>
    </linearGradient>
    <clipPath id="cardClip"><rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="16"/></clipPath>
    <clipPath id="avClip"><circle cx="${avCX}" cy="${avCY}" r="${avR}"/></clipPath>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#bg)"/>

  <!-- left: wordmark + pitch -->
  <text x="64" y="150" font-family="Anton" font-size="80" fill="#ffe000">THUMBJACK</text>
  <text x="66" y="196" font-family="ui-sans-serif, Arial" font-size="21" fill="#a9a0b8">type a Bluesky handle, get the most</text>
  <text x="66" y="224" font-family="ui-sans-serif, Arial" font-size="21" fill="#a9a0b8">shameless YouTube thumbnail imaginable</text>

  <text x="66" y="280" font-family="ui-sans-serif, Arial" font-size="17" fill="#7d7488">built from their real recent posts.</text>
  <text x="66" y="304" font-family="ui-sans-serif, Arial" font-size="17" fill="#7d7488">no AI — just fonts, arrows, and a sticker.</text>

  <rect x="66" y="480" width="230" height="4" fill="#ff3b30"/>
  <text x="66" y="540" font-family="ui-sans-serif, Arial" font-weight="700" font-size="26" fill="#ffe000">thumbjack.bisks.net</text>

  <!-- right: mock generated card -->
  <g clip-path="url(#cardClip)">
    <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" fill="url(#card)"/>
    <g clip-path="url(#cardClip)">${rays}</g>
    <g clip-path="url(#avClip)">
      <rect x="${avCX - avR}" y="${avCY - avR}" width="${avR * 2}" height="${avR * 2}" fill="#2a2a2a"/>
      <text x="${avCX}" y="${avCY + avR * 0.35}" font-family="ui-sans-serif, Arial" font-weight="700" font-size="${avR}" fill="#fff" text-anchor="middle">?</text>
    </g>
    <circle cx="${avCX}" cy="${avCY}" r="${avR + 8}" fill="none" stroke="#ffe000" stroke-width="8"/>
    <text x="${cardX + 120}" y="${cardY + 110}" font-family="Anton" font-size="48" fill="#ffffff" stroke="#000000" stroke-width="6" paint-order="stroke">YOU WON'T</text>
    <text x="${cardX + 120}" y="${cardY + 165}" font-family="Anton" font-size="48" fill="#ffffff" stroke="#000000" stroke-width="6" paint-order="stroke">BELIEVE THIS</text>
    <g transform="translate(${cardX + 55},${cardY + 50}) rotate(-12)">
      <circle r="40" fill="#ffe000" stroke="#000" stroke-width="3"/>
      <text y="5" font-family="Anton" font-size="13" fill="#1a1200" text-anchor="middle">NOT</text>
      <text y="19" font-family="Anton" font-size="13" fill="#1a1200" text-anchor="middle">CLICKBAIT</text>
    </g>
  </g>
  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="16" fill="none" stroke="#3a2650" stroke-width="1.5"/>
</svg>`;

const fontPath = fileURLToPath(new URL("./fonts/Anton-Regular.ttf", import.meta.url));
const r = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontPath], loadSystemFonts: true, defaultFontFamily: "Anton" },
});
const png = r.render().asPng();
const out = new URL("./public/og.png", import.meta.url).pathname;
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");
