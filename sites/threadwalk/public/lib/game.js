// game.js — the walking part. A canvas top-down "overworld" where each
// thread from discourse.js/layout.js is a place on the map. Arrow
// keys/WASD (or the on-screen d-pad on touch) walk a little avatar around;
// walking close enough to a node "arrives" there and fires onArrive(node)
// so the page can show the full post. No physics engine, no deps — a plain
// requestAnimationFrame loop.

const SPEED = 320; // world px / second
const ARRIVE_RADIUS = 46;
const REVEAL_RADIUS = 340; // labels fade in once the player is this close
const WORLD_BOUND = 1500; // soft clamp so you can't walk into the void forever
const MIN_R = 11;
const MAX_R = 30;

const TINTS = [
  "#5b8cff", "#ff6b6b", "#5ad1a8", "#ffb454", "#c792ea",
  "#ff8fd6", "#4fd1ff", "#a8e05f", "#ff9f6b", "#8aa3ff",
];
function tintFor(did) {
  let h = 0;
  for (const c of did || "x") h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  return TINTS[h % TINTS.length];
}

export function createGame(canvas, threads, { onArrive, onVisitedChange } = {}) {
  const ctx = canvas.getContext("2d");
  const maxResonance = Math.max(1, ...threads.map((t) => t.resonance));
  const nodes = threads.map((t) => ({
    ...t,
    r: MIN_R + (MAX_R - MIN_R) * Math.sqrt(t.resonance / maxResonance),
    tint: tintFor(t.authorDid),
  }));

  // No crossOrigin here on purpose: bsky's avatar CDN doesn't send
  // Access-Control-Allow-Origin, so a CORS-mode image request gets blocked
  // outright. A plain cross-origin <img> still loads and draws into the
  // canvas fine — it just taints the canvas for pixel readback, which this
  // game never does (no getImageData/toDataURL/toBlob).
  const avatarImgs = new Map();
  for (const n of nodes) {
    if (!n.authorAvatar) continue;
    const img = new Image();
    img.src = n.authorAvatar;
    avatarImgs.set(n.uri, img);
  }

  const start = nodes[0];
  const player = { x: start.x, y: start.y };
  const keys = { up: false, down: false, left: false, right: false };
  const visited = new Set();
  let current = null;
  let running = true;
  let dpr = Math.max(1, window.devicePixelRatio || 1);

  function resize() {
    dpr = Math.max(1, window.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
  }
  resize();
  window.addEventListener("resize", resize);

  function keyDown(e) {
    if (setKey(e.code, true)) e.preventDefault();
  }
  function keyUp(e) {
    setKey(e.code, false);
  }
  function setKey(code, val) {
    if (code === "ArrowUp" || code === "KeyW") return (keys.up = val), true;
    if (code === "ArrowDown" || code === "KeyS") return (keys.down = val), true;
    if (code === "ArrowLeft" || code === "KeyA") return (keys.left = val), true;
    if (code === "ArrowRight" || code === "KeyD") return (keys.right = val), true;
    return false;
  }
  window.addEventListener("keydown", keyDown);
  window.addEventListener("keyup", keyUp);

  function setDpadKey(dir, val) {
    keys[dir] = val;
  }

  function arriveAt(node) {
    if (current === node) return;
    current = node;
    if (!visited.has(node.uri)) {
      visited.add(node.uri);
      if (onVisitedChange) onVisitedChange(visited.size, nodes.length);
    }
    if (onArrive) onArrive(node, nearestUnvisited(node));
  }

  function nearestUnvisited(from) {
    let best = null;
    let bestD = Infinity;
    for (const nb of from.neighbors || []) {
      const n = nodes[nb.index];
      if (visited.has(n.uri)) continue;
      const d = Math.hypot(n.x - from.x, n.y - from.y);
      if (d < bestD) {
        bestD = d;
        best = n;
      }
    }
    if (best) return best;
    for (const n of nodes) {
      if (n === from || visited.has(n.uri)) continue;
      const d = Math.hypot(n.x - from.x, n.y - from.y);
      if (d < bestD) {
        bestD = d;
        best = n;
      }
    }
    return best;
  }

  // Ambient starfield — fixed random dots across a big field, drawn relative
  // to the camera so it feels like a world rather than a void.
  const stars = Array.from({ length: 260 }, () => ({
    x: (Math.random() - 0.5) * WORLD_BOUND * 3.2,
    y: (Math.random() - 0.5) * WORLD_BOUND * 3.2,
    r: Math.random() * 1.4 + 0.3,
    a: Math.random() * 0.5 + 0.2,
  }));

  let last = performance.now();
  function frame(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    let dx = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    let dy = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
    if (dx || dy) {
      const len = Math.hypot(dx, dy) || 1;
      player.x += (dx / len) * SPEED * dt;
      player.y += (dy / len) * SPEED * dt;
      const dist = Math.hypot(player.x, player.y);
      if (dist > WORLD_BOUND) {
        const k = WORLD_BOUND / dist;
        player.x *= k;
        player.y *= k;
      }
    }

    let nearest = null;
    let nearestD = Infinity;
    for (const n of nodes) {
      const d = Math.hypot(n.x - player.x, n.y - player.y);
      if (d < nearestD) {
        nearestD = d;
        nearest = n;
      }
    }
    if (nearest && nearestD < ARRIVE_RADIUS) arriveAt(nearest);

    draw(nearest, nearestD);
    requestAnimationFrame(frame);
  }

  function draw(nearest, nearestD) {
    const w = canvas.width;
    const h = canvas.height;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cw = canvas.width / dpr;
    const ch = canvas.height / dpr;

    const grad = ctx.createRadialGradient(cw / 2, ch / 2, 0, cw / 2, ch / 2, Math.max(cw, ch) * 0.75);
    grad.addColorStop(0, "#0e1430");
    grad.addColorStop(1, "#05070f");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, cw, ch);

    const camX = player.x - cw / 2;
    const camY = player.y - ch / 2;

    ctx.save();
    for (const s of stars) {
      const sx = s.x - camX;
      const sy = s.y - camY;
      if (sx < -20 || sy < -20 || sx > cw + 20 || sy > ch + 20) continue;
      ctx.globalAlpha = s.a;
      ctx.fillStyle = "#cfe0ff";
      ctx.beginPath();
      ctx.arc(sx, sy, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // Edges between similar threads.
    for (const n of nodes) {
      for (const nb of n.neighbors || []) {
        const o = nodes[nb.index];
        if (o.x < n.x) continue; // draw each edge once
        const nx = n.x - camX;
        const ny = n.y - camY;
        const ox = o.x - camX;
        const oy = o.y - camY;
        const hot = current && (current === n || current === o);
        ctx.strokeStyle = hot ? "rgba(120,200,255,0.55)" : `rgba(140,160,220,${0.08 + nb.sim * 0.35})`;
        ctx.lineWidth = hot ? 2 : 1;
        ctx.beginPath();
        ctx.moveTo(nx, ny);
        ctx.lineTo(ox, oy);
        ctx.stroke();
      }
    }

    // Nodes.
    for (const n of nodes) {
      const nx = n.x - camX;
      const ny = n.y - camY;
      if (nx < -80 || ny < -80 || nx > cw + 80 || ny > ch + 80) continue;
      const isVisited = visited.has(n.uri);
      const isCurrent = current === n;

      const img = avatarImgs.get(n.uri);
      ctx.save();
      ctx.beginPath();
      ctx.arc(nx, ny, n.r, 0, Math.PI * 2);
      if (img && img.complete && img.naturalWidth) {
        ctx.save();
        ctx.clip();
        ctx.drawImage(img, nx - n.r, ny - n.r, n.r * 2, n.r * 2);
        ctx.restore();
      } else {
        ctx.fillStyle = n.tint;
        ctx.fill();
      }
      ctx.lineWidth = isCurrent ? 3 : 1.5;
      ctx.strokeStyle = isCurrent ? "#ffffff" : isVisited ? "rgba(255,255,255,0.65)" : "rgba(255,255,255,0.25)";
      ctx.stroke();
      ctx.restore();

      const dist = Math.hypot(nx - cw / 2, ny - ch / 2);
      if (dist < REVEAL_RADIUS) {
        const alpha = Math.max(0, 1 - dist / REVEAL_RADIUS);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = "#e8ecff";
        ctx.font = "600 12px ui-monospace, monospace";
        ctx.textAlign = "center";
        ctx.fillText("@" + (n.authorHandle || "").replace(/\.bsky\.social$/, ""), nx, ny + n.r + 15);
        ctx.globalAlpha = 1;
      }
    }

    // Player.
    ctx.save();
    ctx.fillStyle = "#fff";
    ctx.shadowColor = "#8fd0ff";
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(cw / 2, ch / 2, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    drawMinimap(cw, ch);
  }

  function drawMinimap(cw, ch) {
    const size = 128;
    const pad = 14;
    const mx = cw - size - pad;
    const my = ch - size - pad;
    const scale = size / (WORLD_BOUND * 2.4);

    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = "rgba(6,9,20,0.75)";
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(mx, my, size, size, 8);
    ctx.fill();
    ctx.stroke();

    const cx = mx + size / 2;
    const cy = my + size / 2;
    for (const n of nodes) {
      const px = cx + n.x * scale;
      const py = cy + n.y * scale;
      ctx.fillStyle = visited.has(n.uri) ? "#8fd0ff" : "rgba(255,255,255,0.45)";
      ctx.beginPath();
      ctx.arc(px, py, n === current ? 3 : 2, 0, Math.PI * 2);
      ctx.fill();
    }
    const ppx = cx + player.x * scale;
    const ppy = cy + player.y * scale;
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(ppx, ppy, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  requestAnimationFrame((t) => {
    last = t;
    frame(t);
  });

  return {
    nodes,
    setDpadKey,
    walkTo(node) {
      // Snap the player toward a node (used by "jump to nearest" affordance);
      // kept gentle — sets a virtual target the frame loop steers toward
      // isn't implemented, so this just teleports for now. Simple + honest.
      player.x = node.x;
      player.y = node.y;
    },
    destroy() {
      running = false;
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("resize", resize);
    },
  };
}
