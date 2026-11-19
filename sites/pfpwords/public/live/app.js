import { newCounts, addPost, rank, classify } from "../lib/stats.js";

const CDN = "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2";
const MODEL = "Xenova/clip-vit-base-patch32";
const HOSTS = [
  "wss://jetstream2.us-east.bsky.network/subscribe",
  "wss://jetstream1.us-east.bsky.network/subscribe",
  "wss://jetstream1.us-west.bsky.network/subscribe",
  "wss://jetstream2.us-west.bsky.network/subscribe",
];
// Several phrasings per class; their probabilities are summed per class. The
// "other" prompts exist so a person/dog/logo avatar has somewhere else to go.
const PROMPTS = [
  ["cat", "a photo of a cat"], ["cat", "a close-up of a cat's face"], ["cat", "a cute kitten"], ["cat", "a cat sitting"],
  ["anime", "an anime character"], ["anime", "anime art of a girl"], ["anime", "a manga illustration"], ["anime", "an anime-style drawing"],
  ["other", "a photo of a person"], ["other", "a selfie of a person"], ["other", "a photo of a dog"], ["other", "a landscape photo"],
  ["other", "a logo or text"], ["other", "a cartoon that is not anime"], ["other", "a photo of an object"], ["other", "a photo of an animal"],
  ["other", "a drawing of a character"], ["other", "a plain colored picture"],
];
const GROUPS = PROMPTS.map((p) => p[0]);
const CONFIDENT = 0.5; // the class must hold the majority of the probability mass
const FEED = "https://public.api.bsky.app/xrpc/";
// Posts pulled per account when it's classified: one page, a stated product
// decision (a sample of the account's recent voice, one request each); posts
// that arrive live afterwards keep adding.
const FEED_LIMIT = 100;

const $ = (id) => document.getElementById(id);
const counts = newCounts();
let skipped = 0, pending = [], running = false, ws = null, hostIx = 0, model = null, busy = 0;
const seen = new Set();
const groupOf = new Map(); // did -> "cat" | "anime" once classified
const why = { other: 0, fail: 0 };
let lastErr = "";
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
  const { text_embeds } = await tm(tok(PROMPTS.map((p) => p[1]), { padding: true, truncation: true }));
  const dim = text_embeds.dims[1];
  const text = PROMPTS.map((_, k) => Array.from(text_embeds.data.slice(k * dim, (k + 1) * dim)));
  model = { tf, proc, vm, text };
  return model;
}

function connect() {
  if (!running) return;
  const u = new URL(HOSTS[hostIx % HOSTS.length]);
  u.searchParams.set("wantedCollections", "app.bsky.feed.post");
  ws = new WebSocket(u);
  ws.onopen = () => status("listening for posts…");
  ws.onmessage = (ev) => {
    let m; try { m = JSON.parse(ev.data); } catch { return; }
    const c = m.commit, r = c && c.record;
    if (!r || c.operation !== "create" || !r.text) return;
    const g = groupOf.get(m.did);
    if (g) { addPost(counts, m.did, g, r.text); dirty = true; return; }
    if (seen.has(m.did)) return;
    seen.add(m.did);
    pending.push(m.did);
    if (pending.length >= 25) flush();
  };
  ws.onclose = () => { if (running) { hostIx++; status("reconnecting…"); setTimeout(connect, 1000); } };
  ws.onerror = () => ws.close();
}

let dirty = false;
// Poster DIDs -> avatars, 25 per getProfiles call (the endpoint's max).
async function flush() {
  if (!pending.length) return;
  const batch = pending.splice(0, 25);
  try {
    const q = batch.map((d) => "actors=" + encodeURIComponent(d)).join("&");
    const res = await fetch(FEED + "app.bsky.actor.getProfiles?" + q);
    if (!res.ok) return;
    const { profiles } = await res.json();
    for (const p of profiles) {
      if (!p.avatar) continue;
      queue.push({ did: p.did, url: p.avatar.replace("/img/avatar/", "/img/avatar_thumbnail/") });
      if (queue.length > MAX_QUEUE) queue.shift();
    }
    pump();
  } catch {}
}

