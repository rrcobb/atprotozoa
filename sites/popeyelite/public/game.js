(() => {
  const cv = document.getElementById("c"), ctx = cv.getContext("2d"), W = cv.width, H = cv.height;
  const $ = id => document.getElementById(id);
  const SAVE = "popeyelite-save";
  let save = Object.assign({ bank: 0, dmg: 0, rate: 0, speed: 0, hp: 0, best: 0 }, JSON.parse(localStorage.getItem(SAVE) || "{}"));
  const UP = [
    ["dmg", "🔥 crispier crust", "+1 damage per shot", l => 10 + l * 8],
    ["rate", "⏱️ hot oil", "faster firing", l => 10 + l * 8],
    ["speed", "👟 non-slip shoes", "move faster", l => 8 + l * 6],
    ["hp", "🧤 oven mitts", "+1 max hp", l => 12 + l * 10],
  ];
  let me, foes, shots, gems, t, kills, over, running, mouse = null, keys = {}, last, raf, spawnT, shootT, earned;
  const rnd = (a, b) => a + Math.random() * (b - a);

  function persist() { localStorage.setItem(SAVE, JSON.stringify(save)); }
  function shopUI() {
    $("bank").textContent = save.bank;
    $("shop").innerHTML = UP.map(([k, n, d, cost]) => { const l = save[k]; const c = cost(l); return `<button type="button" data-k="${k}" ${save.bank < c ? "disabled" : ""}>${n} · lv ${l}<small>${d} — 🧈${c}</small></button>`; }).join("");
  }
  $("shop").addEventListener("click", e => {
    const b = e.target.closest("button[data-k]"); if (!b) return;
    const u = UP.find(x => x[0] === b.dataset.k), c = u[3](save[u[0]]);
    if (save.bank >= c) { save.bank -= c; save[u[0]]++; persist(); shopUI(); }
  });
  const maxHp = () => 3 + save.hp;
  function ui() { $("hp").textContent = "🍗".repeat(Math.max(me.hp, 0)); $("kills").textContent = kills; $("time").textContent = Math.max(0, Math.ceil(75 - t)); }
  function start() {
    me = { x: W / 2, y: H / 2, hp: maxHp(), inv: 0 }; foes = []; shots = []; gems = []; t = 0; kills = 0; over = false; running = true; spawnT = 0; shootT = 0; earned = 0;
    $("msg").textContent = "move with mouse / touch / WASD. your chicken fires on its own. survive 75 seconds.";
    $("go").disabled = true; last = performance.now(); cancelAnimationFrame(raf); raf = requestAnimationFrame(tick); ui();
  }
  function finish(won) {
    running = false; over = true; $("go").disabled = false; $("go").textContent = "another batch";
    earned = kills + (won ? 25 : 0); save.bank += earned; save.best = Math.max(save.best, kills); persist(); shopUI();
    $("msg").textContent = (won ? "you survived the shift! " : "shut down by the health department. ") + `${kills} kills → +${earned} 🧈 (best ${save.best}).`;
    setShare(`${won ? "Survived" : "Died with"} ${kills} kills in popeyelite 🍗 (best ${save.best}).`);
  }
  function tick(now) {
    const dt = Math.min((now - last) / 1000, 0.05); last = now;
    if (running) {
      t += dt;
      const sp = 170 + save.speed * 18;
      let dx = (keys.d || keys.ArrowRight ? 1 : 0) - (keys.a || keys.ArrowLeft ? 1 : 0), dy = (keys.s || keys.ArrowDown ? 1 : 0) - (keys.w || keys.ArrowUp ? 1 : 0);
      if (dx || dy) mouse = null;
      else if (mouse) { dx = mouse.x - me.x; dy = mouse.y - me.y; if (Math.hypot(dx, dy) < 8) dx = dy = 0; }
      const d = Math.hypot(dx, dy) || 1; if (dx || dy) { me.x += dx / d * sp * dt; me.y += dy / d * sp * dt; }
      me.x = Math.max(12, Math.min(W - 12, me.x)); me.y = Math.max(12, Math.min(H - 12, me.y)); me.inv -= dt;
      spawnT -= dt;
      if (spawnT <= 0) {
        spawnT = Math.max(0.12, 0.7 - t * 0.008);
        const a = Math.floor(Math.random() * 4);
        const f = { x: a === 0 ? -15 : a === 1 ? W + 15 : rnd(0, W), y: a === 2 ? -15 : a === 3 ? H + 15 : rnd(0, H), hp: 1 + Math.floor(t / 25), v: 55 + t * 0.5 + rnd(0, 25) };
        foes.push(f);
      }
      shootT -= dt;
      if (shootT <= 0 && foes.length) {
        shootT = 0.55 / (1 + save.rate * 0.18);
        let tg = foes[0], bd = 1e9; for (const f of foes) { const q = Math.hypot(f.x - me.x, f.y - me.y); if (q < bd) { bd = q; tg = f; } }
        const a = Math.atan2(tg.y - me.y, tg.x - me.x);
        shots.push({ x: me.x, y: me.y, vx: Math.cos(a) * 420, vy: Math.sin(a) * 420, life: 1.3 });
      }
      for (const s of shots) { s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt; }
      for (const f of foes) { const a = Math.atan2(me.y - f.y, me.x - f.x); f.x += Math.cos(a) * f.v * dt; f.y += Math.sin(a) * f.v * dt; }
      for (const s of shots) for (const f of foes) if (s.life > 0 && f.hp > 0 && Math.hypot(s.x - f.x, s.y - f.y) < 16) { f.hp -= 1 + save.dmg; s.life = 0; if (f.hp <= 0) kills++; }
      shots = shots.filter(s => s.life > 0); foes = foes.filter(f => f.hp > 0);
      for (const f of foes) if (me.inv <= 0 && Math.hypot(f.x - me.x, f.y - me.y) < 18) { me.hp--; me.inv = 1; f.hp = 0; }
      foes = foes.filter(f => f.hp > 0);
      ui();
      if (me.hp <= 0) finish(false); else if (t >= 75) finish(true);
    }
    draw(); raf = requestAnimationFrame(tick);
  }
  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.font = "22px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    if (!me) { ctx.fillText("🍗 press the button 🍗", W / 2, H / 2); return; }
    for (const s of shots) { ctx.fillText("🧈", s.x, s.y); }
    for (const f of foes) ctx.fillText("📋", f.x, f.y);
    ctx.globalAlpha = me.inv > 0 && Math.floor(me.inv * 10) % 2 ? 0.4 : 1;
    ctx.font = "30px sans-serif"; ctx.fillText("🍗", me.x, me.y); ctx.globalAlpha = 1;
  }
  function pos(ev) { const r = cv.getBoundingClientRect(); const p = ev.touches ? ev.touches[0] : ev; return { x: (p.clientX - r.left) * W / r.width, y: (p.clientY - r.top) * H / r.height }; }
  cv.addEventListener("mousemove", e => { mouse = pos(e); });
  cv.addEventListener("touchstart", e => { mouse = pos(e); e.preventDefault(); }, { passive: false });
  cv.addEventListener("touchmove", e => { mouse = pos(e); e.preventDefault(); }, { passive: false });
  addEventListener("keydown", e => { keys[e.key] = true; if (e.key.startsWith("Arrow")) e.preventDefault(); });
  addEventListener("keyup", e => { keys[e.key] = false; });
  $("go").addEventListener("click", start);
  shopUI(); draw(); raf = requestAnimationFrame(tick);
})();
