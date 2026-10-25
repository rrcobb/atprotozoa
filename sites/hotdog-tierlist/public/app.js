import { buildCluster } from "./lib/cluster.js";
import { searchAuthorPhrase, postUrl } from "./lib/search.js";
import { loadVision, readImage } from "./lib/vision.js";
import { HOTDOG_QUERIES, isHotdogPost, tally, assignTiers, TIERS } from "./lib/toppings.js";

// A concurrency limit, not a data cap: every cluster member is still searched
// for every phrase, a handful of accounts at a time so the browser and the
// AppView aren't hit with hundreds of simultaneous requests.
const CONCURRENCY = 6;

const TIER_COLORS = { S: "#ff7f7f", A: "#ffbf7f", B: "#ffdf7f", C: "#ffff7f", D: "#bfff7f", F: "#7fbfff" };

const els = {
  form: document.getElementById("form"),
  handle: document.getElementById("handle"),
  go: document.getElementById("go"),
  status: document.getElementById("status"),
  board: document.getElementById("board"),
  people: document.getElementById("people"),
  peopleList: document.getElementById("peopleList"),
  shareLink: document.getElementById("shareLink"),
  photos: document.getElementById("photos"),
  useRef: document.getElementById("useRef"),
};

els.useRef.addEventListener("click", () => {
  els.handle.value = "jakobsachs.blog";
  els.handle.focus();
});

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function setStatus(text, isErr = false) {
  els.status.textContent = text;
  els.status.classList.toggle("err", isErr);
}

function renderBoard(posts) {
  const rows = tally(posts);
  const tiers = assignTiers(rows);
  els.board.innerHTML = "";
  if (!rows.length) return rows;
  for (const t of TIERS) {
    const row = document.createElement("div");
    row.className = "tier";
    const label = document.createElement("div");
    label.className = "label";
    label.style.background = TIER_COLORS[t];
    label.textContent = t;
    const items = document.createElement("div");
    items.className = "items";
    for (const r of tiers[t]) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "topping";
      b.innerHTML = `${r.emoji} ${esc(r.name)} <small>${r.people.size}\u{1F464}</small>`;
      b.addEventListener("click", () => showEvidence(r));
      items.appendChild(b);
    }
    row.append(label, items);
    els.board.appendChild(row);
  }
  return rows;
}

