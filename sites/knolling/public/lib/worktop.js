// worktop.js — the canvas scene: lays every account out as its object, either
// scattered (loose, random, overlapping a little — a real desk) or knolled
// (grouped by object type, right angles only, evenly spaced — the knolling
// trick), and animates between the two. Rendering + layout only; app.js does
// the DOM/data wiring.

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function shortestDelta(from, to) {
  const twoPi = Math.PI * 2;
  return (((to - from + Math.PI) % twoPi) + twoPi) % twoPi - Math.PI;
}

function computeScatter(items, W, H) {
  const pad = 92;
  const placed = [];
  return items.map((it) => {
    let best = null, bestScore = -1;
    for (let k = 0; k < 10; k++) {
      const cx = pad + Math.random() * Math.max(1, W - pad * 2);
      const cy = pad + Math.random() * Math.max(1, H - pad * 2);
      let minD = Infinity;
      for (const p of placed) minD = Math.min(minD, Math.hypot(p.x - cx, p.y - cy));
      if (!placed.length) minD = 1e9;
      if (minD > bestScore) { bestScore = minD; best = { x: cx, y: cy }; }
    }
    placed.push(best);
    return { x: best.x, y: best.y, rot: (Math.random() - 0.5) * Math.PI * 1.6, scale: it.params.scale };
  });
}

function computeKnoll(items, W, H) {
  const n = items.length;
  const order = items.map((_, i) => i).sort((a, b) => {
    const A = items[a].params, B = items[b].params;
    if (A.typeIdx !== B.typeIdx) return A.typeIdx - B.typeIdx;
    if (B.scale !== A.scale) return B.scale - A.scale;
    return items[a].did < items[b].did ? -1 : 1;
  });
  const pad = 56;
  const availW = Math.max(1, W - pad * 2), availH = Math.max(1, H - pad * 2);
  const columns = Math.max(1, Math.round(Math.sqrt(n * (availW / availH))));
  const rows = Math.max(1, Math.ceil(n / columns));
  const CELL = Math.max(44, Math.min(172, Math.floor(availW / columns), Math.floor(availH / rows)));
  const gridW = columns * CELL, gridH = rows * CELL;
  const offX = (W - gridW) / 2, offY = (H - gridH) / 2;
  const shrink = Math.min(1, CELL / 172);
  const targets = new Array(n);
  order.forEach((origIdx, k) => {
    const col = k % columns, row = Math.floor(k / columns);
    targets[origIdx] = {
      x: offX + col * CELL + CELL / 2,
      y: offY + row * CELL + CELL / 2,
      rot: 0,
      scale: items[origIdx].params.scale * shrink,
    };
  });
  return targets;
}

const HANDLE_R = 9; // drawn radius
const HANDLE_HIT_R = 20; // hit-test radius — generous, this is the touch target
const HANDLE_GAP = 24; // px beyond the object's own half-height

