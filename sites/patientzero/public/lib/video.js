// video.js — the "hype video" half of the ask. Draws a real animated
// sequence to a <canvas> and records it live with canvas.captureStream() +
// MediaRecorder, entirely client-side (no server render, no Workers AI —
// just the browser's own video pipeline). Produces a real, downloadable
// .webm file, not a fake/looping GIF-style preview.

import { escapeHtml, truncate, timeAgo, loadImage } from "./util.js";

const W = 960;
const H = 540;

const BG = "#0a0b0e";
const INK = "#f4f2f7";
const MUTED = "#9b98a8";
const HAZARD = "#e34948"; // status-critical red — reserved for the "index case" marker
const HAZARD_DIM = "#5a2323";
const SAFE = "#3987e5"; // sequential blue — used for the "your circle" marker
const SAFE_DIM = "#1c3a5c";
const PANEL = "#15141b";

export function canRecordVideo() {
  return typeof MediaRecorder !== "undefined" && typeof HTMLCanvasElement.prototype.captureStream === "function";
}

function pickMimeType() {
  const candidates = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) || null;
}

// ---- drawing helpers ---------------------------------------------------

function clear(ctx) {
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);
}

function hazardStripes(ctx, t, opacity) {
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.translate((t * 0.03) % 80, 0);
  ctx.fillStyle = HAZARD;
  for (let x = -160; x < W + 160; x += 80) {
    ctx.beginPath();
    ctx.moveTo(x, H);
    ctx.lineTo(x + 40, H);
    ctx.lineTo(x + 40 + H, 0);
    ctx.lineTo(x + H, 0);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawAvatar(ctx, img, cx, cy, r, ringColor) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fillStyle = "#2a2833";
  ctx.fill();
  if (img) {
    ctx.clip();
    ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2);
  }
  ctx.restore();
  if (ringColor) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.lineWidth = 4;
    ctx.strokeStyle = ringColor;
    ctx.stroke();
    ctx.restore();
  }
}

function centerText(ctx, text, x, y, font, color, maxWidth) {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (maxWidth) {
    let s = text;
    while (ctx.measureText(s).width > maxWidth && s.length > 3) {
      s = s.slice(0, -2) + "…";
    }
    ctx.fillText(s, x, y);
  } else {
    ctx.fillText(text, x, y);
  }
}

function ease(p) {
  return 1 - Math.pow(1 - Math.min(1, Math.max(0, p)), 3);
}

// ---- segments ------------------------------------------------------------

function drawTitle(ctx, p, phrase) {
  clear(ctx);
  hazardStripes(ctx, performance.now(), 0.06 + 0.04 * Math.sin(p * 20));
  const pop = ease(Math.min(1, p * 3));
  ctx.save();
  ctx.translate(W / 2, H / 2 - 40);
  ctx.scale(0.7 + 0.3 * pop, 0.7 + 0.3 * pop);
  centerText(ctx, "OUTBREAK DETECTED", 0, -20, "800 28px system-ui,sans-serif", HAZARD);
  ctx.restore();
  const flicker = p > 0.35 ? 1 : Math.abs(Math.sin(p * 60));
  ctx.save();
  ctx.globalAlpha = 0.5 + 0.5 * flicker;
  centerText(ctx, `"${truncate(phrase, 34)}"`, W / 2, H / 2 + 40, "700 42px system-ui,sans-serif", INK, W - 120);
  ctx.restore();
  if (p > 0.5) {
    centerText(ctx, "case file initializing…", W / 2, H / 2 + 100, "16px ui-monospace,monospace", MUTED);
  }
}

