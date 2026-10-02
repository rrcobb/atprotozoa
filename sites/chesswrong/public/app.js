import { chessify } from "./lib/chess.js";

const $ = (id) => document.getElementById(id);
const YEARS = 10;
const CONCURRENCY = 4; // parallel month fetches against our own proxy
const PAGE = 100; // rows rendered per "show more" click (display only; all posts are loaded)

let posts = [];
let shown = PAGE;

const compose = `https://bsky.app/intent/compose?text=${encodeURIComponent("ChessWrong: every LessWrong post from the last ten years, retitled to be about chess https://chesswrong.bisks.net/")}`;
$("share").href = compose;

// month windows [after, before) from this month back YEARS years
function windows() {
  const out = [];
  const now = new Date();
  let y = now.getUTCFullYear(), m = now.getUTCMonth();
  const fmt = (yy, mm) => `${yy + Math.floor(mm / 12)}-${String((mm % 12 + 12) % 12 + 1).padStart(2, "0")}-01`;
  const stop = y * 12 + m - YEARS * 12;
  for (let k = y * 12 + m; k >= stop; k--) {
    const yy = Math.floor(k / 12), mm = k % 12;
    out.push([fmt(yy, mm), fmt(yy, mm + 1)]);
  }
  return out;
}

async function getJSON(url) {
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error("HTTP " + r.status);
      return await r.json();
    } catch (e) {
      if (attempt >= 3) throw e;
      await new Promise((res) => setTimeout(res, 600 * (attempt + 1)));
    }
  }
}

// Page one window to exhaustion: keep asking with a growing offset until a batch is empty.
async function loadWindow([after, before]) {
  const rows = [];
  for (let offset = 0; ; ) {
    const batch = await getJSON(`/api/posts?after=${after}&before=${before}&offset=${offset}`);
    if (!batch.length) break;
    rows.push(...batch);
    offset += batch.length;
  }
  return rows;
}

function toPost(p) {
  const c = chessify(p.title);
  return {
    id: p._id, orig: p.title, title: c.title, swaps: c.swaps, appended: c.appended,
    at: p.postedAt, score: p.baseScore || 0, comments: p.commentCount || 0,
    by: p.user ? p.user.displayName : "", url: `https://www.lesswrong.com/posts/${p._id}/${p.slug}`,
  };
}

function view() {
  const q = $("q").value.trim().toLowerCase();
  const year = $("year").value;
  const onlySwaps = $("swapped").checked;
  let rows = posts.filter((p) =>
    (!year || p.at.startsWith(year)) && (!onlySwaps || p.swaps > 0) &&
    (!q || p.orig.toLowerCase().includes(q) || p.title.toLowerCase().includes(q)));
  const sort = $("sort").value;
  const by = {
    new: (a, b) => (a.at < b.at ? 1 : -1),
    top: (a, b) => b.score - a.score,
    comments: (a, b) => b.comments - a.comments,
    swaps: (a, b) => b.swaps - a.swaps || b.score - a.score,
  }[sort];
  rows = rows.slice().sort(by);
  return rows;
}

function render() {
  const rows = view();
  const showOrig = $("orig").checked;
  const list = $("list");
  list.textContent = "";
  for (const p of rows.slice(0, shown)) {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.className = "t"; a.href = `/read?id=${p.id}`; a.textContent = p.title;
    li.append(a);
    if (showOrig) {
      const o = document.createElement("div");
      o.className = "orig"; o.textContent = p.orig; li.append(o);
    }
    const m = document.createElement("div");
    m.className = "meta";
    m.textContent = `${p.at.slice(0, 10)} · ${p.by} · ${p.score} pts · ${p.comments} comments`;
    li.append(m);
    list.append(li);
  }
  $("more").hidden = rows.length <= shown;
  $("more").textContent = `show more (${rows.length - shown} left)`;
  return rows.length;
}

function refresh() {
  const n = render();
  const st = $("status");
  if (!st.classList.contains("err")) st.textContent = `${n.toLocaleString()} of ${posts.length.toLocaleString()} posts${doneAll ? "" : " — still loading…"}`;
}

let doneAll = false;
async function main() {
  const wins = windows();
  const ys = new Set(wins.map((w) => w[0].slice(0, 4)));
  for (const y of [...ys].sort().reverse()) {
    const o = document.createElement("option"); o.value = y; o.textContent = y; $("year").append(o);
  }
  let next = 0, done = 0, failed = 0, lastRender = 0;
  async function worker() {
    while (next < wins.length) {
      const w = wins[next++];
      try {
        const rows = await loadWindow(w);
        for (const r of rows) posts.push(toPost(r));
      } catch (e) {
        failed++;
      }
      done++;
      $("bar").style.width = `${(done / wins.length) * 100}%`;
      if (Date.now() - lastRender > 400) { lastRender = Date.now(); refresh(); }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  doneAll = true;
  if (failed) {
    $("status").classList.add("err");
    $("status").textContent = `${failed} of ${wins.length} months failed to load — reload to retry. ${posts.length.toLocaleString()} posts loaded.`;
  }
  refresh();
}

for (const id of ["q", "sort", "year", "orig", "swapped"]) {
  $(id).addEventListener(id === "q" ? "input" : "change", () => { shown = PAGE; refresh(); });
}
$("more").addEventListener("click", () => { shown += PAGE; refresh(); });
main().catch((e) => { $("status").classList.add("err"); $("status").textContent = "failed: " + e.message; });
