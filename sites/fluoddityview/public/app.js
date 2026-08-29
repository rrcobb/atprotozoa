// fluoddityview — a real Bluesky app view where every post's author line,
// body text, and context line render as fluoddity particle swarms
// (particle-font.js) instead of static type. Background is the same
// attraction-matrix particle-life sim as important-art, at a lower particle
// count since this page also runs two live swarms per visible post.
import { fetchDiscoverPosts, fetchAuthorPosts } from "./lib/feed.js";

// ---------- background particle-life scene ----------
(function () {
  const canvas = document.getElementById("bgScene");
  const ctx = canvas.getContext("2d");
  const COLORS = ["#ff5c8a", "#ffd166", "#4ecdc4", "#8c7bff", "#38bdf8", "#9dffb0"];
  const N = 400; // lighter than important-art's 900: this page also runs per-post swarms
  const RMAX = 62;
  const BETA = 0.28;
  const FRICTION = 0.82;
  const FORCE_SCALE = 0.55;

  let W, H, cellSize, rows;
  const px = new Float32Array(N);
  const py = new Float32Array(N);
  const pvx = new Float32Array(N);
  const pvy = new Float32Array(N);
  const pc = new Uint8Array(N);
  let rules = randomRules();

  function randomRules() {
    const c = COLORS.length;
    const m = [];
    for (let i = 0; i < c; i++) {
      const row = [];
      for (let j = 0; j < c; j++) row.push(Math.random() * 2 - 1);
      m.push(row);
    }
    return m;
  }

  function scatter() {
    for (let i = 0; i < N; i++) {
      px[i] = Math.random() * W;
      py[i] = Math.random() * H;
      pvx[i] = 0;
      pvy[i] = 0;
      pc[i] = Math.floor(Math.random() * COLORS.length);
    }
  }

  function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
    cellSize = RMAX;
    rows = Math.max(1, Math.ceil(H / cellSize));
  }
  window.addEventListener("resize", resize);
  resize();
  scatter();

  function step() {
    const buckets = new Map();
    for (let i = 0; i < N; i++) {
      const key = ((px[i] / cellSize) | 0) * rows + ((py[i] / cellSize) | 0);
      let arr = buckets.get(key);
      if (!arr) buckets.set(key, (arr = []));
      arr.push(i);
    }
    for (let i = 0; i < N; i++) {
      const cx = (px[i] / cellSize) | 0;
      const cy = (py[i] / cellSize) | 0;
      let fx = 0, fy = 0;
      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          const arr = buckets.get((cx + ox) * rows + (cy + oy));
          if (!arr) continue;
          for (let n = 0; n < arr.length; n++) {
            const j = arr[n];
            if (j === i) continue;
            const dx = px[j] - px[i];
            const dy = py[j] - py[i];
            const r = Math.sqrt(dx * dx + dy * dy);
            if (r <= 0 || r > RMAX) continue;
            const rn = r / RMAX;
            let f;
            if (rn < BETA) f = rn / BETA - 1;
            else f = rules[pc[i]][pc[j]] * (1 - Math.abs(2 * rn - 1 - BETA) / (1 - BETA));
            fx += (dx / r) * f;
            fy += (dy / r) * f;
          }
        }
      }
      pvx[i] = (pvx[i] + fx * FORCE_SCALE) * FRICTION;
      pvy[i] = (pvy[i] + fy * FORCE_SCALE) * FRICTION;
    }
    for (let i = 0; i < N; i++) {
      px[i] += pvx[i];
      py[i] += pvy[i];
      if (px[i] < 0) px[i] += W;
      if (px[i] >= W) px[i] -= W;
      if (py[i] < 0) py[i] += H;
      if (py[i] >= H) py[i] -= H;
    }
  }

  function draw() {
    ctx.fillStyle = "rgba(5,4,10,0.22)";
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < N; i++) {
      ctx.fillStyle = COLORS[pc[i]];
      ctx.fillRect(px[i], py[i], 2.2, 2.2);
    }
  }

  let running = true;
  function loop() {
    if (running) {
      step();
      draw();
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  document.addEventListener("visibilitychange", () => {
    running = !document.hidden;
  });

  window.fluoddityBg = {
    mutate() {
      const c = COLORS.length;
      for (let i = 0; i < c; i++)
        for (let j = 0; j < c; j++)
          rules[i][j] = Math.max(-1, Math.min(1, rules[i][j] + (Math.random() * 2 - 1) * 0.35));
    },
    reroll() {
      rules = randomRules();
      scatter();
    },
  };
})();

// ---------- feed rendering ----------
const feedEl = document.getElementById("feed");
const statusEl = document.getElementById("status");
const readableBtn = document.getElementById("readableBtn");

