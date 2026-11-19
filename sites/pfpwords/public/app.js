import { newCounts, addProfile, rank, classify } from "./lib/stats.js";

const CDN = "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2";
const MODEL = "Xenova/clip-vit-base-patch32";
const HOSTS = [
  "wss://jetstream2.us-east.bsky.network/subscribe",
  "wss://jetstream1.us-east.bsky.network/subscribe",
  "wss://jetstream1.us-west.bsky.network/subscribe",
  "wss://jetstream2.us-west.bsky.network/subscribe",
];
// index 0 = cat, 1 = anime, 2.. = the "neither" bucket. Only a confident
// cat/anime call is counted; anything else is skipped.
const PROMPTS = [
  "a photo of a cat", "an anime character illustration",
  "a photo of a person", "a photo of a dog", "a landscape photo", "a logo or text",
  "a cartoon that is not anime", "a photo of an object", "a selfie",
];
const CONFIDENT = 0.6; // a call under 60% is as likely a mislabel as a signal

const $ = (id) => document.getElementById(id);
const counts = newCounts();
let skipped = 0, running = false, ws = null, hostIx = 0, model = null, busy = 0;
const seen = new Set();
const queue = [];
// One image in flight at a time: CLIP in wasm is CPU-bound, and the queue
// dropping oldest-first keeps us classifying current profiles, not a backlog.
const MAX_QUEUE = 40;

const status = (s) => ($("status").textContent = s);

async function loadModel() {
  if (model) return model;
  status("loading the image model (one-time ~90MB download)…");
  const tf = await import(/* @vite-ignore */ CDN);
  tf.env.allowLocalModels = false;
  const [tok, tm, proc, vm] = await Promise.all([
    tf.AutoTokenizer.from_pretrained(MODEL),
    tf.CLIPTextModelWithProjection.from_pretrained(MODEL),
    tf.AutoProcessor.from_pretrained(MODEL),
    tf.CLIPVisionModelWithProjection.from_pretrained(MODEL),
  ]);
  const { text_embeds } = await tm(tok(PROMPTS, { padding: true, truncation: true }));
  const dim = text_embeds.dims[1];
  const text = PROMPTS.map((_, k) => Array.from(text_embeds.data.slice(k * dim, (k + 1) * dim)));
  model = { tf, proc, vm, text };
  return model;
}

function connect() {
  if (!running) return;
  const u = new URL(HOSTS[hostIx % HOSTS.length]);
  u.searchParams.set("wantedCollections", "app.bsky.actor.profile");
  ws = new WebSocket(u);
  ws.onopen = () => status("listening for new profiles…");
  ws.onmessage = (ev) => {
    let m; try { m = JSON.parse(ev.data); } catch { return; }
    const r = m.commit && m.commit.record;
    if (!r || !(m.commit.operation === "create" || m.commit.operation === "update")) return;
    const cid = r.avatar && r.avatar.ref && r.avatar.ref.$link;
    if (!cid || seen.has(m.did)) return;
    seen.add(m.did);
    queue.push({ did: m.did, cid, text: (r.displayName || "") + " " + (r.description || "") });
    if (queue.length > MAX_QUEUE) queue.shift();
    pump();
  };
  ws.onclose = () => { if (running) { hostIx++; status("reconnecting…"); setTimeout(connect, 1000); } };
  ws.onerror = () => ws.close();
}

async function pump() {
  if (busy || !model || !running) return;
  const p = queue.pop(); // newest first
  if (!p) return;
  busy = 1;
  const url = `https://cdn.bsky.app/img/avatar_thumbnail/plain/${p.did}/${p.cid}@jpeg`;
  try {
    const img = await model.tf.RawImage.read(url);
    const { image_embeds } = await model.vm(await model.proc(img));
    const pr = classify(Array.from(image_embeds.data), model.text);
    const g = pr[0] >= CONFIDENT ? "cat" : pr[1] >= CONFIDENT ? "anime" : null;
    if (g) { addProfile(counts, g, p.text); thumb(url, g); } else skipped++;
  } catch { skipped++; }
  busy = 0;
  render();
  pump();
}

function thumb(url, g) {
  const im = document.createElement("img");
  im.src = url; im.className = g; im.alt = g;
  const gal = $("gallery");
  gal.prepend(im);
  // Purely a layout choice: a couple of screens of faces is plenty.
  while (gal.children.length > 120) gal.lastChild.remove();
}

function list(el, rows, key) {
  el.textContent = "";
  if (!rows.length) { const p = document.createElement("p"); p.className = "empty"; p.textContent = "not enough data yet…"; el.append(p); return; }
  const max = Math.max(...rows.map((r) => Math.abs(r.lo)));
  for (const r of rows) {
    const d = document.createElement("div"); d.className = "row";
    const b = document.createElement("div"); b.className = "bar"; b.style.width = (Math.abs(r.lo) / max * 100).toFixed(1) + "%";
    const s = document.createElement("span");
    const w = document.createElement("b"); w.textContent = r.word; w.style.fontWeight = "600";
    const small = document.createElement("small"); small.textContent = `${r[key]} vs ${r[key === "cat" ? "anime" : "cat"]}`;
    s.append(w, small); d.append(b, s); el.append(d);
  }
}

function render() {
  $("tc").firstElementChild.textContent = counts.cat.n;
  $("ta").firstElementChild.textContent = counts.anime.n;
  $("to").firstElementChild.textContent = skipped;
  const r = rank(counts);
  list($("listc"), r.cat, "cat");
  list($("lista"), r.anime, "anime");
  const t = (a) => a.slice(0, 5).map((x) => x.word).join(", ");
  const text = `cat pfps vs anime pfps on bluesky, by bio words (n=${counts.cat.n + counts.anime.n}):\n🐱 ${t(r.cat) || "…"}\n✨ ${t(r.anime) || "…"}\nhttps://pfpwords.bisks.net/`;
  $("share").href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(text);
}

$("go").onclick = async () => {
  if (running) return;
  running = true; $("go").disabled = true; $("stop").disabled = false;
  try { await loadModel(); } catch (e) {
    running = false; $("go").disabled = false; $("stop").disabled = true;
    status("couldn't load the image model: " + (e && e.message || e)); return;
  }
  connect(); pump();
};
$("stop").onclick = () => {
  running = false; if (ws) ws.close();
  $("go").disabled = false; $("go").textContent = "resume"; $("stop").disabled = true;
  status("paused");
};
render();
