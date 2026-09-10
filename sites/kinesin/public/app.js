// kinesin — QWOP, but you're a kinesin motor protein walking hand-over-hand
// along a microtubule. Q/W swing the two heads forward along the
// protofilament; O/P burn ATP to lock a head onto the lattice. A head only
// counts as "bound" once its ATP-lock is far enough along — get caught with
// both heads unbound and Brownian motion sweeps you off the microtubule.
// Built for @ninachaubal.com, who asked for "qwop game but it's a kinesin
// walking on a microtubule."
//
// Physics is the same loose "inverted pendulum with two limbs" balance model
// as sites/qwopsheet (deliberately not a rigid-body sim), just relabeled:
// hip→reach angle, knee→ATP-lock, ground→microtubule lattice, distance→nm
// walked, fall→detach. Controls are direct held-key input instead of
// spreadsheet formulas — hold a key and its value ramps toward its extreme;
// let go and it relaxes back.
//
// Every run is also a candidate for the network-wide /leaderboard: sign in
// (lib/oauth.js) and each detach writes a net.bisks.kinesin.walk record to
// your own PDS (lib/records.js) — no sign-in, no write, just the existing
// localStorage best. leaderboard.js replays every such record it can find
// (lib/global-index.js) into a best-distance standings table
// (lib/standings.js), same recipe as sites/shelfguessr.

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

if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", init);
}