function drawPatientCard(ctx, p, { label, color, dim, post, avatarImg, caseNo, empty, emptyText }) {
  clear(ctx);
  hazardStripes(ctx, performance.now(), 0.05);
  const slide = ease(Math.min(1, p * 2));
  const x = W / 2;
  const y = 40 + (1 - slide) * 60;

  ctx.save();
  ctx.globalAlpha = slide;
  centerText(ctx, label, x, y, "800 22px system-ui,sans-serif", color);
  ctx.restore();

  if (empty) {
    ctx.save();
    ctx.globalAlpha = ease(Math.min(1, (p - 0.2) * 2));
    centerText(ctx, emptyText, x, H / 2, "700 26px system-ui,sans-serif", MUTED, W - 160);
    ctx.restore();
    return;
  }
  if (!post) return;

  const cardW = 620;
  const cardH = 300;
  const cardX = x - cardW / 2;
  const cardY = 150;
  ctx.save();
  ctx.globalAlpha = ease(Math.min(1, (p - 0.15) * 2));
  roundRect(ctx, cardX, cardY, cardW, cardH, 20);
  ctx.fillStyle = PANEL;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = dim;
  ctx.stroke();

  drawAvatar(ctx, avatarImg, cardX + 70, cardY + 70, 40, color);

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = INK;
  ctx.font = "700 22px system-ui,sans-serif";
  ctx.fillText(truncate(post.author.displayName || post.author.handle, 26), cardX + 128, cardY + 62);
  ctx.fillStyle = MUTED;
  ctx.font = "16px system-ui,sans-serif";
  ctx.fillText("@" + post.author.handle, cardX + 128, cardY + 86);

  ctx.fillStyle = color;
  ctx.font = "700 13px ui-monospace,monospace";
  ctx.textAlign = "right";
  ctx.fillText(`CASE #${caseNo}`, cardX + cardW - 24, cardY + 44);
  ctx.textAlign = "left";

  ctx.fillStyle = INK;
  ctx.font = "20px system-ui,sans-serif";
  wrapText(ctx, post.record?.text || "", cardX + 32, cardY + 140, cardW - 64, 28, 4);

  ctx.fillStyle = MUTED;
  ctx.font = "14px ui-monospace,monospace";
  const when = new Date(post.record?.createdAt || post.indexedAt);
  ctx.fillText(timeAgo(when), cardX + 32, cardY + cardH - 24);
  ctx.restore();
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
  const words = String(text).replace(/\s+/g, " ").trim().split(" ");
  let line = "";
  let lines = 0;
  for (let i = 0; i < words.length; i++) {
    const test = line ? line + " " + words[i] : words[i];
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, y);
      line = words[i];
      y += lineHeight;
      lines++;
      if (lines >= maxLines - 1) {
        const rest = words.slice(i).join(" ");
        ctx.fillText(truncate(rest, 60), x, y);
        return;
      }
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, y);
}

function drawTimeline(ctx, p, { cases, total }) {
  clear(ctx);
  hazardStripes(ctx, performance.now(), 0.05);
  centerText(ctx, "CASE HISTORY", W / 2, 50, "800 20px system-ui,sans-serif", HAZARD);

  const n = cases.length || 1;
  const idxF = p * n;
  const idx = Math.min(n - 1, Math.floor(idxF));
  const post = cases[idx];
  const localP = idxF - idx;

  if (post) {
    ctx.save();
    ctx.globalAlpha = 1 - Math.pow(localP, 3);
    ctx.translate(0, -localP * 30);
    centerText(ctx, "@" + post.author.handle, W / 2, H / 2 - 30, "700 30px system-ui,sans-serif", INK);
    centerText(ctx, truncate(post.record?.text || "", 70), W / 2, H / 2 + 10, "18px system-ui,sans-serif", MUTED, W - 140);
    centerText(ctx, `case ${idx + 1} of ${total}`, W / 2, H / 2 + 60, "13px ui-monospace,monospace", HAZARD);
    ctx.restore();
  }

  // growth bar along the bottom
  const barW = W - 160;
  const barX = 80;
  const barY = H - 70;
  ctx.strokeStyle = "#2a2833";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(barX, barY);
  ctx.lineTo(barX + barW, barY);
  ctx.stroke();
  ctx.strokeStyle = HAZARD;
  ctx.beginPath();
  ctx.moveTo(barX, barY);
  ctx.lineTo(barX + barW * Math.min(1, p), barY);
  ctx.stroke();
  centerText(ctx, `${Math.round(Math.min(1, p) * total)} confirmed`, W / 2, barY - 24, "13px ui-monospace,monospace", MUTED);
}

