// Hopf fibers of S^3: (cos(e)e^{i(t+a)}, sin(e)e^{i(t+b)}), 5 tori x 14 fibers.
const TORI = 5, FIBERS = 14, STEPS = 90;
const curves = [];
for (let i = 0; i < TORI; i++) {
  const eta = (i + 0.5) / TORI * Math.PI / 2;
  for (let k = 0; k < FIBERS; k++) {
    const d = k / FIBERS * 2 * Math.PI + i * 0.3;
    const pts = [];
    for (let s = 0; s <= STEPS; s++) {
      const t = s / STEPS * 2 * Math.PI;
      pts.push([Math.cos(eta) * Math.cos(t), Math.cos(eta) * Math.sin(t),
                Math.sin(eta) * Math.cos(t + d), Math.sin(eta) * Math.sin(t + d)]);
    }
    curves.push({ pts, hue: 200 + i * 36 });
  }
}

function render(canvas, alpha, beta, tilt) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  const ca = Math.cos(alpha), sa = Math.sin(alpha), cb = Math.cos(beta), sb = Math.sin(beta);
  const ct = Math.cos(tilt), st = Math.sin(tilt);
  const scale = W * 0.32;
  ctx.lineWidth = Math.max(1, W / 240);
  ctx.lineCap = 'round';
  for (const c of curves) {
    let prev = null;
    for (const p of c.pts) {
      let [x, y, z, w] = p;
      // 4D rotations: x-w by alpha, then y-w by beta
      let x2 = x * ca - w * sa, w2 = x * sa + w * ca;
      let y2 = y * cb - w2 * sb, w3 = y * sb + w2 * cb;
      // 4D -> 3D perspective from w
      const f = 2.4 / (2.4 - w3);
      let X = x2 * f, Y = y2 * f, Z = z * f;
      // fixed 3D tilt about x, then 3D -> 2D perspective
      const Yt = Y * ct - Z * st, Zt = Y * st + Z * ct;
      const g = 4 / (4 - Zt);
      const px = W / 2 + X * g * scale, py = H / 2 + Yt * g * scale;
      if (prev) {
        const u = (w3 + 1) / 2;
        ctx.strokeStyle = `hsla(${c.hue + u * 90},85%,${35 + u * 40}%,${0.25 + u * 0.6})`;
        ctx.beginPath(); ctx.moveTo(prev[0], prev[1]); ctx.lineTo(px, py); ctx.stroke();
      }
      prev = [px, py];
    }
  }
}

const grid = document.getElementById('grid');
const nIn = document.getElementById('n'), nv = document.getElementById('nv');
const spinBtn = document.getElementById('spin');
const big = document.getElementById('big'), bigc = document.getElementById('bigc'), bigcap = document.getElementById('bigcap');
let N = 3, cells = [], spinning = true, phase = 0, zoom = null, last = performance.now();

function build() {
  grid.innerHTML = ''; cells = [];
  grid.style.gridTemplateColumns = `repeat(${N},1fr)`;
  const px = N > 5 ? 220 : 360;
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = px;
    cv.title = `x–w ${Math.round(c / N * 360)}°, y–w ${Math.round(r / N * 360)}°`;
    cv.addEventListener('click', () => { zoom = { r, c }; big.hidden = false; draw(); });
    grid.appendChild(cv);
    cells.push({ cv, r, c });
  }
}
function angles(r, c) {
  return [c / N * 2 * Math.PI + phase, r / N * 2 * Math.PI + phase * 0.6];
}
function draw() {
  for (const { cv, r, c } of cells) { const [a, b] = angles(r, c); render(cv, a, b, 0.5); }
  if (zoom) {
    const [a, b] = angles(zoom.r, zoom.c);
    render(bigc, a, b, 0.5);
    bigcap.textContent = `x–w ${Math.round(((a % 6.2832) + 6.2832) % 6.2832 * 180 / Math.PI)}° · y–w ${Math.round(((b % 6.2832) + 6.2832) % 6.2832 * 180 / Math.PI)}° — click to close`;
  }
}
function frame(now) {
  if (spinning) { phase += (now - last) / 1000 * 0.25; draw(); }
  last = now; requestAnimationFrame(frame);
}
nIn.addEventListener('input', () => { N = +nIn.value; nv.textContent = N; build(); draw(); });
spinBtn.addEventListener('click', () => { spinning = !spinning; spinBtn.textContent = spinning ? 'pause' : 'spin'; });
big.addEventListener('click', () => { zoom = null; big.hidden = true; });
document.getElementById('share').addEventListener('click', () => {
  const text = `every angle of a sphere, including the fourth dimension (${N}×${N}) https://hypersphere.bisks.net/`;
  window.open('https://bsky.app/intent/compose?text=' + encodeURIComponent(text), '_blank', 'noopener');
});
build(); draw(); requestAnimationFrame(frame);