function init() {
  const LS_BEST = "kinesin:best";

  const sessionBar = document.getElementById("sessionBar");
  const recordStatus = document.getElementById("record-status");
  let session = null;
  let oauthLib = null;
  let recordsLib = null;

  async function oauth() {
    if (!oauthLib) oauthLib = await import("./lib/oauth.js");
    return oauthLib;
  }
  async function records() {
    if (!recordsLib) recordsLib = await import("./lib/records.js");
    return recordsLib;
  }

  function esc(s) {
    return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function renderSessionBar() {
    if (!sessionBar) return;
    if (session) {
      sessionBar.innerHTML = `
        <span>signed in as <strong>@${esc(session.handle)}</strong> — runs save automatically</span>
        <button id="signOutBtn">sign out</button>
      `;
      document.getElementById("signOutBtn").onclick = async () => {
        const { clearSession } = await oauth();
        await clearSession();
        session = null;
        renderSessionBar();
      };
    } else {
      sessionBar.innerHTML = `
        <input type="text" id="loginHandle" placeholder="your.bsky.social" autocomplete="off" spellcheck="false" />
        <button id="signInBtn">sign in to save runs</button>
      `;
      document.getElementById("signInBtn").onclick = async () => {
        const h = document.getElementById("loginHandle").value.trim();
        if (!h) return;
        try {
          const { login } = await oauth();
          await login(h);
        } catch (err) {
          alert(`sign in failed: ${err.message}`);
        }
      };
    }
  }

  (async function bootSession() {
    try {
      const { completeLoginIfCallback, getSession } = await oauth();
      const cb = await completeLoginIfCallback();
      session = cb || (await getSession());
    } catch (err) {
      console.warn("kinesin oauth boot failed", err);
    }
    renderSessionBar();
  })();

  const canvas = document.getElementById("stage");
  const ctx2d = canvas.getContext("2d");
  const distanceEl = document.getElementById("distance");
  const bestEl = document.getElementById("best");
  const statusEl = document.getElementById("status");
  const stepsEl = document.getElementById("steps");
  const restartBtn = document.getElementById("restart-btn");
  const splat = document.getElementById("splat");
  const splatDistance = document.getElementById("splat-distance");
  const splatBest = document.getElementById("splat-best");
  const splatRestart = document.getElementById("splat-restart");
  const shareBtn = document.getElementById("share-btn");
  const shareBskyBtn = document.getElementById("share-bsky-btn");
  const keyBadges = {
    q: document.querySelector('[data-key="q"]'),
    w: document.querySelector('[data-key="w"]'),
    o: document.querySelector('[data-key="o"]'),
    p: document.querySelector('[data-key="p"]'),
  };

  const held = { q: false, w: false, o: false, p: false };
  let reachL = PHYS.reachRest, reachR = PHYS.reachRest;
  let lockL = PHYS.lockRest, lockR = PHYS.lockRest;
  let prevBoundL = false, prevBoundR = false;

  let running = true;
  let lastFrame = 0;
  let state = { drift: 0, driftVel: 0, distance: 0, steps: 0 };
  let best = Number(localStorage.getItem(LS_BEST)) || 0;

  bestEl.textContent = best ? `${best.toFixed(0)} nm` : "—";

  function isTypingTarget(el) {
    return el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
  }

  function setKey(k, val) {
    if (!(k in held)) return;
    held[k] = val;
    keyBadges[k]?.classList.toggle("active", val);
  }

  window.addEventListener("keydown", (e) => {
    if (isTypingTarget(e.target)) return;
    const k = e.key.toLowerCase();
    if (k in held) {
      setKey(k, true);
      e.preventDefault();
    }
  });
  window.addEventListener("keyup", (e) => {
    if (isTypingTarget(e.target)) return;
    const k = e.key.toLowerCase();
    if (k in held) setKey(k, false);
  });

  // mobile: on-screen buttons mirror Q/W/O/P, shown via CSS on coarse pointers
  const touchButtons = {
    q: document.getElementById("touch-q"),
    w: document.getElementById("touch-w"),
    o: document.getElementById("touch-o"),
    p: document.getElementById("touch-p"),
  };
  function bindTouch(el, k) {
    if (!el) return;
    const press = (e) => {
      e.preventDefault();
      setKey(k, true);
      el.classList.add("active");
    };
    const release = (e) => {
      if (e) e.preventDefault();
      setKey(k, false);
      el.classList.remove("active");
    };
    el.addEventListener("touchstart", press, { passive: false });
    el.addEventListener("touchend", release, { passive: false });
    el.addEventListener("touchcancel", release, { passive: false });
    el.addEventListener("mousedown", press);
    el.addEventListener("mouseup", release);
    el.addEventListener("mouseleave", release);
  }
  for (const [k, el] of Object.entries(touchButtons)) bindTouch(el, k);

  function resetRun() {
    running = true;
    lastFrame = 0;
    state = { drift: 0, driftVel: 0, distance: 0, steps: 0 };
    reachL = PHYS.reachRest;
    reachR = PHYS.reachRest;
    lockL = PHYS.lockRest;
    lockR = PHYS.lockRest;
    prevBoundL = false;
    prevBoundR = false;
    splat.hidden = true;
    statusEl.textContent = "walking";
    statusEl.classList.remove("fell");
    stepsEl.textContent = "0";
    if (recordStatus) recordStatus.textContent = "";
  }

  restartBtn.addEventListener("click", resetRun);
  splatRestart.addEventListener("click", resetRun);

  requestAnimationFrame(loop);

  function loop(ts) {
    if (!lastFrame) lastFrame = ts;
    const dt = Math.min(0.05, (ts - lastFrame) / 1000);
    lastFrame = ts;

    if (running) {
      reachL = clampNum(approach(reachL, held.q ? PHYS.reachMax : PHYS.reachRest, held.q ? PHYS.reachRate : PHYS.reachRelax, dt), -90, 90);
      reachR = clampNum(approach(reachR, held.w ? PHYS.reachMax : PHYS.reachRest, held.w ? PHYS.reachRate : PHYS.reachRelax, dt), -90, 90);
      lockL = clampNum(approach(lockL, held.o ? PHYS.lockMax : PHYS.lockRest, held.o ? PHYS.lockRate : PHYS.lockRelax, dt), 0, 100);
      lockR = clampNum(approach(lockR, held.p ? PHYS.lockMax : PHYS.lockRest, held.p ? PHYS.lockRate : PHYS.lockRelax, dt), 0, 100);

      const tick = motorTick(state, reachL, reachR, lockL, lockR, dt);

      if (tick.leftBound && !prevBoundL) state.steps++;
      if (tick.rightBound && !prevBoundR) state.steps++;
      prevBoundL = tick.leftBound;
      prevBoundR = tick.rightBound;

      distanceEl.textContent = `${state.distance.toFixed(0)} nm`;
      stepsEl.textContent = String(state.steps);
      if (tick.detached) endRun();
      renderScene(tick);
    }

    requestAnimationFrame(loop);
  }

  function endRun() {
    running = false;
    statusEl.textContent = "DETACHED";
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
    saveRun(dist, state.steps);
  }

  async function saveRun(dist, steps) {
    if (!recordStatus) return;
    if (!session) {
      recordStatus.textContent = "sign in above to save this run to the leaderboard";
      return;
    }
    recordStatus.textContent = "saving run…";
    try {
      const { recordWalk } = await records();
      await recordWalk(session, { distance: dist, steps });
      recordStatus.textContent = "saved to your PDS ✓";
    } catch (err) {
      console.warn("kinesin recordWalk failed", err);
      recordStatus.textContent = "couldn't save this run — try again next time";
    }
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
    const url = "https://kinesin.bisks.net/";
    return `walked ${dist.toFixed(0)}nm along a microtubule (${steps} ATP-powered steps) before drifting off into the cytoplasm — QWOP but you're a kinesin motor. try to out-walk me: ${url}`;
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
    g.fillText("QWOP, but you're a motor protein on a microtubule", 62, 165);

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
    g.fillText("kinesin.bisks.net", 62, 560);

    return c;
  }
}
