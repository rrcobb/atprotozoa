// Generates public/og.png — the Open Graph preview card for pickyourpoison.
//
// Mirrors the page's save-select terminal aesthetic: near-black background,
// scanline-green accent, three slot rows with SLOWDOWN marked locked.
// Rasterised with @resvg/resvg-js (pure native module, no system
// Chromium/fontconfig needed — the font is bundled in ./fonts).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run by hand if you
// change the artwork. Adapted from sites/arachnid2027/og-gen.mjs.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#05070a", INK = "#d7ecff", DIM = "#5c7089", GREEN = "#6ee7a0", AMBER = "#ffb454", RED = "#ff6b6b", VIOLET = "#c792ea", LINE = "#1f2b38";

function slotRow(y, label, name, status, statusColor, locked) {
  const nameColor = locked ? "#4a5b6e" : INK;
  return `
  <rect x="70" y="${y}" width="1060" height="94" rx="6" fill="#0c1118" stroke="${LINE}" stroke-width="2"/>
  <text x="96" y="${y + 32}" font-family="JetBrains Mono" font-size="14" letter-spacing="1" fill="${DIM}">${label}</text>
  <text x="96" y="${y + 66}" font-family="JetBrains Mono" font-weight="700" font-size="26" fill="${nameColor}">${name}</text>
  <rect x="${1010 - status.length * 10}" y="${y + 32}" width="${status.length * 10 + 20}" height="30" rx="15" fill="none" stroke="${statusColor}" stroke-width="2"/>
  <text x="1020" y="${y + 52}" text-anchor="end" font-family="JetBrains Mono" font-weight="700" font-size="14" letter-spacing="1" fill="${statusColor}">${status}</text>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect x="0" y="0" width="10" height="${H}" fill="${GREEN}"/>

  <text x="70" y="90" font-family="JetBrains Mono" font-weight="700" font-size="15" letter-spacing="3" fill="${GREEN}">&gt; SELECT A SAVE FILE_</text>
  <text x="70" y="150" font-family="JetBrains Mono" font-weight="800" font-size="58" fill="#ffffff">PICK YOUR POISON</text>

  ${slotRow(200, "SLOT 01 — GOOD END", "SLOWDOWN", "LOCKED", DIM, true)}
  ${slotRow(306, "SLOT 02 — BAD END", "RACE", "AVAILABLE", RED, false)}
  ${slotRow(412, "SLOT 03 — EXTREMELY BAD END", "METAMORPHOSIS OF PRIME INTELLECT", "AVAILABLE", VIOLET, false)}

  <text x="70" y="560" font-family="JetBrains Mono" font-size="17" fill="${DIM}">one of these three is not like the others.</text>
  <text x="70" y="590" font-family="JetBrains Mono" font-weight="700" font-size="18" fill="${GREEN}">pickyourpoison.bisks.net</text>
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
