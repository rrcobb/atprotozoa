// Generates public/og.png — the Open Graph preview card for rfcwho.
// Hand-drawn SVG mocked up as an RFC cover page, rasterised with
// @resvg/resvg-js (no system fonts on this box, so fonts are bundled in
// ./fonts and loaded explicitly).
//
//   node og-gen.mjs   # writes ./public/og.png
//   (node_modules/@resvg here is symlinked from a sibling site's install —
//   see sites/sidenote for why: it's not hoisted to root node_modules.)

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const PAPER = "#f3efe4", INK = "#2a2620", MUTED = "#6b6455", ACCENT = "#a3311f", ACCENT2 = "#1f5e4a";
const MONO = "JetBrains Mono";
const SERIF = "DejaVu Serif";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${PAPER}"/>
  <rect x="40" y="40" width="${W - 80}" height="${H - 80}" fill="#fffdf7" stroke="#c9c0a8" stroke-width="2"/>

  <text x="80" y="105" font-family="${MONO}" font-size="20" fill="${MUTED}">Network Working Group</text>
  <text x="1120" y="105" text-anchor="end" font-family="${MONO}" font-size="20" fill="${MUTED}">Who</text>
  <text x="80" y="132" font-family="${MONO}" font-size="20" fill="${MUTED}">Request for Comments: 9142</text>
  <text x="1120" y="132" text-anchor="end" font-family="${MONO}" font-size="20" fill="${MUTED}">rfcwho.bisks.net</text>
  <text x="80" y="159" font-family="${MONO}" font-size="20" fill="${MUTED}">Category: Informational (Not for Implementation)</text>

  <line x1="80" y1="188" x2="1120" y2="188" stroke="#c9c0a8" stroke-width="2"/>

  <text x="80" y="270" font-family="${MONO}" font-weight="bold" font-size="72" fill="${ACCENT}">rfcwho</text>
  <text x="80" y="315" font-family="${MONO}" font-size="27" fill="${INK}">a spec generator, rigorously correct and completely unintelligible</text>

  <text x="80" y="400" font-family="${SERIF}" font-size="26" fill="${INK}">&#8220;Who MUST NOT ask who Who is.&#8221;</text>
  <text x="80" y="434" font-family="${MONO}" font-size="20" fill="${MUTED}">&#8212; Section 6, REQ-3 (a normative requirement)</text>

  <text x="80" y="500" font-family="${MONO}" font-size="20" fill="${ACCENT2}">RFC 2119 keywords. ASD-STE100 plain style. Zero clarity.</text>

  <text x="80" y="570" font-family="${MONO}" font-weight="bold" font-size="26" fill="${ACCENT}">rfcwho.bisks.net</text>
</svg>`;

const fontPaths = [
  fileURLToPath(new URL("./fonts/DejaVuSerif.ttf", import.meta.url)),
  fileURLToPath(new URL("./fonts/DejaVuSerif-Bold.ttf", import.meta.url)),
  fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url)),
];
const r = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: fontPaths, loadSystemFonts: false, defaultFontFamily: MONO },
});
const png = r.render().asPng();
const out = new URL("./public/og.png", import.meta.url).pathname;
writeFileSync(out, png);
console.log("wrote", out);
