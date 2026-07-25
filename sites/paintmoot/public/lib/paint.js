// paint.js — the board's mark model, canvas renderer, and pointer-event
// wiring for the MS-Paint-ish toolset (pencil, eraser, line, rect, ellipse,
// text, emoji sticker). A "mark" is exactly what gets persisted as a
// net.bisks.paintmoot.mark record (see index.html) — this file only knows how
// to turn one into pixels and how to build one from pointer input.

export function clearBoard(ctx, board) {
  ctx.clearRect(0, 0, board.width, board.height);
  ctx.fillStyle = board.background || "#ffffff";
  ctx.fillRect(0, 0, board.width, board.height);
}

// Eraser is just a stroke in the board's background color — simplest possible
// "erase" that fits the append-only mark model (no deletion needed, and
// deletion across other people's repos wouldn't be possible anyway).
export function eraserColorFor(board) {
  return board.background || "#ffffff";
}

export function drawMark(ctx, mark) {
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = mark.color || "#111111";
  ctx.fillStyle = mark.color || "#111111";
  ctx.lineWidth = mark.size || 4;

  switch (mark.kind) {
    case "path": {
      const pts = mark.points || [];
      if (pts.length < 2) break;
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.stroke();
      break;
    }
    case "line": {
      const pts = mark.points || [];
      if (pts.length < 2) break;
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      ctx.lineTo(pts[1][0], pts[1][1]);
      ctx.stroke();
      break;
    }
    case "rect": {
      if (mark.fill) ctx.fillRect(mark.x, mark.y, mark.w, mark.h);
      else ctx.strokeRect(mark.x, mark.y, mark.w, mark.h);
      break;
    }
    case "ellipse": {
      const rx = Math.abs(mark.w / 2);
      const ry = Math.abs(mark.h / 2);
      if (rx < 0.5 || ry < 0.5) break;
      ctx.beginPath();
      ctx.ellipse(mark.x + mark.w / 2, mark.y + mark.h / 2, rx, ry, 0, 0, Math.PI * 2);
      if (mark.fill) ctx.fill();
      else ctx.stroke();
      break;
    }
    case "text": {
      ctx.font = `${mark.size || 24}px ui-sans-serif, system-ui, sans-serif`;
      ctx.textBaseline = "top";
      ctx.fillText(mark.text || "", mark.x, mark.y);
      break;
    }
    case "sticker": {
      ctx.font = `${mark.size || 32}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
      ctx.textBaseline = "top";
      ctx.fillText(mark.emoji || "🙂", mark.x, mark.y);
      break;
    }
  }
  ctx.restore();
}

export function redraw(ctx, board, marks) {
  clearBoard(ctx, board);
  for (const m of marks) drawMark(ctx, m);
}

// Wires pointer events on `canvas` (its width/height must already be set to
// board.width/board.height — CSS may scale it visually, we convert back to
// board-space via getBoundingClientRect). `state` is a live object the caller
// mutates in place: { enabled, tool, color, size, fill, emoji, onText(x, y) }.
// `size` doubles as stroke width (pencil/eraser/line/rect/ellipse) and font
// px (text/sticker) — same overload the mark model uses. `onMark(mark)` fires
// once per completed mark; the caller is
// responsible for persisting it (createRecord) and keeping it in the local
// marks list — this function only draws locally + reports what happened.
export function attachInteraction(canvas, board, state, onMark) {
  const ctx = canvas.getContext("2d");
  let drawing = false;
  let start = null;
  let path = null;
  let snapshot = null;

  // atproto records have no float type (only integer) — round to board-space
  // pixels here, at the single source of pointer coordinates, so every mark
  // built from this (path/line points, rect/ellipse x/y/w/h, text/sticker
  // placement) is createRecord-safe.
  function toBoard(e) {
    const r = canvas.getBoundingClientRect();
    const sx = canvas.width / r.width;
    const sy = canvas.height / r.height;
    return [Math.round((e.clientX - r.left) * sx), Math.round((e.clientY - r.top) * sy)];
  }

  function baseMark(kind) {
    return {
      kind,
      color: state.tool === "eraser" ? eraserColorFor(board) : state.color,
      size: state.size,
      fill: state.fill,
    };
  }

  canvas.addEventListener("pointerdown", (e) => {
    if (!state.enabled) return;
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    const [x, y] = toBoard(e);
    start = [x, y];

    if (state.tool === "text") {
      state.onText?.(x, y);
      return;
    }
    if (state.tool === "sticker") {
      const mark = {
        ...baseMark("sticker"),
        x,
        y,
        emoji: state.emoji || "🙂",
        createdAt: new Date().toISOString(),
      };
      drawMark(ctx, mark);
      onMark(mark);
      return;
    }
    drawing = true;
    if (state.tool === "pencil" || state.tool === "eraser") {
      path = [[x, y]];
    } else {
      snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
    }
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!drawing) return;
    const [x, y] = toBoard(e);
    if (state.tool === "pencil" || state.tool === "eraser") {
      const prev = path[path.length - 1];
      path.push([x, y]);
      drawMark(ctx, { ...baseMark("path"), points: [prev, [x, y]] });
    } else if (state.tool === "line") {
      ctx.putImageData(snapshot, 0, 0);
      drawMark(ctx, { ...baseMark("line"), points: [start, [x, y]] });
    } else if (state.tool === "rect" || state.tool === "ellipse") {
      ctx.putImageData(snapshot, 0, 0);
      const rx = Math.min(start[0], x);
      const ry = Math.min(start[1], y);
      const rw = Math.abs(x - start[0]);
      const rh = Math.abs(y - start[1]);
      drawMark(ctx, { ...baseMark(state.tool), x: rx, y: ry, w: rw, h: rh });
    }
  });

  function finish(e) {
    if (!drawing) return;
    drawing = false;
    const [x, y] = toBoard(e);
    let mark = null;
    if (state.tool === "pencil" || state.tool === "eraser") {
      if (path.length > 1) mark = { ...baseMark("path"), points: path };
    } else if (state.tool === "line") {
      mark = { ...baseMark("line"), points: [start, [x, y]] };
    } else if (state.tool === "rect" || state.tool === "ellipse") {
      const rx = Math.min(start[0], x);
      const ry = Math.min(start[1], y);
      const rw = Math.abs(x - start[0]);
      const rh = Math.abs(y - start[1]);
      if (rw > 1 && rh > 1) mark = { ...baseMark(state.tool), x: rx, y: ry, w: rw, h: rh };
    }
    path = null;
    snapshot = null;
    start = null;
    if (mark) {
      mark.createdAt = new Date().toISOString();
      onMark(mark);
    }
  }

  canvas.addEventListener("pointerup", finish);
  canvas.addEventListener("pointercancel", finish);
}
