// feedstorm: live firehose posts fly toward the camera; click to swat, or miss.
const JETSTREAM = "wss://jetstream2.us-east.bsky.network/subscribe?wantedCollections=app.bsky.feed.post";
const $ = (id) => document.getElementById(id);
const stage = $("stage"), insaneBox = $("insane"), toggleBtn = $("toggle");
const scoreEl = $("score"), statusEl = $("status"), warn = $("warn"), share = $("share");

let swatted = 0, missed = 0, paused = false, insane = false;
let buffer = []; // newest posts from the firehose; only the latest few matter for display
const BUFFER_MAX = 50; // display queue only: the firehose is far faster than anyone can read
const live = new Set();
const LIVE_MAX = 40; // DOM-node budget for a phone, not a data limit

function updateScore() {
  scoreEl.textContent = `swatted ${swatted} · missed ${missed}`;
  const text = `I swatted ${swatted} posts out of my feed on feedstorm${insane ? " (insanity mode)" : ""} and missed ${missed}. it's just the firehose.`;
  share.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(text + "\nhttps://feedstorm.bisks.net/");
}

// ---- firehose ----
let ws, backoff = 1000;
function connect() {
  statusEl.textContent = "connecting…";
  ws = new WebSocket(JETSTREAM);
  ws.onopen = () => { backoff = 1000; statusEl.textContent = "● live"; };
  ws.onmessage = (e) => {
    let m; try { m = JSON.parse(e.data); } catch { return; }
    const r = m.commit && m.commit.operation === "create" && m.commit.record;
    if (!r || typeof r.text !== "string" || !r.text.trim()) return;
    buffer.push({ did: m.did, text: r.text });
    if (buffer.length > BUFFER_MAX) buffer.shift();
  };
  ws.onclose = () => {
    statusEl.textContent = "reconnecting…";
    setTimeout(connect, backoff);
    backoff = Math.min(backoff * 2, 15000);
  };
  ws.onerror = () => ws.close();
}

// ---- projectiles ----
function spawn(p) {
  if (live.size >= LIVE_MAX) return;
  const el = document.createElement("div");
  el.className = "post";
  const hue = Math.floor(Math.random() * 360);
  el.style.setProperty("--h", hue);
  const who = document.createElement("b");
  who.textContent = p.did.replace("did:plc:", "").slice(0, 14) + "…";
  const body = document.createElement("span");
  body.textContent = p.text.length > 160 ? p.text.slice(0, 160) + "…" : p.text;
  el.append(who, body);
  const w = window.innerWidth, h = window.innerHeight;
  const o = {
    el,
    x: (Math.random() - 0.5) * w * 0.9 + w / 2 - 140,
    y: (Math.random() - 0.5) * h * 0.7 + h / 2 - 40,
    z: -2200,
    vz: (insane ? 900 : 380) * (0.7 + Math.random() * 0.6),
    rot: 0,
    vr: insane ? (Math.random() - 0.5) * 500 : 0,
    done: false,
  };
  el.addEventListener("pointerdown", (ev) => { ev.preventDefault(); swat(o); });
  live.add(o);
  stage.appendChild(el);
}
function swat(o) {
  if (o.done) return;
  o.done = true; swatted++; updateScore();
  o.el.classList.add("hit");
  o.el.style.transform = `translate3d(${o.x}px,${o.y}px,${o.z + 400}px) rotate(${o.rot + 90}deg) scale(1.4)`;
  setTimeout(() => { o.el.remove(); live.delete(o); }, 280);
}

let last = performance.now(), acc = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (!paused) {
    acc += dt * (insane ? 14 : 1.3);
    while (acc >= 1) {
      acc -= 1;
      const p = buffer.pop(); // newest first
      if (p) spawn(p);
    }
    if (buffer.length > 20) buffer.splice(0, buffer.length - 20);
    for (const o of live) {
      if (o.done) continue;
      o.z += o.vz * dt; o.rot += o.vr * dt;
      if (o.z > 560) { // past the camera: it hit you
        o.done = true; missed++; updateScore();
        o.el.remove(); live.delete(o); continue;
      }
      const fade = Math.min(1, (o.z + 2200) / 600);
      o.el.style.opacity = fade;
      o.el.style.transform = `translate3d(${o.x}px,${o.y}px,${o.z}px) rotate(${o.rot}deg)`;
    }
  }
  requestAnimationFrame(frame);
}

insaneBox.addEventListener("change", () => {
  insane = insaneBox.checked;
  document.body.classList.toggle("insane", insane);
  warn.hidden = !insane;
  if (insane) setTimeout(() => { warn.hidden = true; }, 2500);
  updateScore();
});
toggleBtn.addEventListener("click", () => {
  paused = !paused;
  toggleBtn.textContent = paused ? "resume" : "pause";
});

updateScore();
connect();
requestAnimationFrame(frame);
