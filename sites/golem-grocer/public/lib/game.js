// golem grocer — a tiny first-person raycaster. Everything runs in the browser.
// Foods in the store slowly "golemize" (plain -> stirring -> stone limbs) and then
// chase you along the aisles at a posted running speed.

const W = 21, H = 15;
const SCREEN_W = 480, SCREEN_H = 300;
const FOV = 66 * Math.PI / 180;
// Game-scale: how many map cells per second one mph is worth. A cell is roughly a
// shopping-aisle width, so this is a feel constant, not a measurement.
const CELLS_PER_MPH = 0.35;
const WALK = 2.0, SPRINT = 3.6; // cells / second
const CATCH_R = 0.6, PICK_R = 0.75, PLAYER_R = 0.22;
const POSTED_MPH = 4.1 / (8 + 37 / 60) * 60; // 4.1 mi in 8'37" ≈ 28.5 mph

// name, emoji, top speed (mph), sprite scale
const FOODS = [
  { name: "banana", e: "🍌", mph: 6, s: 0.55 },
  { name: "bread", e: "🍞", mph: 8, s: 0.6 },
  { name: "milk", e: "🥛", mph: 7, s: 0.65 },
  { name: "cheese", e: "🧀", mph: 9, s: 0.55 },
  { name: "tomato", e: "🍅", mph: 10, s: 0.5 },
  { name: "carrot", e: "🥕", mph: 11, s: 0.6 },
  { name: "apple", e: "🍎", mph: 9, s: 0.5 },
  { name: "eggs", e: "🥚", mph: 6.5, s: 0.5 },
  { name: "steak", e: "🥩", mph: 12, s: 0.6 },
  { name: "frozen pizza", e: "🍕", mph: 10, s: 0.7 },
  { name: "watermelon", e: "🍉", mph: 5, s: 0.9 },
  { name: "broccoli", e: "🥦", mph: 8.5, s: 0.6 },
  { name: "rotisserie chicken", e: "🍗", mph: POSTED_MPH, s: 0.75, posted: true },
];
const LIST_SIZE = 5;

const $ = (id) => document.getElementById(id);
const canvas = $("view");
const ctx = canvas.getContext("2d");
canvas.width = SCREEN_W; canvas.height = SCREEN_H;

// ---------- map ----------
const grid = [];
function buildMap() {
  for (let y = 0; y < H; y++) {
    grid[y] = [];
    for (let x = 0; x < W; x++) grid[y][x] = (x === 0 || y === 0 || x === W - 1 || y === H - 1) ? 1 : 0;
  }
  const bands = [[2, 3, [7, 13]], [5, 6, [5, 10, 15]], [8, 9, [7, 13]], [11, 12, [5, 10, 15]]];
  for (const [a, b, gaps] of bands) {
    for (let y = a; y <= b; y++) for (let x = 2; x <= 18; x++) if (!gaps.includes(x)) grid[y][x] = 2;
  }
}
buildMap();
const isWall = (x, y) => {
  const gx = Math.floor(x), gy = Math.floor(y);
  return gx < 0 || gy < 0 || gx >= W || gy >= H || grid[gy][gx] > 0;
};
const CHECKOUT = { x: 19.5, y: 13.5 };