export function createWorktop(canvas, { W, H, onHover, onHold }) {
  const ctx = canvas.getContext("2d");
  let items = [];
  let knolled = false;
  let raf = null;
  let selectedDid = null; // last-grabbed item — its rotate handle stays live
  let dragging = null; // { pointerId, item, mode: "move"|"rotate", ... }

  function handlePos(it) {
    const s = Math.max(0.001, it.curScale);
    const h = it.params.type.h * s;
    const dist = h / 2 + HANDLE_GAP;
    return { x: it.x + Math.sin(it.rot) * dist, y: it.y - Math.cos(it.rot) * dist };
  }

  function hitTestHandle(lx, ly, it) {
    const p = handlePos(it);
    const dx = lx - p.x, dy = ly - p.y;
    return dx * dx + dy * dy <= HANDLE_HIT_R * HANDLE_HIT_R;
  }

  function clampAxis(v, max) {
    const margin = 20;
    return Math.min(max - margin, Math.max(margin, v));
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }
  window.addEventListener("resize", resize);

  function loadAvatar(it) {
    if (!it.avatar || it.avImg || it.avFailed) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => { it.avImg = img; draw(); };
    img.onerror = () => { it.avFailed = true; };
    img.src = it.avatar;
  }

  function setItems(newItems) {
    dragging = null;
    selectedDid = null;
    items = newItems.map((it) => ({
      ...it,
      x: W / 2, y: H / 2, rot: 0, curScale: it.params.scale,
      avImg: null, avFailed: false,
    }));
    items.forEach(loadAvatar);
    knolled = false;
    const targets = computeScatter(items, W, H);
    items.forEach((it, i) => {
      it.x = targets[i].x; it.y = targets[i].y;
      it.rot = targets[i].rot; it.curScale = targets[i].scale;
    });
    draw();
  }

  function animateTo(knollMode) {
    if (!items.length) return;
    const targets = knollMode ? computeKnoll(items, W, H) : computeScatter(items, W, H);
    const now = performance.now();
    items.forEach((it, i) => {
      const t = targets[i];
      it.fromX = it.x; it.fromY = it.y; it.fromRot = it.rot; it.fromScale = it.curScale;
      it.toX = t.x; it.toY = t.y;
      it.toRot = it.rot + shortestDelta(it.rot, t.rot);
      it.toScale = t.scale;
      it.delay = i * 9;
      it.animStart = now;
    });
    knolled = knollMode;
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(tick);
  }

  function tick(ts) {
    const DUR = 620;
    let stillGoing = false;
    for (const it of items) {
      const p = Math.min(1, Math.max(0, (ts - (it.animStart + it.delay)) / DUR));
      const e = easeInOutCubic(p);
      it.x = it.fromX + (it.toX - it.fromX) * e;
      it.y = it.fromY + (it.toY - it.fromY) * e;
      it.rot = it.fromRot + (it.toRot - it.fromRot) * e;
      it.curScale = it.fromScale + (it.toScale - it.fromScale) * e;
      if (p < 1) stillGoing = true;
    }
    draw();
    raf = stillGoing ? requestAnimationFrame(tick) : null;
  }

  function drawBackdrop() {
    const g = ctx.createRadialGradient(W / 2, H * 0.4, H * 0.15, W / 2, H * 0.5, H * 0.95);
    g.addColorStop(0, "#f4f2ee");
    g.addColorStop(1, "#dedad2");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(30,25,15,0.05)";
    ctx.lineWidth = 1;
    const step = 43;
    for (let x = step; x < W; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = step; y < H; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  }

  function drawItem(it, highlighted) {
    const s = Math.max(0.001, it.curScale);
    const w = it.params.type.w * s, h = it.params.type.h * s;
    ctx.save();
    ctx.translate(it.x, it.y + Math.max(w, h) * 0.16);
    ctx.rotate(it.rot);
    ctx.beginPath();
    ctx.ellipse(0, 0, w * 0.48, h * 0.34 + 6, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(20,15,5,0.16)";
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(it.x, it.y);
    ctx.rotate(it.rot);
    ctx.scale(s, s);
    it.params.type.draw(ctx, it.params.color);
    ctx.restore();

    if (highlighted) {
      ctx.save();
      ctx.translate(it.x, it.y);
      ctx.rotate(it.rot);
      ctx.strokeStyle = "#1a5fd0";
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.strokeRect(-w / 2 - 10, -h / 2 - 10, w + 20, h + 20);
      ctx.restore();
    }

    // avatar badge — always drawn upright, in world space, regardless of item rotation.
    const r = 12;
    const bx = it.x + 10, by = it.y - 10;
    ctx.save();
    ctx.beginPath();
    ctx.arc(bx, by, r + 2, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.strokeStyle = it.params.color;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(bx, by, r, 0, Math.PI * 2);
    ctx.clip();
    if (it.avImg) {
      ctx.drawImage(it.avImg, bx - r, by - r, r * 2, r * 2);
    } else {
      ctx.fillStyle = it.params.color;
      ctx.fillRect(bx - r, by - r, r * 2, r * 2);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 12px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText((it.displayName || it.handle || "?")[0].toUpperCase(), bx, by + 1);
    }
    ctx.restore();
  }

  function drawHandle(it) {
    const p = handlePos(it);
    ctx.save();
    ctx.strokeStyle = "rgba(26,95,208,0.55)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(it.x, it.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(p.x, p.y, HANDLE_R, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.strokeStyle = "#1a5fd0";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0.3, Math.PI * 1.5);
    ctx.strokeStyle = "#1a5fd0";
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.restore();
  }

  let hoverDid = null;
  function draw() {
    ctx.clearRect(0, 0, W, H);
    drawBackdrop();
    for (const it of items) drawItem(it, it.did === hoverDid || it.did === selectedDid);
    const handleDids = new Set([selectedDid, hoverDid].filter(Boolean));
    for (const did of handleDids) {
      const it = items.find((i) => i.did === did);
      if (it) drawHandle(it);
    }
  }

  function hitTest(lx, ly) {
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      const dx = lx - it.x, dy = ly - it.y;
      const c = Math.cos(-it.rot), s = Math.sin(-it.rot);
      const rx = dx * c - dy * s, ry = dx * s + dy * c;
      const hw = (it.params.type.w / 2) * it.curScale * 1.3;
      const hh = (it.params.type.h / 2) * it.curScale * 1.3;
      if (Math.abs(rx) <= hw && Math.abs(ry) <= hh) return it;
      const bdx = lx - (it.x + 10), bdy = ly - (it.y - 10);
      if (bdx * bdx + bdy * bdy <= 14 * 14) return it;
    }
    return null;
  }

  function toLogical(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * W,
      y: ((clientY - rect.top) / rect.height) * H,
    };
  }

  // The activity: grab an object's body to translate it, grab its rotate
  // handle (shown once it's selected/hovered) to spin it in place. Both are
  // plain pointer-drag gestures, so mouse and touch work the same way.
  canvas.addEventListener("pointerdown", (e) => {
    const { x, y } = toLogical(e.clientX, e.clientY);
    const selItem = selectedDid ? items.find((i) => i.did === selectedDid) : null;
    let target = null, mode = null;
    if (selItem && hitTestHandle(x, y, selItem)) {
      target = selItem; mode = "rotate";
    } else {
      const hit = hitTest(x, y);
      if (hit) { target = hit; mode = "move"; }
    }
    if (!target) {
      if (selectedDid) { selectedDid = null; draw(); }
      return;
    }
    if (raf) { cancelAnimationFrame(raf); raf = null; }
    selectedDid = target.did;
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = "grabbing";
    if (mode === "move") {
      dragging = { pointerId: e.pointerId, item: target, mode, offX: target.x - x, offY: target.y - y };
    } else {
      const ang = Math.atan2(x - target.x, -(y - target.y));
      dragging = { pointerId: e.pointerId, item: target, mode, startAng: ang, startRot: target.rot };
    }
    if (onHold) onHold(target);
    draw();
  });

  canvas.addEventListener("pointermove", (e) => {
    const { x, y } = toLogical(e.clientX, e.clientY);
    if (dragging && dragging.pointerId === e.pointerId) {
      const it = dragging.item;
      if (dragging.mode === "move") {
        it.x = clampAxis(x + dragging.offX, W);
        it.y = clampAxis(y + dragging.offY, H);
      } else {
        const ang = Math.atan2(x - it.x, -(y - it.y));
        it.rot = dragging.startRot + (ang - dragging.startAng);
      }
      knolled = false;
      draw();
      return;
    }
    const hit = hitTest(x, y);
    const nextDid = hit ? hit.did : null;
    if (nextDid !== hoverDid) { hoverDid = nextDid; draw(); }
    const selItem = selectedDid ? items.find((i) => i.did === selectedDid) : null;
    canvas.style.cursor = hit ? "grab" : (selItem && hitTestHandle(x, y, selItem) ? "grab" : "default");
    if (onHover) onHover(hit, e.clientX, e.clientY);
  });
  canvas.addEventListener("pointerleave", () => {
    if (hoverDid) { hoverDid = null; draw(); }
    if (onHover) onHover(null, 0, 0);
  });
  function endDrag(e) {
    if (dragging && dragging.pointerId === e.pointerId) {
      dragging = null;
      canvas.style.cursor = "default";
      if (onHold) onHold(null);
      draw();
    }
  }
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);

  resize();

  return {
    setItems,
    knoll: () => animateTo(true),
    scatter: () => animateTo(false),
    isKnolled: () => knolled,
    canvas,
  };
}
