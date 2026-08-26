// Generates public/og.png — the Open Graph preview card for mootflow.
// Same recipe as sites/receipts/og-gen.mjs: hand-drawn SVG at the canonical
// OG size, rasterised with @resvg/resvg-js (no system fontconfig needed).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// Illustrative flow numbers, not live data — same tradeoff birdflow/receipts
// make: the card just needs to look like the real thing.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#0d0d0d", SURFACE = "#1a1a19", INK = "#ffffff", DIM = "#c3c2b7", MUTED = "#898781";
const ACCENT = "#5b9bf0";
const K_LIKE = "#3987e5", K_REPLY = "#d95926", K_REPOST = "#199e70";
const REL = { mutual: "#c98500", follower: "#d55181", following: "#008300", stranger: "#9085e9" };
const RELATION_LABEL = { mutual: "Mutuals", follower: "Followers", following: "Following", stranger: "Strangers" };

// A representative split: three kind-nodes fanning into four relation-nodes,
// enough ribbons to read as a sankey without needing real data.
const kindNodes = [
  { id: "like", label: "Likes", color: K_LIKE, y: 216, h: 150 },
  { id: "reply", label: "Replies", color: K_REPLY, y: 382, h: 90 },
  { id: "repost", label: "Reposts", color: K_REPOST, y: 488, h: 60 },
];
const relNodes = [
  { id: "stranger", label: "Strangers", color: REL.stranger, y: 210, h: 110 },
  { id: "follower", label: "Followers", color: REL.follower, y: 334, h: 90 },
  { id: "mutual", label: "Mutuals", color: REL.mutual, y: 438, h: 70 },
  { id: "following", label: "Following", color: REL.following, y: 522, h: 30 },
];

const rootX = 420, kindX = 620, relX = 900;
const rootTop = 200, rootH = 300;

function ribbon(x1, y1a, y1b, x2, y2a, y2b, color, opacity) {
  const mx = (x1 + x2) / 2;
  return `<path d="M${x1},${y1a} C${mx},${y1a} ${mx},${y2a} ${x2},${y2a} L${x2},${y2b} C${mx},${y2b} ${mx},${y1b} ${x1},${y1b} Z" fill="${color}" opacity="${opacity}"/>`;
}

// root -> kind ribbons (evenly split thirds of the root bar)
let ribbons = "";
let cursor = rootTop;
for (const k of kindNodes) {
  ribbons += ribbon(rootX + 16, cursor, cursor + k.h, kindX, k.y, k.y + k.h, k.color, 0.5);
  cursor += k.h;
}
// kind -> relation ribbons (fixed illustrative fan-out per kind)
const fanout = {
  like: [["stranger", 60], ["follower", 40], ["mutual", 30], ["following", 20]],
  reply: [["mutual", 35], ["stranger", 25], ["follower", 20], ["following", 10]],
  repost: [["stranger", 20], ["mutual", 20], ["follower", 15], ["following", 5]],
};
const relCursor = { stranger: 210, follower: 334, mutual: 438, following: 522 };
for (const k of kindNodes) {
  let ky = k.y;
  for (const [relId, v] of fanout[k.id]) {
    const relStart = relCursor[relId];
    ribbons += ribbon(kindX + 16, ky, ky + v, relX, relStart, relStart + v, REL[relId], 0.55);
    ky += v;
    relCursor[relId] += v;
  }
}

const nodesSvg =
  `<rect x="${rootX}" y="${rootTop}" width="16" height="${rootH}" rx="4" fill="${DIM}"/>` +
  kindNodes.map((k) => `<rect x="${kindX}" y="${k.y}" width="16" height="${k.h}" rx="4" fill="${k.color}"/>
    <text x="${kindX + 26}" y="${k.y + k.h / 2 + 6}" font-family="JetBrains Mono" font-size="18" font-weight="700" fill="${INK}">${k.label}</text>`).join("") +
  relNodes.map((r) => `<rect x="${relX}" y="${r.y}" width="16" height="${r.h}" rx="4" fill="${r.color}"/>
    <text x="${relX + 26}" y="${r.y + r.h / 2 + 6}" font-family="JetBrains Mono" font-size="17" fill="${INK}">${RELATION_LABEL[r.id]}</text>`).join("");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="6%" cy="-10%" r="55%">
      <stop offset="0" stop-color="#1c2c44"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>

  <text x="64" y="112" font-family="JetBrains Mono" font-weight="800" font-size="58" fill="${ACCENT}">mootflow</text>
  <text x="64" y="150" font-family="JetBrains Mono" font-size="20" fill="${DIM}">who's actually engaging with your posts</text>
  <text x="64" y="178" font-family="JetBrains Mono" font-size="16" fill="${MUTED}">mutuals · followers · following · total strangers — bilateral</text>

  ${ribbons}
  ${nodesSvg}

  <text x="64" y="${H - 44}" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT}">mootflow.bisks.net</text>
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