// ---------- sprite textures ----------
const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
const TEX = 128;
const texCache = new Map();
function makeTex(food, stage) {
  const c = document.createElement("canvas");
  c.width = c.height = TEX;
  const g = c.getContext("2d");
  g.textAlign = "center"; g.textBaseline = "middle";
  const cx = TEX / 2;
  if (stage === 2) {
    // stone limbs behind the body
    g.strokeStyle = "#7d8187"; g.lineCap = "round"; g.lineWidth = 11;
    g.beginPath();
    g.moveTo(cx - 22, 92); g.lineTo(cx - 30, 124);
    g.moveTo(cx + 22, 92); g.lineTo(cx + 30, 124);
    g.moveTo(cx - 34, 60); g.lineTo(cx - 56, 86);
    g.moveTo(cx + 34, 60); g.lineTo(cx + 56, 86);
    g.stroke();
    g.strokeStyle = "#5b5f65"; g.lineWidth = 3; g.stroke();
  }
  const size = stage === 2 ? 84 : 78;
  g.font = `${size}px ${EMOJI_FONT}`;
  g.fillText(food.e, cx, stage === 2 ? 58 : 64);
  if (stage === 2) {
    g.fillStyle = "rgba(120,124,130,.45)";
    g.fillRect(cx - 34, 74, 26, 14);
    g.fillRect(cx + 6, 28, 22, 12);
  }
  if (stage >= 1) {
    const ey = stage === 2 ? 52 : 60;
    for (const dx of [-14, 14]) {
      g.fillStyle = "#fff"; g.beginPath(); g.arc(cx + dx, ey, 10, 0, 7); g.fill();
      g.strokeStyle = "#222"; g.lineWidth = 2; g.stroke();
      g.fillStyle = stage === 2 ? "#d11" : "#111";
      g.beginPath(); g.arc(cx + dx + (stage === 2 ? 0 : 3), ey + 1, stage === 2 ? 5 : 4, 0, 7); g.fill();
    }
    if (stage === 2) {
      g.strokeStyle = "#222"; g.lineWidth = 4;
      g.beginPath(); g.moveTo(cx - 26, ey - 14); g.lineTo(cx - 6, ey - 8);
      g.moveTo(cx + 26, ey - 14); g.lineTo(cx + 6, ey - 8); g.stroke();
      g.fillStyle = "#222"; g.fillRect(cx - 12, ey + 20, 24, 6);
    } else {
      g.strokeStyle = "rgba(60,60,60,.7)"; g.lineWidth = 2;
      g.beginPath(); g.moveTo(cx - 30, 34); g.lineTo(cx - 20, 48); g.lineTo(cx - 28, 58); g.stroke();
    }
  }
  return c;
}
function tex(food, stage) {
  const k = food.name + stage;
  if (!texCache.has(k)) texCache.set(k, makeTex(food, stage));
  return texCache.get(k);
}
const signTex = (() => {
  const c = document.createElement("canvas");
  c.width = c.height = TEX;
  const g = c.getContext("2d");
  g.fillStyle = "#14532d"; g.fillRect(8, 20, 112, 56);
  g.strokeStyle = "#7fe07f"; g.lineWidth = 4; g.strokeRect(8, 20, 112, 56);
  g.fillStyle = "#dfffdc"; g.font = "bold 20px monospace"; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText("CHECKOUT", 64, 48);
  g.fillStyle = "#555"; g.fillRect(60, 76, 8, 52);
  return c;
})();

// ---------- state ----------
const P = { x: 1.5, y: 1.5, a: 0.6 };
let foods = [], listItems = [], t = 0, running = false, over = false, stamina = 1;
let msgText = "", msgT = 0, distField = null, fieldT = 0;
const keys = {};

function say(s) { msgText = s; msgT = 3; $("msg").textContent = s; }

function reset() {
  const spots = [];
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    if (grid[y][x] === 0 && Math.hypot(x - 1, y - 1) > 5 && Math.hypot(x - 19, y - 13) > 3) spots.push({ x: x + 0.5, y: y + 0.5 });
  }
  for (let i = spots.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [spots[i], spots[j]] = [spots[j], spots[i]]; }
  const chosen = [];
  for (const s of spots) if (chosen.every((c) => Math.hypot(c.x - s.x, c.y - s.y) > 2.2)) chosen.push(s);
  const picks = FOODS.slice();
  for (let i = picks.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [picks[i], picks[j]] = [picks[j], picks[i]]; }
  foods = picks.slice(0, Math.min(picks.length, chosen.length)).map((f, i) => ({
    ...f, x: chosen[i].x, y: chosen[i].y,
    // The posted-speed chicken wakes last; everything else wakes at a random moment in the first
    // two minutes. Each takes `dur` seconds to go from plain food to full golem.
    wake: f.posted ? 125 + Math.random() * 20 : 20 + Math.random() * 100,
    dur: 28 + Math.random() * 10,
    level: 0, stage: 0, alive: true, listed: false, announced: [false, false],
  }));
  const pool = foods.filter((f) => !f.posted);
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  listItems = pool.slice(0, LIST_SIZE);
  listItems.forEach((f) => { f.listed = true; f.got = false; });
  Object.assign(P, { x: 1.5, y: 1.5, a: 0.6 });
  t = 0; over = false; stamina = 1; distField = null;
  renderList();
}

