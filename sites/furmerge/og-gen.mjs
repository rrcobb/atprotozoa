// Generates public/og.png — the Open Graph preview card for furmerge, so a
// shared link auto-renders a picture of the fluff scale in Bluesky / other
// unfurlers. Hand-drawn SVG at the canonical OG size, matching the live
// page's warm cat-parlor look, rasterised with @resvg/resvg-js (pure native
// module, no system Chromium needed — this box has no fontconfig/system
// fonts either, so the font is bundled in ./fonts and loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract (adapted from
// sites/didscope/og-gen.mjs). Re-run this by hand if you change the artwork.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#21170f", PANEL = "#362819", BORDER = "#4a3521", FG = "#fdf3e4", DIM = "#c9b190", ACCENT = "#e8b84b";

// Same breed list/order/art as public/game.js's catFaceMarkup — least to
// most fluffy (house style: copy, don't abstract, this file just rasterizes
// it standalone at build time).
const BREEDS = [
  { name: "Sphynx", bg: "#3b3f46", fg: "#f2f2f2", ruff: 0, earStyle: "point", pattern: null, wrinkles: true, flat: false },
  { name: "Devon Rex", bg: "#5b5346", fg: "#f5efe2", ruff: 1, earStyle: "point", pattern: null, wrinkles: false, flat: false },
  { name: "Siamese", bg: "#8a6a4a", fg: "#fff7ea", ruff: 1, earStyle: "point", pattern: "mask", wrinkles: false, flat: false },
  { name: "Bengal", bg: "#b8802f", fg: "#fff7ea", ruff: 2, earStyle: "point", pattern: "spots", wrinkles: false, flat: false },
  { name: "Abyssinian", bg: "#c9832a", fg: "#fff7ea", ruff: 2, earStyle: "point", pattern: "tabby", wrinkles: false, flat: false },
  { name: "British Shorthair", bg: "#6f8fa6", fg: "#ffffff", ruff: 4, earStyle: "point", pattern: null, wrinkles: false, flat: false },
  { name: "Scottish Fold", bg: "#8a99a8", fg: "#ffffff", ruff: 5, earStyle: "fold", pattern: null, wrinkles: false, flat: false },
  { name: "American Shorthair", bg: "#c9944f", fg: "#ffffff", ruff: 6, earStyle: "point", pattern: "tabby", wrinkles: false, flat: false },
  { name: "Maine Coon", bg: "#c06a2c", fg: "#ffffff", ruff: 8, earStyle: "lynx", pattern: null, wrinkles: false, flat: false },
  { name: "Norwegian Forest Cat", bg: "#d68a3a", fg: "#ffffff", ruff: 10, earStyle: "lynx", pattern: null, wrinkles: false, flat: false },
  { name: "Persian", bg: "#e8b84b", fg: "#4a3300", ruff: 13, earStyle: "point", pattern: null, wrinkles: false, flat: true },
];

