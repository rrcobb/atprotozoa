// nothoney — the "that's not honey" meme drawing core. Two panels: fancy
// (tuxedo, monocle) Pooh happily dipping into a jar labeled "FOR YOU", then
// plain Pooh startled, holding up a speech bubble whose final line is the
// actual skeet you gave it. Loaded as a plain <script> in the browser
// (public/index.html + app.js) AND required() from og-gen.mjs via node-canvas
// so the static og.png preview is rendered by the exact same code path as
// the real tool — see the module.exports guard at the bottom.
//
// Pooh here is drawn from scratch as simple shapes (circles, rounded rects,
// beziers) rather than tracing any Disney artwork — recognizable through the
// meme's own framing (jar + bowtie + monocle + speech bubble), not through
// copied linework.

const MEME_W = 1080;
const MEME_H = 1560;

const INK = "#2b1d10";
const BEAR = "#e8a53d";
const BEAR_SHADE = "#c9860f";
const BEAR_LIGHT = "#f6cf7c";
const SNOUT = "#fff3d9";
const BOWTIE = "#b5342c";
const BOWTIE_DARK = "#7d211b";

function roundRectPath(ctx, x, y, w, h, r) {
  if (ctx.roundRect) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function limb(ctx, x0, y0, x1, y1, w) {
  ctx.save();
  ctx.strokeStyle = BEAR;
  ctx.lineWidth = w;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.restore();
  // paw
  ctx.beginPath();
  ctx.fillStyle = BEAR_LIGHT;
  ctx.arc(x1, y1, w * 0.62, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = INK;
  ctx.stroke();
}

// style: "fancy" (dips into a jar, monocle, content smile) or "plain" (bare,
// startled, one arm flung up toward a speech bubble)
function drawBear(ctx, { cx, cy, r, style, armTarget }) {
  ctx.save();
  ctx.lineJoin = "round";

  // back arm (drawn first so the body overlaps its shoulder)
  if (style === "fancy") {
    limb(ctx, cx + r * 0.72, cy + r * 0.75, cx + r * 1.55, cy + r * 1.55, r * 0.34);
  } else {
    limb(ctx, cx - r * 0.72, cy + r * 0.8, cx - r * 1.25, cy + r * 1.55, r * 0.34);
  }

  // body
  ctx.fillStyle = BEAR;
  roundRectPath(ctx, cx - r * 0.95, cy + r * 0.55, r * 1.9, r * 1.85, r * 0.75);
  ctx.fill();
  ctx.lineWidth = 7;
  ctx.strokeStyle = INK;
  ctx.stroke();

  // belly highlight
  ctx.fillStyle = BEAR_LIGHT;
  ctx.globalAlpha = 0.55;
  roundRectPath(ctx, cx - r * 0.5, cy + r * 0.95, r * 1.0, r * 1.2, r * 0.5);
  ctx.fill();
  ctx.globalAlpha = 1;

  // front arm
  if (style === "fancy") {
    // resting on a lapel — short, tucked
    limb(ctx, cx - r * 0.7, cy + r * 0.8, cx - r * 0.95, cy + r * 1.35, r * 0.34);
  } else {
    const tx = armTarget ? armTarget.x : cx + r * 1.4;
    const ty = armTarget ? armTarget.y : cy - r * 0.6;
    limb(ctx, cx + r * 0.72, cy + r * 0.75, tx, ty, r * 0.34);
  }

  // ears (behind head)
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.fillStyle = BEAR;
    ctx.arc(cx + s * r * 0.78, cy - r * 0.82, r * 0.34, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 7;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.beginPath();
    ctx.fillStyle = BEAR_SHADE;
    ctx.arc(cx + s * r * 0.78, cy - r * 0.82, r * 0.16, 0, Math.PI * 2);
    ctx.fill();
  }

  // head
  ctx.beginPath();
  ctx.fillStyle = BEAR;
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 7;
  ctx.strokeStyle = INK;
  ctx.stroke();

  // snout
  ctx.beginPath();
  ctx.fillStyle = SNOUT;
  ctx.ellipse(cx, cy + r * 0.32, r * 0.58, r * 0.46, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = INK;
  ctx.stroke();

  // nose
  ctx.beginPath();
  ctx.fillStyle = INK;
  ctx.ellipse(cx, cy + r * 0.06, r * 0.16, r * 0.115, 0, 0, Math.PI * 2);
  ctx.fill();

  // mouth
  ctx.beginPath();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 5;
  if (style === "fancy") {
    ctx.moveTo(cx - r * 0.22, cy + r * 0.42);
    ctx.quadraticCurveTo(cx, cy + r * 0.56, cx + r * 0.22, cy + r * 0.42);
    ctx.stroke();
  } else {
    ctx.ellipse(cx, cy + r * 0.5, r * 0.16, r * 0.22, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#6b3a12";
    ctx.fill();
    ctx.stroke();
  }

  // eyes
  const eyeY = cy - r * 0.06;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.fillStyle = INK;
    if (style === "plain") {
      ctx.ellipse(cx + s * r * 0.34, eyeY, r * 0.075, r * 0.13, 0, 0, Math.PI * 2);
    } else {
      ctx.ellipse(cx + s * r * 0.34, eyeY, r * 0.07, r * 0.09, 0, 0, Math.PI * 2);
    }
    ctx.fill();
  }
  // eyebrows for plain (startled)
  if (style === "plain") {
    ctx.strokeStyle = INK;
    ctx.lineWidth = 6;
    ctx.lineCap = "round";
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx + s * r * 0.22, eyeY - r * 0.22);
      ctx.lineTo(cx + s * r * 0.48, eyeY - r * 0.32);
      ctx.stroke();
    }
  }

  // monocle for fancy
  if (style === "fancy") {
    const mx = cx + r * 0.34, my = eyeY;
    ctx.beginPath();
    ctx.strokeStyle = "#8a6a2a";
    ctx.lineWidth = 6;
    ctx.arc(mx, my, r * 0.22, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(mx + r * 0.2, my + r * 0.14);
    ctx.quadraticCurveTo(mx + r * 0.5, my + r * 0.5, mx + r * 0.2, my + r * 0.85);
    ctx.strokeStyle = "#8a6a2a";
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  // bowtie, drawn last so it sits on top of the chest, just under the chin
  if (style === "fancy") {
    const bx = cx, by = cy + r * 1.02;
    ctx.fillStyle = BOWTIE;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx - r * 0.34, by - r * 0.2);
    ctx.lineTo(bx - r * 0.34, by + r * 0.2);
    ctx.closePath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx + r * 0.34, by - r * 0.2);
    ctx.lineTo(bx + r * 0.34, by + r * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.fillStyle = BOWTIE_DARK;
    roundRectPath(ctx, bx - r * 0.1, by - r * 0.14, r * 0.2, r * 0.28, r * 0.06);
    ctx.fill();
    ctx.stroke();
  }

  ctx.restore();
}

function drawJar(ctx, { x, y, scale, label }) {
  const w = 210 * scale, h = 250 * scale;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.05);

  // honey glow
  ctx.beginPath();
  const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, w * 1.3);
  glow.addColorStop(0, "rgba(233,161,20,0.35)");
  glow.addColorStop(1, "rgba(233,161,20,0)");
  ctx.fillStyle = glow;
  ctx.arc(0, 0, w * 1.3, 0, Math.PI * 2);
  ctx.fill();

  // jar body
  roundRectPath(ctx, -w / 2, -h / 2, w, h, w * 0.16);
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.fill();
  ctx.lineWidth = 7;
  ctx.strokeStyle = INK;
  ctx.stroke();

  // honey fill
  ctx.save();
  roundRectPath(ctx, -w / 2, -h / 2, w, h, w * 0.16);
  ctx.clip();
  ctx.fillStyle = "#e2960f";
  const honeyTop = h * 0.16;
  ctx.beginPath();
  ctx.moveTo(-w / 2, honeyTop);
  ctx.quadraticCurveTo(0, honeyTop - h * 0.05, w / 2, honeyTop);
  ctx.lineTo(w / 2, h / 2);
  ctx.lineTo(-w / 2, h / 2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // glass highlight streak
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  roundRectPath(ctx, -w * 0.32, -h * 0.42, w * 0.12, h * 0.55, w * 0.06);
  ctx.fill();

  // lid
  roundRectPath(ctx, -w * 0.42, -h / 2 - h * 0.1, w * 0.84, h * 0.16, w * 0.08);
  ctx.fillStyle = "#c9860f";
  ctx.fill();
  ctx.lineWidth = 7;
  ctx.strokeStyle = INK;
  ctx.stroke();

  // label
  ctx.save();
  ctx.translate(0, h * 0.06);
  ctx.rotate(0.03);
  roundRectPath(ctx, -w * 0.4, -h * 0.11, w * 0.8, h * 0.22, 8);
  ctx.fillStyle = "#fffaf0";
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `800 ${Math.round(26 * scale)}px "JetBrains Mono"`;
  ctx.fillText(label, 0, 2);
  ctx.restore();

  ctx.restore();
}

// wraps `text` inside maxWidth, returns at most maxLines lines (last one
// ellipsized if the text ran long), each line already narrow enough to fit.
function wrapLines(ctx, text, maxWidth, maxLines) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (line && ctx.measureText(test).width > maxWidth) {
      lines.push(line);
      line = w;
      if (lines.length === maxLines) break;
    } else {
      line = test;
    }
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines) {
    let last = lines[maxLines - 1];
    while (ctx.measureText(last + "…").width > maxWidth && last.length > 1) {
      last = last.slice(0, -1);
    }
    // only mark truncated if there was more text left unconsumed
    const consumed = lines.slice(0, -1).join(" ") + (lines.length > 1 ? " " : "") + last;
    if (consumed.length < text.trim().length) lines[maxLines - 1] = last + "…";
  }
  return lines;
}