// cdn.bsky.app sends no CORS headers, so the model's fetch() of an avatar URL
// is blocked from the browser. Pull the pixels through CORS-friendly routes:
// a resizing image proxy (wsrv.nl, small and fast), else the blob straight
// from the account's own PDS (plc.directory and PDSes send ACAO: *).
const pdsOf = new Map();
async function pds(did) {
  if (pdsOf.has(did)) return pdsOf.get(did);
  const u = did.startsWith("did:web:") ? `https://${did.slice(8)}/.well-known/did.json` : `https://plc.directory/${did}`;
  const doc = await (await fetch(u)).json();
  const svc = (doc.service || []).find((x) => x.id === "#atproto_pds");
  if (!svc) throw new Error("no PDS in DID doc");
  pdsOf.set(did, svc.serviceEndpoint);
  return svc.serviceEndpoint;
}
async function avatarBlobUrl(p) {
  try {
    const r = await fetch("https://wsrv.nl/?output=jpg&w=224&h=224&url=" + encodeURIComponent(p.url));
    if (!r.ok) throw new Error("proxy " + r.status);
    return URL.createObjectURL(await r.blob());
  } catch {
    const cid = p.url.split("/").pop().split("@")[0];
    const host = await pds(p.did);
    const r = await fetch(`${host}/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(p.did)}&cid=${cid}`);
    if (!r.ok) throw new Error("getBlob " + r.status);
    return URL.createObjectURL(await r.blob());
  }
}

async function ownPosts(did) {
  try { return await ownPostsRaw(did); } catch { return []; }
}
async function ownPostsRaw(did) {
  const res = await fetch(`${FEED}app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(did)}&filter=posts_no_replies&limit=${FEED_LIMIT}`);
  if (!res.ok) return [];
  const { feed } = await res.json();
  return feed.filter((f) => !f.reason && f.post.record && f.post.record.text).map((f) => f.post.record.text);
}

async function pump() {
  if (busy || !model || !running) return;
  const p = queue.pop(); // newest first
  if (!p) return;
  busy = 1;
  try {
    const blobUrl = await avatarBlobUrl(p);
    let img;
    try { img = await model.tf.RawImage.read(blobUrl); } finally { URL.revokeObjectURL(blobUrl); }
    const { image_embeds } = await model.vm(await model.proc(img));
    const pr = classify(Array.from(image_embeds.data), model.text, GROUPS);
    const g = pr.cat >= CONFIDENT ? "cat" : pr.anime >= CONFIDENT ? "anime" : null;
    if (g) {
      const posts = await ownPosts(p.did);
      groupOf.set(p.did, g);
      addPost(counts, p.did, g, posts.join("\n"));
      thumb(p.url, g);
    } else { skipped++; why.other++; }
  } catch (e) { skipped++; why.fail++; lastErr = (e && e.message) || String(e); }
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
  dirty = false;
  $("why").textContent = `skipped: ${why.other} had some other kind of avatar, ${why.fail} wouldn't load${lastErr ? " (last error: " + lastErr + ")" : ""}`;
  $("tc").firstElementChild.textContent = counts.cat.n;
  $("ta").firstElementChild.textContent = counts.anime.n;
  $("to").firstElementChild.textContent = skipped;
  const r = rank(counts);
  list($("listc"), r.cat, "cat");
  list($("lista"), r.anime, "anime");
  const t = (a) => a.slice(0, 5).map((x) => x.word).join(", ");
  const text = `cat pfps vs anime pfps on bluesky, by what they post (n=${counts.cat.n + counts.anime.n}):\n🐱 ${t(r.cat) || "…"}\n✨ ${t(r.anime) || "…"}\nhttps://pfpwords.bisks.net/live/`;
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
setInterval(() => { if (dirty) render(); }, 1000);
setInterval(flush, 2000); // don't strand a partial batch on a quiet moment