function drawOutro(ctx, p, { phrase, total, shareUrl }) {
  clear(ctx);
  hazardStripes(ctx, performance.now(), 0.07);
  const pop = ease(Math.min(1, p * 3));
  ctx.save();
  ctx.translate(W / 2, H / 2 - 60);
  ctx.scale(0.85 + 0.15 * pop, 0.85 + 0.15 * pop);
  const shown = Math.round(total * ease(Math.min(1, p * 2)));
  centerText(ctx, String(shown), 0, -10, "800 84px system-ui,sans-serif", HAZARD);
  ctx.restore();
  centerText(ctx, total >= 100 ? "100+ CONFIRMED CASES" : "CONFIRMED CASES", W / 2, H / 2 + 30, "700 18px system-ui,sans-serif", INK);
  centerText(ctx, `"${truncate(phrase, 40)}"`, W / 2, H / 2 + 70, "600 20px system-ui,sans-serif", MUTED, W - 120);
  if (p > 0.4) {
    ctx.save();
    ctx.globalAlpha = ease(Math.min(1, (p - 0.4) * 2));
    centerText(ctx, shareUrl, W / 2, H - 60, "15px ui-monospace,monospace", SAFE);
    ctx.restore();
  }
}

// ---- driver ---------------------------------------------------------------

// opts: { phrase, globalZero, localZero, localChecked, cases, shareUrl, onProgress }
// cases: array of posts, oldest-first, used for the timeline montage.
export async function generateHypeVideo(opts) {
  if (!canRecordVideo()) throw new Error("this browser can't record canvas video");
  const { phrase, globalZero, localZero, localChecked, cases, shareUrl, onProgress } = opts;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  const avatarUrls = new Set();
  if (globalZero) avatarUrls.add(globalZero.author.avatar);
  if (localZero) avatarUrls.add(localZero.author.avatar);
  const montage = cases.filter((_, i) => i % Math.max(1, Math.floor(cases.length / 8)) === 0).slice(0, 8);
  for (const c of montage) avatarUrls.add(c.author.avatar);

  const avatarImages = new Map();
  await Promise.all(
    [...avatarUrls].map(async (url) => {
      if (!url) return;
      const img = await loadImage(`/api/avatar?u=${encodeURIComponent(url)}`);
      avatarImages.set(url, img);
    }),
  );

  const SEG = [
    ["title", 1500],
    ["global", 2200],
    ...(localChecked ? [["local", 2200]] : []),
    ["timeline", montage.length ? 2600 : 0],
    ["outro", 1900],
  ].filter(([, dur]) => dur > 0);
  const total = SEG.reduce((a, [, d]) => a + d, 0);

  function segmentAt(t) {
    let acc = 0;
    for (const [name, dur] of SEG) {
      if (t < acc + dur) return { name, p: (t - acc) / dur };
      acc += dur;
    }
    return { name: SEG[SEG.length - 1][0], p: 1 };
  }

  function frame(t) {
    const { name, p } = segmentAt(t);
    if (name === "title") {
      drawTitle(ctx, p, phrase);
    } else if (name === "global") {
      drawPatientCard(ctx, p, {
        label: "GLOBAL PATIENT ZERO",
        color: HAZARD,
        dim: HAZARD_DIM,
        post: globalZero,
        avatarImg: globalZero ? avatarImages.get(globalZero.author.avatar) : null,
        caseNo: 1,
        empty: !globalZero,
        emptyText: "no confirmed cases found (yet)",
      });
    } else if (name === "local") {
      drawPatientCard(ctx, p, {
        label: "PATIENT ZERO IN YOUR CIRCLE",
        color: SAFE,
        dim: SAFE_DIM,
        post: localZero,
        avatarImg: localZero ? avatarImages.get(localZero.author.avatar) : null,
        caseNo: localZero ? cases.indexOf(localZero) + 1 : 0,
        empty: !localZero,
        emptyText: "your circle is clean. so far.",
      });
    } else if (name === "timeline") {
      drawTimeline(ctx, p, { cases: montage, total: cases.length });
    } else {
      drawOutro(ctx, p, { phrase, total: cases.length, shareUrl });
    }
  }

  const stream = canvas.captureStream(30);
  const mimeType = pickMimeType();
  if (!mimeType) throw new Error("no supported recording format");
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 4_000_000 });
  const chunks = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  const stopped = new Promise((resolve) => (recorder.onstop = resolve));

  recorder.start();
  const start = performance.now();
  await new Promise((resolve) => {
    function tick(now) {
      const t = now - start;
      frame(Math.min(t, total));
      if (onProgress) onProgress(Math.min(1, t / total));
      if (t < total) requestAnimationFrame(tick);
      else resolve();
    }
    requestAnimationFrame(tick);
  });
  recorder.stop();
  stream.getTracks().forEach((tr) => tr.stop());
  await stopped;

  return new Blob(chunks, { type: mimeType.split(";")[0] });
}
