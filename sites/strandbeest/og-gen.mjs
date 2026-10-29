// Generates public/og.png (1200x630) with @resvg/resvg-js: a strandbeest on a dune,
// drawn from the same linkage the site runs. Run: node og-gen.mjs
// (resvg is borrowed from sites/receipts/node_modules if not installed here.)
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { solveLeg, RODS, SOLE_Y } from "./public/lib/linkage.js";
import { heightAt } from "./public/lib/terrain.js";

const require = createRequire(import.meta.url);
let Resvg;
try { ({ Resvg } = require("@resvg/resvg-js")); } catch { ({ Resvg } = createRequire(new URL("../receipts/", import.meta.url))("@resvg/resvg-js")); }

const Z = 2.3, PAIRS = 8, PITCH = 26, X0 = 250, BODY_Y = 0;
const gh = (px) => 470 - (heightAt(px / Z + 900, "dunes", 0.5) * 0.9 + 0) * 1.2;
let ground = "M0 630 ";
for (let x = 0; x <= 1200; x += 6) ground += `L${x} ${gh(x).toFixed(1)} `;
ground += "L1200 630 Z";
let ridges = "";
for (const [seed, base, amp, col] of [[1, 330, 70, "#c9d1d6"], [2, 365, 60, "#b2bec6"]]) {
  let d = `M0 ${base + 100} `;
  for (let x = 0; x <= 1200; x += 8) d += `L${x} ${(base - amp * (0.5 + 0.5 * Math.sin(x / (150 + seed * 40) + seed * 2) * Math.cos(x / 410 + seed))).toFixed(1)} `;
  ridges += `<path d="${d}L1200 ${base + 100}Z" fill="${col}"/>`;
}
let legs = "";
const hx0 = (k) => X0 + k * PITCH * Z + 330 - 20;
const drawLeg = (hx, hy, th, col, w) => {
  const J = solveLeg(th), p = (n) => `${(hx + J[n].x * Z).toFixed(1)} ${(hy + J[n].y * Z).toFixed(1)}`;
  const rods = [["O", "C"], ["F", "O"], ...RODS.map(([a, b]) => [a, b])];
  let s = rods.map(([a, b]) => `<line x1="${p(a).split(" ")[0]}" y1="${p(a).split(" ")[1]}" x2="${p(b).split(" ")[0]}" y2="${p(b).split(" ")[1]}" stroke="${col}" stroke-width="${w}" stroke-linecap="round"/>`).join("");
  s += ["F", "O", "C", "J1", "J2", "J3", "J4", "J5"].map((n) => `<circle cx="${p(n).split(" ")[0]}" cy="${p(n).split(" ")[1]}" r="${w * 1.5}" fill="#2a2420"/>`).join("");
  return s;
};
for (let side = 1; side >= 0; side--)
  for (let k = 0; k < PAIRS; k++) {
    const hx = X0 + k * PITCH * Z + 330, hy = gh(hx0(k)) - SOLE_Y * Z + 4;
    legs += drawLeg(hx, hy, k * 2.094 + side * Math.PI + 0.6, side ? "#a89a85" : "#6e5a43", side ? 2.2 : 3);
  }
const railY = gh(X0 + 330) - SOLE_Y * Z - 24 * Z + 4, rail = `<line x1="${X0 + 330 - 19 * Z - 40}" y1="${railY}" x2="${X0 + 330 + (PAIRS - 1) * PITCH * Z - 19 * Z + 40}" y2="${railY}" stroke="#6e5a43" stroke-width="3.5" stroke-linecap="round"/>`;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e9e3d3"/><stop offset="1" stop-color="#f8f3e8"/></linearGradient>
<linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e6d9bc"/><stop offset="1" stop-color="#cdbd98"/></linearGradient></defs>
<rect width="1200" height="630" fill="url(#s)"/>${ridges}
<path d="${ground}" fill="url(#g)" stroke="#8a7a60" stroke-width="2"/>${rail}${legs}</svg>`;
writeFileSync(fileURLToPath(new URL("./public/og.png", import.meta.url)), new Resvg(svg, { font: { loadSystemFonts: true } }).render().asPng());
