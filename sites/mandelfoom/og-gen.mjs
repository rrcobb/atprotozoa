// Generates public/og.png — the Open Graph preview card for mandelfoom.
//
// The card is two *real* Mandelbrot renders (not a doodle): a full silhouette
// on the right, and a small bordered inset showing an actual satellite copy
// found near the western antenna — the picture makes the "more of itself,
// smaller" pitch without needing the caption to do it. The fractal rasters
// are hand-encoded to PNG (raw zlib deflate, no image deps) and embedded as
// base64 <image> elements inside an SVG that also carries the title text,
// then the whole thing is rasterised with @resvg/resvg-js (pure native
// module, no system Chromium needed).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork. Adapted from sites/droste/og-gen.mjs.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const W = 1200, H = 630;
const BG = "#08060f", INK = "#ece8f7", MUTED = "#8a80a8", ACCENT = "#c77dff", ACCENT2 = "#52e0c4";

// ── minimal PNG encoder (signature + IHDR + IDAT + IEND), no dependencies ──
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}
function encodePNG(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0; // 8bpc RGBA, no interlace
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width * 4);
    raw[rowStart] = 0; // filter: none
    rgba.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}
function pngDataUri(width, height, rgba) {
  return "data:image/png;base64," + encodePNG(width, height, rgba).toString("base64");
}

// ── escape-time Mandelbrot render, ported from public/index.html ──────────
const SCHEME = {
  a: [0.08, 0.22, 0.34], b: [0.32, 0.42, 0.5], c: [0.8, 0.9, 1.1], d: [0.0, 0.2, 0.5], freq: 0.05,
};
function clampByte(v) { return v < 0 ? 0 : v > 255 ? 255 : v | 0; }
function paletteColor(t) {
  const s = SCHEME;
  const r = s.a[0] + s.b[0] * Math.cos(6.2831853 * (s.c[0] * t + s.d[0]));
  const g = s.a[1] + s.b[1] * Math.cos(6.2831853 * (s.c[1] * t + s.d[1]));
  const b = s.a[2] + s.b[2] * Math.cos(6.2831853 * (s.c[2] * t + s.d[2]));
  return [clampByte(r * 255), clampByte(g * 255), clampByte(b * 255)];
}
function mandelIter(cre, cim, cap) {
  let zre = 0, zim = 0, zre2 = 0, zim2 = 0, n = 0;
  while (n < cap && zre2 + zim2 <= 4) {
    zim = 2 * zre * zim + cim;
    zre = zre2 - zim2 + cre;
    zre2 = zre * zre; zim2 = zim * zim;
    n++;
  }
  return { n, zre, zim, escaped: zre2 + zim2 > 4 };
}
function smoothMu(res) {
  if (!res.escaped) return null;
  const zn2 = res.zre * res.zre + res.zim * res.zim;
  const nu = Math.log(Math.log(zn2) / 2 / Math.LN2) / Math.LN2;
  const mu = res.n + 1 - nu;
  return Number.isFinite(mu) ? mu : res.n;
}
function renderMandel(w, h, cx, cy, scale, cap) {
  const rgba = Buffer.alloc(w * h * 4);
  const aspect = w / h;
  const halfH = scale, halfW = scale * aspect;
  let i = 0;
  for (let py = 0; py < h; py++) {
    const wy = cy + (0.5 - py / h) * 2 * halfH;
    for (let px = 0; px < w; px++) {
      const wx = cx + (px / w - 0.5) * 2 * halfW;
      const res = mandelIter(wx, wy, cap);
      const mu = smoothMu(res);
      let r, g, b;
      if (mu === null) { r = 5; g = 10; b = 18; }
      else [r, g, b] = paletteColor(mu * SCHEME.freq);
      rgba[i++] = r; rgba[i++] = g; rgba[i++] = b; rgba[i++] = 255;
    }
  }
  return rgba;
}

// ── compose the two panels ─────────────────────────────────────────────
const mainW = 660, mainH = 630;
const mainRgba = renderMandel(mainW, mainH, -0.55, 0.0, 1.28, 320);
const mainUri = pngDataUri(mainW, mainH, mainRgba);

// A verified satellite copy sitting on the western antenna: a full little
// Mandelbrot silhouette, spikes and all, one scale down from the main panel.
const boundary = { re: -1.75, im: 0.0 };
const insetW = 300, insetH = 300;
const insetRgba = renderMandel(insetW, insetH, boundary.re, boundary.im, 0.036, 700);
const insetUri = pngDataUri(insetW, insetH, insetRgba);

const insetX = mainW - insetW - 46, insetY = H - insetH - 46;
// marker on the main panel, roughly where the antenna sits in that framing
const markerX = Math.round(mainW * ((-1.75 - (-0.55 - 1.28 * (mainW / mainH))) / (2 * 1.28 * (mainW / mainH))));
const markerY = Math.round(mainH * 0.5);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>

  <image x="0" y="0" width="${mainW}" height="${mainH}" href="${mainUri}"/>
  <circle cx="${markerX}" cy="${markerY}" r="7" fill="none" stroke="${ACCENT2}" stroke-width="3"/>
  <line x1="${markerX + 6}" y1="${markerY + 6}" x2="${insetX}" y2="${insetY}" stroke="${ACCENT2}" stroke-width="2" stroke-dasharray="6 6" opacity="0.85"/>
  <rect x="${insetX - 4}" y="${insetY - 4}" width="${insetW + 8}" height="${insetH + 8}" fill="none" stroke="${ACCENT2}" stroke-width="4"/>
  <image x="${insetX}" y="${insetY}" width="${insetW}" height="${insetH}" href="${insetUri}"/>

  <rect x="${mainW}" y="0" width="${W - mainW}" height="${H}" fill="${BG}"/>
  <text x="${mainW + 46}" y="200" font-family="JetBrains Mono" font-weight="800" font-size="66" fill="${INK}">mandel-</text>
  <text x="${mainW + 46}" y="270" font-family="JetBrains Mono" font-weight="800" font-size="66" fill="${ACCENT}">foom</text>
  <text x="${mainW + 46}" y="330" font-family="JetBrains Mono" font-size="21" fill="${MUTED}">zoom into the boundary and you</text>
  <text x="${mainW + 46}" y="358" font-family="JetBrains Mono" font-size="21" fill="${MUTED}">fall through a copy of the whole</text>
  <text x="${mainW + 46}" y="386" font-family="JetBrains Mono" font-size="21" fill="${MUTED}">set — smaller, forever. that dot</text>
  <text x="${mainW + 46}" y="414" font-family="JetBrains Mono" font-size="21" fill="${MUTED}">on the left is the one below.</text>
  <text x="${mainW + 46}" y="574" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${ACCENT}">mandelfoom.bisks.net</text>
</svg>`;

const fontPath = fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url));
const r = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
});
const png = r.render().asPng();
const out = new URL("./public/og.png", import.meta.url).pathname;
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes; satellite at", boundary);