function showEvidence(r) {
  const box = document.getElementById("evidence");
  box.hidden = false;
  box.innerHTML =
    `<h3>${r.emoji} ${esc(r.name)} — ${r.mentions} mention(s) by ${r.people.size} people (${r.pos} glowing, ${r.neg} hostile)</h3>` +
    r.posts
      .slice()
      .sort((a, b) => (b.post.likeCount || 0) - (a.post.likeCount || 0))
      .map(
        ({ post, seen }) =>
          `<div class="ev">${seen ? "\u{1F441} <i>spotted in the photo (a guess)</i> " : ""}<a href="https://bsky.app/profile/${esc(post.author.handle || post.author.did)}" target="_blank" rel="noopener">@${esc(post.author.handle || "")}</a>: ${esc(post.text.slice(0, 280))} <a href="${postUrl(post.uri)}" target="_blank" rel="noopener">↗</a></div>`,
      )
      .join("");
  box.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function renderPeople(posts) {
  const by = new Map();
  for (const p of posts) {
    const k = p.author.did || p.author.handle;
    const e = by.get(k) || { author: p.author, n: 0 };
    e.n++;
    by.set(k, e);
  }
  const list = [...by.values()].sort((a, b) => b.n - a.n);
  els.people.hidden = list.length === 0;
  els.peopleList.innerHTML = list
    .map((e) => `<li><a href="https://bsky.app/profile/${esc(e.author.handle || e.author.did)}" target="_blank" rel="noopener">@${esc(e.author.handle || "")}</a> · ${e.n} hotdog post${e.n === 1 ? "" : "s"}</li>`)
    .join("");
}

function updateShare(handleText, rows) {
  if (!rows.length) {
    els.shareLink.hidden = true;
    return;
  }
  const tiers = assignTiers(rows);
  const line = TIERS.filter((t) => tiers[t].length)
    .map((t) => `${t}: ${tiers[t].map((r) => r.emoji).join("")}`)
    .join("\n");
  const url = `${location.origin}${location.pathname}?handle=${encodeURIComponent(handleText)}`;
  const text = `@${handleText}'s simcluster hotdog topping tier list\n${line}\n${url}`;
  els.shareLink.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(text);
  els.shareLink.hidden = false;
}

async function run(handleInput) {
  const handleText = handleInput.trim().replace(/^@/, "");
  els.go.disabled = true;
  els.board.innerHTML = "";
  els.people.hidden = true;
  document.getElementById("evidence").hidden = true;
  els.shareLink.hidden = true;
  setStatus(`resolving @${handleText}…`);

  let cluster;
  try {
    cluster = await buildCluster(handleText, { onStep: setStatus });
  } catch (e) {
    setStatus(`couldn't crawl that handle's graph: ${e.message}`, true);
    els.go.disabled = false;
    return;
  }
  const members = cluster.core.concat([cluster.self]);
  if (cluster.core.length === 0) {
    setStatus("no mutuals found for that handle — no simcluster to search.", true);
    els.go.disabled = false;
    return;
  }

  const found = new Map(); // uri -> post, dedupes across the phrase variants
  let checked = 0;
  const queue = members.slice();

  async function worker() {
    while (queue.length) {
      const m = queue.shift();
      for (const q of HOTDOG_QUERIES) {
        let posts = [];
        try {
          posts = await searchAuthorPhrase(q, m.did);
        } catch {
          // one account failing (deactivated repo etc.) shouldn't sink the scan
        }
        for (const p of posts) {
          if (!found.has(p.uri) && isHotdogPost(p.text)) {
            if (!p.author.handle) p.author = { did: m.did, handle: m.handle };
            found.set(p.uri, p);
          }
        }
      }
      checked++;
      setStatus(`checked ${checked}/${members.length} people in the simcluster… ${found.size} hotdog posts so far`);
      if (checked % 5 === 0) renderBoard([...found.values()]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, members.length) }, worker));

  const posts = [...found.values()];
  if (els.photos.checked) await readPhotos(posts);
  const rows = renderBoard(posts);
  renderPeople(posts);
  updateShare(cluster.handle, rows);
  setStatus(
    posts.length === 0
      ? `checked all ${members.length} people — nobody in this simcluster has posted about hot dogs.`
      : `${posts.length} hotdog posts from ${new Set(posts.map((p) => p.author.did)).size} people across ${members.length} checked. ${rows.length} toppings ranked — tap one for the receipts.`,
  );
  els.go.disabled = false;
}

// Optional second pass: run CLIP over each hotdog post's photos, on-device.
async function readPhotos(posts) {
  const withImgs = posts.filter((p) => p.images && p.images.length);
  if (!withImgs.length) return;
  try {
    await loadVision(setStatus);
  } catch (e) {
    setStatus(`photo model failed to load (${e.message}) — showing text-only results.`, true);
    return;
  }
  let done = 0;
  const queue = withImgs.slice();
  async function worker() {
    while (queue.length) {
      const p = queue.shift();
      const seen = new Set();
      for (const url of p.images) {
        const r = await readImage(url);
        if (r) for (const t of r.toppings) seen.add(t.name);
      }
      p.visual = [...seen];
      done++;
      setStatus(`reading photos… ${done}/${withImgs.length} posts`);
    }
  }
  // Model inference is CPU/GPU-bound in one tab; two at a time keeps it moving
  // without stacking big tensors.
  await Promise.all([worker(), worker()]);
}

els.form.addEventListener("submit", (ev) => {
  ev.preventDefault();
  if (!els.handle.value.trim()) {
    setStatus("need a handle first.", true);
    return;
  }
  run(els.handle.value);
});

const pre = new URLSearchParams(location.search).get("handle");
if (pre) {
  els.handle.value = pre;
  run(pre);
}