function catFace(b, s) {
  const cx = s / 2, cy = s / 2 + s * 0.05;
  const r = b.flat ? s * 0.33 : s * 0.3;
  const rx = b.flat ? r * 1.08 : r;
  const ry = b.flat ? r * 0.92 : r;
  const sw = (s * 0.015).toFixed(1);
  const MARK = "#4a2f18";
  const INK = "#2a1c10";

  let ruff = "";
  if (b.ruff > 0) {
    const n = Math.max(6, Math.round(b.ruff * 1.5));
    const bumpR = r * (0.16 + Math.min(b.ruff, 13) * 0.012);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const x = cx + Math.cos(a) * r * 1.05;
      const y = cy + Math.sin(a) * r * 1.05 * (ry / r);
      ruff += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${bumpR.toFixed(1)}" fill="${b.bg}" stroke="${b.fg}" stroke-width="${(s * 0.008).toFixed(1)}" opacity="0.9"/>`;
    }
  }

  const earFill = b.pattern === "mask" ? MARK : b.bg;
  const ear = (side) => {
    if (b.earStyle === "fold") {
      const bx = cx + side * r * 0.58, by = cy - r * 0.68;
      return `<ellipse cx="${bx.toFixed(1)}" cy="${by.toFixed(1)}" rx="${(r * 0.26).toFixed(1)}" ry="${(r * 0.17).toFixed(1)}" fill="${earFill}" stroke="${b.fg}" stroke-width="${sw}" transform="rotate(${side * 20} ${bx.toFixed(1)} ${by.toFixed(1)})"/>`;
    }
    const base = `<path d="M ${(cx + side * r * 0.85).toFixed(1)} ${(cy - r * 0.55).toFixed(1)} L ${(cx + side * r * 0.35).toFixed(1)} ${(cy - r * 1.15).toFixed(1)} L ${(cx + side * r * 0.1).toFixed(1)} ${(cy - r * 0.55).toFixed(1)} Z" fill="${earFill}" stroke="${b.fg}" stroke-width="${sw}"/>`;
    const inner = `<path d="M ${(cx + side * r * 0.6).toFixed(1)} ${(cy - r * 0.62).toFixed(1)} L ${(cx + side * r * 0.35).toFixed(1)} ${(cy - r * 0.96).toFixed(1)} L ${(cx + side * r * 0.22).toFixed(1)} ${(cy - r * 0.62).toFixed(1)} Z" fill="${b.fg}" opacity="0.22"/>`;
    let tips = "";
    if (b.earStyle === "lynx") {
      for (let i = 0; i < 2; i++) {
        const tx = cx + side * r * (0.32 - i * 0.14);
        const ty = cy - r * (1.13 + i * 0.1);
        tips += `<line x1="${tx.toFixed(1)}" y1="${ty.toFixed(1)}" x2="${(tx + side * r * 0.1).toFixed(1)}" y2="${(ty - r * 0.24).toFixed(1)}" stroke="${b.fg}" stroke-width="${sw}" stroke-linecap="round"/>`;
      }
    }
    return base + inner + tips;
  };

  let pattern = "";
  if (b.pattern === "mask") {
    pattern += `<ellipse cx="${cx.toFixed(1)}" cy="${(cy + r * 0.3).toFixed(1)}" rx="${(rx * 0.5).toFixed(1)}" ry="${(ry * 0.32).toFixed(1)}" fill="${MARK}" opacity="0.85"/>`;
  } else if (b.pattern === "spots") {
    const spots = [[-0.42, -0.22], [0.4, -0.15], [-0.1, -0.4], [0.15, 0.1], [-0.35, 0.18]];
    spots.forEach(([dx, dy]) => {
      pattern += `<ellipse cx="${(cx + rx * dx).toFixed(1)}" cy="${(cy + ry * dy).toFixed(1)}" rx="${(rx * 0.11).toFixed(1)}" ry="${(rx * 0.08).toFixed(1)}" fill="${MARK}" opacity="0.55"/>`;
    });
  } else if (b.pattern === "tabby") {
    for (let i = -1; i <= 1; i++) {
      const x = cx + i * rx * 0.16;
      pattern += `<path d="M ${x.toFixed(1)} ${(cy - ry * 0.72).toFixed(1)} q ${(i * rx * 0.06).toFixed(1)} ${(ry * 0.14).toFixed(1)} 0 ${(ry * 0.28).toFixed(1)}" fill="none" stroke="${MARK}" stroke-width="${(s * 0.012).toFixed(1)}" opacity="0.6" stroke-linecap="round"/>`;
    }
  }

  const wrinkles = b.wrinkles
    ? `<path d="M ${(cx - rx * 0.3).toFixed(1)} ${(cy - ry * 0.55).toFixed(1)} q ${(rx * 0.3).toFixed(1)} ${(-ry * 0.1).toFixed(1)} ${(rx * 0.6).toFixed(1)} 0" fill="none" stroke="${b.fg}" stroke-width="${(s * 0.01).toFixed(1)}" opacity="0.4"/>
       <path d="M ${(cx - rx * 0.22).toFixed(1)} ${(cy - ry * 0.4).toFixed(1)} q ${(rx * 0.22).toFixed(1)} ${(-ry * 0.08).toFixed(1)} ${(rx * 0.44).toFixed(1)} 0" fill="none" stroke="${b.fg}" stroke-width="${(s * 0.01).toFixed(1)}" opacity="0.3"/>`
    : "";

  const eyeDx = b.flat ? 0.3 : 0.34;
  const eyeY = cy - ry * (b.flat ? 0.02 : 0.06);
  const eyeR = r * (b.flat ? 0.15 : 0.13);
  const eye = (dx) => {
    const ex = cx + rx * dx;
    return `<ellipse cx="${ex.toFixed(1)}" cy="${eyeY.toFixed(1)}" rx="${eyeR.toFixed(1)}" ry="${(eyeR * 1.15).toFixed(1)}" fill="#fbeee0"/>
      <circle cx="${ex.toFixed(1)}" cy="${(eyeY + eyeR * 0.1).toFixed(1)}" r="${(eyeR * 0.62).toFixed(1)}" fill="${INK}"/>
      <circle cx="${(ex - eyeR * 0.22).toFixed(1)}" cy="${(eyeY - eyeR * 0.28).toFixed(1)}" r="${(eyeR * 0.2).toFixed(1)}" fill="#ffffff" opacity="0.9"/>`;
  };

  const muzzleY = cy + ry * (b.flat ? 0.28 : 0.42);
  const blush = `<ellipse cx="${(cx - rx * 0.55).toFixed(1)}" cy="${(muzzleY - ry * 0.06).toFixed(1)}" rx="${(rx * 0.16).toFixed(1)}" ry="${(rx * 0.1).toFixed(1)}" fill="#ff8fa3" opacity="0.3"/>
    <ellipse cx="${(cx + rx * 0.55).toFixed(1)}" cy="${(muzzleY - ry * 0.06).toFixed(1)}" rx="${(rx * 0.16).toFixed(1)}" ry="${(rx * 0.1).toFixed(1)}" fill="#ff8fa3" opacity="0.3"/>`;

  const nose = `<path d="M ${cx.toFixed(1)} ${(muzzleY - ry * 0.1).toFixed(1)} L ${(cx - rx * 0.08).toFixed(1)} ${(muzzleY + ry * 0.02).toFixed(1)} L ${(cx + rx * 0.08).toFixed(1)} ${(muzzleY + ry * 0.02).toFixed(1)} Z" fill="#f2a3b3"/>`;
  const mouth = `<path d="M ${cx.toFixed(1)} ${(muzzleY + ry * 0.03).toFixed(1)} q ${(-rx * 0.12).toFixed(1)} ${(ry * 0.12).toFixed(1)} ${(-rx * 0.22).toFixed(1)} 0 M ${cx.toFixed(1)} ${(muzzleY + ry * 0.03).toFixed(1)} q ${(rx * 0.12).toFixed(1)} ${(ry * 0.12).toFixed(1)} ${(rx * 0.22).toFixed(1)} 0" fill="none" stroke="${b.fg}" stroke-width="${(s * 0.015).toFixed(1)}" stroke-linecap="round" opacity="0.85"/>`;

  let whiskers = "";
  [-1, 1].forEach((side) => {
    for (let i = 0; i < 3; i++) {
      const y = muzzleY - ry * 0.06 + i * ry * 0.09;
      const x1 = cx + side * rx * 0.14;
      const x2 = cx + side * rx * (0.75 + i * 0.06);
      whiskers += `<line x1="${x1.toFixed(1)}" y1="${y.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${b.fg}" stroke-width="${(s * 0.008).toFixed(1)}" opacity="0.55" stroke-linecap="round"/>`;
    }
  });

  const head = b.flat
    ? `<ellipse cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" fill="${b.bg}" stroke="${b.fg}" stroke-width="${sw}"/>`
    : `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" fill="${b.bg}" stroke="${b.fg}" stroke-width="${sw}"/>`;

  return `${ruff}${ear(-1)}${ear(1)}${head}${pattern}${wrinkles}${blush}${eye(-eyeDx)}${eye(eyeDx)}${nose}${mouth}${whiskers}`;
}

