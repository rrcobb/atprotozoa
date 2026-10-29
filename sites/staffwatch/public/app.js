// staffwatch — browser-only. Jetstream (filtered to the roster's DIDs) gives every
// public repo action; liked posts are looked up on the public AppView to see
// whether they carry adult-content labels.

const APPVIEW = "https://public.api.bsky.app/xrpc";
const JETSTREAM = "wss://jetstream2.us-east.bsky.network/subscribe";
const ROSTER_KEY = "staffwatch.roster.v1";
const SPICY_LABELS = new Set(["porn", "sexual", "nudity", "graphic-media", "gore"]);
// getPosts accepts at most 25 uris per call (AppView lexicon maxLength).
const GETPOSTS_BATCH = 25;
// Feed DOM size: purely a browser-memory limit — older rows scroll off, nothing is dropped from the stream.
const MAX_ROWS = 1500;

// A best guess at staff handles; the user edits it. Unresolvable ones are reported, not hidden.
const DEFAULT_ROSTER = [
  "jay.bsky.team", "pfrazee.com", "why.bsky.team", "bnewbold.net",
  "divy.zone", "samuel.bsky.team", "emily.bsky.team", "bsky.app",
];

const $ = (id) => document.getElementById(id);
const feed = $("feed"), statusEl = $("status"), rosterEl = $("roster"), rosterMsg = $("roster-msg");

let roster = loadRoster();      // [{handle, did, name}]
let ws = null, lastCursor = 0, gen = 0, retry = 0, seen = 0;
const byDid = () => new Map(roster.filter((r) => r.did).map((r) => [r.did, r]));

function loadRoster() {
  try { const r = JSON.parse(localStorage.getItem(ROSTER_KEY)); if (Array.isArray(r) && r.length) return r; } catch {}
  return DEFAULT_ROSTER.map((handle) => ({ handle }));
}
const saveRoster = () => localStorage.setItem(ROSTER_KEY, JSON.stringify(roster));
const cleanHandle = (s) => s.trim().replace(/^@/, "").toLowerCase();

async function getJSON(path) {
  const r = await fetch(`${APPVIEW}/${path}`);
  if (!r.ok) throw new Error(`${path.split("?")[0]} ${r.status}`);
  return r.json();
}

async function resolveEntry(e) {
  if (e.did) return e;
  try {
    const { did } = await getJSON(`com.atproto.identity.resolveHandle?handle=${encodeURIComponent(e.handle)}`);
    e.did = did;
    try { const p = await getJSON(`app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`); e.name = p.displayName || ""; e.handle = p.handle || e.handle; } catch {}
  } catch { e.failed = true; }
  return e;
}

function renderRoster() {
  rosterEl.textContent = "";
  for (const e of roster) {
    const chip = document.createElement("span");
    chip.className = "chip" + (e.failed ? "" : " on");
    chip.title = e.failed ? "couldn't resolve this handle" : e.did || "resolving…";
    chip.append((e.failed ? "⚠ " : "") + e.handle + " ");
    const x = document.createElement("span");
    x.className = "x"; x.textContent = "✕";
    x.addEventListener("click", () => { roster = roster.filter((r) => r !== e); saveRoster(); renderRoster(); restart(); });
    chip.append(x);
    rosterEl.append(chip);
  }
  const bad = roster.filter((r) => r.failed).length;
  rosterMsg.textContent = bad ? `${bad} handle(s) didn't resolve and are skipped.` : "";
}

async function addHandle() {
  const h = cleanHandle($("add-handle").value);
  if (!h) return;
  $("add-handle").value = "";
  if (roster.some((r) => r.handle === h)) return;
  const e = { handle: h };
  roster.push(e); renderRoster();
  await resolveEntry(e); saveRoster(); renderRoster(); restart();
}

// ---- stream ----
function setStatus(t) { statusEl.textContent = t; }

