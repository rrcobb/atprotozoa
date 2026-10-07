// Generates public/og.png — the Open Graph card for littlelean.
//   npm install @resvg/resvg-js --no-save   # one-time
//   node og-gen.mjs
import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const code = [
  ["#7ee0a4", "def fib : Nat → Nat"],
  ["#e6edf3", "  | 0 => 0"],
  ["#e6edf3", "  | 1 => 1"],
  ["#e6edf3", "  | n + 2 => fib n + fib (n + 1)"],
  ["#e6edf3", ""],
  ["#79b8ff", "#eval fib 20          -- 6765"],
  ["#7ee0a4", "theorem fib_ten : fib 10 = 55 := by decide"],
  ["#f0c674", "  => decided true"],
  ["#f0c674", "theorem add_zero (n : Nat) : n + 0 = n"],
  ["#f0c674", "  => tested on 0..39, not proved"],
];
const lines = code.map(([c, t], i) => `<text x="80" y="${200 + i * 36}" fill="${c}" font-size="26" xml:space="preserve">${esc(t)}</text>`).join("");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
<rect width="${W}" height="${H}" fill="#0e1116"/>
<rect x="50" y="150" width="1100" height="440" rx="16" fill="#151a22" stroke="#262e3b" stroke-width="2"/>
<text x="60" y="108" fill="#7ee0a4" font-size="72" font-weight="700">λ</text>
<text x="140" y="108" fill="#e6edf3" font-size="64" font-weight="700">littlelean</text>
<text x="1140" y="104" fill="#8b97a8" font-size="26" text-anchor="end">a little Lean 4, in your browser</text>
${lines}
</svg>`;
const png = new Resvg(svg, { font: { fontFiles: [fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url))], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" } }).render().asPng();
writeFileSync(fileURLToPath(new URL("./public/og.png", import.meta.url)), png);
console.log("wrote public/og.png", png.length, "bytes");
