// unloved — shows recent posts/replies from your followers that nobody has
// liked, reposted or quoted yet, so you can be the first. Followers with fewer
// followers rank higher and the list is spread across many different followers
// (lib/rank.js). Follower DIDs come from Constellation in bulk (1000/page),
// falling back to a getFollowers walk to exhaustion; followers are then scanned
// in shuffled batches until there's a screenful of candidates.

import { login, completeLoginIfCallback, getSession, clearSession } from "./lib/oauth.js";
import { likePost, repostPost, quotePost } from "./lib/actions.js";
import { followerDids } from "./lib/microcosm.js";
import { rank, isUnloved } from "./lib/rank.js";

const $ = (id) => document.getElementById(id);
const APPVIEW = "https://public.api.bsky.app/xrpc";
const BATCH = 30; // followers per scan step (a work unit — scanning continues batch after batch until every follower is covered)
const PARALLEL = 6; // concurrent feed fetches, polite to the AppView
const TARGET = 20; // keep scanning until this many unacted posts are queued

let session = null;
let followers = []; // shuffled DIDs not yet scanned
let totalFollowers = 0;
let scanned = 0;
let scanning = false;
let pool = []; // candidate items
const acted = new Set(); // post uris already handled this session
const seenUris = new Set();

const cleanHandle = (s) => (s || "").trim().replace(/^@/, "");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function setStatus(msg, cls = "") {
  const el = $("status");
  el.textContent = msg;
  el.className = "status " + cls;
}

function renderAuth() {
  const on = !!session;
  $("signinRow").hidden = on;
  $("panel").hidden = !on;
  $("who").textContent = on ? `signed in as ${session.handle || session.did}` : "not signed in.";
}

async function xrpc(method, params) {
  const url = new URL(`${APPVIEW}/${method}`);
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) v.forEach((x) => url.searchParams.append(k, x));
    else url.searchParams.set(k, v);
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url);
    if (res.status === 429) { await sleep(1500 * (attempt + 1)); continue; }
    if (!res.ok) throw new Error(`${method} ${res.status}`);
    return res.json();
  }
  throw new Error(`${method} rate-limited`);
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function loadFollowers() {
  setStatus("listing your followers…");
  try {
    return await followerDids(session.did, { onStep: (n) => setStatus(`listing your followers… ${n}`) });
  } catch {
    // Constellation down: walk the AppView's follower list until the cursor ends.
    const out = [];
    let cursor;
    do {
      const d = await xrpc("app.bsky.graph.getFollowers", { actor: session.did, limit: 100, ...(cursor ? { cursor } : {}) });
      for (const f of d.followers || []) out.push(f.did);
      cursor = (d.followers || []).length ? d.cursor : undefined;
      setStatus(`listing your followers… ${out.length}`);
    } while (cursor);
    return out;
  }
}

async function profilesFor(dids) {
  const map = new Map();
  for (let i = 0; i < dids.length; i += 25) {
    try {
      const d = await xrpc("app.bsky.actor.getProfiles", { actors: dids.slice(i, i + 25) });
      for (const p of d.profiles || []) map.set(p.did, p);
    } catch {}
  }
  return map;
}

function windowMs() { return Number($("window").value) * 3600e3; }

async function scanFeed(did, profile) {
  const d = await xrpc("app.bsky.feed.getAuthorFeed", { actor: did, filter: "posts_with_replies", limit: 30 });
  const cutoff = Date.now() - windowMs();
  const found = [];
  for (const item of d.feed || []) {
    const p = item.post;
    if (item.reason || p.author.did !== did) continue; // reposts / pinned reasons
    if (seenUris.has(p.uri)) continue;
    const t = Date.parse(p.indexedAt);
    if (!(t >= cutoff) || !isUnloved(p)) continue;
    seenUris.add(p.uri);
    found.push({
      post: p, authorDid: did, indexedAt: t,
      followers: profile?.followersCount ?? 0,
      isReply: !!p.record?.reply,
    });
  }
  return found;
}

async function scanBatch() {
  const batch = followers.splice(0, BATCH);
  const profiles = await profilesFor(batch);
  let i = 0;
  async function worker() {
    while (i < batch.length) {
      const did = batch[i++];
      try { pool.push(...(await scanFeed(did, profiles.get(did)))); } catch {}
      scanned++;
    }
  }
  await Promise.all(Array.from({ length: PARALLEL }, worker));
}

const queued = () => pool.filter((it) => !acted.has(it.post.uri));

async function scanUntilFull() {
  if (scanning) return;
  scanning = true;
  $("moreBtn").disabled = true;
  try {
    do {
      await scanBatch();
      setStatus(`scanned ${scanned} of ${totalFollowers} followers · ${queued().length} unloved posts found`);
      renderList();
    } while (followers.length && queued().length < TARGET);
    setStatus(
      followers.length
        ? `scanned ${scanned} of ${totalFollowers} followers · ${queued().length} unloved posts found`
        : `scanned all ${scanned} followers · ${queued().length} unloved posts found`,
    );
  } catch (e) {
    setStatus(e.message || String(e), "err");
  } finally {
    scanning = false;
    $("moreBtn").disabled = false;
    $("moreBtn").hidden = !followers.length;
  }
}