async function restart() {
  const my = ++gen;
  if (ws) { try { ws.close(); } catch {} ws = null; }
  setStatus("resolving roster…");
  await Promise.all(roster.map(resolveEntry));
  if (my !== gen) return;
  saveRoster(); renderRoster();
  const dids = roster.filter((r) => r.did).map((r) => r.did);
  if (!dids.length) { setStatus("no resolvable handles in the roster."); return; }
  const hours = Number($("lookback").value);
  lastCursor = hours ? (Date.now() - hours * 3600e3) * 1000 : 0;
  retry = 0;
  connect(my, dids);
}

function connect(my, dids) {
  const q = new URLSearchParams();
  for (const d of dids) q.append("wantedDids", d);
  if (lastCursor) q.set("cursor", String(lastCursor));
  ws = new WebSocket(`${JETSTREAM}?${q}`);
  ws.onopen = () => { retry = 0; setStatus(`watching ${dids.length} accounts… ${seen} events so far`); };
  ws.onmessage = (m) => {
    let ev; try { ev = JSON.parse(m.data); } catch { return; }
    if (ev.time_us) lastCursor = ev.time_us;
    handle(ev);
  };
  ws.onclose = () => {
    if (my !== gen) return;
    setStatus("stream dropped, reconnecting…");
    // resume slightly before the last event so nothing is missed across the gap
    if (lastCursor) lastCursor -= 2e6;
    setTimeout(() => { if (my === gen) connect(my, dids); }, Math.min(1000 * 2 ** retry++, 15000));
  };
  ws.onerror = () => { try { ws.close(); } catch {} };
}

// ---- events ----
const VERBS = {
  "app.bsky.feed.like": "liked", "app.bsky.feed.post": "posted", "app.bsky.feed.repost": "reposted",
  "app.bsky.graph.follow": "followed", "app.bsky.graph.block": "blocked", "app.bsky.graph.listitem": "added to a list",
  "app.bsky.graph.list": "made a list", "app.bsky.feed.threadgate": "set a threadgate",
  "app.bsky.actor.profile": "updated their profile",
};

function handle(ev) {
  const who = byDid().get(ev.did);
  if (!who) return;
  seen++;
  let kind, verb, detail = null, subjectUri = null, subjectDid = null;
  if (ev.kind === "commit") {
    const c = ev.commit;
    kind = c.collection;
    const base = VERBS[kind] || `${c.operation}d ${kind}`;
    if (c.operation === "delete") { verb = `deleted a record (${kind.split(".").pop()})`; }
    else {
      verb = base;
      const r = c.record || {};
      if (kind === "app.bsky.feed.like" || kind === "app.bsky.feed.repost") subjectUri = r.subject?.uri;
      else if (kind === "app.bsky.graph.follow" || kind === "app.bsky.graph.block") subjectDid = r.subject;
      else if (kind === "app.bsky.feed.post") {
        detail = r.text || "";
        if (r.reply) verb = "replied";
        const selfLabels = (r.labels?.values || []).map((v) => v.val);
        if (selfLabels.some((v) => SPICY_LABELS.has(v))) detail = null;
      }
    }
  } else if (ev.kind === "identity") { kind = "identity"; verb = `identity update${ev.identity?.handle ? ` → ${ev.identity.handle}` : ""}`; }
  else if (ev.kind === "account") { kind = "account"; verb = `account ${ev.account?.status || (ev.account?.active ? "active" : "changed")}`; }
  else return;

  const li = document.createElement("li");
  li.dataset.kind = kind;
  const head = document.createElement("div");
  const when = document.createElement("span");
  when.className = "when";
  when.textContent = new Date(ev.time_us / 1000).toLocaleTimeString();
  const name = document.createElement("a");
  name.className = "who"; name.href = `https://bsky.app/profile/${who.did}`; name.target = "_blank"; name.rel = "noopener";
  name.textContent = who.handle;
  const act = document.createElement("span");
  act.className = "act"; act.textContent = " " + verb + " ";
  head.append(when, name, act);
  const body = document.createElement("div");
  body.className = "snip";
  li.append(head, body);
  if (detail) body.textContent = detail;
  if (subjectDid) { body.textContent = subjectDid; resolveDidLabel(subjectDid, body); }
  if (subjectUri) { body.textContent = "looking up post…"; queuePost(subjectUri, li, body, head); }
  feed.prepend(li);
  while (feed.children.length > MAX_ROWS) feed.lastChild.remove();
  applyFilter(li);
  setStatus(`watching ${roster.filter((r) => r.did).length} accounts… ${seen} events so far`);
}

