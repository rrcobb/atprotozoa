// bleekcube — a Curiosity-style cube where each cubelet is a live post.
// Everything is client-side: Jetstream feeds a buffer, tapping a cubelet
// pulls a post out of it. Progress lives in localStorage (per browser).
const JETSTREAM = "wss://jetstream2.us-east.bsky.network/subscribe?wantedCollections=app.bsky.feed.post";
// Sizes shrink toward the center: each layer is a smaller square face.
const LAYERS = [11, 9, 7, 5, 3, 1];
const NAMES = ["#hashtags", "notifications", "replies", "quote posts", "the discourse", "the center"];
const PICKS = [
  { name: "hand", cost: 0, r: 0 },
  { name: "iron pick (plus)", cost: 25, r: 1 },
  { name: "diamond pick (3×3)", cost: 120, r: 2 },
];
const KEY = "bleekcube.v1";
const TOTAL = LAYERS.reduce((a, n) => a + n * n, 0);

const $ = (id) => document.getElementById(id);
const fresh = () => ({ dug: LAYERS.map((n) => new Array(n * n).fill(0)), coins: 0, pick: 0, posts: 0 });
let st;
try { st = JSON.parse(localStorage.getItem(KEY)); } catch {}
if (!st || !Array.isArray(st.dug) || st.dug.length !== LAYERS.length) st = fresh();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch {} };

// Post buffer: newest posts in, oldest-used out. Keeps a small recycle pool so a
// quiet firehose never leaves a cubelet empty. 300 is a memory/latency choice:
// plenty to outlast a burst of taps, while keeping posts fresh.
const buf = [];
const pool = [];
const BUF_MAX = 300;
function onPost(m) {
  const rec = m.commit && m.commit.record;
  if (!rec || m.commit.operation !== "create" || !rec.text || rec.text.length < 4) return;
  const p = { did: m.did, rkey: m.commit.rkey, text: rec.text };
  buf.push(p);
  if (buf.length > BUF_MAX) pool.push(buf.shift()), pool.length > 200 && pool.shift();
}
function connect() {
  const ws = new WebSocket(JETSTREAM);
  ws.onopen = () => { $("conn").textContent = "● live"; };
  ws.onmessage = (e) => { try { onPost(JSON.parse(e.data)); } catch {} };
  ws.onclose = () => { $("conn").textContent = "reconnecting…"; setTimeout(connect, 2000); };
  ws.onerror = () => ws.close();
}
function takePost() {
  const p = buf.length ? buf.splice(Math.floor(Math.random() * buf.length), 1)[0] : pool[Math.floor(Math.random() * pool.length)];
  return p || { did: "", rkey: "", text: "(the firehose is quiet… this cubelet was empty)" };
}

function curLayer() { return st.dug.findIndex((l) => l.some((v) => !v)); }

function showPost(p) {
  const feed = $("feed");
  const d = document.createElement("div");
  d.className = "post fresh";
  const t = document.createElement("div");
  t.textContent = p.text.slice(0, 300);
  d.appendChild(t);
  if (p.did) {
    const a = document.createElement("a");
    a.href = `https://bsky.app/profile/${p.did}/post/${p.rkey}`;
    a.target = "_blank"; a.rel = "noopener";
    a.textContent = p.did.slice(-8) + " ↗";
    d.appendChild(a);
  }
  feed.prepend(d);
  setTimeout(() => d.classList.remove("fresh"), 900);
  while (feed.children.length > 6) feed.lastChild.remove();
}

function dig(li, idx) {
  const n = LAYERS[li], r = PICKS[st.pick].r;
  const x0 = idx % n, y0 = Math.floor(idx / n);
  let gained = 0, first = true;
  for (let y = y0 - r; y <= y0 + r; y++) for (let x = x0 - r; x <= x0 + r; x++) {
    if (x < 0 || y < 0 || x >= n || y >= n) continue;
    if (r === 1 && x !== x0 && y !== y0) continue; // plus shape
    const i = y * n + x;
    if (st.dug[li][i]) continue;
    st.dug[li][i] = 1; gained++;
    if (first) { showPost(takePost()); first = false; }
    else takePost(); // splash cubelets burn a post without displaying it
  }
  st.coins += gained * (li + 1);
  st.posts += gained;
  save(); render();
}

function render() {
  const li = curLayer();
  const dugN = st.dug.reduce((a, l) => a + l.reduce((b, v) => b + v, 0), 0);
  $("n-dug").textContent = dugN; $("n-total").textContent = TOTAL;
  $("n-coins").textContent = st.coins;
  const cube = $("cube");
  cube.textContent = "";
  const shop = $("shop"); shop.textContent = "";
  PICKS.forEach((p, i) => {
    const b = document.createElement("button");
    b.className = "b" + (st.pick === i ? " on" : "");
    b.textContent = i <= st.pick && i ? `${p.name} ✓` : `${p.name}${p.cost ? ` — ${p.cost}c` : ""}`;
    b.disabled = i <= st.pick ? i !== st.pick && i < st.pick : st.coins < p.cost;
    b.onclick = () => {
      if (i <= st.pick) { st.pick = i; }
      else if (st.coins >= p.cost) { st.coins -= p.cost; st.pick = i; }
      save(); render();
    };
    if (i < st.pick) b.disabled = false; // can switch back down to a lesser tool
    shop.appendChild(b);
  });
  if (li < 0) {
    $("layername").textContent = "";
    $("n-layer").textContent = LAYERS.length;
    $("center").hidden = false; $("center").classList.add("show");
    $("center-text").textContent = `you dug through ${st.posts} cubelets, each one a real bleesk. inside the cube there was nothing but the people who made it. life-changingly amazing, as promised.`;
    $("share").href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(`I dug to the center of the cube of everyone's bleesks (${st.posts} cubelets) and found... all of you.\n\nhttps://bleekcube.bisks.net/`);
    return;
  }
  $("center").hidden = true; $("center").classList.remove("show");
  $("n-layer").textContent = li + 1;
  $("layername").textContent = `layer ${li + 1} of ${LAYERS.length} — ${NAMES[li]}`;
  const n = LAYERS[li];
  const s = Math.min(34, Math.floor((Math.min(innerWidth, 420) - 40) / n));
  cube.style.setProperty("--s", s + "px");
  cube.style.gridTemplateColumns = `repeat(${n}, ${s}px)`;
  st.dug[li].forEach((v, i) => {
    const c = document.createElement("button");
    c.className = "cl" + (v ? " gone" : "");
    c.setAttribute("aria-label", "cubelet");
    c.onclick = () => dig(li, i);
    cube.appendChild(c);
  });
}

$("again").onclick = () => { st = fresh(); save(); $("feed").textContent = ""; render(); };
render();
connect();