function renderList() {
  $("list").innerHTML = "";
  for (const f of listItems) {
    const li = document.createElement("li");
    li.textContent = `${f.e} ${f.name}`;
    if (f.got) li.className = "done";
    $("list").appendChild(li);
  }
}

// ---------- BFS distance field from the player ----------
function computeField() {
  const d = Array.from({ length: H }, () => new Array(W).fill(1e9));
  const sx = Math.floor(P.x), sy = Math.floor(P.y);
  const q = [[sx, sy]]; d[sy][sx] = 0;
  for (let i = 0; i < q.length; i++) {
    const [x, y] = q[i];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || grid[ny][nx] > 0 || d[ny][nx] < 1e9) continue;
      d[ny][nx] = d[y][x] + 1; q.push([nx, ny]);
    }
  }
  distField = d;
}

function stepGolem(f, dt) {
  let rem = f.speed * dt;
  for (let k = 0; k < 6 && rem > 1e-4; k++) {
    const cx = Math.floor(f.x), cy = Math.floor(f.y);
    let tx, ty;
    if (cx === Math.floor(P.x) && cy === Math.floor(P.y)) { tx = P.x; ty = P.y; }
    else {
      let best = distField[cy][cx], bx = -1, by = -1;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        if (distField[ny][nx] < best) { best = distField[ny][nx]; bx = nx; by = ny; }
      }
      if (bx < 0) return;
      tx = bx + 0.5; ty = by + 0.5;
    }
    const dx = tx - f.x, dy = ty - f.y, d = Math.hypot(dx, dy);
    if (d < 1e-6) { f.x = tx; f.y = ty; continue; }
    const m = Math.min(rem, d);
    f.x += dx / d * m; f.y += dy / d * m; rem -= m;
    if (m < d) return;
  }
}

function finish(win, why) {
  over = true; running = false;
  if (document.pointerLockElement) document.exitPointerLock();
  const secs = Math.floor(t), time = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
  const got = listItems.filter((f) => f.got).length;
  $("endTitle").textContent = win ? "checked out! 🛒" : "you've been golemized 💀";
  $("endText").textContent = win
    ? `all ${LIST_SIZE} items, out the door in ${time}. the receipt is warm and the store is angry.`
    : `${why} You got ${got}/${LIST_SIZE} items in ${time}.`;
  const text = win
    ? `I finished my whole shopping list in ${time} before the groceries could golemize me. golem grocer 🛒🍗`
    : `I got ${got}/${LIST_SIZE} items before ${why.replace(/^you were /i, "I was ").replace(/\.$/, "")}. golem grocer 🛒🍗`;
  $("share").href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(text + " https://golem-grocer.bisks.net/");
  $("end").hidden = false;
}

// ---------- update ----------
function tryMove(nx, ny) {
  if (!isWall(nx + Math.sign(nx - P.x) * PLAYER_R, P.y)) P.x = nx;
  if (!isWall(P.x, ny + Math.sign(ny - P.y) * PLAYER_R)) P.y = ny;
}
let touch = { fwd: 0, strafe: 0, turn: 0, sprint: false };
let mouseTurn = 0;