const didLabels = new Map();
async function resolveDidLabel(did, el) {
  if (!didLabels.has(did)) didLabels.set(did, getJSON(`app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`).then((p) => "@" + p.handle).catch(() => did));
  const t = await didLabels.get(did);
  el.textContent = t;
}

// ---- liked-post lookup (batched) ----
const postCache = new Map(); // uri -> Promise<view|null>
let pending = [], timer = null;
function queuePost(uri, li, body, head) {
  if (!postCache.has(uri)) {
    let resolve; const p = new Promise((r) => (resolve = r));
    postCache.set(uri, p);
    pending.push({ uri, resolve });
    if (!timer) timer = setTimeout(flush, 250);
  }
  postCache.get(uri).then((view) => showPost(view, uri, li, body, head));
}
async function flush() {
  timer = null;
  const batch = pending; pending = [];
  for (let i = 0; i < batch.length; i += GETPOSTS_BATCH) {
    const chunk = batch.slice(i, i + GETPOSTS_BATCH);
    const q = chunk.map((c) => "uris=" + encodeURIComponent(c.uri)).join("&");
    let posts = [];
    try { posts = (await getJSON(`app.bsky.feed.getPosts?${q}`)).posts || []; } catch {}
    const m = new Map(posts.map((p) => [p.uri, p]));
    for (const c of chunk) c.resolve(m.get(c.uri) || null);
  }
}
function isSpicy(view) {
  const labels = [...(view.labels || []), ...(view.author?.labels || [])];
  return labels.some((l) => SPICY_LABELS.has(l.val));
}
function showPost(view, uri, li, body, head) {
  const link = document.createElement("a");
  link.target = "_blank"; link.rel = "noopener";
  const rkey = uri.split("/").pop(), did = uri.split("/")[2];
  link.href = `https://bsky.app/profile/${did}/post/${rkey}`;
  body.textContent = "";
  if (!view) { link.textContent = "a post that's no longer available"; body.append(link); return; }
  link.textContent = "@" + view.author.handle + "'s post";
  const txt = document.createElement("div");
  txt.textContent = view.record?.text || (view.embed ? "[media]" : "");
  body.append(link, txt);
  if (isSpicy(view)) {
    li.classList.add("spicy"); li.dataset.spicy = "1";
    const tag = document.createElement("span");
    tag.className = "hot"; tag.textContent = "🌶 spicy like ";
    head.append(tag);
    txt.classList.add("hidden-text");
    if ($("reveal").checked) txt.classList.add("shown");
    txt.addEventListener("click", () => txt.classList.toggle("shown"));
    applyFilter(li);
  }
}

function applyFilter(li) {
  const k = $("kind").value;
  li.hidden = k === "all" ? false : k === "spicy" ? li.dataset.spicy !== "1" : li.dataset.kind !== k;
}
$("kind").addEventListener("change", () => [...feed.children].forEach(applyFilter));
$("reveal").addEventListener("change", () =>
  document.querySelectorAll(".hidden-text").forEach((t) => t.classList.toggle("shown", $("reveal").checked)));

$("add-btn").addEventListener("click", addHandle);
$("add-handle").addEventListener("keydown", (e) => { if (e.key === "Enter") addHandle(); });
$("reset-btn").addEventListener("click", () => { roster = DEFAULT_ROSTER.map((handle) => ({ handle })); saveRoster(); renderRoster(); restart(); });
$("restart").addEventListener("click", () => { feed.textContent = ""; seen = 0; restart(); });
$("lookback").addEventListener("change", () => { feed.textContent = ""; seen = 0; restart(); });
$("secret").addEventListener("click", () => { const i = $("add-handle"); i.value = "@cee.wtf"; i.dispatchEvent(new Event("input", { bubbles: true })); i.focus(); });
$("secret").style.cursor = "pointer";

renderRoster();
restart();
