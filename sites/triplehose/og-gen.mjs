// Writes public/og.png. Needs: npm install @resvg/resvg-js --no-save
import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const font = fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url));
const col = (x, t, n) => `<rect x="${x}" y="230" width="340" height="300" rx="14" fill="#f4f4f4" stroke="#ddd"/><text x="${x + 24}" y="285" font-size="34" font-weight="bold" fill="#111">${t}</text><text x="${x + 24}" y="335" font-size="22" fill="#1a5fd0">${n}</text><rect x="${x + 24}" y="370" width="292" height="26" rx="6" fill="#e2e2e2"/><rect x="${x + 24}" y="410" width="220" height="26" rx="6" fill="#e2e2e2"/><rect x="${x + 24}" y="450" width="260" height="26" rx="6" fill="#e2e2e2"/>`;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" font-family="JetBrains Mono"><rect width="1200" height="630" fill="#fff"/><text x="60" y="110" font-size="64" font-weight="bold" fill="#111">triplehose</text><text x="60" y="165" font-size="26" fill="#6b6b6b">one live Bluesky firehose, three columns</text>${col(60, "cee", "@cee.wtf")}${col(430, "kanye", "Kanye West")}${col(800, "cats", "cat photos")}</svg>`;
const png = new Resvg(svg, { font: { fontFiles: [font], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" } }).render().asPng();
writeFileSync(fileURLToPath(new URL("./public/og.png", import.meta.url)), png);
