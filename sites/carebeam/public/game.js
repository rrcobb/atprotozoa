// carebeam — tiny canvas game. Everything runs in the browser; nothing is stored.
const cv = document.getElementById("c");
const ctx = cv.getContext("2d");
const W = cv.width, H = cv.height;
const $ = (id) => document.getElementById(id);

// Cartoon swearing only: grawlix, never real words.
const GRAWLIX = ["#@%&!", "$*&%@!", "!?#$%", "@#&!!", "%$#@*!", "&*#%?!"];
const MAX_MISSES = 5;

let s; // game state
let running = false, last = 0, keys = {}, targetX = null;

function reset() {
  s = { x: W / 2, hp: 0, shield: 0, triple: 0, merged: 0, misses: 0, rage: 0, hearts: 0, t: 0,
    beams: [], things: [], fireCd: 0, spawnCd: 0.6, rant: "", rantT: 0, shake: 0, combo: 0 };
}

function spawnThing() {
  const r = Math.random();
  const x = 24 + Math.random() * (W - 48);
  const speed = 55 + Math.min(s.t, 120) * 0.8; // difficulty ramps for ~2 minutes then holds
  if (r < 0.58) s.things.push({ k: "bug", x, y: 70, vy: speed, hp: 1 + (s.t > 40 && Math.random() < 0.3 ? 1 : 0) });
  else if (r < 0.84) s.things.push({ k: "rage", x: 60 + Math.random() * (W - 120), y: 70, vy: speed * 1.15, txt: GRAWLIX[(Math.random() * GRAWLIX.length) | 0] });
  else if (r < 0.93) s.things.push({ k: "heart", x, y: 70, vy: speed * 0.8 });
  else s.things.push({ k: "snack", x, y: 70, vy: speed * 0.8 });
}

function troll(msg) { s.rant = msg; s.rantT = 1.1; s.shake = 0.35; }

function update(dt) {
  s.t += dt;
  if (keys.ArrowLeft || keys.a) s.x -= 280 * dt;
  if (keys.ArrowRight || keys.d) s.x += 280 * dt;
  if (targetX != null) s.x += (targetX - s.x) * Math.min(1, dt * 14);
  s.x = Math.max(24, Math.min(W - 24, s.x));
  s.shield = Math.max(0, s.shield - dt);
  s.triple = Math.max(0, s.triple - dt);
  s.rantT -= dt; s.shake = Math.max(0, s.shake - dt);

  s.fireCd -= dt;
  if (s.fireCd <= 0) {
    s.fireCd = s.triple > 0 ? 0.16 : 0.28;
    const xs = s.triple > 0 ? [-14, 0, 14] : [0];
    for (const o of xs) s.beams.push({ x: s.x + o, y: H - 70 });
  }
  s.spawnCd -= dt;
  if (s.spawnCd <= 0) { spawnThing(); s.spawnCd = Math.max(0.35, 0.95 - s.t * 0.006); }

  for (const b of s.beams) b.y -= 480 * dt;
  s.beams = s.beams.filter((b) => b.y > 40);

  for (const th of s.things) {
    th.y += th.vy * dt;
    if (th.k === "rage") th.x += Math.sin(s.t * 3 + th.y * 0.05) * 30 * dt;
    // beams
    for (const b of s.beams) {
      if (b.dead || th.dead) continue;
      if (Math.abs(b.x - th.x) < 20 && Math.abs(b.y - th.y) < 22 && (th.k === "bug" || th.k === "rage")) {
        b.dead = true;
        if (th.k === "bug") {
          th.hp--;
          if (th.hp <= 0) {
            th.dead = true; s.merged++; s.combo++;
            // the non-zero-sum bit: every merge also winds the troll up
            s.rage += 1 + (s.combo >= 5 ? 1 : 0);
            if (s.merged % 4 === 0) troll(GRAWLIX[(Math.random() * GRAWLIX.length) | 0] + " ANOTHER ONE?!");
            s.pops = (s.pops || []).concat({ x: th.x, y: th.y, t: "merged ✓", life: 0.7 });
          }
        } else {
          th.dead = true; s.hearts++; s.rage += 2;
          s.pops = (s.pops || []).concat({ x: th.x, y: th.y, t: "💗", life: 0.7 });
          troll("…" + GRAWLIX[(Math.random() * GRAWLIX.length) | 0] + " HE MADE IT A HEART");
        }
      }
    }
    // reaching the player
    if (!th.dead && th.y > H - 70 && Math.abs(th.x - s.x) < 28) {
      th.dead = true;
      if (th.k === "heart") { s.shield = 8; s.hearts++; }
      else if (th.k === "snack") { s.triple = 8; }
      else if (th.k === "rage") {
        if (s.shield > 0) { s.hearts++; s.rage += 1; } else { s.combo = 0; s.misses++; s.shake = 0.3; }
      } else if (th.k === "bug") { s.combo = 0; s.misses++; s.shake = 0.3; }
    } else if (!th.dead && th.y > H - 24) {
      th.dead = true;
      if (th.k === "bug") { s.misses++; s.combo = 0; }
    }
  }
  s.things = s.things.filter((t) => !t.dead);
  s.beams = s.beams.filter((b) => !b.dead);
  s.pops = (s.pops || []).filter((p) => (p.life -= dt) > 0);
  if (s.misses >= MAX_MISSES) end();
}

