// Generates public/og.png — the Open Graph preview card for nothoney.
//
// Reuses the real bear/jar drawing primitives from public/lib/meme.js (via
// its CommonJS export) so the marketing image is built from the exact same
// art as the live tool, rendered here with node-canvas instead of a browser.
//
//   npm install canvas --no-save --prefer-offline   # one-time, not a project dependency
//   node og-gen.mjs                                 # writes ./public/og.png

import { createCanvas, registerFont } from "canvas";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { drawBear, drawJar } = require("./public/lib/meme.js");

const fontPath = fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url));
registerFont(fontPath, { family: "JetBrains Mono" });

const W = 1200, H = 630;
const INK = "#2b1d10";

const canvas = createCanvas(W, H);
const ctx = canvas.getContext("2d");

ctx.fillStyle = "#f7e4bd";
ctx.fillRect(0, 0, W, H);
ctx.fillStyle = "#fbeed0";
ctx.fillRect(0, H * 0.62, W, H * 0.38);

// title
ctx.textAlign = "left";
ctx.fillStyle = "#b5342c";
ctx.font = `800 62px "JetBrains Mono"`;
ctx.fillText("nothoney", 56, 92);
ctx.fillStyle = INK;
ctx.font = `700 24px "JetBrains Mono"`;
ctx.fillText(`that's not "for you"...`, 56, 130);

// fancy bear + jar (left)
drawBear(ctx, { cx: 200, cy: 300, r: 96, style: "fancy" });
drawJar(ctx, { x: 400, y: 320, scale: 0.54, label: "FOR YOU" });

// arrow
ctx.strokeStyle = INK;
ctx.lineWidth = 6;
ctx.lineCap = "round";
ctx.beginPath();
ctx.moveTo(535, 300);
ctx.lineTo(630, 300);
ctx.stroke();
ctx.beginPath();
ctx.moveTo(630, 300);
ctx.lineTo(608, 282);
ctx.moveTo(630, 300);
ctx.lineTo(608, 318);
ctx.stroke();

// plain bear (right)
drawBear(ctx, { cx: 760, cy: 310, r: 94, style: "plain", armTarget: { x: 920, y: 200 } });

// speech bubble snippet
const bx = 880, by = 135, bw = 250, bh = 170;
function roundRectPath(c, x, y, w, h, r) {
  c.beginPath();
  c.roundRect ? c.roundRect(x, y, w, h, r) : c.rect(x, y, w, h);
}
roundRectPath(ctx, bx, by, bw, bh, 22);
ctx.fillStyle = "#fffdf7";
ctx.fill();
ctx.lineWidth = 6;
ctx.strokeStyle = INK;
ctx.stroke();

ctx.fillStyle = INK;
ctx.font = `800 26px "JetBrains Mono"`;
ctx.fillText(`that's not`, bx + 22, by + 48);
ctx.fillText(`"for you"...`, bx + 22, by + 84);
ctx.font = `700 20px "JetBrains Mono"`;
ctx.fillStyle = "#5a4326";
ctx.fillText(`you're scrolling`, bx + 22, by + 122);
ctx.fillText(`"discover".`, bx + 22, by + 148);

// bottom strip: pitch + url
ctx.fillStyle = INK;
ctx.font = `400 22px "JetBrains Mono"`;
ctx.fillText("paste a bsky post link, get it roasted by a bear in a bow tie", 56, H - 56);
ctx.fillStyle = "#b5342c";
ctx.font = `800 26px "JetBrains Mono"`;
ctx.fillText("nothoney.bisks.net", 56, H - 18);

const out = fileURLToPath(new URL("./public/og.png", import.meta.url));
writeFileSync(out, canvas.toBuffer("image/png"));
console.log("wrote", out);
