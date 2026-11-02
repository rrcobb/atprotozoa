// triplehose: one Jetstream socket in the tab, three matchers, three columns.
const HANDLE = "cee.wtf";
const JETSTREAM = "wss://jetstream2.us-east.bsky.network/subscribe?wantedCollections=app.bsky.feed.post";
const APPVIEW = "https://public.api.bsky.app/xrpc/";
// Rendered rows per column. This is a DOM-size limit for the browser tab, not a data limit:
// the counters keep counting every match.
const KEEP = 60;

const KANYE = /\b(kanye|yeezy|yeezus|ye west)\b/i;
const CAT = /\b(cats?|kitty|kitties|kitten|kittens|caturday|catsofbluesky|tabby|meow)\b|[🐱🐈😺😸😻]/iu;

const $ = (id) => document.getElementById(id);
const cols = { cee: $("cee"), kanye: $("kanye"), cat: $("cat") };
const counts = { cee: 0, kanye: 0, cat: 0 };
let scanned = 0, ceeDid = null, paused = false;
const queue = [];

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function imagesOf(embed) {
  if (!embed) return [];
  if (embed.$type === "app.bsky.embed.images") return embed.images || [];
  if (embed.$type === "app.bsky.embed.recordWithMedia") return imagesOf(embed.media);
  return [];
}
function embeddedUri(embed) {
  if (!embed) return "";
  if (embed.record && embed.record.uri) return embed.record.uri;
  if (embed.record && embed.record.record && embed.record.record.uri) return embed.record.record.uri;
  return "";
}

export function classify(did, rec, ceeDidValue) {
  const text = rec.text || "";
  const imgs = imagesOf(rec.embed);
  const hits = [];
  let ceeHit = ceeDidValue && did === ceeDidValue;
  if (new RegExp("(^|[^\\w.])@?" + HANDLE.replace(".", "\\."), "i").test(text)) ceeHit = true;
  if (ceeDidValue) {
    for (const f of rec.facets || []) for (const feat of f.features || []) if (feat.did === ceeDidValue) ceeHit = true;
    const refs = [rec.reply && rec.reply.parent && rec.reply.parent.uri, rec.reply && rec.reply.root && rec.reply.root.uri, embeddedUri(rec.embed)];
    if (refs.some((u) => u && u.startsWith("at://" + ceeDidValue + "/"))) ceeHit = true;
  }
  if (ceeHit) hits.push("cee");
  const alts = imgs.map((i) => i.alt || "").join(" ");
  if (KANYE.test(text) || KANYE.test(alts)) hits.push("kanye");
  if (imgs.length && (CAT.test(text) || CAT.test(alts) || (rec.tags || []).some((t) => CAT.test(t)))) hits.push("cat");
  return hits;
}

function card(kind, did, rkey, rec) {
  const url = `https://bsky.app/profile/${did}/post/${rkey}`;
  let thumbs = "";
  if (kind === "cat") {
    thumbs = '<div class="pics">' + imagesOf(rec.embed).slice(0, 4).map((i) => {
      const cid = i.image && i.image.ref && i.image.ref.$link;
      return cid ? `<a href="${url}" target="_blank" rel="noopener"><img loading="lazy" alt="${esc(i.alt || "")}" src="https://cdn.bsky.app/img/feed_thumbnail/plain/${did}/${cid}@jpeg"></a>` : "";
    }).join("") + "</div>";
  }
  const el = document.createElement("article");
  el.className = "post";
  el.innerHTML = `<div class="who"><span class="did" data-did="${did}">${esc(did.slice(0, 22))}…</span> <a href="${url}" target="_blank" rel="noopener">open ↗</a></div><p>${esc(rec.text || "")}</p>${thumbs}`;
  return el;
}

const handles = new Map();
async function resolveHandle(did, span) {
  if (!handles.has(did)) {
    handles.set(did, fetch(APPVIEW + "app.bsky.actor.getProfile?actor=" + encodeURIComponent(did)).then((r) => (r.ok ? r.json() : null)).then((j) => (j && j.handle) || null).catch(() => null));
  }
  const h = await handles.get(did);
  if (h) span.textContent = "@" + h;
}

function show(kind, did, rkey, rec) {
  counts[kind]++;
  $("n-" + kind).textContent = counts[kind].toLocaleString();
  const col = cols[kind];
  $("empty-" + kind).hidden = true;
  const el = card(kind, did, rkey, rec);
  col.prepend(el);
  while (col.children.length > KEEP) col.lastChild.remove();
  resolveHandle(did, el.querySelector(".did"));
}

function onEvent(ev) {
  if (ev.kind !== "commit" || !ev.commit || ev.commit.operation !== "create" || ev.commit.collection !== "app.bsky.feed.post") return;
  scanned++;
  const rec = ev.commit.record;
  if (!rec) return;
  for (const kind of classify(ev.did, rec, ceeDid)) queue.push([kind, ev.did, ev.commit.rkey, rec]);
}

function flush() {
  $("scanned").textContent = scanned.toLocaleString();
  if (paused) return;
  for (const q of queue.splice(0)) show(...q);
}

let backoff = 1000;
function connect() {
  $("status").textContent = "connecting…";
  const ws = new WebSocket(JETSTREAM);
  ws.onopen = () => { backoff = 1000; $("dot").classList.add("live"); $("status").textContent = "live"; };
  ws.onmessage = (m) => { try { onEvent(JSON.parse(m.data)); } catch {} };
  ws.onclose = () => { $("dot").classList.remove("live"); $("status").textContent = "disconnected, retrying…"; setTimeout(connect, backoff); backoff = Math.min(backoff * 2, 30000); };
  ws.onerror = () => ws.close();
}

async function start() {
  try {
    const r = await fetch(APPVIEW + "com.atproto.identity.resolveHandle?handle=" + HANDLE);
    if (r.ok) ceeDid = (await r.json()).did;
  } catch {}
  $("cee-note").textContent = ceeDid ? "mentions, replies, quotes and posts by @" + HANDLE : "text mentions of @" + HANDLE + " only (couldn't resolve the DID)";
  connect();
}

if (typeof document !== "undefined") {
  $("pause").addEventListener("click", () => {
    paused = !paused;
    $("pause").textContent = paused ? "resume" : "pause";
  });
  const share = () => {
    const text = `triplehose: watching Bluesky live — ${counts.cee} about @${HANDLE}, ${counts.kanye} about Kanye, ${counts.cat} cat photos so far`;
    return "https://bsky.app/intent/compose?text=" + encodeURIComponent(text + "\nhttps://triplehose.bisks.net/");
  };
  $("share").addEventListener("click", (e) => { e.currentTarget.href = share(); });
  setInterval(flush, 700);
  start();
}