let readable = false;
let activeSwarms = []; // every live createParticleText() instance on screen right now

function clearFeed() {
  activeSwarms = [];
  feedEl.innerHTML = "";
}

function renderPosts(posts, sourceLabel) {
  clearFeed();
  posts.forEach((post) => {
    const card = document.createElement("article");
    card.className = "post" + (readable ? " readable-mode" : "");

    const ctxBox = document.createElement("div");
    ctxBox.className = "swarm-box ctx-box";
    const ctxCanvas = document.createElement("canvas");
    ctxBox.appendChild(ctxCanvas);
    const ctxSr = document.createElement("p");
    ctxSr.className = "sr-only";
    ctxSr.textContent = post.context;
    ctxBox.appendChild(ctxSr);

    const textBox = document.createElement("div");
    textBox.className = "swarm-box text-box";
    const textCanvas = document.createElement("canvas");
    textBox.appendChild(textCanvas);
    const textSr = document.createElement("p");
    textSr.className = "sr-only";
    textSr.textContent = post.text;
    textBox.appendChild(textSr);

    const link = document.createElement("a");
    link.className = "permalink";
    link.href = post.link;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = "view real post on bluesky →";

    card.appendChild(ctxBox);
    card.appendChild(textBox);
    card.appendChild(link);
    feedEl.appendChild(card);

    // maxParticles kept modest here (unlike important-art's single plaque):
    // up to PAGE_SIZE posts each run two of these swarms concurrently, so the
    // per-canvas budget has to stay small for the page as a whole to hold 60fps.
    const ctxSwarm = window.createParticleText(ctxCanvas, {
      text: post.context,
      wrap: true,
      fontFamily: "'JetBrains Mono', ui-monospace, monospace",
      fontWeight: 600,
      maxFontPx: 13,
      minFontPx: 8,
      maxParticles: 260,
      rmax: 14,
      leashK: 0.07,
      leashMax: 14,
    });
    const textSwarm = window.createParticleText(textCanvas, {
      text: post.text,
      wrap: true,
      fontFamily: "Georgia, serif",
      fontWeight: 400,
      maxFontPx: 22,
      minFontPx: 9,
      maxParticles: 900,
    });
    activeSwarms.push(ctxSwarm, textSwarm);
  });
  statusEl.textContent = `${posts.length} posts, rendered as fluoddities — ${sourceLabel}`;
}

async function loadDiscover() {
  statusEl.textContent = "loading what's hot…";
  try {
    const posts = await fetchDiscoverPosts();
    renderPosts(posts, "bluesky's what's-hot feed");
  } catch (e) {
    statusEl.textContent = `couldn't load the feed: ${e.message}`;
  }
}

async function loadAuthor(handle) {
  statusEl.textContent = `loading @${handle}'s posts…`;
  try {
    const posts = await fetchAuthorPosts(handle);
    renderPosts(posts, `@${posts[0].handle}'s recent posts`);
  } catch (e) {
    statusEl.textContent = `couldn't load that: ${e.message}`;
  }
}

document.getElementById("viewBtn").addEventListener("click", () => {
  const v = document.getElementById("handleInput").value;
  if (v.trim()) loadAuthor(v);
});
document.getElementById("handleInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.getElementById("viewBtn").click();
});
document.getElementById("discoverBtn").addEventListener("click", loadDiscover);

document.getElementById("mutateBtn").addEventListener("click", () => {
  window.fluoddityBg && window.fluoddityBg.mutate();
  activeSwarms.forEach((s) => s.mutate());
});
document.getElementById("rerollBtn").addEventListener("click", () => {
  window.fluoddityBg && window.fluoddityBg.reroll();
  activeSwarms.forEach((s) => s.reroll());
});
readableBtn.addEventListener("click", () => {
  readable = !readable;
  document.querySelectorAll(".post").forEach((p) => p.classList.toggle("readable-mode", readable));
  readableBtn.classList.toggle("active", readable);
  readableBtn.textContent = readable ? "swarm it again" : "read the text";
});

// @cee.wtf's secret handle-prefill: a single invisible character in the
// title that fills the handle input with @cee.wtf, no visual tell.
document.getElementById("secretMark").addEventListener("click", () => {
  const input = document.getElementById("handleInput");
  input.value = "@cee.wtf";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  input.focus();
});

const shareText =
  "@buildthis.bisks.net built a real bluesky app view where every post's text and " +
  "context render as living fluoddity particle swarms instead of static type. " +
  "fluoddityview.bisks.net";
document.getElementById("shareBtn").href =
  "https://bsky.app/intent/compose?text=" + encodeURIComponent(shareText);

loadDiscover();
