// Generates public/og.png — the Open Graph preview card for deckulator.
//
// Hand-draws a mock of the dense control-panel UI (wordmark, a couple of
// input fields, a telemetry readout) as an SVG at the canonical OG size,
// then rasterises it with @resvg/resvg-js (no system Chromium/fontconfig on
// this box — the font is bundled in ./fonts and loaded explicitly). Copied
// from sites/areyoumad/og-gen.mjs (copy, don't abstract).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#0a0e13", PANEL = "#10161f", PANEL2 = "#0c1119", BORDER = "#223046";
const TEXT = "#dbe4ee", MUTED = "#7c8ba1", ACCENT = "#33d17a", AMBER = "#ffb020";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>

  <!-- wordmark -->
  <text x="56" y="92" font-family="JetBrains Mono" font-weight="700" font-size="46" fill="${TEXT}">DECKULATOR<tspan fill="${ACCENT}">_</tspan></text>
  <text x="56" y="122" font-family="JetBrains Mono" font-size="17" fill="${MUTED}">Residential Decking Estimation &amp; Structural Advisory Terminal — rev 4.7.2</text>

  <!-- left: a stack of mock input panels -->
  <g>
    <rect x="56" y="160" width="520" height="128" rx="6" fill="${PANEL}" stroke="${BORDER}"/>
    <rect x="56" y="160" width="520" height="28" rx="6" fill="${PANEL2}"/>
    <text x="70" y="179" font-family="JetBrains Mono" font-weight="700" font-size="12" fill="${ACCENT}">01 · DECK GEOMETRY &amp; DECKING LAYOUT</text>
    <rect x="70" y="204" width="150" height="26" rx="4" fill="${BG}" stroke="${BORDER}"/>
    <text x="80" y="221" font-family="JetBrains Mono" font-size="13" fill="${TEXT}">16</text>
    <rect x="234" y="204" width="150" height="26" rx="4" fill="${BG}" stroke="${BORDER}"/>
    <text x="244" y="221" font-family="JetBrains Mono" font-size="13" fill="${TEXT}">12</text>
    <rect x="398" y="204" width="164" height="26" rx="4" fill="${BG}" stroke="${BORDER}"/>
    <text x="408" y="221" font-family="JetBrains Mono" font-size="12" fill="${MUTED}">Diagonal 45°</text>
    <rect x="70" y="248" width="200" height="26" rx="4" fill="${BG}" stroke="${BORDER}"/>
    <text x="80" y="265" font-family="JetBrains Mono" font-size="12" fill="${MUTED}">Ipe (Brazilian hardwood)</text>
    <rect x="290" y="248" width="272" height="26" rx="4" fill="${BG}" stroke="${BORDER}"/>
    <text x="300" y="265" font-family="JetBrains Mono" font-size="12" fill="${MUTED}">Waste factor override %</text>

    <rect x="56" y="304" width="520" height="96" rx="6" fill="${PANEL}" stroke="${BORDER}"/>
    <rect x="56" y="304" width="520" height="28" rx="6" fill="${PANEL2}"/>
    <text x="70" y="323" font-family="JetBrains Mono" font-weight="700" font-size="12" fill="${ACCENT}">05 · ENVIRONMENTAL COMPENSATION</text>
    <text x="70" y="356" font-family="JetBrains Mono" font-size="12" fill="${MUTED}">Barometric pressure (inHg), lunar phase at install,</text>
    <text x="70" y="378" font-family="JetBrains Mono" font-size="12" fill="${MUTED}">board acclimation period, hygroscopic equilibrium index...</text>

    <text x="56" y="440" font-family="JetBrains Mono" font-size="16" fill="${TEXT}">42 inputs. 6 subsystems. One deck.</text>
  </g>

  <!-- right: telemetry readout card -->
  <rect x="624" y="160" width="520" height="382" rx="6" fill="${PANEL}" stroke="${BORDER}" stroke-width="2"/>
  <rect x="624" y="160" width="520" height="30" rx="6" fill="${PANEL2}"/>
  <text x="640" y="180" font-family="JetBrains Mono" font-weight="700" font-size="12" fill="${ACCENT}">LIVE TELEMETRY</text>
  <circle cx="1128" cy="175" r="5" fill="${ACCENT}"/>

  ${[
    ["Deck area", "192.0 ft²"],
    ["Field boards", "58"],
    ["Total boards (pre-spares)", "71"],
    ["Joist span advisory", "ADEQUATE"],
    ["Fasteners, total", "1,846"],
    ["Hygroscopic equilibrium index", "62.4 / 100"],
    ["Grain alignment confidence", "97%"],
    ["Realities evaluated", "1,412"],
  ]
    .map(
      ([k, v], i) => `
    <text x="646" y="${222 + i * 34}" font-family="JetBrains Mono" font-size="14" fill="${MUTED}">${k}</text>
    <text x="1128" y="${222 + i * 34}" text-anchor="end" font-family="JetBrains Mono" font-weight="700" font-size="14" fill="${i === 3 ? ACCENT : TEXT}">${v}</text>`,
    )
    .join("")}

  <rect x="646" y="500" width="478" height="26" rx="4" fill="rgba(51,209,122,0.12)" stroke="#1b7a48"/>
  <text x="662" y="518" font-family="JetBrains Mono" font-weight="700" font-size="13" fill="${ACCENT}">BUY: 75 BOARDS × 16 FT</text>

  <!-- footer -->
  <text x="56" y="600" font-family="JetBrains Mono" font-size="16" fill="${MUTED}">a materials takeoff buried under a structural advisory.</text>
  <text x="${W - 56}" y="600" text-anchor="end" font-family="JetBrains Mono" font-size="16" fill="${AMBER}">deckulator.bisks.net</text>
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