function update(dt) {
  t += dt;
  const fwd = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0) + touch.fwd;
  const strafe = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0) + touch.strafe;
  const turn = (keys.ArrowRight ? 1 : 0) - (keys.ArrowLeft ? 1 : 0) + touch.turn;
  P.a += turn * 2.4 * dt + mouseTurn; mouseTurn = 0;
  const wantSprint = (keys.ShiftLeft || keys.ShiftRight || touch.sprint) && (fwd || strafe);
  let sp = WALK;
  if (wantSprint && stamina > 0.02) { sp = SPRINT; stamina = Math.max(0, stamina - dt * 0.28); }
  else stamina = Math.min(1, stamina + dt * (wantSprint ? 0.04 : 0.12));
  const len = Math.hypot(fwd, strafe) || 1;
  const mx = (Math.cos(P.a) * fwd - Math.sin(P.a) * strafe) / len * sp * dt;
  const my = (Math.sin(P.a) * fwd + Math.cos(P.a) * strafe) / len * sp * dt;
  tryMove(P.x + mx, P.y + my);

  fieldT -= dt;
  if (!distField || fieldT <= 0) { computeField(); fieldT = 0.15; }

  for (const f of foods) {
    if (!f.alive) continue;
    f.level = Math.max(0, Math.min(1, (t - f.wake) / f.dur));
    f.stage = f.level < 0.25 ? 0 : f.level < 0.6 ? 1 : 2;
    if (f.stage >= 1 && !f.announced[0]) { f.announced[0] = true; say(`the ${f.name} just blinked...`); }
    if (f.stage === 2) {
      if (!f.announced[1]) { f.announced[1] = true; say(`the ${f.name} golemized — ${f.mph.toFixed(1)} mph!${f.posted ? " (the posted one.)" : ""}`); }
      f.speed = f.mph * CELLS_PER_MPH * (0.5 + 0.5 * (f.level - 0.6) / 0.4);
      stepGolem(f, dt);
    }
    const d = Math.hypot(f.x - P.x, f.y - P.y);
    if (f.listed && !f.got && f.stage < 2 && d < PICK_R) {
      f.got = true; f.alive = false; renderList();
      say(`got the ${f.name} ✓ (${listItems.filter((x) => x.got).length}/${LIST_SIZE})`);
    } else if (f.stage === 2 && d < CATCH_R) {
      return finish(false, `you were run down by a golemized ${f.name} doing ${f.mph.toFixed(1)} mph.`);
    }
  }
  const allGot = listItems.every((f) => f.got);
  if (Math.hypot(CHECKOUT.x - P.x, CHECKOUT.y - P.y) < 1.1) {
    if (allGot) return finish(true);
    if (msgT <= 0) say(`list not done: ${LIST_SIZE - listItems.filter((f) => f.got).length} left`);
  }
  if (msgT > 0) { msgT -= dt; if (msgT <= 0) $("msg").textContent = ""; }
}

let hudT = 0;
function updateHud(dt) {
  hudT -= dt; if (hudT > 0) return; hudT = 0.2;
  const s = Math.floor(t);
  $("clock").textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const awake = foods.filter((f) => f.alive && f.stage === 2).length;
  $("awake").textContent = `${awake} golem${awake === 1 ? "" : "s"} loose`;
  $("stam").firstElementChild.style.width = Math.round(stamina * 100) + "%";
}

// ---------- render ----------
const zbuf = new Float32Array(SCREEN_W);
const skyGrad = ctx.createLinearGradient(0, 0, 0, SCREEN_H / 2);
skyGrad.addColorStop(0, "#d8dde0"); skyGrad.addColorStop(1, "#aab2b6");
const floorGrad = ctx.createLinearGradient(0, SCREEN_H / 2, 0, SCREEN_H);
floorGrad.addColorStop(0, "#5c6266"); floorGrad.addColorStop(1, "#c9cdc7");
const PRODUCT = ["#e0443a", "#f2b632", "#3f9ad6", "#5cb85c", "#d96ba0", "#f08a3c", "#8b6bd1", "#e8e8e8"];
const hash = (a, b, c) => { let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; return (h ^ (h >>> 16)) >>> 0; };