const stripY = 430;
const n = BREEDS.length;
const stripW = W - 128;
const cell = stripW / n;
let strip = "";
BREEDS.forEach((b, i) => {
  const x = 64 + i * cell;
  const size = cell * 0.82;
  strip += `<g transform="translate(${(x + (cell - size) / 2).toFixed(1)}, ${stripY})">${catFace(b, size)}</g>`;
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="15%" cy="0%" r="70%">
      <stop offset="0" stop-color="#4a3418"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>

  <text x="64" y="120" font-family="JetBrains Mono" font-weight="800" font-size="68" fill="${ACCENT}">furmerge</text>
  <text x="64" y="164" font-family="JetBrains Mono" font-size="23" fill="${DIM}">a 2048-style merge game, but the tiles are cats</text>

  <rect x="64" y="220" width="${W - 128}" height="150" rx="16" fill="${PANEL}" stroke="${BORDER}" stroke-width="1.5"/>
  <text x="92" y="270" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${FG}">merge same-breed cats up the fluff scale</text>
  <text x="92" y="304" font-family="JetBrains Mono" font-size="19" fill="${DIM}">Sphynx</text>
  <text x="${W - 92}" y="304" text-anchor="end" font-family="JetBrains Mono" font-size="19" fill="${DIM}">Persian</text>
  <line x1="92" y1="330" x2="${W - 92}" y2="330" stroke="${BORDER}" stroke-width="2" stroke-dasharray="4,5"/>
  <line x1="92" y1="330" x2="${W - 92}" y2="330" stroke="${ACCENT}" stroke-width="2" opacity="0.5"/>

  ${strip}

  <text x="64" y="590" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${ACCENT}">bisks.net/games/furmerge</text>
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
