// uuidfountain — counter, localStorage lifetime tally, and share wiring.
// Deliberately has no `three` import so it starts running immediately even
// while scene.js is still fetching three.js from the CDN; every call into
// window.fountainScene is optional-chained for that reason.

const SITE_URL = "https://uuidfountain.bisks.net/";
const RATE_TARGET = 45000; // UUIDs/sec, the "extreme rate" the brief asked for
const LIFETIME_KEY = "uuidfountain:lifetime";

const els = {
  count: document.getElementById("count"),
  rate: document.getElementById("rate"),
  lifetime: document.getElementById("lifetime"),
  latest: document.getElementById("latest"),
  pause: document.getElementById("pause"),
  burst: document.getElementById("burst"),
  share: document.getElementById("share"),
};

function fmt(n) {
  return Math.floor(n).toLocaleString("en-US");
}

let consumed = 0;
let lifetime = Number(localStorage.getItem(LIFETIME_KEY) || 0);
let latestId = "—";
let paused = false;
let lastRate = 0;

function updateShareLink() {
  const text =
    `i've personally deprived humanity of ${fmt(lifetime)} UUIDs at ${SITE_URL} ` +
    `— zero measurable impact on the remaining 5.3 undecillion, but it felt great.`;
  els.share.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(text);
}

function paintDom() {
  els.count.textContent = fmt(consumed);
  els.lifetime.textContent = fmt(lifetime);
  els.rate.textContent = fmt(lastRate);
  els.latest.textContent = latestId;
  updateShareLink();
}

let last = performance.now();
let domAcc = 0;
let persistAcc = 0;

function tick(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;

  if (!paused) {
    const jitter = 0.75 + Math.random() * 0.5;
    const batch = Math.min(3000, Math.round(RATE_TARGET * dt * jitter));
    for (let i = 0; i < batch; i++) latestId = crypto.randomUUID();
    consumed += batch;
    lifetime += batch;
    lastRate = Math.round(batch / Math.max(dt, 1e-4));
  }

  domAcc += dt;
  if (domAcc >= 0.1) {
    domAcc = 0;
    paintDom();
  }

  persistAcc += dt;
  if (persistAcc >= 2) {
    persistAcc = 0;
    localStorage.setItem(LIFETIME_KEY, String(Math.floor(lifetime)));
  }

  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

paintDom();

els.pause.addEventListener("click", () => {
  paused = !paused;
  els.pause.textContent = paused ? "resume the spray" : "pause the spray";
  els.pause.classList.toggle("paused", paused);
  window.fountainScene?.setPaused(paused);
});

els.burst.addEventListener("click", () => {
  const amount = 50000;
  latestId = crypto.randomUUID();
  consumed += amount;
  lifetime += amount;
  localStorage.setItem(LIFETIME_KEY, String(Math.floor(lifetime)));
  paintDom();
  window.fountainScene?.spawnBurst(70);
});

addEventListener("beforeunload", () => {
  localStorage.setItem(LIFETIME_KEY, String(Math.floor(lifetime)));
});