function ago(t) {
  const m = Math.max(1, Math.round((Date.now() - t) / 60000));
  if (m < 60) return `${m}m`;
  if (m < 1440) return `${Math.round(m / 60)}h`;
  return `${Math.round(m / 1440)}d`;
}

const postUrl = (p) => `https://bsky.app/profile/${p.author.did}/post/${p.uri.split("/").pop()}`;

function renderList() {
  const list = $("list");
  list.textContent = "";
  const items = rank(queued());
  $("empty").hidden = items.length > 0;
  for (const it of items) list.append(card(it));
}

function card(it) {
  const p = it.post;
  const li = document.createElement("li");
  li.className = "post";

  const head = document.createElement("div");
  head.className = "head";
  if (p.author.avatar) {
    const img = document.createElement("img");
    img.src = p.author.avatar; img.alt = ""; img.width = 36; img.height = 36;
    head.append(img);
  }
  const who = document.createElement("div");
  const name = document.createElement("a");
  name.href = postUrl(p); name.target = "_blank"; name.rel = "noopener";
  name.textContent = p.author.displayName || p.author.handle;
  const meta = document.createElement("div");
  meta.className = "meta";
  meta.textContent = `@${p.author.handle} · ${it.followers.toLocaleString()} followers · ${ago(it.indexedAt)} ago${it.isReply ? " · reply" : ""}`;
  who.append(name, meta);
  head.append(who);

  const text = document.createElement("p");
  text.className = "text";
  text.textContent = p.record?.text || "(no text)";

  const extras = [];
  const emb = p.embed?.$type || "";
  if (emb.includes("images")) extras.push(`🖼 ${p.embed.images?.length || ""} image(s)`);
  else if (emb.includes("video")) extras.push("🎞 video");
  else if (emb.includes("external")) extras.push("🔗 " + (p.embed.external?.uri || "link"));
  else if (emb.includes("record")) extras.push("💬 quotes another post");
  if (extras.length) {
    const ex = document.createElement("div");
    ex.className = "meta";
    ex.textContent = extras.join(" · ");
    li.append(head, text, ex);
  } else li.append(head, text);

  const row = document.createElement("div");
  row.className = "row actions";
  const msg = document.createElement("span");
  msg.className = "fine";
  const mk = (label, fn) => {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = label;
    b.addEventListener("click", async () => {
      b.disabled = true;
      try { await fn(b); } catch (e) { msg.textContent = e.message || String(e); b.disabled = false; }
    });
    return b;
  };
  const done = (what) => { msg.textContent = what; acted.add(p.uri); row.querySelectorAll("button").forEach((x) => (x.disabled = true)); setTimeout(() => { li.remove(); $("empty").hidden = queued().length > 0; }, 900); };

  const qbox = document.createElement("div");
  qbox.className = "qbox";
  qbox.hidden = true;
  const ta = document.createElement("textarea");
  ta.rows = 2; ta.maxLength = 300; ta.placeholder = "add your take (optional)";
  const send = mk("post quote", async () => { await quotePost(session, p, ta.value.trim()); done("quoted ✓"); });
  qbox.append(ta, send);

  const like = mk("♥ like", async () => { await likePost(session, p); done("liked ✓"); });
  const rep = mk("↻ repost", async () => { await repostPost(session, p); done("reposted ✓"); });
  const quote = mk("❝ quote", async (b) => { qbox.hidden = !qbox.hidden; if (!qbox.hidden) ta.focus(); b.disabled = false; });
  const skip = mk("skip", async () => { acted.add(p.uri); li.remove(); $("empty").hidden = queued().length > 0; });
  skip.className = "ghost";
  row.append(like, rep, quote, skip, msg);
  li.append(row, qbox);
  return li;
}

async function start() {
  $("startBtn").disabled = true;
  pool = []; scanned = 0; seenUris.clear();
  renderList();
  try {
    const all = await loadFollowers();
    totalFollowers = all.length;
    followers = shuffle(all);
    if (!all.length) { setStatus("you don't have any followers yet."); return; }
    $("moreBtn").hidden = false;
    await scanUntilFull();
  } catch (e) {
    setStatus(e.message || String(e), "err");
  } finally {
    $("startBtn").disabled = false;
    $("startBtn").textContent = "rescan";
  }
}

$("startBtn").addEventListener("click", start);
$("moreBtn").addEventListener("click", scanUntilFull);
$("window").addEventListener("change", start);
$("signoutBtn").addEventListener("click", async () => {
  await clearSession();
  session = null; pool = []; followers = [];
  $("list").textContent = "";
  renderAuth();
});
$("signinBtn").addEventListener("click", async () => {
  const h = cleanHandle($("handle").value);
  if (!h) return;
  try { await login(h); } catch (e) { $("who").textContent = e.message || String(e); }
});
$("handle").addEventListener("keydown", (e) => { if (e.key === "Enter") $("signinBtn").click(); });

(async () => {
  try {
    session = (await completeLoginIfCallback()) || (await getSession());
  } catch (e) {
    $("who").textContent = e.message || String(e);
  }
  renderAuth();
  if (session) start();
})();
