// purrscue — the whole game. No server, no build step.
//
// The joke: the house only ever has a FEW cats. Clicking the house rescues
// one (score++), but once the house is empty there's nothing left to save —
// so the only way to keep scoring is to click a safe cat and throw it back
// into the fire. Every trip in shortens that cat's clock a little, so the
// same handful of cats gets harder to keep rescuing the longer you play.

(() => {
  const NAMES = ["Mittens", "Biscuit", "Toast", "Whiskers", "Noodle", "Gremlin"];
  const EMOJI = "🐱";
  const START_IN_FIRE = 3; // cats already burning when you land on the page
  const TOTAL_CATS = NAMES.length;
  const BASE_DURATION = 6500; // ms, first time a cat goes in
  const DURATION_STEP = 380; // ms shaved off per re-toss
  const MIN_DURATION = 2000;

  /** @typedef {{id:number,name:string,state:'yard'|'fire'|'burned',tosses:number,deadline:number,duration:number}} Cat */

  /** @type {Cat[]} */
  let cats = [];
  let saved = 0;
  let burned = 0;
  let rafId = null;
  let gameOver = false;

  const els = {
    fireCats: document.getElementById("fireCats"),
    yardCats: document.getElementById("yardCats"),
    statSaved: document.getElementById("statSaved"),
    statBurned: document.getElementById("statBurned"),
    statLeft: document.getElementById("statLeft"),
    houseBtn: document.getElementById("houseBtn"),
    hint: document.querySelector(".hint"),
    memoriam: document.getElementById("memoriam"),
    toastLayer: document.getElementById("toastLayer"),
    restartBtn: document.getElementById("restartBtn"),
    overlay: document.getElementById("overlay"),
    modalTitle: document.getElementById("modalTitle"),
    modalBody: document.getElementById("modalBody"),
    playAgainBtn: document.getElementById("playAgainBtn"),
    shareBtn: document.getElementById("shareBtn"),
    card: document.getElementById("card"),
  };

  function durationFor(cat) {
    return Math.max(MIN_DURATION, BASE_DURATION - cat.tosses * DURATION_STEP);
  }

  function init() {
    cats = NAMES.map((name, i) => ({
      id: i,
      name,
      state: i < START_IN_FIRE ? "fire" : "yard",
      tosses: i < START_IN_FIRE ? 1 : 0,
    }));
    const now = performance.now();
    cats.forEach((c) => {
      if (c.state === "fire") {
        c.duration = durationFor(c);
        c.deadline = now + c.duration;
      }
    });
    saved = 0;
    burned = 0;
    gameOver = false;
    els.overlay.classList.remove("show");
    els.restartBtn.style.display = "none";
    els.memoriam.textContent = "";
    render();
    if (rafId) cancelAnimationFrame(rafId);
    tick();
  }

  function toast(text, kind) {
    const t = document.createElement("div");
    t.className = "toast " + kind;
    t.textContent = text;
    els.toastLayer.appendChild(t);
    setTimeout(() => t.remove(), 2100);
  }

  function shakeHouse() {
    els.houseBtn.classList.remove("shake");
    void els.houseBtn.offsetWidth; // restart animation
    els.houseBtn.classList.add("shake");
  }

  function rescue() {
    if (gameOver) return;
    const burning = cats.filter((c) => c.state === "fire");
    if (!burning.length) {
      shakeHouse();
      return;
    }
    // Pull out whoever has the least time left — the actually urgent one.
    burning.sort((a, b) => a.deadline - b.deadline);
    const cat = burning[0];
    cat.state = "yard";
    saved++;
    toast(`saved ${cat.name}! (${saved})`, "save");
    render();
  }

  function tossIn(cat) {
    if (gameOver || cat.state !== "yard") return;
    cat.state = "fire";
    cat.tosses++;
    cat.duration = durationFor(cat);
    cat.deadline = performance.now() + cat.duration;
    render();
  }

  function burnOut(cat) {
    cat.state = "burned";
    burned++;
    toast(`${cat.name} didn't make it...`, "burn");
    render();
    checkGameOver();
  }

  function checkGameOver() {
    const alive = cats.filter((c) => c.state !== "burned");
    if (alive.length === 0) {
      endGame();
    }
  }

  function endGame() {
    gameOver = true;
    if (rafId) cancelAnimationFrame(rafId);
    els.restartBtn.style.display = "inline-flex";
    const lost = cats.filter((c) => c.state === "burned").map((c) => c.name);
    els.memoriam.innerHTML = lost.length
      ? `in memoriam: <b>${lost.join(", ")}</b>`
      : "";
    showModal();
  }

  function render() {
    els.statSaved.textContent = String(saved);
    els.statBurned.textContent = String(burned);
    els.statLeft.textContent = String(cats.filter((c) => c.state !== "burned").length);

    const burning = cats.filter((c) => c.state === "fire");
    els.fireCats.innerHTML = "";
    if (!burning.length && !gameOver) {
      const div = document.createElement("div");
      div.className = "fire-empty";
      div.textContent = "the fire's empty — nothing left to save. throw one in!";
      els.fireCats.appendChild(div);
    }
    burning.forEach((cat) => {
      const wrap = document.createElement("div");
      wrap.className = "fcat";
      wrap.title = `${cat.name} — click the house to save`;
      const r = 22;
      const c = 2 * Math.PI * r;
      wrap.innerHTML = `
        <svg class="ring" viewBox="0 0 50 50">
          <circle class="bg" cx="25" cy="25" r="${r}"></circle>
          <circle class="fg" data-id="${cat.id}" cx="25" cy="25" r="${r}"
            stroke-dasharray="${c}" stroke-dashoffset="0"></circle>
        </svg>
        ${EMOJI}
        <span class="name">${cat.name}</span>
      `;
      els.fireCats.appendChild(wrap);
    });

    const safe = cats.filter((c) => c.state === "yard");
    els.yardCats.innerHTML = "";
    if (!safe.length) {
      const div = document.createElement("div");
      div.className = "yard-empty";
      div.textContent = gameOver
        ? "no cats left. that's the game."
        : "everyone's in the fire.";
      els.yardCats.appendChild(div);
    }
    safe.forEach((cat) => {
      const el = document.createElement("div");
      el.className = "ycat";
      el.title = `send ${cat.name} back into the fire`;
      el.innerHTML = `${EMOJI}<span class="name">${cat.name}</span>`;
      el.addEventListener("click", () => tossIn(cat));
      els.yardCats.appendChild(el);
    });
  }

  function tick() {
    const now = performance.now();
    let needsRender = false;
    cats.forEach((cat) => {
      if (cat.state !== "fire") return;
      const remain = cat.deadline - now;
      if (remain <= 0) {
        burnOut(cat);
        needsRender = true;
        return;
      }
      const frac = Math.max(0, remain / cat.duration);
      const ring = els.fireCats.querySelector(`circle.fg[data-id="${cat.id}"]`);
      if (ring) {
        const r = 22;
        const c = 2 * Math.PI * r;
        ring.style.strokeDashoffset = String(c * (1 - frac));
        if (frac < 0.3) ring.style.stroke = "var(--ember)";
      }
    });
    if (!gameOver) rafId = requestAnimationFrame(tick);
  }

  function shareText() {
    const url = "https://purrscue.bisks.net/";
    return burned === 0
      ? `I rescued cats from a burning house ${saved} time${saved === 1 ? "" : "s"} and lost none of them. hero behavior. ${url}`
      : `I rescued cats from a burning house ${saved} time${saved === 1 ? "" : "s"}... and lost ${burned} to the flames (I kept throwing them back in for points). ${url}`;
  }

  function showModal() {
    els.modalTitle.textContent = burned === 0 ? "flawless rescue" : "the fire won, eventually";
    els.modalBody.textContent =
      `You pulled a cat out of the fire ${saved} time${saved === 1 ? "" : "s"}` +
      (burned ? `, but lost ${burned} of ${TOTAL_CATS} cats for good along the way.` : `, and never lost a single one.`);
    drawCard();
    els.shareBtn.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(shareText());
    els.overlay.classList.add("show");
  }

  function drawCard() {
    const ctx = els.card.getContext("2d");
    const W = 1200, H = 630;
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, "#170d0f");
    grad.addColorStop(1, "#0c0709");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = "#ff7a3c";
    ctx.beginPath();
    ctx.arc(W / 2, H * 0.72, 260, 0, Math.PI * 2);
    ctx.globalAlpha = 0.18;
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.fillStyle = "#f6eade";
    ctx.font = "700 74px 'JetBrains Mono', monospace";
    ctx.textAlign = "center";
    ctx.fillText("purrscue", W / 2, 190);

    ctx.fillStyle = "#c2a08f";
    ctx.font = "24px 'JetBrains Mono', monospace";
    ctx.fillText("a burning house, a few cats, and me", W / 2, 240);

    ctx.font = "700 96px 'JetBrains Mono', monospace";
    ctx.fillStyle = "#7fd68a";
    ctx.fillText(String(saved), W / 2 - 210, 400);
    ctx.fillStyle = "#c2a08f";
    ctx.font = "22px 'JetBrains Mono', monospace";
    ctx.fillText("saved", W / 2 - 210, 440);

    ctx.font = "700 96px 'JetBrains Mono', monospace";
    ctx.fillStyle = "#ff4d4d";
    ctx.fillText(String(burned), W / 2 + 210, 400);
    ctx.fillStyle = "#c2a08f";
    ctx.font = "22px 'JetBrains Mono', monospace";
    ctx.fillText("lost", W / 2 + 210, 440);

    ctx.fillStyle = "#ffd27a";
    ctx.font = "26px 'JetBrains Mono', monospace";
    ctx.fillText("purrscue.bisks.net", W / 2, 560);
  }

  els.houseBtn.addEventListener("click", rescue);
  els.restartBtn.addEventListener("click", init);
  els.playAgainBtn.addEventListener("click", init);

  init();
})();
