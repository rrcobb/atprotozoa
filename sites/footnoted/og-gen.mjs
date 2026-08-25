// Generates public/og.png — the static Open Graph preview card for
// footnoted.bisks.net. Hand-drawn SVG, rasterised with @resvg/resvg-js and
// skyclone's bundled JetBrains Mono font (no system Chromium/fontconfig
// needed). Same recipe as sites/fieldguide/og-gen.mjs.
//
//   node og-gen.mjs   # writes ./public/og.png (borrows resvg + the font
//                      # from sites/skyclone — build-time only, not a
//                      # runtime dependency of this site)

import { Resvg } from "../skyclone/node_modules/@resvg/resvg-js/index.js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const fontPath = fileURLToPath(new URL("../skyclone/fonts/JetBrainsMono.ttf", import.meta.url));

const W = 1200, H = 630;
const BG = "#fbfaf7", INK = "#171512", MUTED = "#6b6558", FAINT = "#e6e0d4", ACCENT = "#a8390f", ACCENT_SOFT = "#c9754f";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>

  <text x="64" y="112" font-family="JetBrains Mono" font-weight="800" font-size="58" fill="${INK}">footnoted</text>
  <text x="64" y="150" font-family="JetBrains Mono" font-size="19" fill="${MUTED}">one jargon-dense post, underlined term by term</text>

  <line x1="64" y1="184" x2="${W - 64}" y2="184" stroke="${INK}" stroke-width="2"/>

  <!-- mock annotated sentence -->
  <text x="64" y="244" font-family="Georgia, serif" font-size="26" fill="${INK}">i'm using the</text>
  <text x="246" y="244" font-family="Georgia, serif" font-size="26" fill="${INK}" text-decoration="underline" text-decoration-style="dotted">HybViT<tspan font-family="JetBrains Mono" font-size="14" fill="${ACCENT}" dy="-8">1</tspan></text>
  <text x="336" y="244" font-family="Georgia, serif" font-size="26" fill="${INK}" dy="8">recipe with</text>
  <text x="64" y="284" font-family="Georgia, serif" font-size="26" fill="${INK}" text-decoration="underline" text-decoration-style="dotted">SwiGLUs<tspan font-family="JetBrains Mono" font-size="14" fill="${ACCENT}" dy="-8">2</tspan></text>
  <text x="200" y="284" font-family="Georgia, serif" font-size="26" fill="${INK}" dy="8">swapped in on</text>
  <text x="440" y="284" font-family="Georgia, serif" font-size="26" fill="${INK}" text-decoration="underline" text-decoration-style="dotted">CIFAR-10<tspan font-family="JetBrains Mono" font-size="14" fill="${ACCENT}" dy="-8">3</tspan></text>

  <!-- arrows pointing to footnote cards -->
  <path d="M 336 234 C 460 210, 560 260, 700 320" stroke="${ACCENT_SOFT}" stroke-width="2" fill="none" marker-end="url(#head)"/>
  <path d="M 260 274 C 400 300, 560 340, 700 400" stroke="${ACCENT_SOFT}" stroke-width="2" fill="none" marker-end="url(#head)"/>
  <path d="M 570 274 C 620 320, 660 400, 700 480" stroke="${ACCENT_SOFT}" stroke-width="2" fill="none" marker-end="url(#head)"/>
  <defs>
    <marker id="head" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L6,3 L0,6 Z" fill="${ACCENT_SOFT}"/>
    </marker>
  </defs>

  <g font-family="JetBrains Mono" font-size="14" fill="${MUTED}">
    <rect x="700" y="296" width="440" height="56" rx="6" fill="none" stroke="${FAINT}" stroke-width="1.5"/>
    <text x="720" y="316">1 · HYBVIT — a ViT trained to classify</text>
    <text x="720" y="336">    and diffusion-generate at once</text>

    <rect x="700" y="376" width="440" height="56" rx="6" fill="none" stroke="${FAINT}" stroke-width="1.5"/>
    <text x="720" y="396">2 · SWIGLU — a gated MLP variant that</text>
    <text x="720" y="416">    trains to a better loss per param</text>

    <rect x="700" y="456" width="440" height="56" rx="6" fill="none" stroke="${FAINT}" stroke-width="1.5"/>
    <text x="720" y="476">3 · CIFAR-10 — 60k tiny images, cheap</text>
    <text x="720" y="496">    enough to ablate hourly</text>
  </g>

  <text x="64" y="588" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT}">footnoted.bisks.net</text>
  <text x="64" y="612" font-family="JetBrains Mono" font-size="14" fill="${MUTED}">every underline links to the real paper</text>
</svg>`;

const resvg = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
});
const png = resvg.render().asPng();
const out = fileURLToPath(new URL("./public/og.png", import.meta.url));
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");
