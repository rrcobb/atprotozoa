// Generates public/og.png — the Open Graph preview card for kludgebot.
// A little robot with a few bolted-on extras, drawn as plain vector shapes
// (no emoji: resvg's bundled font has no emoji glyphs, so any emoji text
// node silently rasterizes as an empty box — see sites/grindset's og-gen
// note). Rasterised with @resvg/resvg-js (pure native module, no system
// Chromium needed).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork. Adapted from sites/bootstraps/og-gen.mjs.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#0a0e12";
const MUTED = "#7c93a3";
const ACCENT = "#b6ff3c";
const ACCENT2 = "#ff5fd8";
const BODY = "#4fd1ff";
const DARK = "#3a4b58";

const cx = 300, headCy = 260, torsoY = 300, torsoCy = 345, legCy = 400;

const legs = [-12, 12].map((dx) =>
  `<rect x="${cx + dx - 6}" y="${legCy}" width="12" height="30" rx="3" fill="${DARK}"/>`
).join("\n  ");

const arms = [
  `<line x1="${cx - 35}" y1="${torsoCy}" x2="${cx - 62}" y2="${torsoCy + 14}" stroke="${BODY}" stroke-width="9" stroke-linecap="round"/>`,
  `<circle cx="${cx - 62}" cy="${torsoCy + 14}" r="7" fill="${DARK}"/>`,
  `<line x1="${cx + 35}" y1="${torsoCy}" x2="${cx + 62}" y2="${torsoCy + 14}" stroke="${BODY}" stroke-width="9" stroke-linecap="round"/>`,
  `<circle cx="${cx + 62}" cy="${torsoCy + 14}" r="7" fill="${DARK}"/>`,
  // a bolted-on third arm, slightly askew — the joke, drawn straight
  `<line x1="${cx + 35}" y1="${torsoCy + 18}" x2="${cx + 78}" y2="${torsoCy + 46}" stroke="${ACCENT2}" stroke-width="8" stroke-linecap="round"/>`,
  `<circle cx="${cx + 78}" cy="${torsoCy + 46}" r="6" fill="${DARK}"/>`,
].join("\n  ");

const antenna = `
  <line x1="${cx - 10}" y1="${headCy - 40}" x2="${cx - 10}" y2="${headCy - 58}" stroke="${DARK}" stroke-width="3"/>
  <circle cx="${cx - 10}" cy="${headCy - 60}" r="4" fill="${ACCENT2}"/>
  <line x1="${cx + 14}" y1="${headCy - 40}" x2="${cx + 14}" y2="${headCy - 62}" stroke="${DARK}" stroke-width="3"/>
  <circle cx="${cx + 14}" cy="${headCy - 64}" r="4" fill="${ACCENT}"/>
`;

// three eyes — one of the "upgrades" that never quite makes sense
const eyes = [-24, 0, 24].map((dx, i) =>
  `<circle cx="${cx + dx}" cy="${headCy - (i === 2 ? 6 : 2)}" r="6" fill="#111"/>`
).join("\n  ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>

  <g transform="translate(-40,0)">
    ${legs}
    <rect x="${cx - 45}" y="${torsoY}" width="90" height="70" rx="14" fill="${BODY}"/>
    ${arms}
    ${antenna}
    <circle cx="${cx}" cy="${headCy}" r="40" fill="${BODY}"/>
    ${eyes}
    <path d="M ${cx + 96} ${torsoCy + 30} q 14 -18 -2 -30" fill="none" stroke="${ACCENT}" stroke-width="4" stroke-linecap="round"/>
  </g>

  <text x="560" y="230" font-family="JetBrains Mono" font-weight="800" font-size="60" fill="${ACCENT}">kludgebot</text>
  <text x="562" y="300" font-family="JetBrains Mono" font-size="22" fill="${MUTED}">a robot that tries to improve itself,</text>
  <text x="562" y="332" font-family="JetBrains Mono" font-size="22" fill="${MUTED}">one chaotic self-upgrade at a time.</text>
  <text x="562" y="364" font-family="JetBrains Mono" font-size="22" fill="${MUTED}">never quite the ability it meant to gain.</text>
  <text x="562" y="440" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${ACCENT2}">kludgebot.bisks.net</text>
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