function score() { return s.merged * 10 + s.hearts * 5 + s.rage * 2; }
function rank() {
  const n = s.merged;
  return n >= 60 ? "maintainer of the year" : n >= 35 ? "trusted committer" : n >= 15 ? "regular contributor" : n >= 5 ? "first-timer" : "drive-by";
}

function end() {
  running = false;
  $("endEmoji").textContent = s.rage >= 40 ? "🤬🏆" : "🏆";
  $("endText").textContent = `${s.merged} PRs merged, ${s.hearts} hearts made, troll rage ${s.rage}. Score ${score()} — ${rank()}. Nobody lost.`;
  const text = `I merged ${s.merged} PRs and the troll hit rage ${s.rage} (${rank()}, score ${score()}) in carebeam 🧸🌈`;
  $("shareLink").href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(text + "\nhttps://carebeam.bisks.net/");
  $("endPanel").hidden = false;
}

function draw() {
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  if (s.shake > 0) ctx.translate((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8);
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  // troll
  const rageLvl = Math.min(1, s.rage / 60);
  ctx.font = `${44 + rageLvl * 16}px serif`;
  ctx.fillText(rageLvl > 0.6 ? "🤬" : rageLvl > 0.25 ? "😡" : "😠", W / 2 + Math.sin(s.t * 30) * rageLvl * 5, 34);
  if (s.rantT > 0) {
    ctx.font = "bold 13px sans-serif"; ctx.fillStyle = "#ffd0d0";
    ctx.fillText(s.rant, W / 2, 72);
  }
  // beams
  for (const b of s.beams) {
    const g = ctx.createLinearGradient(0, b.y, 0, b.y + 22);
    g.addColorStop(0, "#ff8fc7"); g.addColorStop(0.5, "#ffe08f"); g.addColorStop(1, "#8ff0d0");
    ctx.fillStyle = g; ctx.fillRect(b.x - 3, b.y, 6, 22);
  }
  // things
  for (const th of s.things) {
    if (th.k === "rage") {
      ctx.font = "bold 18px monospace"; ctx.fillStyle = "#ff6b6b"; ctx.fillText(th.txt, th.x, th.y);
    } else {
      ctx.font = "28px serif";
      ctx.fillText(th.k === "bug" ? "🐛" : th.k === "heart" ? "💗" : "🍪", th.x, th.y);
    }
  }
  // player
  if (s.shield > 0) { ctx.strokeStyle = "rgba(255,143,199,.8)"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(s.x, H - 48, 32, 0, 7); ctx.stroke(); }
  ctx.font = "44px serif"; ctx.fillStyle = "#fff"; ctx.fillText("🧸", s.x, H - 48);
  ctx.font = "14px serif"; ctx.fillText("💗", s.x, H - 42);
  // pops
  ctx.font = "bold 13px sans-serif"; ctx.fillStyle = "#8ff0d0";
  for (const p of s.pops || []) ctx.fillText(p.t, p.x, p.y - (0.7 - p.life) * 40);
  // hud
  ctx.textAlign = "left"; ctx.font = "bold 13px sans-serif"; ctx.fillStyle = "#fff4fb";
  ctx.fillText(`merged ${s.merged}  💗 ${s.hearts}  score ${score()}`, 10, H - 10);
  ctx.textAlign = "right";
  ctx.fillText("🐛".repeat(Math.max(0, MAX_MISSES - s.misses)) + (s.shield > 0 ? " 🛡" : "") + (s.triple > 0 ? " 🍪" : ""), W - 10, H - 10);
  ctx.textAlign = "left"; ctx.fillStyle = "#ff8f8f"; ctx.fillText("rage " + s.rage, 10, 16);
  ctx.restore();
}

function loop(ts) {
  const dt = Math.min(0.05, (ts - last) / 1000 || 0);
  last = ts;
  if (running) update(dt);
  draw();
  requestAnimationFrame(loop);
}

function start() {
  reset(); running = true;
  $("startPanel").hidden = true; $("endPanel").hidden = true;
  troll("HEY! " + GRAWLIX[0]);
}

function pointerX(e) {
  const r = cv.getBoundingClientRect();
  targetX = ((e.clientX - r.left) / r.width) * W;
}
cv.addEventListener("pointermove", pointerX);
cv.addEventListener("pointerdown", pointerX);
cv.addEventListener("pointerleave", () => { targetX = null; });
addEventListener("keydown", (e) => { keys[e.key] = true; if (e.key.startsWith("Arrow")) e.preventDefault(); });
addEventListener("keyup", (e) => { keys[e.key] = false; });
$("startBtn").addEventListener("click", start);
$("againBtn").addEventListener("click", start);
reset();
requestAnimationFrame(loop);
