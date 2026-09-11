// victorylap — the whole lap, the scoreboard, and the share card, client-side.

const SITE_URL = "https://victorylap.bisks.net";

const canvas = document.getElementById("trackCanvas");
const ctx = canvas.getContext("2d");
const W = canvas.width, H = canvas.height;

const TRACK = { cx: W / 2, cy: H / 2, rx: W * 0.4, ry: H * 0.34 };
const CUT_AT = 0.58; // fraction of the real lap the runner actually bothers to run

function pointOnTrack(t) {
  // t in [0, 1), start at the top (finish line), running clockwise.
  const angle = -Math.PI / 2 + t * Math.PI * 2;
  return {
    x: TRACK.cx + TRACK.rx * Math.cos(angle),
    y: TRACK.cy + TRACK.ry * Math.sin(angle),
  };
}

function lerp(a, b, t) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

// progress in [0,1] over the whole animation -> actual runner position,
// cutting straight across the infield after CUT_AT instead of finishing the oval.
function runnerPosition(progress) {
  if (progress <= CUT_AT) {
    return pointOnTrack((progress / CUT_AT) * CUT_AT);
  }
  const shortcutT = (progress - CUT_AT) / (1 - CUT_AT);
  return lerp(pointOnTrack(CUT_AT), pointOnTrack(0), shortcutT);
}

function drawTrack(runnerT, confetti) {
  ctx.clearRect(0, 0, W, H);

  // field
  ctx.fillStyle = "#152318";
  ctx.fillRect(0, 0, W, H);

  // track (dashed = the part of the lap nobody ran)
  ctx.lineWidth = 22;
  ctx.strokeStyle = "#24402f";
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.ellipse(TRACK.cx, TRACK.cy, TRACK.rx, TRACK.ry, 0, 0, Math.PI * 2);
  ctx.stroke();

  const ranEnd = -Math.PI / 2 + Math.min(runnerT, CUT_AT) * Math.PI * 2;
  ctx.lineWidth = 22;
  ctx.strokeStyle = "#3a6b4c";
  ctx.beginPath();
  ctx.ellipse(TRACK.cx, TRACK.cy, TRACK.rx, TRACK.ry, 0, -Math.PI / 2, ranEnd);
  ctx.stroke();

  if (runnerT > CUT_AT) {
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#ff6b6b";
    ctx.setLineDash([6, 8]);
    const cut = pointOnTrack(CUT_AT);
    const finish = pointOnTrack(0);
    ctx.beginPath();
    ctx.moveTo(cut.x, cut.y);
    ctx.lineTo(finish.x, finish.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // finish line
  const finish = pointOnTrack(0);
  ctx.fillStyle = "#ecfff2";
  ctx.fillRect(finish.x - 12, finish.y - 11, 24, 22);
  ctx.fillStyle = "#0d1410";
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      if ((i + j) % 2 === 0) ctx.fillRect(finish.x - 12 + i * 6, finish.y - 11 + j * 5.5, 6, 5.5);
    }
  }

  // runner
  const pos = runnerPosition(runnerT);
  ctx.font = "34px serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(runnerT >= 1 ? "🙌" : "🏃", pos.x, pos.y - 6);

  // confetti
  if (confetti) {
    for (const p of confetti) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      ctx.restore();
    }
  }
}

drawTrack(0, null);

const CONFETTI_COLORS = ["#ffcf4d", "#4dffb0", "#ff6b6b", "#ecfff2", "#4da6ff"];

function makeConfetti() {
  const finish = pointOnTrack(0);
  const particles = [];
  for (let i = 0; i < 70; i++) {
    particles.push({
      x: finish.x + (Math.random() - 0.5) * 60,
      y: finish.y,
      vx: (Math.random() - 0.5) * 4,
      vy: -Math.random() * 6 - 2,
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.3,
      size: 5 + Math.random() * 5,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
    });
  }
  return particles;
}

function stepConfetti(particles) {
  for (const p of particles) {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.22;
    p.rot += p.vr;
  }
  return particles.filter((p) => p.y < H + 20);
}

let currentClaim = "";
let currentStats = null;
let timerInterval = null;
let lapStart = 0;

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function rollStats() {
  return {
    confidence: 100 + Math.floor(Math.random() * 300),
    evidence: 0,
    lapTime: (0.2 + Math.random() * 1.3).toFixed(1),
    witnesses: Math.floor(Math.random() * 3),
    verdict: pick([
      "pending, indefinitely",
      "not yet contested",
      "under advisement forever",
      "too soon to say, celebrating anyway",
    ]),
  };
}

