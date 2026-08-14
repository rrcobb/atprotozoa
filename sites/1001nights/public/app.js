// 1,001 nights — counter animation, a starfield/firework canvas, and a
// browsable carousel over real asks (public/data/tales.json, a snapshot of
// receipts' own archive). Everything client-side, no network calls.

const TOTAL_NIGHTS = 1001;

const els = {
  counter: document.getElementById("counter"),
  fill: document.getElementById("fill"),
  told: document.getElementById("told"),
  blank: document.getElementById("blank"),
  nightNum: document.getElementById("nightNum"),
  nightTitle: document.getElementById("nightTitle"),
  nightBody: document.getElementById("nightBody"),
  prev: document.getElementById("prev"),
  next: document.getElementById("next"),
  shuffle: document.getElementById("shuffle"),
  shareBluesky: document.getElementById("shareBluesky"),
};

// ---------- starfield + firework burst ----------
const sky = document.getElementById("sky");
const ctx = sky.getContext("2d");
let stars = [];
let bursts = [];
let W = 0, H = 0;

function resize() {
  W = sky.width = window.innerWidth;
  H = sky.height = window.innerHeight;
  stars = Array.from({ length: 140 }, () => ({
    x: Math.random() * W,
    y: Math.random() * H,
    r: Math.random() * 1.4 + 0.3,
    tw: Math.random() * Math.PI * 2,
    speed: Math.random() * 0.02 + 0.01,
  }));
}
window.addEventListener("resize", resize);
resize();

function spawnBurst(x, y, hue) {
  const n = 46;
  const particles = [];
  for (let i = 0; i < n; i++) {
    const angle = (Math.PI * 2 * i) / n + Math.random() * 0.2;
    const speed = 2.2 + Math.random() * 3.2;
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      hue: hue + Math.random() * 40 - 20,
    });
  }
  bursts.push(particles);
}

function tick() {
  ctx.clearRect(0, 0, W, H);

  ctx.fillStyle = "#f2c265";
  for (const s of stars) {
    s.tw += s.speed;
    const a = 0.35 + Math.sin(s.tw) * 0.35;
    ctx.globalAlpha = Math.max(0, a);
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  bursts = bursts.filter((particles) => {
    let alive = false;
    for (const p of particles) {
      if (p.life <= 0) continue;
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.045;
      p.vx *= 0.985;
      p.life -= 0.014;
      if (p.life > 0) {
        alive = true;
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = `hsl(${p.hue}, 90%, 68%)`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    return alive;
  });
  ctx.globalAlpha = 1;

  requestAnimationFrame(tick);
}
tick();

// ---------- counter, 0 -> 1001 with fireworks at the end ----------
function animateCounter() {
  const dur = 2200;
  const start = performance.now();
  function frame(now) {
    const t = Math.min(1, (now - start) / dur);
    const eased = 1 - Math.pow(1 - t, 3);
    const val = Math.round(eased * TOTAL_NIGHTS);
    els.counter.textContent = val.toLocaleString();
    if (t < 1) {
      requestAnimationFrame(frame);
    } else {
      celebrate();
    }
  }
  requestAnimationFrame(frame);
}

function celebrate() {
  const hues = [280, 45, 330, 260];
  let i = 0;
  const burstInterval = setInterval(() => {
    spawnBurst(
      W * (0.2 + Math.random() * 0.6),
      H * (0.15 + Math.random() * 0.35),
      hues[i % hues.length]
    );
    i++;
    if (i >= 6) clearInterval(burstInterval);
  }, 220);
}

setTimeout(animateCounter, 350);

// ---------- tales carousel ----------
let tales = [];
let order = [];
let idx = 0;

function nightNumberFor(i, count) {
  // Spread the real tales evenly across the 1..1001 range so the last one
  // told lands near the end of the story, not bunched at the start.
  if (count <= 1) return 1;
  return Math.max(1, Math.round(((i + 1) / count) * TOTAL_NIGHTS));
}

function renderNight() {
  if (!tales.length) {
    els.nightNum.textContent = `Night — of ${TOTAL_NIGHTS.toLocaleString()}`;
    els.nightTitle.textContent = "…";
    els.nightBody.innerHTML = '<div class="night-blank">This page has gone blank. Try again in a moment.</div>';
    return;
  }
  const t = tales[order[idx]];
  const night = nightNumberFor(order[idx], tales.length);
  els.nightNum.textContent = `Night ${night.toLocaleString()} of ${TOTAL_NIGHTS.toLocaleString()}`;
  els.nightTitle.textContent = t.name;
  const byLine = t.by ? `told for @${t.by}` : "";
  els.nightBody.innerHTML = `${escapeHtml(t.blurb || "")}${byLine ? `<span class="by">${escapeHtml(byLine)}</span>` : ""}`;
  updateShare(night, t);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function updateShare(night, t) {
  const text = `Night ${night} of 1,001: @buildthis.bisks.net built "${t.name}" — one of 417 real tales in the archive so far. https://1001nights.bisks.net/`;
  els.shareBluesky.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(text);
}

els.prev.addEventListener("click", () => {
  idx = (idx - 1 + order.length) % order.length;
  renderNight();
});
els.next.addEventListener("click", () => {
  idx = (idx + 1) % order.length;
  renderNight();
});
els.shuffle.addEventListener("click", () => {
  idx = Math.floor(Math.random() * order.length);
  renderNight();
});

fetch("/data/tales.json")
  .then((r) => r.json())
  .then((data) => {
    tales = data;
    order = tales.map((_, i) => i);
    // Fisher-Yates, so the opening tale isn't always "abstractodo".
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    idx = 0;
    els.told.textContent = tales.length.toLocaleString();
    els.blank.textContent = Math.max(0, TOTAL_NIGHTS - tales.length).toLocaleString();
    els.fill.style.width = `${Math.min(100, (tales.length / TOTAL_NIGHTS) * 100)}%`;
    renderNight();
  })
  .catch(() => {
    els.nightBody.innerHTML = '<div class="night-blank">The archive didn\'t open tonight. Try refreshing.</div>';
  });
