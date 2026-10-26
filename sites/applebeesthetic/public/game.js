(() => {
  const cv = document.getElementById("c"), ctx = cv.getContext("2d"), W = cv.width, H = cv.height;
  const $ = id => document.getElementById(id);
  const GOOD = ["🍤", "🧀", "🍟", "🥟", "🍗", "🥗", "🍹"], BAD = "🥀";
  let tray, drops, score, combo, lives, over, spawnT, t, mouseX = null, keys = {}, last, raf, best = +localStorage.getItem("applebeesthetic-best") || 0;
  function init() {
    tray = { x: W / 2, w: 90 }; drops = []; score = 0; combo = 1; lives = 3; over = false; spawnT = 0; t = 0;
    $("msg").textContent = "move the mouse / touch / ←→ to slide the tray. catch the good stuff; let 🥀 fall.";
    cancelAnimationFrame(raf); last = performance.now(); raf = requestAnimationFrame(tick); ui();
  }
  function ui() { $("score").textContent = score; $("combo").textContent = combo; $("lives").textContent = "💖".repeat(lives); $("best").textContent = best; }
  function tick(now) {
    const dt = Math.min((now - last) / 1000, 0.05); last = now;
    if (!over) {
      t += dt;
      const k = (keys.ArrowRight ? 1 : 0) - (keys.ArrowLeft ? 1 : 0);
      if (k) { tray.x += k * 460 * dt; mouseX = null; } else if (mouseX != null) tray.x += (mouseX - tray.x) * Math.min(1, dt * 14);
      tray.x = Math.max(tray.w / 2, Math.min(W - tray.w / 2, tray.x));
      spawnT -= dt;
      if (spawnT <= 0) { spawnT = Math.max(0.28, 0.9 - t * 0.012); const bad = Math.random() < 0.18; drops.push({ x: 20 + Math.random() * (W - 40), y: -20, v: 130 + t * 3 + Math.random() * 60, e: bad ? BAD : GOOD[Math.floor(Math.random() * GOOD.length)], bad }); }
      for (const d of drops) d.y += d.v * dt;
      const ty = H - 50;
      drops = drops.filter(d => {
        if (d.y > ty - 14 && d.y < ty + 14 && Math.abs(d.x - tray.x) < tray.w / 2 + 10) {
          if (d.bad) { lives--; combo = 1; $("msg").textContent = "wilted. the manager is looking."; }
          else { score += 2 * combo; combo = Math.min(combo + 1, 20); if (combo % 2 === 0) $("msg").textContent = `2 for $20! combo ×${combo}`; }
          ui(); return false;
        }
        if (d.y > H + 10) { if (!d.bad) { combo = 1; ui(); } return false; }
        return true;
      });
      if (lives <= 0) {
        over = true; if (score > best) { best = score; localStorage.setItem("applebeesthetic-best", best); }
        $("msg").textContent = `tab closed at $${score}. thanks for dining in the neighborhood.`;
        setShare(`eat good in the neighborhood 🍎 I ran up a $${score} tab in applebeesthetic.`); ui();
      }
    }
    draw(); raf = requestAnimationFrame(tick);
  }
  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(0,229,255,.35)"; ctx.lineWidth = 1;
    for (let y = H * 0.55; y < H; y += 28) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    for (let x = -W; x < 2 * W; x += 60) { ctx.beginPath(); ctx.moveTo(W / 2 + (x - W / 2) * 0.1, H * 0.55); ctx.lineTo(x, H); ctx.stroke(); }
    ctx.fillStyle = "#ffe14d"; ctx.beginPath(); ctx.arc(W / 2, H * 0.4, 70, 0, 7); ctx.fill();
    ctx.font = "30px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (const d of drops) ctx.fillText(d.e, d.x, d.y);
    ctx.fillStyle = "#e5195b"; ctx.shadowColor = "#ff2f92"; ctx.shadowBlur = 14;
    ctx.fillRect(tray.x - tray.w / 2, H - 42, tray.w, 12); ctx.shadowBlur = 0;
    ctx.fillText("🍎", tray.x, H - 54);
  }
  function pos(ev) { const r = cv.getBoundingClientRect(); const p = ev.touches ? ev.touches[0] : ev; return (p.clientX - r.left) * W / r.width; }
  cv.addEventListener("mousemove", e => { mouseX = pos(e); });
  cv.addEventListener("touchstart", e => { mouseX = pos(e); e.preventDefault(); }, { passive: false });
  cv.addEventListener("touchmove", e => { mouseX = pos(e); e.preventDefault(); }, { passive: false });
  addEventListener("keydown", e => { keys[e.key] = true; if (e.key.startsWith("Arrow")) e.preventDefault(); });
  addEventListener("keyup", e => { keys[e.key] = false; });
  $("restart").addEventListener("click", init);
  init();
})();
