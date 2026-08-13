// sparkles.js — cursor-trail glitter effect shared by index.html and cat.html.
// Pure canvas, no image assets: each particle is a hand-drawn 4-point star.

export function initSparkles() {
  const canvas = document.getElementById("sparkles");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  let particles = [];
  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener("resize", resize);

  function spawn(x, y) {
    particles.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 1.2,
      vy: -Math.random() * 1.2 - 0.3,
      life: 1,
      size: Math.random() * 3 + 2,
      hue: Math.floor(Math.random() * 60) + 280,
    });
    if (particles.length > 120) particles.shift();
  }

  let last = { x: -100, y: -100 };
  window.addEventListener("pointermove", (e) => {
    const dx = e.clientX - last.x;
    const dy = e.clientY - last.y;
    if (dx * dx + dy * dy > 100) {
      spawn(e.clientX, e.clientY);
      last = { x: e.clientX, y: e.clientY };
    }
  });

  function tick() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles = particles.filter((p) => p.life > 0);
    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 0.02;
      ctx.save();
      ctx.globalAlpha = Math.max(p.life, 0);
      ctx.translate(p.x, p.y);
      ctx.rotate((p.life * 4) % (Math.PI * 2));
      ctx.fillStyle = `hsl(${p.hue}, 100%, 75%)`;
      const s = p.size;
      ctx.beginPath();
      ctx.moveTo(0, -s);
      ctx.lineTo(s * 0.3, -s * 0.3);
      ctx.lineTo(s, 0);
      ctx.lineTo(s * 0.3, s * 0.3);
      ctx.lineTo(0, s);
      ctx.lineTo(-s * 0.3, s * 0.3);
      ctx.lineTo(-s, 0);
      ctx.lineTo(-s * 0.3, -s * 0.3);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    requestAnimationFrame(tick);
  }
  tick();
}
