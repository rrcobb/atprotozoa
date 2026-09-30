// zerogbong: a chamber of radius R spins at rate w. Simulated in the rotating
// frame: the water sphere feels centrifugal push (w^2 r, outward), Coriolis
// (2 w x v) and, while you pull, suction toward the stem port at the hub.
(function () {
  const cv = document.getElementById("cv"), ctx = cv.getContext("2d");
  const spin = document.getElementById("spin"), spinv = document.getElementById("spinv");
  const pull = document.getElementById("pull"), reset = document.getElementById("reset");
  const statusText = document.getElementById("statusText");
  const shareRow = document.getElementById("shareRow"), share = document.getElementById("share");

  const S = cv.width, C = S / 2, R = 0.44 * S; // px
  const RB = 0.11 * S, HUB = 0.07 * S;         // sphere radius, stem port radius
  const W_MAX = 3.2;                           // rad/s at 100% (a motor limit, not a safety cap)
  const SUCTION = 34;                          // px-units acceleration scale while pulling
  const FILL_TIME = 3.5;                       // seconds of held pull to fill the chamber

  let st;
  function fresh() {
    // The sphere starts resting against the rim, at a random angle.
    const a = Math.random() * Math.PI * 2, lim = R - RB;
    return { x: Math.cos(a) * lim, y: Math.sin(a) * lim, vx: 0, vy: 0,
      w: 0, phi: 0, pulling: false, smoke: 0, pullT: 0, over: false, wobble: 0, t: 0 };
  }
  st = fresh();

  function say(html) { statusText.innerHTML = html; }

  function step(dt) {
    st.t += dt;
    const target = (+spin.value / 100) * W_MAX;
    st.w += (target - st.w) * Math.min(1, dt * 2.5); // motor spin-up
    st.phi += st.w * dt;
    if (st.over) return;
    const w = st.w;
    // Fictitious forces in the rotating frame. 
    const k = 1.2; // tuned so ~50% spin holds the sphere against a pull at mid-radius
    let ax = k * w * w * st.x + 2 * w * st.vy;
    let ay = k * w * w * st.y - 2 * w * st.vx;
    if (st.pulling) {
      const d = Math.hypot(st.x, st.y) || 1;
      ax += -SUCTION * 9 * st.x / d; ay += -SUCTION * 9 * st.y / d;
      st.pullT += dt;
    }
    // A tiny random draft keeps a resting sphere from sitting perfectly still.
    ax += (Math.random() - .5) * 60; ay += (Math.random() - .5) * 60;
    st.vx += ax * dt; st.vy += ay * dt;
    const damp = Math.pow(0.55, dt); // viscous drag against the walls
    st.vx *= damp; st.vy *= damp;
    st.x += st.vx * dt; st.y += st.vy * dt;
    // Wall: sphere can't leave the chamber.
    const d = Math.hypot(st.x, st.y), lim = R - RB;
    if (d > lim) {
      const nx = st.x / d, ny = st.y / d;
      st.x = nx * lim; st.y = ny * lim;
      const vn = st.vx * nx + st.vy * ny;
      if (vn > 0) { st.vx -= vn * nx * 1.2; st.vy -= vn * ny * 1.2; st.wobble = Math.min(1, st.wobble + vn / 300); }
    }
    st.wobble *= Math.pow(0.05, dt);
    // Gulp: sphere touches the stem port.
    if (Math.hypot(st.x, st.y) < HUB + RB * 0.55) {
      st.over = true;
      say("<b>Gulp.</b> The sphere went up the stem. " + Math.round(st.smoke * 100) + "% charged. Reset and spin harder.");
      showShare("I let a zero-g water sphere float up the stem at " + Math.round(st.smoke * 100) + "% charge");
      return;
    }
    // Charging: smoke fills while pulling and the sphere is held off the port.
    if (st.pulling) {
      st.smoke = Math.min(1, st.smoke + dt / FILL_TIME);
      if (st.smoke >= 1) {
        st.over = true;
        say("<b>Fully charged.</b> Held the sphere at spin " + spin.value + "% for " + st.pullT.toFixed(1) + "s. Zero-g bong design solved.");
        showShare("Fully charged a zero-g pipe with the water sphere held out by spin " + spin.value + "%");
      }
    } else st.smoke = Math.max(0, st.smoke - dt * 0.15);
  }

  function showShare(text) {
    shareRow.hidden = false;
    share.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(text + " — https://zerogbong.bisks.net/");
  }

  function draw() {
    ctx.clearRect(0, 0, S, S);
    ctx.save(); ctx.translate(C, C);
    ctx.rotate(st.phi);
    // chamber
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
    g.addColorStop(0, "rgba(120,140,200,.10)"); g.addColorStop(1, "rgba(120,140,200,.22)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, R, 0, 7); ctx.fill();
    // smoke fill
    if (st.smoke > 0) {
      const sg = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
      sg.addColorStop(0, "rgba(235,235,245," + (0.5 * st.smoke) + ")"); sg.addColorStop(1, "rgba(200,200,220," + (0.15 * st.smoke) + ")");
      ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(0, 0, R * (0.25 + 0.75 * st.smoke), 0, 7); ctx.fill();
    }
    // spokes so rotation is visible
    ctx.strokeStyle = "rgba(160,180,255,.18)"; ctx.lineWidth = 3;
    for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(R * Math.cos(i * Math.PI / 3), R * Math.sin(i * Math.PI / 3)); ctx.stroke(); }
    ctx.strokeStyle = "#5c6fb0"; ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(0, 0, R, 0, 7); ctx.stroke();
    // stem port
    ctx.fillStyle = "#10162b"; ctx.strokeStyle = st.pulling ? "#ffd166" : "#8390b0"; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(0, 0, HUB, 0, 7); ctx.fill(); ctx.stroke();
    // water sphere (wobbles after wall impacts)
    const wb = st.wobble * Math.sin(st.t * 30) * 0.12;
    ctx.save(); ctx.translate(st.x, st.y); ctx.scale(1 + wb, 1 - wb);
    const wg = ctx.createRadialGradient(-RB * .3, -RB * .3, RB * .1, 0, 0, RB);
    wg.addColorStop(0, "#c8ecff"); wg.addColorStop(.6, "#4fb6ff"); wg.addColorStop(1, "#1a5fa8");
    ctx.fillStyle = wg; ctx.beginPath(); ctx.arc(0, 0, RB, 0, 7); ctx.fill();
    ctx.restore();
    ctx.restore();
    // charge meter (screen-fixed)
    ctx.fillStyle = "#1a2444"; ctx.fillRect(C - 150, S - 34, 300, 12);
    ctx.fillStyle = "#ffd166"; ctx.fillRect(C - 150, S - 34, 300 * st.smoke, 12);
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    // Sub-step so a fast sphere can't tunnel past the stem port in one tick.
    for (let i = 0; i < 4; i++) step(dt / 4);
    draw(); requestAnimationFrame(frame);
  }

  function setPull(on) {
    if (st.over && on) return;
    st.pulling = on; pull.classList.toggle("on", on);
    if (on && st.pullT === 0) say("Pulling… keep the sphere off the stem.");
  }
  pull.addEventListener("pointerdown", (e) => { e.preventDefault(); setPull(true); });
  ["pointerup", "pointerleave", "pointercancel"].forEach((n) => pull.addEventListener(n, () => setPull(false)));
  window.addEventListener("keydown", (e) => { if (e.code === "Space" && !e.repeat && e.target === document.body) { e.preventDefault(); setPull(true); } });
  window.addEventListener("keyup", (e) => { if (e.code === "Space") setPull(false); });
  spin.addEventListener("input", () => { spinv.textContent = spin.value; });
  reset.addEventListener("click", () => {
    st = fresh(); pull.classList.remove("on"); shareRow.hidden = true;
    say("Pull with no spin and watch what happens. (Space also pulls.)");
  });
  requestAnimationFrame(frame);
})();