function render() {
  ctx.fillStyle = skyGrad; ctx.fillRect(0, 0, SCREEN_W, SCREEN_H / 2);
  ctx.fillStyle = floorGrad; ctx.fillRect(0, SCREEN_H / 2, SCREEN_W, SCREEN_H / 2);
  const plane = Math.tan(FOV / 2);
  const dirX = Math.cos(P.a), dirY = Math.sin(P.a);
  const planeX = -dirY * plane, planeY = dirX * plane;
  for (let x = 0; x < SCREEN_W; x++) {
    const cam = 2 * x / SCREEN_W - 1;
    const rx = dirX + planeX * cam, ry = dirY + planeY * cam;
    let mx = Math.floor(P.x), my = Math.floor(P.y);
    const ddx = Math.abs(1 / (rx || 1e-9)), ddy = Math.abs(1 / (ry || 1e-9));
    let stepX, stepY, sdx, sdy;
    if (rx < 0) { stepX = -1; sdx = (P.x - mx) * ddx; } else { stepX = 1; sdx = (mx + 1 - P.x) * ddx; }
    if (ry < 0) { stepY = -1; sdy = (P.y - my) * ddy; } else { stepY = 1; sdy = (my + 1 - P.y) * ddy; }
    let side = 0, hit = 0;
    // The outer wall ring is solid, so the ray always terminates; the counter is only a guard.
    for (let n = 0; n < 64 && !hit; n++) {
      if (sdx < sdy) { sdx += ddx; mx += stepX; side = 0; } else { sdy += ddy; my += stepY; side = 1; }
      if (mx < 0 || my < 0 || mx >= W || my >= H) { hit = 1; break; }
      hit = grid[my][mx];
    }
    const dist = Math.max(0.05, side === 0 ? sdx - ddx : sdy - ddy);
    zbuf[x] = dist;
    const lh = SCREEN_H / dist, y0 = SCREEN_H / 2 - lh / 2;
    const shade = Math.max(0.25, 1 - dist / 14) * (side ? 0.8 : 1);
    const wallX = (side === 0 ? P.y + dist * ry : P.x + dist * rx);
    const u = wallX - Math.floor(wallX);
    if (hit === 1) {
      ctx.fillStyle = `rgb(${Math.round(150 * shade)},${Math.round(160 * shade)},${Math.round(168 * shade)})`;
      ctx.fillRect(x, y0, 1, lh);
    } else {
      // shelf unit: dark frame, three boards, each with a run of colored products
      ctx.fillStyle = `rgb(${Math.round(90 * shade)},${Math.round(70 * shade)},${Math.round(52 * shade)})`;
      ctx.fillRect(x, y0, 1, lh);
      const col = Math.floor(u * 6);
      for (let r = 0; r < 3; r++) {
        const c = PRODUCT[hash(mx, my, r * 8 + col + side * 50) % PRODUCT.length];
        const py = y0 + lh * (0.06 + r * 0.31), ph = lh * 0.22;
        ctx.fillStyle = c; ctx.globalAlpha = 0.55 + 0.45 * shade;
        ctx.fillRect(x, py, 1, ph);
        ctx.globalAlpha = 1;
        ctx.fillStyle = `rgba(0,0,0,${0.55 - shade * 0.4})`; ctx.fillRect(x, py, 1, ph);
      }
    }
  }
  // sprites
  const list = foods.filter((f) => f.alive).map((f) => ({ x: f.x, y: f.y, f }));
  list.push({ x: CHECKOUT.x, y: CHECKOUT.y, sign: true });
  for (const s of list) s.d = (s.x - P.x) ** 2 + (s.y - P.y) ** 2;
  list.sort((a, b) => b.d - a.d);
  const inv = 1 / (planeX * dirY - dirX * planeY);
  for (const s of list) {
    const sx = s.x - P.x, sy = s.y - P.y;
    const tx = inv * (dirY * sx - dirX * sy);
    const ty = inv * (-planeY * sx + planeX * sy);
    if (ty < 0.2) continue;
    const scale = s.sign ? 0.9 : s.f.s * (0.8 + 0.2 * s.f.level);
    const size = Math.abs(SCREEN_H / ty) * scale * 1.0;
    const cx = (SCREEN_W / 2) * (1 + tx / ty);
    let bob = 0;
    if (!s.sign && s.f.stage === 1) bob = Math.sin(t * 14 + s.x) * size * 0.04;
    if (!s.sign && s.f.stage === 2) bob = -Math.abs(Math.sin(t * 9 + s.x)) * size * 0.12;
    // floor-standing: bottom of the sprite sits a bit below the horizon line
    const bottom = SCREEN_H / 2 + (SCREEN_H / ty) * 0.5 + bob;
    const top = bottom - size;
    const left = Math.floor(cx - size / 2), right = Math.floor(cx + size / 2);
    const img = s.sign ? signTex : tex(s.f, s.f.stage);
    for (let x = Math.max(0, left); x < Math.min(SCREEN_W, right); x++) {
      if (zbuf[x] < ty) continue;
      const tu = Math.floor((x - left) / size * TEX);
      ctx.drawImage(img, tu, 0, 1, TEX, x, top, 1, size);
    }
  }
  // chase vignette
  const near = foods.filter((f) => f.alive && f.stage === 2).reduce((m, f) => Math.min(m, Math.hypot(f.x - P.x, f.y - P.y)), 99);
  if (near < 6) {
    const a = (1 - near / 6) * 0.45;
    const g = ctx.createRadialGradient(SCREEN_W / 2, SCREEN_H / 2, SCREEN_H * 0.3, SCREEN_W / 2, SCREEN_H / 2, SCREEN_W * 0.65);
    g.addColorStop(0, "rgba(180,0,0,0)"); g.addColorStop(1, `rgba(180,0,0,${a})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
  }
}

// ---------- loop & input ----------
let last = 0;
function frame(ts) {
  const dt = Math.min(0.05, (ts - last) / 1000 || 0); last = ts;
  if (running) { update(dt); updateHud(dt); }
  render();
  requestAnimationFrame(frame);
}

function start() {
  reset();
  $("intro").hidden = true; $("end").hidden = true;
  running = true; say("find: " + listItems.map((f) => f.e).join(" "));
}

addEventListener("keydown", (e) => {
  keys[e.code] = true;
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) e.preventDefault();
});
addEventListener("keyup", (e) => { keys[e.code] = false; });
addEventListener("blur", () => { for (const k in keys) keys[k] = false; });

canvas.addEventListener("click", () => {
  if (running && canvas.requestPointerLock && !document.pointerLockElement) canvas.requestPointerLock();
});
document.addEventListener("mousemove", (e) => {
  if (document.pointerLockElement === canvas) mouseTurn += e.movementX * 0.0025;
});

// touch: left half drags to walk, right half drags to turn, two fingers sprint
const tstate = new Map();
function touchUpdate() {
  touch = { fwd: 0, strafe: 0, turn: 0, sprint: tstate.size >= 2 };
  for (const s of tstate.values()) {
    const dx = Math.max(-1, Math.min(1, (s.x - s.x0) / 50)), dy = Math.max(-1, Math.min(1, (s.y - s.y0) / 50));
    if (s.left) { touch.fwd = -dy; touch.strafe = dx; } else touch.turn = dx * 1.2;
  }
}
canvas.addEventListener("touchstart", (e) => {
  e.preventDefault();
  const r = canvas.getBoundingClientRect();
  for (const c of e.changedTouches) tstate.set(c.identifier, { x: c.clientX, y: c.clientY, x0: c.clientX, y0: c.clientY, left: c.clientX < r.left + r.width / 2 });
  touchUpdate();
}, { passive: false });
canvas.addEventListener("touchmove", (e) => {
  e.preventDefault();
  for (const c of e.changedTouches) { const s = tstate.get(c.identifier); if (s) { s.x = c.clientX; s.y = c.clientY; } }
  touchUpdate();
}, { passive: false });
const touchEnd = (e) => { for (const c of e.changedTouches) tstate.delete(c.identifier); touchUpdate(); };
canvas.addEventListener("touchend", touchEnd);
canvas.addEventListener("touchcancel", touchEnd);

$("start").addEventListener("click", start);
$("again").addEventListener("click", start);
$("speeds").textContent = "posted speeds: " + FOODS.slice().sort((a, b) => a.mph - b.mph).map((f) => `${f.e} ${f.mph.toFixed(1)}`).join(" · ") + " mph  (you: ~6 walking, ~10 sprinting)";
reset();
requestAnimationFrame(frame);
