// signs.js — planted wooden signs that carry feed posts past the walker.
// Pure layout lives here (testable in node); drawing takes a canvas context.

// World units between sign posts. At the default pace the walker covers this in
// well under a minute, so each sign is on screen long enough to read.
export const SPACING = 1100;
export const FIRST_X = 900;

// Sign indexes whose post is within [x0, x1] of world x.
export function signsInRange(x0, x1) {
  const a = Math.max(0, Math.ceil((x0 - FIRST_X) / SPACING));
  const b = Math.floor((x1 - FIRST_X) / SPACING);
  const out = [];
  for (let k = a; k <= b; k++) out.push(k);
  return out;
}
export const signX = (k) => FIRST_X + k * SPACING;

// Greedy word wrap using a width-measuring function. Overlong words are broken.
export function wrap(text, maxW, measure) {
  const lines = [];
  for (const para of String(text).split(/\n+/)) {
    let line = "";
    for (let word of para.split(/\s+/).filter(Boolean)) {
      while (measure(word) > maxW && word.length > 1) {
        let n = word.length - 1;
        while (n > 1 && measure(word.slice(0, n)) > maxW) n--;
        if (line) { lines.push(line); line = ""; }
        lines.push(word.slice(0, n)); word = word.slice(n);
      }
      const t = line ? line + " " + word : word;
      if (line && measure(t) > maxW) { lines.push(line); line = word; } else line = t;
    }
    if (line) lines.push(line);
  }
  return lines;
}

// Boards are a fixed size on screen, so a long post is cut with an ellipsis;
// clicking the sign opens the whole post.
const MAX_LINES = 9;
export function clip(lines, max = MAX_LINES) {
  if (lines.length <= max) return lines;
  const out = lines.slice(0, max);
  out[max - 1] = out[max - 1].replace(/\s*\S{0,3}$/, "") + "…";
  return out;
}

const images = new Map();
function thumb(url) {
  let e = images.get(url);
  if (!e) { e = new Image(); e.onload = () => { e.ok = true; }; e.src = url; images.set(url, e); }
  return e.ok ? e : null;
}

const INK = { paper: [255, 250, 238], ink: [52, 40, 28], sub: [120, 98, 72], post: [110, 84, 56] };
const RETRO = { paper: [6, 24, 12], ink: [184, 255, 184], sub: [100, 190, 120], post: [79, 166, 111] };
const rgba = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

// Lay a post out for scale s (cached on the post per scale step).
function layout(ctx, post, s) {
  const key = Math.round(s * 20);
  if (post._lay && post._lay.key === key) return post._lay;
  const fs = 13 * s, lh = 17 * s, w = 300 * s, pad = 10 * s, inner = w - pad * 2;
  ctx.font = `${fs}px ui-sans-serif, system-ui, sans-serif`;
  const m = (t) => ctx.measureText(t).width;
  let body = post.text ? post.text : post.link ? "🔗 " + post.link : "";
  const lines = clip(wrap(body, inner, m), post.image ? 6 : MAX_LINES);
  const qlines = post.quote ? clip(wrap("↪ @" + post.quote.handle + ": " + post.quote.text, inner - 8 * s, m), 3) : [];
  const imgH = post.image ? 110 * s : 0;
  const h = pad * 2 + lh * 1.2 + lines.length * lh + (qlines.length ? qlines.length * lh + 8 * s : 0) + (imgH ? imgH + 6 * s : 0) + lh;
  return (post._lay = { key, fs, lh, w, h, pad, lines, qlines, imgH });
}

// Draw one sign: a post in the ground and a board above the machine's height.
// Returns the board rect {x,y,w,h} for hit-testing clicks.
export function drawSign(ctx, post, x, groundY, s, retro, topLimit = 8) {
  const C = retro ? RETRO : INK;
  const L = layout(ctx, post, s);
  let top = groundY - 215 * s - L.h;
  if (top < topLimit) top = topLimit;
  const left = x - L.w / 2;
  ctx.strokeStyle = rgba(C.post); ctx.lineWidth = Math.max(2, 4 * s); ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(x, groundY + 2); ctx.lineTo(x, top + L.h); ctx.stroke();
  ctx.fillStyle = rgba(C.paper, retro ? 0.9 : 0.94);
  ctx.strokeStyle = rgba(C.post); ctx.lineWidth = Math.max(1.5, 2.5 * s);
  ctx.beginPath(); ctx.roundRect(left, top, L.w, L.h, retro ? 0 : 6 * s); ctx.fill(); ctx.stroke();
  let y = top + L.pad;
  ctx.textBaseline = "top";
  ctx.font = `bold ${L.fs}px ui-sans-serif, system-ui, sans-serif`;
  ctx.fillStyle = rgba(C.sub);
  const head = (post.repostedBy ? "↻ " : "") + (post.name ? post.name + " · " : "") + "@" + post.handle;
  let h = head;
  while (h.length > 4 && ctx.measureText(h).width > L.w - L.pad * 2) h = h.slice(0, -2);
  ctx.fillText(h === head ? head : h + "…", left + L.pad, y);
  y += L.lh * 1.2;
  ctx.font = `${L.fs}px ui-sans-serif, system-ui, sans-serif`;
  ctx.fillStyle = rgba(C.ink);
  for (const ln of L.lines) { ctx.fillText(ln, left + L.pad, y); y += L.lh; }
  if (L.qlines.length) {
    y += 4 * s;
    ctx.fillStyle = rgba(C.sub, 0.6); ctx.fillRect(left + L.pad, y, 2 * s, L.qlines.length * L.lh);
    ctx.fillStyle = rgba(C.sub);
    for (const ln of L.qlines) { ctx.fillText(ln, left + L.pad + 8 * s, y); y += L.lh; }
    y += 4 * s;
  }
  if (post.image) {
    const im = thumb(post.image), iw = L.w - L.pad * 2;
    if (im) {
      const r = Math.min(iw / im.width, L.imgH / im.height), dw = im.width * r, dh = im.height * r;
      ctx.drawImage(im, left + L.pad, y + 3 * s, dw, dh);
    }
    y += L.imgH + 6 * s;
  }
  ctx.fillStyle = rgba(C.sub, 0.85); ctx.font = `${L.fs * 0.85}px ui-sans-serif, system-ui, sans-serif`;
  ctx.fillText(`♥ ${post.likes}   💬 ${post.replies}`, left + L.pad, top + L.h - L.pad - L.lh * 0.8);
  return { x: left, y: top, w: L.w, h: L.h };
}
