(() => {
  const T = 26, COLS = 24, ROWS = 14, W = COLS * T, H = ROWS * T;
  const cv = document.getElementById("c"), ctx = cv.getContext("2d");
  const $ = id => document.getElementById(id);

  // Rooms are built from rects so every row is guaranteed COLS wide.
  // Each room: left/right = open to a neighbour (else a solid wall column).
  function room(o) {
    const g = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
    const rect = (x, y, w, h) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) g[j][i] = 1; };
    rect(0, ROWS - 1, COLS, 1); rect(0, 0, COLS, 1);
    if (!o.l) rect(0, 0, 1, ROWS); if (!o.r) rect(COLS - 1, 0, 1, ROWS);
    for (const [x, y, w, h] of o.solid || []) rect(x, y, w, h);
    for (const [x, y, w, h] of o.cut || []) for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) g[j][i] = 0;
    return { g, l: !!o.l, r: !!o.r, items: (o.items || []).map(([x, y, k]) => ({ x, y, k, got: false })), down: !!o.down, up: !!o.up };
  }
  const rooms = [
    [ // top row
      room({ r: 1, down: 1, cut: [[8, ROWS - 1, 7, 1]], solid: [[16, 9, 4, 1]], items: [[17, 8, "coin"]] }),
      room({ l: 1, r: 1, cut: [[6, ROWS - 1, 12, 1]], items: [[12, 5, "coin"]] }),
      room({ l: 1, solid: [[9, 7, 5, 1], [4, 10, 3, 1]], items: [[11, 6, "F"]] }),
    ],
    [ // bottom row
      room({ r: 1, up: 1, cut: [[8, 0, 7, 1]], solid: [[14, 10, 4, 1], [10, 7, 4, 1], [5, 4, 5, 1], [2, 10, 4, 1]], items: [[3, 9, "J"]] }),
      room({ l: 1, r: 1, solid: [[18, 8, 5, 1], [6, 10, 2, 3]], items: [[20, 7, "D"]] }),
      room({ l: 1, solid: [[8, 10, 3, 1], [14, 7, 3, 1]], items: [[15, 6, "coin"]] }),
    ],
  ];
  const NAMES = { J: "tomato slice — double jump! (jump again in the air)", D: "banana pepper — dash! (Shift / X)", F: "the footlong!" };

  let rx, ry, p, has, coins, t0, done, keys = {}, last, entry, seen, raf, jumpHeld;

  function init() {
    for (const row of rooms) for (const r of row) r.items.forEach(i => (i.got = false));
    rx = 0; ry = 0; has = { J: false, D: false }; coins = 0; done = false; seen = new Set(["0,0"]);
    p = { x: 3 * T, y: (ROWS - 2) * T - 10, w: 16, h: 24, vx: 0, vy: 0, face: 1, ground: false, air: 0, dashT: 0, dashed: false };
    entry = { x: p.x, y: p.y };
    t0 = performance.now(); last = t0;
    $("msg").textContent = "←/→ or A/D to move · Space/↑/W to jump · Shift/X to dash (once you find it).";
    cancelAnimationFrame(raf); raf = requestAnimationFrame(tick); mapUI();
  }
  const cur = () => rooms[ry][rx];
  function mapUI() {
    $("map").innerHTML = "";
    for (let j = 0; j < 2; j++) for (let i = 0; i < 3; i++) { const e = document.createElement("i"); e.className = i === rx && j === ry ? "here" : seen.has(i + "," + j) ? "seen" : ""; $("map").appendChild(e); }
    $("abil").textContent = [has.J && "🍅 double jump", has.D && "🌶️ dash"].filter(Boolean).join(" · ") || "none yet";
    $("coins").textContent = coins;
  }
  function hitsX(r) { // test p against solid tiles
    for (let y = p.y; y < p.y + p.h; y += T / 2) for (const x of [p.x, p.x + p.w]) if (cell(r, x, y)) return true;
    return cell(r, p.x, p.y + p.h - 1) || cell(r, p.x + p.w, p.y + p.h - 1);
  }
  const cell = (r, x, y) => { const c = Math.floor(x / T), l = Math.floor(y / T); if (l < 0 || l >= ROWS) return false; if (c < 0 || c >= COLS) return false; return r.g[l][c] === 1; };
  function step(dt) {
    const r = cur();
    const L = keys.ArrowLeft || keys.a, R = keys.ArrowRight || keys.d;
    const jump = keys[" "] || keys.ArrowUp || keys.w;
    if (p.dashT > 0) { p.dashT -= dt; p.vx = p.face * 600; p.vy = 0; }
    else {
      p.vx = ((R ? 1 : 0) - (L ? 1 : 0)) * 220;
      if (p.vx) p.face = Math.sign(p.vx);
      p.vy = Math.min(p.vy + 1800 * dt, 700);
    }
    if (jump && !jumpHeld) {
      if (p.ground) { p.vy = -560; p.ground = false; p.air = 1; }
      else if (has.J && p.air === 1) { p.vy = -560; p.air = 2; }
    }
    jumpHeld = !!jump;
    if ((keys.Shift || keys.x) && has.D && !p.dashed && p.dashT <= 0) { p.dashT = 0.25; p.dashed = true; }
    // x then y, resolving against tiles
    p.x += p.vx * dt;
    if (hitsX(r)) { p.x -= p.vx * dt; if (p.dashT > 0) p.dashT = 0; }
    p.y += p.vy * dt;
    p.ground = false;
    if (hitsX(r)) {
      if (p.vy > 0) { p.y = Math.floor((p.y + p.h) / T) * T - p.h - 0.01; p.ground = true; p.air = 0; p.dashed = false; }
      else p.y = (Math.floor(p.y / T) + 1) * T + 0.01;
      p.vy = 0;
    }
    if (p.ground && p.air === 0 && p.dashT <= 0) p.dashed = false;
    if (!p.ground && p.air === 0) p.air = 1; // walked off a ledge: still has the double jump only
    // room transitions
    const cx = p.x + p.w / 2;
    if (cx < 0 && r.l) { rx--; p.x = W - p.w - 4; enter(); }
    else if (cx > W && r.r) { rx++; p.x = 4; enter(); }
    else if (p.y > H) {
      if (r.down) { ry++; p.y = 2; enter(); }
      else { p.x = entry.x; p.y = entry.y; p.vx = p.vy = 0; $("msg").textContent = "splat. back to the doorway."; }
    } else if (p.y + p.h < 0 && r.up) { ry--; p.y = H - p.h - 4; p.vy = Math.min(p.vy, -300); enter(); }
    // items
    for (const it of r.items) {
      if (it.got) continue;
      if (Math.abs(it.x * T + T / 2 - cx) < 20 && Math.abs(it.y * T + T / 2 - (p.y + p.h / 2)) < 24) {
        it.got = true;
        if (it.k === "coin") { coins++; $("msg").textContent = "an olive. nice."; }
        else if (it.k === "F") { done = true; const s = ((performance.now() - t0) / 1000).toFixed(1); $("msg").textContent = `${NAMES.F} you win in ${s}s with ${coins}/3 olives.`; setShare(`I found the footlong in subwaidvania in ${s}s with ${coins}/3 olives 🥖`); }
        else { has[it.k] = true; $("msg").textContent = NAMES[it.k]; }
        mapUI();
      }
    }
  }
  function enter() { seen.add(rx + "," + ry); entry = { x: p.x, y: p.y }; p.dashT = 0; mapUI(); }
  function tick(now) {
    const dt = Math.min((now - last) / 1000, 0.033); last = now;
    if (!done) { step(dt); $("time").textContent = ((now - t0) / 1000).toFixed(1); }
    draw();
    raf = requestAnimationFrame(tick);
  }
  function draw() {
    const r = cur();
    ctx.fillStyle = "#cfe6b4"; ctx.fillRect(0, 0, W, H);
    for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) if (r.g[j][i]) { ctx.fillStyle = j === ROWS - 1 || j === 0 || i === 0 || i === COLS - 1 ? "#a9743a" : "#c88f4a"; ctx.fillRect(i * T, j * T, T, T); ctx.strokeStyle = "#8a5a28"; ctx.strokeRect(i * T + .5, j * T + .5, T - 1, T - 1); }
    ctx.font = "22px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (const it of r.items) if (!it.got) ctx.fillText({ coin: "🫒", J: "🍅", D: "🌶️", F: "🥖" }[it.k], it.x * T + T / 2, it.y * T + T / 2);
    ctx.fillStyle = p.dashT > 0 ? "#fff" : "#2a8a2f"; ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.fillStyle = "#000"; ctx.fillRect(p.x + (p.face > 0 ? 10 : 2), p.y + 5, 4, 4);
  }
  addEventListener("keydown", e => { const k = e.key.length === 1 ? e.key.toLowerCase() : e.key; keys[k] = true; if (k === "Shift") keys.Shift = true; if ([" ", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) e.preventDefault(); });
  addEventListener("keyup", e => { const k = e.key.length === 1 ? e.key.toLowerCase() : e.key; keys[k] = false; });
  document.querySelectorAll(".touch button").forEach(b => {
    const k = b.dataset.k;
    const on = e => { e.preventDefault(); keys[k] = true; }, off = e => { e.preventDefault(); keys[k] = false; };
    b.addEventListener("pointerdown", on); b.addEventListener("pointerup", off); b.addEventListener("pointerleave", off); b.addEventListener("pointercancel", off);
  });
  $("restart").addEventListener("click", init);
  init();
})();
