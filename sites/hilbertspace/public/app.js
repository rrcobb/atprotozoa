import { makeState, probs, phaseAt, measure, hash } from "./lib/state.js";

const JETSTREAM = "wss://jetstream2.us-east.bsky.network/subscribe?wantedCollections=app.bsky.feed.post";
// Clouds alive on screen. A legibility limit: each one is up to six words of
// text, and past ~70 the canvas is an unreadable smear (which is the idea, but
// hover has to be able to find one).
const MAX_CLOUDS = 70;
const PICK_R = 70;       // px: how close the pointer must be to "look at" a cloud
const COLLAPSED_MS = 7000;

const cv = document.getElementById("cv");
const ctx = cv.getContext("2d");
const statsEl = document.getElementById("stats");
const shareEl = document.getElementById("share");
const observeBtn = document.getElementById("observe");

let W = 0, H = 0, dpr = 1;
function resize() {
  dpr = window.devicePixelRatio || 1;
  W = window.innerWidth; H = window.innerHeight;
  cv.width = Math.floor(W * dpr); cv.height = Math.floor(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener("resize", resize);
resize();

let clouds = [];
let seen = 0, measured = 0, connected = false;
let observeAll = false;
let lastWord = "";

function addCloud(text) {
  const st = makeState(text);
  if (!st) return;
  seen++;
  const h = hash(text);
  clouds.push({
    st, born: performance.now(),
    x: 60 + (h % 1000) / 1000 * Math.max(1, W - 120),
    y: H + 20,
    vy: 6 + ((h >>> 10) % 100) / 100 * 10, // px/s drift upward
    hue: h % 360,
    // each word sits at its own fixed offset around the cloud centre
    off: st.words.map((w) => { const g = hash(w + "~"); return [((g % 200) - 100) * 0.55, (((g >>> 9) % 100) - 50) * 0.5]; }),
    result: null,
  });
  if (clouds.length > MAX_CLOUDS) clouds.shift();
}

let ws = null, retry = 1000;
function connect() {
  ws = new WebSocket(JETSTREAM);
  ws.onopen = () => { connected = true; retry = 1000; };
  ws.onmessage = (ev) => {
    let m; try { m = JSON.parse(ev.data); } catch { return; }
    if (m.kind !== "commit" || m.commit?.operation !== "create") return;
    const t = m.commit.record?.text;
    // the firehose is far faster than anyone can read; thin to a watchable pace
    if (typeof t === "string" && t.length && performance.now() - lastAdd > 180) { lastAdd = performance.now(); addCloud(t); }
  };
  ws.onclose = () => { connected = false; setTimeout(connect, retry); retry = Math.min(retry * 2, 15000); };
  ws.onerror = () => { try { ws.close(); } catch {} };
}
let lastAdd = 0;
connect();

function collapse(c, now) {
  if (c.result) return;
  const r = measure(c.st);
  c.result = { ...r, at: now };
  measured++;
  lastWord = r.word;
}

// ---- observation -------------------------------------------------------
function look(px, py) {
  const now = performance.now();
  let best = null, bd = PICK_R;
  for (const c of clouds) {
    if (c.result) continue;
    const d = Math.hypot(c.x - px, cy(c, now) - py);
    if (d < bd) { bd = d; best = c; }
  }
  if (best) collapse(best, now);
}
function cy(c, now) { return c.y - c.vy * (now - c.born) / 1000; }
cv.addEventListener("pointermove", (e) => look(e.clientX, e.clientY));
cv.addEventListener("pointerdown", (e) => look(e.clientX, e.clientY));
observeBtn.addEventListener("click", () => {
  observeAll = !observeAll;
  observeBtn.classList.toggle("on", observeAll);
  observeBtn.textContent = observeAll ? "stop observing" : "observe everything";
});

// ---- render ------------------------------------------------------------
function frame(now) {
  requestAnimationFrame(frame);
  ctx.fillStyle = "rgba(5,3,10,0.28)"; // trails: unobserved futures leave a haze
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const alive = [];
  for (const c of clouds) {
    const y = cy(c, now);
    if (y < -60) continue;
    if (c.result && now - c.result.at > COLLAPSED_MS) continue;
    if (observeAll && !c.result && y < H - 40) collapse(c, now);
    alive.push(c);
    const { st } = c;
    if (c.result) {
      const age = (now - c.result.at) / COLLAPSED_MS;
      ctx.globalAlpha = Math.max(0, 1 - age * age);
      ctx.fillStyle = `hsl(${c.hue},90%,85%)`;
      ctx.font = "600 22px ui-monospace,Menlo,monospace";
      ctx.fillText(c.result.word, c.x, y);
      ctx.font = "10px ui-monospace,Menlo,monospace";
      ctx.fillStyle = "#b9a8ff";
      ctx.fillText(`p = ${c.result.p.toFixed(2)} · ${st.words.length - 1} other futures gone`, c.x, y + 18);
      continue;
    }
    const p = probs(st);
    for (let i = 0; i < st.words.length; i++) {
      const ph = phaseAt(st, i, now - c.born);
      // brightness follows the probability; phase makes it breathe
      const a = Math.min(1, (0.15 + p[i] * 1.8) * (0.55 + 0.45 * Math.cos(ph)));
      ctx.globalAlpha = Math.max(0.04, a);
      ctx.fillStyle = `hsl(${(c.hue + i * 24) % 360},75%,${60 + 20 * Math.sin(ph)}%)`;
      ctx.font = `${Math.round(10 + p[i] * 30)}px ui-monospace,Menlo,monospace`;
      ctx.fillText(st.words[i], c.x + c.off[i][0], y + c.off[i][1]);
    }
  }
  ctx.globalAlpha = 1;
  clouds = alive;
  updateStats();
}

let tick = 0;
function updateStats() {
  if (++tick % 10) return;
  if (seen === 0) {
    statsEl.innerHTML = '<span id="status">' + (connected ? "waiting for the first post…" : "connecting to the firehose…") + "</span>";
    return;
  }
  const open = Math.max(0, seen - measured);
  statsEl.textContent = `${seen.toLocaleString()} states prepared · ${measured.toLocaleString()} collapsed · ${open.toLocaleString()} still undecided` + (lastWord ? ` · last observed: ${lastWord}` : "");
  shareEl.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(
    `I watched ${seen.toLocaleString()} bluesky posts as quantum states and collapsed ${measured.toLocaleString()} of them to a single word. https://hilbertspace.bisks.net/`);
}
requestAnimationFrame(frame);