function esc(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

function renderStats(stats) {
  const el = document.getElementById("stats");
  el.innerHTML = `
    <div class="stat good"><div class="label">confidence</div><div class="value">${stats.confidence}%</div></div>
    <div class="stat bad"><div class="label">evidence</div><div class="value">${stats.evidence}%</div></div>
    <div class="stat"><div class="label">lap time</div><div class="value">${stats.lapTime}s*</div></div>
    <div class="stat"><div class="label">witnesses</div><div class="value">${stats.witnesses}, unreliable</div></div>
  `;
}

function startTimer() {
  lapStart = performance.now();
  clearInterval(timerInterval);
  const line = document.getElementById("timer-line");
  timerInterval = setInterval(() => {
    const secs = Math.floor((performance.now() - lapStart) / 1000);
    const mm = String(Math.floor(secs / 60)).padStart(2, "0");
    const ss = String(secs % 60).padStart(2, "0");
    line.textContent = `unchallenged for ${mm}:${ss} and counting. *lap time reflects the shortcut, not a real lap.`;
  }, 1000);
}

function buildShareText() {
  const s = currentStats;
  const text = `just took a premature victory lap over: "${currentClaim}". confidence ${s.confidence}%, evidence ${s.evidence}%, lap time ${s.lapTime}s (shortcut taken). do it before you've earned it: ${SITE_URL}`;
  return text;
}

function runLap(claim) {
  currentClaim = claim || "this";
  document.getElementById("lap-btn").disabled = true;
  document.getElementById("claim-input").disabled = true;
  document.getElementById("result").style.display = "none";

  const duration = 1900;
  const start = performance.now();
  let confetti = null;

  function frame(now) {
    const t = Math.min((now - start) / duration, 1);
    if (t >= 1 && !confetti) confetti = makeConfetti();
    if (confetti) confetti = stepConfetti(confetti);
    drawTrack(t, confetti);

    if (t < 1 || (confetti && confetti.length > 0)) {
      requestAnimationFrame(frame);
    } else {
      finishLap();
    }
  }
  requestAnimationFrame(frame);
}

function finishLap() {
  currentStats = rollStats();
  document.getElementById("claim-out").textContent = `"${currentClaim}"`;
  renderStats(currentStats);
  document.getElementById("result").style.display = "block";
  document.getElementById("lap-btn").disabled = false;
  document.getElementById("claim-input").disabled = false;
  document.getElementById("lap-btn").textContent = "lap again";
  startTimer();

  document.getElementById("share-bsky").href =
    "https://bsky.app/intent/compose?text=" + encodeURIComponent(buildShareText());
}

function canShareFiles() {
  if (!navigator.share || !navigator.canShare) return false;
  try {
    const probe = new File([""], "probe.png", { type: "image/png" });
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

function wrapText(c, text, x, y, maxWidth, lineHeight) {
  const words = text.split(" ");
  let line = "";
  let cy = y;
  for (const word of words) {
    const test = line + word + " ";
    if (c.measureText(test).width > maxWidth && line) {
      c.fillText(line, x, cy);
      line = word + " ";
      cy += lineHeight;
    } else {
      line = test;
    }
  }
  c.fillText(line, x, cy);
  return cy;
}

function buildShareCard(cb) {
  const canvas = document.getElementById("shareCanvas");
  const c = canvas.getContext("2d");
  const cw = canvas.width, ch = canvas.height;

  const grad = c.createRadialGradient(cw * 0.7, 0, 0, cw * 0.7, 0, ch);
  grad.addColorStop(0, "#1c3226");
  grad.addColorStop(1, "#0d1410");
  c.fillStyle = grad;
  c.fillRect(0, 0, cw, ch);

  c.textAlign = "left";
  c.fillStyle = "#ecfff2";
  c.font = "800 52px monospace";
  c.fillText("PREMATURE VICTORY LAP", 56, 100);

  c.fillStyle = "#8fae9c";
  c.font = "600 20px monospace";
  c.fillText("declared victory over:", 56, 150);

  c.fillStyle = "#4dffb0";
  c.font = "700 30px monospace";
  wrapText(c, `"${currentClaim}"`, 56, 200, 1080, 38);

  const s = currentStats;
  c.fillStyle = "#ffcf4d";
  c.font = "700 26px monospace";
  c.fillText(`confidence ${s.confidence}%`, 56, 330);
  c.fillStyle = "#ff6b6b";
  c.fillText(`evidence ${s.evidence}%`, 420, 330);
  c.fillStyle = "#ecfff2";
  c.font = "600 22px monospace";
  c.fillText(`lap time ${s.lapTime}s (shortcut taken)`, 56, 375);
  c.fillText(`verdict: ${s.verdict}`, 56, 410);

  c.fillStyle = "#4dffb0";
  c.font = "700 26px monospace";
  c.fillText("victorylap.bisks.net", 56, ch - 46);

  canvas.toBlob((blob) => cb(blob), "image/png");
}

document.getElementById("lap-btn").addEventListener("click", () => {
  const claim = document.getElementById("claim-input").value.trim();
  runLap(claim);
});

document.getElementById("claim-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.getElementById("lap-btn").click();
});

document.getElementById("again-btn").addEventListener("click", () => {
  runLap(document.getElementById("claim-input").value.trim() || currentClaim);
});

document.getElementById("share-card-btn").addEventListener("click", () => {
  buildShareCard(async (blob) => {
    if (!blob) return;
    const file = new File([blob], "victorylap.png", { type: "image/png" });
    if (canShareFiles()) {
      try {
        await navigator.share({ files: [file], text: buildShareText(), title: "victorylap" });
        return;
      } catch {
        // fall through to download
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "victorylap.png";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  });
});
