// rasterize.js — draw a bisk (post text + author avatar) onto an offscreen
// canvas, then threshold it down to a binary cols×rows grid: that grid IS
// the automaton's generation-zero seed, so the shape of the bisk is
// visible for a moment before evolution scrambles it.

const CELL_PX = 8; // offscreen pixels per grid cell — enough to render legible small type

function wrapText(ctx, text, maxWidth) {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth || !line) {
      line = candidate;
      // A single word wider than the line on its own: hard-break it so it
      // doesn't just overflow silently off the canvas.
      while (ctx.measureText(line).width > maxWidth && line.length > 1) {
        lines.push(line.slice(0, -1));
        line = line.slice(-1);
      }
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

async function loadAvatar(url) {
  if (!url) return null;
  return new Promise((resolve) => {
    const img = new Image();
    const timer = setTimeout(() => resolve(null), 4000);
    img.onload = () => { clearTimeout(timer); resolve(img); };
    img.onerror = () => { clearTimeout(timer); resolve(null); };
    img.crossOrigin = "anonymous";
    img.src = `/avatar?u=${encodeURIComponent(url)}`;
  });
}

// bisk: { text, author: { avatar } }. Returns a Uint8Array of length
// cols*rows, 1 = alive (ink), 0 = dead (blank paper).
export async function rasterizeBisk(bisk, cols, rows) {
  const w = cols * CELL_PX;
  const h = rows * CELL_PX;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);

  const avatarSize = Math.min(w, h) * 0.32;
  const pad = CELL_PX * 2;
  let textTop = pad;
  const avatarImg = await loadAvatar(bisk.author && bisk.author.avatar);
  if (avatarImg) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(pad + avatarSize / 2, pad + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(avatarImg, pad, pad, avatarSize, avatarSize);
    ctx.restore();
    textTop = pad + avatarSize + CELL_PX;
  }

  ctx.fillStyle = "#000000";
  // Font height is set in multiples of CELL_PX, the same block size the
  // 1-bit threshold pass below averages down to one grid cell — so this
  // multiplier IS "how many grid rows tall is a letter" (3 used to mean
  // 3 rows, an unreadable smear; 6 gives roughly dot-matrix-legible glyphs).
  ctx.font = `800 ${CELL_PX * 6}px ui-monospace, "JetBrains Mono", monospace`;
  ctx.textBaseline = "top";
  const lineHeight = CELL_PX * 7;
  const lines = wrapText(ctx, bisk.text || "(no text)", w - pad * 2);
  let y = textTop;
  for (const line of lines) {
    if (y > h - lineHeight * 0.5) break; // overflow just gets clipped — texture, not a transcript
    ctx.fillText(line, pad, y);
    y += lineHeight;
  }

  const { data } = ctx.getImageData(0, 0, w, h);
  const grid = new Uint8Array(cols * rows);
  const THRESHOLD = 200; // luminance below this counts as "ink"
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      let sum = 0;
      for (let py = 0; py < CELL_PX; py++) {
        const rowBase = ((cy * CELL_PX + py) * w + cx * CELL_PX) * 4;
        for (let px = 0; px < CELL_PX; px++) {
          const i = rowBase + px * 4;
          sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
        }
      }
      const avg = sum / (CELL_PX * CELL_PX);
      grid[cy * cols + cx] = avg < THRESHOLD ? 1 : 0;
    }
  }
  return grid;
}
