(() => {
  const cv = document.getElementById("c"), ctx = cv.getContext("2d"), S = 640, N = 25;
  const $ = id => document.getElementById(id);
  let ents, steaks, fence, over, mouse = null, keys = {}, placing, best = +localStorage.getItem("corral-best") || 0, raf;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const rad = m => 8 + Math.sqrt(m) * 4;
  function init() {
    cancelAnimationFrame(raf);
    ents = Array.from({ length: N }, (_, i) => ({ me: i === 0, x: i === 0 ? S / 2 : rnd(40, S - 40), y: i === 0 ? S / 2 : rnd(40, S - 40), m: 1, tx: rnd(0, S), ty: rnd(0, S), hue: rnd(0, 360), alive: true }));
    steaks = Array.from({ length: 40 }, () => ({ x: rnd(20, S - 20), y: rnd(20, S - 20) }));
    fence = S * 0.72; over = false; placing = 0;
    $("msg").textContent = "move with the mouse / touch (or WASD). touch a smaller rancher to eat them; steaks 🥩 make you bigger. stay inside the fence.";
    last = performance.now(); raf = requestAnimationFrame(tick);
  }
  let last = 0;
  function die(e, why) {
    e.alive = false;
    if (e.me) {
      const left = ents.filter(x => x.alive).length;
      finish(left + 1, why);
    }
  }
  function finish(place, why) {
    over = true; placing = place;
    if (!best || place < best) { best = place; localStorage.setItem("corral-best", best); }
    $("msg").textContent = place === 1 ? "🏆 last rancher standing! yeehaw." : `${why} you placed #${place} of ${N}.`;
    setShare(place === 1 ? `I won corral royale 🤠 last rancher standing out of ${N}.` : `I placed #${place} of ${N} in corral royale 🤠`);
  }
  function tick(t) {
    const dt = Math.min((t - last) / 1000, 0.05); last = t;
    const cx = S / 2, cy = S / 2;
    fence = Math.max(70, fence - dt * 7.5);
    for (const e of ents) {
      if (!e.alive) continue;
      const sp = 150 / Math.sqrt(e.m + 1.5) + 40;
      let dx = 0, dy = 0;
      if (e.me) {
        if (mouse) { dx = mouse.x - e.x; dy = mouse.y - e.y; const d = Math.hypot(dx, dy); if (d < 6) dx = dy = 0; }
        const kx = (keys.d || keys.ArrowRight ? 1 : 0) - (keys.a || keys.ArrowLeft ? 1 : 0);
        const ky = (keys.s || keys.ArrowDown ? 1 : 0) - (keys.w || keys.ArrowUp ? 1 : 0);
        if (kx || ky) { dx = kx; dy = ky; mouse = null; }
      } else {
        // bots: flee bigger neighbours, chase smaller ones, else wander toward steaks / away from fence
        let best = null, bd = 1e9, flee = null, fd = 160;
        for (const o of ents) { if (o === e || !o.alive) continue; const d = Math.hypot(o.x - e.x, o.y - e.y); if (o.m > e.m * 1.1 && d < fd) { fd = d; flee = o; } else if (e.m > o.m * 1.1 && d < 220 && d < bd) { bd = d; best = o; } }
        if (flee) { dx = e.x - flee.x; dy = e.y - flee.y; }
        else if (best) { dx = best.x - e.x; dy = best.y - e.y; }
        else {
          if (Math.hypot(e.tx - e.x, e.ty - e.y) < 15 || Math.random() < 0.005) {
            const s = steaks[Math.floor(Math.random() * steaks.length)];
            e.tx = s ? s.x : rnd(0, S); e.ty = s ? s.y : rnd(0, S);
          }
          dx = e.tx - e.x; dy = e.ty - e.y;
        }
        if (Math.hypot(e.x - cx, e.y - cy) > fence - 40) { dx = cx - e.x; dy = cy - e.y; }
      }
      const d = Math.hypot(dx, dy) || 1;
      e.x += dx / d * sp * dt * (dx || dy ? 1 : 0); e.y += dy / d * sp * dt * (dx || dy ? 1 : 0);
      e.x = Math.min(S, Math.max(0, e.x)); e.y = Math.min(S, Math.max(0, e.y));
      // eat steak
      for (let i = steaks.length - 1; i >= 0; i--) if (Math.hypot(steaks[i].x - e.x, steaks[i].y - e.y) < rad(e.m) + 6) { steaks.splice(i, 1); e.m += 0.6; }
      // fence burns
      if (Math.hypot(e.x - cx, e.y - cy) > fence) { e.m -= dt * 1.6; if (e.m < 0.3) die(e, "the fence got you."); }
    }
    // eating
    for (const a of ents) for (const b of ents) {
      if (a === b || !a.alive || !b.alive) continue;
      if (a.m > b.m * 1.1 && Math.hypot(a.x - b.x, a.y - b.y) < rad(a.m) - rad(b.m) * 0.3) { a.m += b.m * 0.7; die(b, "you got eaten."); }
    }
    // steaks respawn slowly inside the fence
    if (steaks.length < 40 && Math.random() < dt * 3) { const a = rnd(0, 6.283), r = Math.sqrt(Math.random()) * (fence - 10); steaks.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r }); }
    const alive = ents.filter(e => e.alive);
    if (!over && alive.length === 1 && alive[0].me) finish(1);
    if (!over && !ents[0].alive) { /* handled in die() */ }
    // a spectator keeps watching until the end
    $("alive").textContent = alive.length; $("size").textContent = ents[0].alive ? ents[0].m.toFixed(1) : "0"; $("best").textContent = best || "-";
    draw();
    if (!(over && alive.length <= 1)) raf = requestAnimationFrame(tick);
  }
  function draw() {
    ctx.fillStyle = "#3d2a14"; ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = "#b8924f"; ctx.beginPath(); ctx.arc(S / 2, S / 2, fence, 0, 7); ctx.fill();
    ctx.strokeStyle = "#5a2f10"; ctx.lineWidth = 6; ctx.setLineDash([10, 6]); ctx.stroke(); ctx.setLineDash([]);
    ctx.font = "16px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (const s of steaks) ctx.fillText("🥩", s.x, s.y);
    for (const e of ents) {
      if (!e.alive) continue;
      const r = rad(e.m);
      ctx.fillStyle = e.me ? "#d94a1e" : `hsl(${e.hue} 45% 45%)`;
      ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, 7); ctx.fill();
      if (e.me) { ctx.strokeStyle = "#fff"; ctx.lineWidth = 3; ctx.stroke(); }
      ctx.font = `${Math.round(r * 1.1)}px sans-serif`; ctx.fillText("🤠", e.x, e.y + 1);
    }
  }
  function pos(ev) { const r = cv.getBoundingClientRect(); const p = ev.touches ? ev.touches[0] : ev; return { x: (p.clientX - r.left) * S / r.width, y: (p.clientY - r.top) * S / r.height }; }
  cv.addEventListener("mousemove", e => { mouse = pos(e); });
  cv.addEventListener("touchstart", e => { mouse = pos(e); e.preventDefault(); }, { passive: false });
  cv.addEventListener("touchmove", e => { mouse = pos(e); e.preventDefault(); }, { passive: false });
  addEventListener("keydown", e => { keys[e.key] = true; if (e.key.startsWith("Arrow")) e.preventDefault(); });
  addEventListener("keyup", e => { keys[e.key] = false; });
  $("restart").addEventListener("click", init);
  init();
})();
