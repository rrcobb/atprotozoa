// Generates public/og.png (1200x630). Run: node og-gen.mjs
// Needs @resvg/resvg-js (borrowed from a sibling site's node_modules if not local).
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const require = createRequire(new URL("../receipts/", import.meta.url));
const { Resvg } = require("@resvg/resvg-js");

const W = 1200, H = 630;
// a little 4-state Markov chain drawn as nodes + arrows
const nodes = [[250, 400, "mine"], [520, 330, "haul"], [790, 400, "strike"], [520, 500, "bulwark"]];
const edges = [[0, 1], [1, 0], [1, 2], [2, 3], [3, 1], [0, 3], [2, 2]];
const edgeSvg = edges.map(([a, b]) => {
  const [x1, y1] = nodes[a], [x2, y2] = nodes[b];
  if (a === b) return `<circle cx="${x1}" cy="${y1 - 56}" r="26" fill="none" stroke="#2f7f72" stroke-width="3"/>`;
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#2f7f72" stroke-width="3" stroke-dasharray="${(a + b) % 2 ? "0" : "8 6"}"/>`;
}).join("");
const nodeSvg = nodes.map(([x, y, t]) => `<circle cx="${x}" cy="${y}" r="46" fill="#121a33" stroke="#5ee1c4" stroke-width="4"/><text x="${x}" y="${y + 6}" text-anchor="middle" font-family="JetBrains Mono" font-size="20" fill="#d7def5">${t}</text>`).join("");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
<rect width="${W}" height="${H}" fill="#0b1020"/>
<text x="64" y="130" font-family="JetBrains Mono" font-weight="700" font-size="84" fill="#5ee1c4">skillchain</text>
<text x="64" y="190" font-family="JetBrains Mono" font-size="30" fill="#8591bd">ships that run on Markov chains of skills,</text>
<text x="64" y="232" font-family="JetBrains Mono" font-size="30" fill="#8591bd">sized by their power plant.</text>
${edgeSvg}${nodeSvg}
<text x="64" y="590" font-family="JetBrains Mono" font-size="26" fill="#d7def5">async PvP over PDS records · skillchain.bisks.net</text>
<rect x="900" y="330" width="236" height="170" rx="14" fill="#121a33" stroke="#25305a"/>
<text x="920" y="372" font-family="JetBrains Mono" font-size="20" fill="#8591bd">reactor  fusion</text>
<text x="920" y="408" font-family="JetBrains Mono" font-size="20" fill="#8591bd">output   60 MW</text>
<text x="920" y="444" font-family="JetBrains Mono" font-size="20" fill="#8591bd">draw     47 MW</text>
<rect x="920" y="460" width="196" height="12" rx="6" fill="#0a0f20"/><rect x="920" y="460" width="154" height="12" rx="6" fill="#5ee1c4"/>
</svg>`;
const png = new Resvg(svg, { font: { fontFiles: [fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url))], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" } }).render().asPng();
writeFileSync(fileURLToPath(new URL("./public/og.png", import.meta.url)), png);
console.log("wrote public/og.png");
