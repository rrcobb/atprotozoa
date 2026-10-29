// Scary maze game. Corridors are polylines with a width; a point is "safe"
// when it's within width/2 of any segment. Level 3 has a hidden trigger near
// the end that fires the jumpscare.

const W = 720, H = 480;
const LEVELS = [
  { width: 70, pts: [[60, 80], [360, 80], [360, 240], [120, 240], [120, 400], [640, 400]] },
  { width: 44, pts: [[60, 60], [600, 60], [600, 200], [100, 200], [100, 330], [600, 330], [600, 420], [660, 420]] },
  { width: 30, pts: [[50, 50], [660, 50], [660, 160], [60, 160], [60, 270], [660, 270], [660, 370], [200, 370], [200, 430], [660, 430]] },
];

const $ = (id) => document.getElementById(id);
const cv = $("maze"), ctx = cv.getContext("2d");
const msg = $("msg");
let level = 0, state = "idle"; // idle (waiting for start) | playing | scared | done
let scareFired = false;

function segDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}
function onPath(p, L) {
  for (let i = 0; i < L.pts.length - 1; i++) if (segDist(p, L.pts[i], L.pts[i + 1]) <= L.width / 2) return true;
  return false;
}

function draw() {
  const L = LEVELS[level];
  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#1b1b3a"; ctx.fillRect(0, 0, W, H); // walls
  ctx.lineCap = "square"; ctx.lineJoin = "miter";
  ctx.strokeStyle = "#e8e8ff"; ctx.lineWidth = L.width;
  ctx.beginPath(); L.pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke();
  const s = Math.min(L.width - 6, 34), a = L.pts[0], b = L.pts[L.pts.length - 1];
  ctx.fillStyle = "#2c2"; ctx.fillRect(a[0] - s / 2, a[1] - s / 2, s, s);
  ctx.fillStyle = "#d22"; ctx.fillRect(b[0] - s / 2, b[1] - s / 2, s, s);
}

function setLevel(n) {
  level = n; state = "idle"; draw();
  msg.textContent = `level ${n + 1} — move onto the green square to begin.`;
}

function toLocal(e) {
  const r = cv.getBoundingClientRect();
  return [(e.clientX - r.left) * (W / r.width), (e.clientY - r.top) * (H / r.height)];
}

function fail() {
  setLevel(level);
  msg.textContent = `touched a wall! level ${level + 1} — back onto the green square.`;
}

cv.addEventListener("pointermove", (e) => {
  if (state === "scared" || state === "done") return;
  const p = toLocal(e), L = LEVELS[level];
  const a = L.pts[0], b = L.pts[L.pts.length - 1];
  const s = Math.min(L.width - 6, 34) / 2;
  if (state === "idle") {
    if (Math.abs(p[0] - a[0]) <= s && Math.abs(p[1] - a[1]) <= s) {
      state = "playing"; msg.textContent = `level ${level + 1} — go!`;
    }
    return;
  }
  if (!onPath(p, L)) return fail();
  if (Math.abs(p[0] - b[0]) <= s && Math.abs(p[1] - b[1]) <= s) return win();
  // Trigger: partway down the last corridor of the final level.
  if (level === 2 && !scareFired && p[0] > 400 && p[1] > 400 && !$("chicken").checked) {
    scareFired = true; scare();
  }
});
cv.addEventListener("pointerleave", () => {
  if (state === "playing") fail();
});

function win() {
  if (level < LEVELS.length - 1) {
    setLevel(level + 1);
    msg.textContent = `cleared! level ${level + 1} — move onto the green square to begin.`;
  } else {
    state = "done";
    msg.textContent = $("chicken").checked ? "you made it through. chicken mode, but still." : "you made it through. are you okay?";
    const text = $("chicken").checked ? "I beat the scary maze game (chicken mode)" : "I beat the scary maze game and survived the jumpscare";
    $("share").href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(text + " https://scarymaze.bisks.net/");
    $("after").hidden = false;
  }
}

// ---------- the scare ----------
let actx = null;
function scream() {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const t = actx.currentTime, g = actx.createGain();
    g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 1.8);
    const comp = actx.createDynamicsCompressor();
    g.connect(comp); comp.connect(actx.destination);
    for (const f of [520, 783, 1180]) {
      const o = actx.createOscillator();
      o.type = "sawtooth"; o.frequency.setValueAtTime(f, t);
      o.frequency.linearRampToValueAtTime(f * 1.5, t + 0.4);
      o.frequency.linearRampToValueAtTime(f * 0.8, t + 1.8);
      o.connect(g); o.start(t); o.stop(t + 1.8);
    }
    const n = actx.createBuffer(1, actx.sampleRate * 1.8, actx.sampleRate), d = n.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = actx.createBufferSource(); src.buffer = n; src.connect(g); src.start(t);
  } catch {}
}

function face(c, w, h, k) {
  const cx = w / 2 + (Math.random() - .5) * 30, cy = h / 2 + (Math.random() - .5) * 30, r = Math.min(w, h) * (.55 + k * .15);
  c.fillStyle = k % 2 ? "#300" : "#000"; c.fillRect(0, 0, w, h);
  c.fillStyle = "#d9d9c8";
  c.beginPath(); c.ellipse(cx, cy, r * .62, r * .85, 0, 0, 7); c.fill();
  c.fillStyle = "#000";
  for (const s of [-1, 1]) { c.beginPath(); c.ellipse(cx + s * r * .27, cy - r * .2, r * .17, r * .24, s * .2, 0, 7); c.fill(); }
  c.fillStyle = "#f00";
  for (const s of [-1, 1]) { c.beginPath(); c.arc(cx + s * r * .27, cy - r * .2, r * .04, 0, 7); c.fill(); }
  c.beginPath(); c.ellipse(cx, cy + r * .1, r * .05, r * .09, 0, 0, 7); c.fillStyle = "#000"; c.fill();
  c.beginPath(); c.ellipse(cx, cy + r * .45, r * .26, r * .3 + k * 8, 0, 0, 7); c.fill();
  c.strokeStyle = "#d9d9c8"; c.lineWidth = r * .02;
  for (let i = -4; i <= 4; i++) { c.beginPath(); c.moveTo(cx + i * r * .05, cy + r * .2); c.lineTo(cx + i * r * .05, cy + r * .28); c.stroke(); }
}

function scare() {
  state = "scared";
  const ov = $("scare"), sc = $("scarecv");
  sc.width = innerWidth; sc.height = innerHeight; ov.hidden = false;
  const c = sc.getContext("2d");
  scream();
  let k = 0;
  const iv = setInterval(() => face(c, sc.width, sc.height, k++), 70);
  setTimeout(() => {
    clearInterval(iv); ov.hidden = true;
    msg.textContent = "…you can keep going. it's right there.";
    state = "playing"; // resume: the red square is still a few steps away
  }, 2200);
}

$("restart").addEventListener("click", () => {
  scareFired = false; $("after").hidden = true; setLevel(0);
});

setLevel(0);
