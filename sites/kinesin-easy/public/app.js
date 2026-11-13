// kinesin-easy — the kinesin game with one control. Hold → (or D / Space, or
// the on-screen button) and the motor walks hand-over-hand by itself; let go
// and it rests. Same goal as sites/kinesin: walk as far along the microtubule
// as you can before you detach.
//
// The physics (PHYS, motorTick, headKinematics) is copied from sites/kinesin
// unchanged. What replaced the four Q/W/O/P keys is GAIT: a small state machine
// that emits the same four "held" flags a player would have pressed, so each
// head still swings and locks through the real model. Detaching comes from ATP
// fuel: walking burns it (faster the farther you've gone), resting refuels it,
// and an empty tank lets go of the lattice. No sign-in or leaderboard here —
// the records on sites/kinesin's board are for the hard controls.

export const PHYS = {
  armLen: 42, // neck-linker segment length, px
  headLen: 40, // motor-domain reach past the neck-linker joint, px
  lockSupport: 55, // % ATP-lock at which a head counts as "bound" to the lattice
  detachDrift: 55, // degrees of drift before Brownian motion sweeps you off
  brownian: 40, // deg/s^2 drift while both heads are unbound
  springK: 1.2,
  dampK: 1.0,
  velDamp: 0.985,
  baseSpeed: 46, // nm/s while at least one head bound, even with matched reach
  strideK: 5.2, // extra nm/s per degree of reach-angle spread between heads
  driftSpeed: 7, // nm/s of aimless jiggle while fully detached (pre-splat)
  reachMax: 68,
  reachRest: -30,
  reachRate: 210, // deg/s while held
  reachRelax: 130, // deg/s while released
  lockMax: 100,
  lockRest: 0,
  lockRate: 230, // %/s while held
  lockRelax: 170, // %/s while released
};

function clampNum(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

export function approach(cur, target, rate, dt) {
  const diff = target - cur;
  const step = rate * dt;
  if (Math.abs(diff) <= step) return target;
  return cur + Math.sign(diff) * step;
}

// state: { drift, driftVel, distance, steps } — mutated in place.
export function motorTick(state, reachL, reachR, lockL, lockR, dt) {
  const leftBound = lockL > PHYS.lockSupport;
  const rightBound = lockR > PHYS.lockSupport;
  let sum = 0;
  let count = 0;
  if (leftBound) { sum += reachL; count++; }
  if (rightBound) { sum += reachR; count++; }
  const supportAngle = count ? sum / count : 0;

  const torque = count > 0
    ? (-supportAngle * PHYS.springK - state.drift * PHYS.dampK)
    : PHYS.brownian;
  state.driftVel = (state.driftVel + torque * dt) * PHYS.velDamp;
  state.drift += state.driftVel * dt;

  const detached = Math.abs(state.drift) > PHYS.detachDrift;

  const stride = Math.min(90, Math.abs(reachL - reachR));
  const bound = leftBound || rightBound;
  const speed = detached ? 0 : (bound ? (PHYS.baseSpeed + stride * PHYS.strideK) : PHYS.driftSpeed);
  state.distance += speed * dt;

  return { detached, leftBound, rightBound, reachL, reachR, lockL, lockR, speed };
}

// Geometry for one head: the neck-linker pivots at (0,0) — the coiled-coil
// stalk junction — and swings by reachDeg; the motor domain extends past it
// by lockDeg's worth of extra flex. Mirrors qwopsheet's forwardKinematics.
export function headKinematics(reachDeg, lockDeg) {
  const reachRad = (reachDeg * Math.PI) / 180;
  const flexRad = ((reachDeg - lockDeg * 0.3) * Math.PI) / 180;
  const joint = { x: Math.sin(reachRad) * PHYS.armLen, y: Math.cos(reachRad) * PHYS.armLen };
  const head = {
    x: joint.x + Math.sin(flexRad) * PHYS.headLen,
    y: joint.y + Math.cos(flexRad) * PHYS.headLen,
  };
  return { joint, head };
}


// Hand-over-hand sequence. Each stage is the set of keys the original game's
// player would hold: q/w swing the left/right head forward, o/p lock it on.
// One head is always gripping, so the motor never lets go on its own.
export const GAIT = [
  ["q", "p"],
  ["q", "o", "p"],
  ["w", "o", "q"],
  ["w", "p", "o", "q"],
  ["w", "p"],
  ["w", "q", "p"],
];
export const STAGE_SECONDS = 0.22;
// How far the autopilot swings a head. The hard game swings to PHYS.reachMax,
// which tips the body past detachDrift unless the player times locks well;
// 30° keeps the bound heads' average pull under that line.
export const GAIT_REACH = 30;

// ATP: burn rate climbs with distance so every run eventually ends.
export const ATP = { max: 100, restGain: 14, burnBase: 4, burnPerNm: 0.0006 };
export function atpStep(atp, walking, distance, dt) {
  const next = walking
    ? atp - (ATP.burnBase + distance * ATP.burnPerNm) * dt
    : atp + ATP.restGain * dt;
  return clampNum(next, 0, ATP.max);
}

if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", init);
}

