// Generates public/og.png — the static Open Graph preview card for the bare
// plcwatch.bisks.net link. Hand-drawn SVG at the canonical OG size,
// rasterised with @resvg/resvg-js (pure native module, no system
// Chromium/fontconfig needed — the font is bundled in ./fonts and loaded
// explicitly). Same recipe as sites/fleetwatch/og-gen.mjs.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#0a0c10";
const CARD = "#12151b";
const BORDER = "#232833";
const FG = "#eef0f4";
const DIM = "#8992a4";
const NEW = "#6ea8ff";
const UPDATE = "#f2b84b";

const rows = [
  { kind: "new", label: "@marzieari.bsky.social", detail: "→ discina.us-west.host.bsky.network" },
  { kind: "update", label: "did:plc:jzr62p…", detail: "→ brittlegill.us-west.host.bsky.network" },
  { kind: "new", label: "@lylum611-00.bsky.social", detail: "→ poisonpie.us-west.host.bsky.network" },
  { kind: "update", label: "@crochetfromgardens.bsky.social", detail: "→ chalciporus.us-west.host.bsky.network" },
  { kind: "new", label: "@avolafferty.bsky.social", detail: "→ fibercap.us-west.host.bsky.network" },
];

function row(y, kind, label, detail) {
  const color = kind === "new" ? NEW : UPDATE;
  return `
  <rect x="60" y="${y}" width="700" height="52" rx="8" fill="${CARD}" stroke="${BORDER}"/>
  <rect x="76" y="${y + 17}" width="58" height="18" rx="9" fill="${color}" fill-opacity="0.16"/>
  <text x="105" y="${y + 30}" text-anchor="middle" font-family="JetBrains Mono" font-size="11" letter-spacing="0.5" fill="${color}">${kind.toUpperCase()}</text>
  <text x="150" y="${y + 32}" font-family="JetBrains Mono" font-size="16" font-weight="700" fill="${FG}">${label}</text>
  <text x="150" y="${y + 32}" font-family="JetBrains Mono" font-size="16" fill="${DIM}" text-anchor="start" dx="${label.length * 9.6 + 12}">${detail}</text>`;
}

let feed = "";
rows.forEach((r, i) => {
  feed += row(70 + i * 62, r.kind, r.label, r.detail);
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>
  ${feed}

  <text x="60" y="440" font-family="JetBrains Mono" font-weight="800" font-size="60" fill="${FG}">plc<tspan fill="#52d68a">watch</tspan></text>
  <text x="62" y="480" font-family="JetBrains Mono" font-size="21" fill="${DIM}">the AT Protocol's identity ledger, live</text>

  <text x="62" y="530" font-family="JetBrains Mono" font-size="16" fill="${DIM}">new accounts &#183; PDS migrations &#183; key rotations &#183; handle changes</text>
  <text x="62" y="558" font-family="JetBrains Mono" font-size="16" fill="${DIM}">no server, no storage — polled straight from your browser</text>

  <text x="62" y="608" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="#52d68a">plcwatch.bisks.net</text>
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
