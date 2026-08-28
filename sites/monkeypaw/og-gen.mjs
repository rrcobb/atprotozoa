// Generates public/og.png — the static Open Graph preview card, so a bare
// share of monkeypaw.bisks.net still unfurls as a real picture instead of a
// blank card. Hand-drawn SVG at the canonical OG size, matching the live
// page's plain black-on-white house look plus its curse-red accent,
// rasterised with @resvg/resvg-js (pure native module — see
// sites/didscope/og-gen.mjs, this is the same recipe).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// No emoji in the SVG text: JetBrainsMono.ttf has no emoji glyphs and
// resvg-js with loadSystemFonts:false draws empty tofu boxes for anything
// outside the font (see sites/grindset's og-gen note) — the live page uses
// emoji freely since real browsers have system emoji fonts, this static
// render doesn't. The paw itself is drawn as plain shapes instead.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const INK = "#111111", MUTED = "#6b6b6b", FAINT = "#e4e4e4", CURSE = "#7a1730", CURSE_BG = "#fbf3f4";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// A small closed-fist paw, drawn as a palm circle plus five curled-knuckle
// arcs, over on the right side of the card.
const pawCx = 990, pawCy = 330, pawR = 90;

function fingerArc(i) {
  const angle = (-52 + i * 26) * (Math.PI / 180);
  const baseX = pawCx + pawR * 0.62 * Math.sin(angle);
  const baseY = pawCy - pawR * 0.62 * Math.cos(angle);
  const tipX = pawCx + pawR * 1.15 * Math.sin(angle * 0.35);
  const tipY = pawCy - pawR * 0.15 - pawR * 0.55 * Math.cos(angle * 0.35);
  return `<path d="M ${baseX.toFixed(1)} ${baseY.toFixed(1)} Q ${tipX.toFixed(1)} ${(tipY - 20).toFixed(1)} ${baseX.toFixed(1)} ${(baseY - 6).toFixed(1)}" stroke="${CURSE}" stroke-width="16" stroke-linecap="round" fill="none"/>`;
}

const fingers = [0, 1, 2, 3, 4].map(fingerArc).join("\n    ");

const rows = [
  { label: "1 KNUCKLE", value: "granted, wrong" },
  { label: "5 KNUCKLES", value: "the fist closes" },
  { label: "AGAIN", value: "it never stops" },
];

const rowH = 78;
const startY = 340;

const rowsSvg = rows
  .map((r, i) => {
    const y = startY + i * rowH;
    return `
    <line x1="64" y1="${y - 32}" x2="800" y2="${y - 32}" stroke="${FAINT}" stroke-width="1"/>
    <text x="64" y="${y}" font-family="JetBrains Mono" font-weight="800" font-size="26" fill="${CURSE}">${esc(r.label)}</text>
    <text x="780" y="${y}" text-anchor="end" font-family="JetBrains Mono" font-weight="600" font-size="24" fill="${INK}">${esc(r.value)}</text>`;
  })
  .join("\n");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#ffffff"/>
  <rect x="0" y="0" width="${W}" height="${H}" fill="${CURSE_BG}" opacity="0.35"/>
  <rect width="${W}" height="${H}" fill="none"/>

  <circle cx="${pawCx}" cy="${pawCy}" r="${pawR * 0.62}" fill="${CURSE}"/>
  ${fingers}

  <text x="64" y="112" font-family="JetBrains Mono" font-weight="800" font-size="50" fill="${CURSE}">MONKEY PAW CURLER</text>
  <text x="64" y="154" font-family="JetBrains Mono" font-size="21" fill="${MUTED}">wishes granted correctly, never kindly</text>

  <text x="64" y="220" font-family="JetBrains Mono" font-size="18" fill="${MUTED}">type a wish. the paw curls a knuckle and grants it, with a catch.</text>
  <text x="64" y="246" font-family="JetBrains Mono" font-size="18" fill="${MUTED}">press again — it curls one knuckle further. it never really stops.</text>

  ${rowsSvg}

  <text x="64" y="${H - 40}" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${CURSE}">monkeypaw.bisks.net</text>
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