function init() {
  const LS_BEST = "kinesin-easy:best";

  const canvas = document.getElementById("stage");
  const ctx2d = canvas.getContext("2d");
  const distanceEl = document.getElementById("distance");
  const bestEl = document.getElementById("best");
  const statusEl = document.getElementById("status");
  const stepsEl = document.getElementById("steps");
  const atpFill = document.getElementById("atp-fill");
  const restartBtn = document.getElementById("restart-btn");
  const walkBtn = document.getElementById("walk-btn");
  const walkKey = document.getElementById("walk-key");
  const splat = document.getElementById("splat");
  const splatDistance = document.getElementById("splat-distance");
  const splatBest = document.getElementById("splat-best");
  const splatRestart = document.getElementById("splat-restart");
  const shareBtn = document.getElementById("share-btn");
  const shareBskyBtn = document.getElementById("share-bsky-btn");

  let walking = false;
  function setWalking(v) {
    walking = v;
    walkKey.classList.toggle("active", v);
    walkBtn.classList.toggle("active", v);
  }

  const WALK_KEYS = new Set(["arrowright", "d", " "]);
  window.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    if (!WALK_KEYS.has(k)) return;
    e.preventDefault();
    if (!running && !e.repeat && splat.hidden === false) { resetRun(); }
    setWalking(true);
  });
  window.addEventListener("keyup", (e) => {
    if (WALK_KEYS.has(e.key.toLowerCase())) setWalking(false);
  });
  const press = (e) => { e.preventDefault(); setWalking(true); };
  const release = (e) => { if (e) e.preventDefault(); setWalking(false); };
  walkBtn.addEventListener("touchstart", press, { passive: false });
  walkBtn.addEventListener("touchend", release, { passive: false });
  walkBtn.addEventListener("touchcancel", release, { passive: false });
  walkBtn.addEventListener("mousedown", press);
  walkBtn.addEventListener("mouseup", release);
  walkBtn.addEventListener("mouseleave", release);

  let reachL, reachR, lockL, lockR, prevBoundL, prevBoundR;
  let running, lastFrame, state, atp, stage, stageT;
  let best = Number(localStorage.getItem(LS_BEST)) || 0;
  bestEl.textContent = best ? `${best.toFixed(0)} nm` : "—";

  function resetRun() {
    running = true;
    lastFrame = 0;
    state = { drift: 0, driftVel: 0, distance: 0, steps: 0 };
    // start gripping the lattice so a fresh run doesn't open with Brownian drift
    reachL = PHYS.reachRest; reachR = PHYS.reachRest;
    lockL = PHYS.lockMax; lockR = PHYS.lockMax;
    prevBoundL = true; prevBoundR = true;
    atp = ATP.max;
    stage = 0; stageT = 0;
    splat.hidden = true;
    statusEl.textContent = "resting";
    statusEl.classList.remove("fell");
    stepsEl.textContent = "0";
    atpFill.style.width = "100%";
    atpFill.classList.remove("low");
  }
  resetRun();

  restartBtn.addEventListener("click", resetRun);
  splatRestart.addEventListener("click", resetRun);

  requestAnimationFrame(loop);

  function loop(ts) {
    if (!lastFrame) lastFrame = ts;
    const dt = Math.min(0.05, (ts - lastFrame) / 1000);
    lastFrame = ts;
    if (running) step(dt);
    requestAnimationFrame(loop);
  }

  // Exposed for the headless test in tests/.
  function step(dt) {
    let held;
    if (walking && atp > 0) {
      stageT += dt;
      while (stageT >= STAGE_SECONDS) { stageT -= STAGE_SECONDS; stage = (stage + 1) % GAIT.length; }
      held = new Set(GAIT[stage]);
    } else {
      // resting: both heads gripping, relaxed back
      held = new Set(["o", "p"]);
    }
    reachL = clampNum(approach(reachL, held.has("q") ? GAIT_REACH : PHYS.reachRest, held.has("q") ? PHYS.reachRate : PHYS.reachRelax, dt), -90, 90);
    reachR = clampNum(approach(reachR, held.has("w") ? GAIT_REACH : PHYS.reachRest, held.has("w") ? PHYS.reachRate : PHYS.reachRelax, dt), -90, 90);
    lockL = clampNum(approach(lockL, held.has("o") ? PHYS.lockMax : PHYS.lockRest, held.has("o") ? PHYS.lockRate : PHYS.lockRelax, dt), 0, 100);
    lockR = clampNum(approach(lockR, held.has("p") ? PHYS.lockMax : PHYS.lockRest, held.has("p") ? PHYS.lockRate : PHYS.lockRelax, dt), 0, 100);

    // Resting stands still: the motor only advances while walking.
    const before = state.distance;
    const tick = motorTick(state, reachL, reachR, lockL, lockR, dt);
    if (!walking) state.distance = before;

    atp = atpStep(atp, walking, state.distance, dt);
    if (tick.leftBound && !prevBoundL) state.steps++;
    if (tick.rightBound && !prevBoundR) state.steps++;
    prevBoundL = tick.leftBound;
    prevBoundR = tick.rightBound;

    distanceEl.textContent = `${state.distance.toFixed(0)} nm`;
    stepsEl.textContent = String(state.steps);
    statusEl.textContent = walking ? "walking" : "resting";
    atpFill.style.width = `${atp}%`;
    atpFill.classList.toggle("low", atp < 25);

    // empty tank: let go of the lattice and drift off
    if (atp <= 0 || tick.detached) endRun();
    renderScene(tick);
  }

  function endRun() {
    running = false;
    statusEl.textContent = atp <= 0 ? "OUT OF ATP" : "DETACHED";
    statusEl.classList.add("fell");
    const dist = state.distance;
    if (dist > best) {
      best = dist;
      localStorage.setItem(LS_BEST, String(best));
      bestEl.textContent = `${best.toFixed(0)} nm`;
    }
    splatDistance.textContent = `${dist.toFixed(0)} nm`;
    splatBest.textContent = `best: ${best.toFixed(0)} nm · ${state.steps} steps`;
    splat.hidden = false;
    wireShare(dist, state.steps);
  }

  function renderScene(tick) {
    const w = canvas.width, h = canvas.height;
    ctx2d.clearRect(0, 0, w, h);

    const tubeY = h - 70;
    const tubeH = 46;
    const hipX = 150;
    const hipY = tubeY - (PHYS.armLen + PHYS.headLen) * 0.92;

    drawMicrotubule(tubeY, tubeH, w);

    const drift = (state.drift * Math.PI) / 180;

    ctx2d.lineCap = "round";
    ctx2d.lineWidth = 7;
    drawArm(hipX, hipY, tick.reachL, tick.lockL, tick.leftBound ? "#6ef2c9" : "#4a5578");
    drawArm(hipX, hipY, tick.reachR, tick.lockR, tick.rightBound ? "#ff9b3d" : "#4a5578");

    // coiled-coil stalk + cargo vesicle, tipped by drift
    ctx2d.save();
    ctx2d.translate(hipX, hipY);
    ctx2d.rotate(drift);
    ctx2d.strokeStyle = "#f2e9ff";
    ctx2d.beginPath();
    ctx2d.moveTo(0, 0);
    ctx2d.lineTo(0, -60);
    ctx2d.stroke();
    ctx2d.fillStyle = "#7c4dff";
    ctx2d.beginPath();
    ctx2d.arc(0, -80, 17, 0, Math.PI * 2);
    ctx2d.fill();
    ctx2d.strokeStyle = "#c9b8ff";
    ctx2d.lineWidth = 2;
    ctx2d.stroke();
    ctx2d.restore();
  }

  function drawArm(hipX, hipY, reachDeg, lockDeg, color) {
    const { joint, head } = headKinematics(reachDeg, lockDeg);
    ctx2d.strokeStyle = color;
    ctx2d.beginPath();
    ctx2d.moveTo(hipX, hipY);
    ctx2d.lineTo(hipX + joint.x, hipY + joint.y);
    ctx2d.lineTo(hipX + head.x, hipY + head.y);
    ctx2d.stroke();
    ctx2d.fillStyle = color;
    ctx2d.beginPath();
    ctx2d.arc(hipX + head.x, hipY + head.y, 6, 0, Math.PI * 2);
    ctx2d.fill();
  }

  function drawMicrotubule(tubeY, tubeH, w) {
    ctx2d.fillStyle = "#141a3d";
    ctx2d.fillRect(0, tubeY, w, tubeH);
    ctx2d.strokeStyle = "#2c3550";
    ctx2d.lineWidth = 2;
    ctx2d.strokeRect(0, tubeY, w, tubeH);

    // scrolling lattice of alternating alpha/beta tubulin dimers
    const dimerW = 26;
    const offset = state.distance % dimerW;
    for (let x = -offset; x < w; x += dimerW) {
      const alt = Math.floor((x + state.distance) / dimerW) % 2 === 0;
      ctx2d.fillStyle = alt ? "#2a3465" : "#232b52";
      ctx2d.beginPath();
      ctx2d.ellipse(x + dimerW / 2, tubeY + tubeH * 0.28, 11, 9, 0, 0, Math.PI * 2);
      ctx2d.fill();
      ctx2d.beginPath();
      ctx2d.ellipse(x + dimerW / 2, tubeY + tubeH * 0.72, 11, 9, 0, 0, Math.PI * 2);
      ctx2d.fill();
    }
  }

  // ---- sharing ----

  function buildShareText(dist, steps) {
    const url = "https://kinesin-easy.bisks.net/";
    return `walked ${dist.toFixed(0)}nm along a microtubule (${steps} ATP-powered steps) before drifting off into the cytoplasm — hold one key and a kinesin motor does the rest. try to out-walk me: ${url}`;
  }

  function wireShare(dist, steps) {
    const text = buildShareText(dist, steps);
    shareBskyBtn.href = `https://bsky.app/intent/compose?text=${encodeURIComponent(text)}`;

    shareBtn.onclick = async () => {
      const card = buildShareCard(dist, steps);
      card.toBlob(async (blob) => {
        if (!blob) return;
        const file = new File([blob], "kinesin.png", { type: "image/png" });
        if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({ files: [file], text, title: "kinesin" });
            return;
          } catch { /* fall through to download */ }
        }
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "kinesin.png";
        a.click();
      }, "image/png");
    };
  }

  function buildShareCard(dist, steps) {
    const c = document.createElement("canvas");
    c.width = 1200;
    c.height = 630;
    const g = c.getContext("2d");
    g.fillStyle = "#0b0e1f";
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = "#141a3d";
    g.fillRect(0, 470, c.width, 160);
    g.strokeStyle = "#2c3550";
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, 470);
    g.lineTo(c.width, 470);
    g.stroke();

    g.fillStyle = "#f2e9ff";
    g.font = "800 64px monospace";
    g.fillText("kinesin", 60, 120);
    g.fillStyle = "#93a3c2";
    g.font = "22px monospace";
    g.fillText("hold one key, a motor protein walks", 62, 165);

    g.fillStyle = "#6ef2c9";
    g.font = "800 110px monospace";
    g.fillText(`${dist.toFixed(0)}nm`, 60, 330);
    g.fillStyle = "#93a3c2";
    g.font = "24px monospace";
    g.fillText(`${steps} ATP-powered steps before detaching`, 64, 370);

    // little kinesin, mid-detach
    g.strokeStyle = "#f2e9ff";
    g.lineWidth = 8;
    g.lineCap = "round";
    g.save();
    g.translate(950, 420);
    g.rotate(1.0);
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(0, -60);
    g.stroke();
    g.fillStyle = "#7c4dff";
    g.beginPath();
    g.arc(0, -76, 16, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "#6ef2c9";
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(-32, 38);
    g.stroke();
    g.strokeStyle = "#ff9b3d";
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(34, 32);
    g.stroke();
    g.restore();

    g.fillStyle = "#6ef2c9";
    g.font = "700 26px monospace";
    g.fillText("kinesin-easy.bisks.net", 62, 560);

    return c;
  }
}
