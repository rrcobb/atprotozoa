// Generates public/og.png (1200x630). Needs @resvg/resvg-js (npm install @resvg/resvg-js --no-save).
import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { replay } from "./public/grow.js";
const s = replay(9, 40);
const col = (h) => `hsl(${Math.round(h * 360)} 70% 60%)`;
const shapes = s.objects.map((o) => {
  const cx = 600 + o.x * 100, cy = 330 + o.z * 28 - o.y * 40, r = 12 + o.s * 40;
  return o.kind === "box" ? `<rect x="${cx - r}" y="${cy - r}" width="${2 * r}" height="${2 * r}" fill="${col(o.hue)}" opacity=".85"/>`
    : o.kind === "pillar" ? `<rect x="${cx - r / 2}" y="${cy - o.h * 40}" width="${r}" height="${o.h * 80}" fill="${col(o.hue)}" opacity=".85"/>`
    : o.kind === "torus" ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${col(o.hue)}" stroke-width="8"/>`
    : `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${col(o.hue)}" opacity=".85"/>`;
}).join("\n");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#0e0d14"/>${shapes}
<text x="60" y="110" font-family="JetBrains Mono" font-weight="700" font-size="64" fill="#e8e6f0">roomgrow</text>
<text x="60" y="160" font-family="JetBrains Mono" font-size="26" fill="#9a97ab">one change a minute, forever</text>
<text x="60" y="580" font-family="JetBrains Mono" font-size="22" fill="#9a97ab">roomgrow.bisks.net</text></svg>`;
const font = fileURLToPath(new URL("../receipts/fonts/JetBrainsMono.ttf", import.meta.url));
const png = new Resvg(svg, { font: { fontFiles: [font], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" } }).render().asPng();
writeFileSync(fileURLToPath(new URL("./public/og.png", import.meta.url)), png);
console.log("og.png", png.length);