// a small blue wing-mark, not a trace of Bluesky's actual butterfly mark —
// just enough to read as "this is a post" next to the handle.
function drawWingmark(ctx, cx, cy, s) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);
  ctx.fillStyle = "#1185fe";
  ctx.beginPath();
  ctx.moveTo(0, 3);
  ctx.bezierCurveTo(-2, -6, -11, -8, -13, -1);
  ctx.bezierCurveTo(-14.5, 4, -8, 6, 0, 12);
  ctx.bezierCurveTo(8, 6, 14.5, 4, 13, -1);
  ctx.bezierCurveTo(11, -8, 2, -6, 0, 3);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// truncates a single line to fit maxWidth, adding an ellipsis if it had to cut.
function truncateLine(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(s + "…").width > maxWidth) s = s.slice(0, -1);
  return s + "…";
}

// full MEME_W x MEME_H two-panel meme. `avatarImg` is a loaded
// Image/HTMLImageElement or null (falls back to an initial-letter badge).
// The caption ("that's not 'for you'... you're scrolling 'discover'") is
// fixed set dressing, not user text, so its line breaks are hand-placed
// rather than measured — only the handle and post body (real, variable-
// length skeet content) get wrapped/truncated to fit.
function drawMeme(ctx, { handle, text, avatarImg }) {
  const W = MEME_W, H = MEME_H;
  const P1H = 660;
  const DIVH = 14;
  const P2Y = P1H + DIVH;

  // panel 1 — fancy bear, content, dipping into a jar labeled FOR YOU
  ctx.fillStyle = "#f7e4bd";
  ctx.fillRect(0, 0, W, P1H);
  drawBear(ctx, { cx: 400, cy: 400, r: 185, style: "fancy" });
  drawJar(ctx, { x: 810, y: 460, scale: 1.15, label: "FOR YOU" });

  // divider
  ctx.fillStyle = INK;
  ctx.fillRect(0, P1H, W, DIVH);

  // panel 2 — plain bear, startled, speech bubble reveals the truth
  ctx.fillStyle = "#fbeed0";
  ctx.fillRect(0, P2Y, W, H - P2Y);

  // speech bubble geometry
  const bx = 460, by = P2Y + 55, bw = W - 460 - 60;
  const pad = 44;
  const cardH = 300;
  const bh = 300 + cardH + pad * 2; // caption block + card + top/bottom pad
  const tailY = by + 150; // where the bubble meets the bear's raised paw

  const bearCx = 255, bearCy = P2Y + 300, bearR = 170;
  drawBear(ctx, {
    cx: bearCx,
    cy: bearCy,
    r: bearR,
    style: "plain",
    armTarget: { x: bx - 8, y: tailY },
  });

  ctx.save();
  ctx.fillStyle = "#fffdf7";
  roundRectPath(ctx, bx, by, bw, bh, 34);
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = INK;
  ctx.stroke();
  // tail — a short stubby nub on the left edge, right where the bear's
  // raised paw meets the bubble (a line spanning the whole gap to the bear's
  // mouth reads as a stray scratch across the panel instead of a tail)
  ctx.beginPath();
  ctx.moveTo(bx + 4, tailY - 46);
  ctx.lineTo(bx - 66, tailY + 6);
  ctx.lineTo(bx + 4, tailY + 54);
  ctx.closePath();
  ctx.fillStyle = "#fffdf7";
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 8;
  ctx.lineJoin = "round";
  ctx.stroke();
  // re-cover the seam where the nub meets the bubble edge
  ctx.fillStyle = "#fffdf7";
  ctx.fillRect(bx - 2, tailY - 44, 10, 88);
  ctx.restore();

  const textX = bx + pad;
  const textW = bw - pad * 2;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = INK;
  ctx.font = `800 50px "JetBrains Mono"`;
  let cy2 = by + 66;
  ctx.fillText(`that's not`, textX, cy2);
  cy2 += 58;
  ctx.fillText(`"for you"...`, textX, cy2);
  cy2 += 54;
  ctx.font = `700 36px "JetBrains Mono"`;
  ctx.fillText(`you're scrolling`, textX, cy2);
  cy2 += 44;
  ctx.fillText(`"discover".`, textX, cy2);
  cy2 += 30;

  // dashed divider
  ctx.save();
  ctx.strokeStyle = "#c9b48a";
  ctx.lineWidth = 3;
  ctx.setLineDash([10, 10]);
  ctx.beginPath();
  ctx.moveTo(textX, cy2);
  ctx.lineTo(bx + bw - pad, cy2);
  ctx.stroke();
  ctx.restore();
  cy2 += 28;

  // the actual skeet, in pooh's speech box
  const cardX = textX, cardY = cy2, cardW = textW;
  ctx.save();
  roundRectPath(ctx, cardX, cardY, cardW, cardH, 20);
  ctx.fillStyle = "#eef3f8";
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#c7d4e0";
  ctx.stroke();
  ctx.clip();

  const av = 28;
  const avCx = cardX + 30, avCy = cardY + 34;
  if (avatarImg) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(avCx, avCy, av, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(avatarImg, avCx - av, avCy - av, av * 2, av * 2);
    ctx.restore();
  } else {
    ctx.beginPath();
    ctx.fillStyle = "#1185fe";
    ctx.arc(avCx, avCy, av, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `800 24px "JetBrains Mono"`;
    ctx.fillText((handle || "?").replace(/^@/, "")[0].toUpperCase(), avCx, avCy + 2);
  }

  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#0f1419";
  ctx.font = `700 22px "JetBrains Mono"`;
  const handleMaxW = cardW - (avCx - cardX) - av - 60;
  ctx.fillText(truncateLine(ctx, "@" + (handle || "unknown"), handleMaxW), avCx + av + 16, avCy);
  drawWingmark(ctx, cardX + cardW - 30, cardY + 30, 1.1);

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#0f1419";
  ctx.font = `400 23px "JetBrains Mono"`;
  const maxTextLines = Math.max(2, Math.floor((cardH - 86) / 30));
  let ty = cardY + 88;
  for (const line of wrapLines(ctx, text, cardW - 60, maxTextLines)) {
    ctx.fillText(line, cardX + 30, ty);
    ty += 30;
  }
  ctx.restore();

  // footer watermark
  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(43,29,16,0.55)";
  ctx.font = `700 22px "JetBrains Mono"`;
  ctx.fillText("nothoney.bisks.net", W - 34, H - 26);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { MEME_W, MEME_H, drawMeme, drawBear, drawJar };
}
