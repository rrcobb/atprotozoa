// app.js — pseudochan's UI. Routes live in the hash so every view is linkable:
//   #/<handle>                 catalog
//   #/<handle>/index           index (OP + latest replies per thread)
//   #/<handle>/t/<rkey>        thread page (pulls in everyone's responses)

import { loadBoard, loadThread, resolveDid, cleanActor, postLabel, posterId, renderBody, esc, ID_MODES } from "./board.js";

const $ = (id) => document.getElementById(id);
const view = $("view");
const msg = $("msg");

// Cards / threads are added to the page in chunks purely to keep the DOM
// light in the browser; the board itself holds every post and "show more"
// reaches all of them.
const CATALOG_CHUNK = 150;
const INDEX_CHUNK = 10;
const INDEX_PREVIEW = 3; // replies shown under each OP in the index, as on a board index

const boards = new Map(); // handle (lowercase) -> board
const threadsCache = new Map(); // did/rkey -> thread
let token = 0;

let idMode = "no";
try { idMode = localStorage.getItem("pseudochan.idmode") || "no"; } catch (_) {}
if (!ID_MODES.some((m) => m.key === idMode)) idMode = "no";
$("idMode").innerHTML = ID_MODES.map((m) => `<option value="${m.key}">${esc(m.label)}</option>`).join("");
$("idMode").value = idMode;

function say(text, err) {
  msg.textContent = text || "";
  msg.className = "msg" + (err ? " err" : "");
}

const fmtDate = (iso) => {
  const d = new Date(iso);
  if (isNaN(d)) return "";
  const p = (n) => String(n).padStart(2, "0");
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()];
  return `${p(d.getMonth() + 1)}/${p(d.getDate())}/${String(d.getFullYear()).slice(2)}(${day})${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

// ---- ID display -----------------------------------------------------------

function idPrefix() {
  return { no: "No.", seq: "#", rkey: "rkey ", did: "" }[idMode];
}
function shown(label) {
  return label.length > 26 ? label.slice(0, 14) + "…" + label.slice(-6) : label;
}

// ---- posts ----------------------------------------------------------------

function filesHtml(p) {
  let h = "";
  if (p.images.length) {
    h += '<div class="files">';
    p.images.forEach((im, i) => {
      h += `<a href="${esc(im.full)}" target="_blank" rel="noopener"><span class="fileinfo">File: image${i + 1}.jpg${im.alt ? " — " + esc(im.alt.slice(0, 80)) : ""}</span><img src="${esc(im.thumb)}" alt="${esc(im.alt)}" loading="lazy" /></a>`;
    });
    h += "</div>";
  } else if (p.video) {
    h += '<div class="files"><span class="vid">[video — open on bsky.app]</span></div>';
  }
  return h;
}

// ctx: { owner: profile|null, byUri: Map<uri, post>, backlinks: Map<uri, post[]>, op: bool }
function postHtml(p, ctx) {
  const who = p.author || (ctx.owner && ctx.owner.did === p.did ? ctx.owner : { did: p.did, handle: p.did, displayName: p.did });
  const pid = posterId(p.did);
  const label = postLabel(p, idMode);
  const url = `https://bsky.app/profile/${p.did}/post/${p.rkey}`;
  let quote = "";
  if (p.parent) {
    const par = ctx.byUri.get(p.parent);
    quote = par
      ? `<a class="quotelink" data-target="${esc(par.uri)}">&gt;&gt;${esc(shown(postLabel(par, idMode)))}</a>`
      : '<span class="phandle">&gt;&gt;(not shown)</span>';
  }
  const backs = (ctx.backlinks.get(p.uri) || [])
    .map((b) => `<a class="quotelink" data-target="${esc(b.uri)}">&gt;&gt;${esc(shown(postLabel(b, idMode)))}</a>`)
    .join(" ");
  return `<div class="post ${ctx.op ? "op" : "reply"}" data-uri="${esc(p.uri)}">
    <div class="pinfo">
      <span class="pname">${esc(who.displayName || who.handle)}</span>
      <span class="phandle">@${esc(who.handle || p.did)}</span>
      <span class="pid" style="background:hsl(${pid.hue} 45% 38%)" title="${esc(p.did)}">ID:${pid.id}</span>
      ${fmtDate(p.createdAt)}
      <span class="pno">${idPrefix()}<a href="${esc(url)}" target="_blank" rel="noopener" title="${esc(p.uri)}">${esc(shown(label))}</a></span>
      ${ctx.extra || ""}
    </div>
    ${filesHtml(p)}
    <div class="pbody">${quote ? quote + "<br>" : ""}${renderBody(p.text, p.facets)}</div>
    ${backs ? `<div class="backlinks">Replies: ${backs}</div>` : ""}
  </div>`;
}

function backlinkMap(posts) {
  const m = new Map();
  for (const p of posts) {
    if (!p.parent) continue;
    if (!m.has(p.parent)) m.set(p.parent, []);
    m.get(p.parent).push(p);
  }
  return m;
}

// ---- views ----------------------------------------------------------------

function listFor(board) {
  const sort = $("sort").value;
  const q = $("filter").value.trim().toLowerCase();
  let ts = board.threads.filter((t) => !t.foreign || $("withReplies").checked);
  if ($("imgOnly").checked) ts = ts.filter((t) => t.op.images.length);
  if (q) ts = ts.filter((t) => t.op.text.toLowerCase().includes(q) || t.replies.some((r) => r.text.toLowerCase().includes(q)));
  const by = {
    bump: (a, b) => (a.bump < b.bump ? 1 : -1),
    new: (a, b) => (a.op.createdAt < b.op.createdAt ? 1 : -1),
    old: (a, b) => (a.op.createdAt < b.op.createdAt ? -1 : 1),
    replies: (a, b) => b.replies.length - a.replies.length,
  }[sort];
  return ts.slice().sort(by);
}

function cardHtml(t, handle) {
  const op = t.op;
  const thumb = op.images[0]
    ? `<img class="thumb" src="${esc(op.images[0].thumb)}" alt="" loading="lazy" />`
    : `<div class="tbox">${esc(op.text.slice(0, 160)) || "(no text)"}</div>`;
  const imgs = t.replies.reduce((n, r) => n + r.images.length, 0) + op.images.length;
  return `<div class="card" data-href="#/${esc(handle)}/t/${esc(op.rkey)}" title="${esc(fmtDate(op.createdAt))}">
    ${thumb}
    <div class="meta">${t.foreign ? '<span class="tag">↪ reply</span> ' : ""}R: <b>${t.replies.length}</b> / I: <b>${imgs}</b></div>
    <div class="snip">${esc(op.text.slice(0, 90))}</div>
  </div>`;
}

function showMore(container, items, chunk, renderItem, afterNode) {
  let shownN = 0;
  const btn = document.createElement("div");
  btn.className = "pager";
  const next = () => {
    const part = items.slice(shownN, shownN + chunk);
    shownN += part.length;
    const frag = document.createElement("div");
    frag.innerHTML = part.map(renderItem).join("");
    while (frag.firstChild) container.appendChild(frag.firstChild);
    btn.innerHTML = shownN < items.length ? `<button>show more (${items.length - shownN} left)</button>` : "";
    if (shownN < items.length) btn.firstChild.onclick = next;
  };
  (afterNode || container.parentNode).appendChild(btn);
  next();
}

function renderCatalog(board, handle) {
  const items = listFor(board);
  view.innerHTML = `<div class="thead">${items.length} thread${items.length === 1 ? "" : "s"} · ${board.posts.length} posts total · R = author's own replies, I = images</div><div class="grid" id="grid"></div>`;
  if (!items.length) { $("grid").innerHTML = "<p>Nothing matches.</p>"; return; }
  showMore($("grid"), items, CATALOG_CHUNK, (t) => cardHtml(t, handle), $("grid").parentNode);
}

function renderIndex(board, handle) {
  const items = listFor(board);
  view.innerHTML = `<div class="thead">${items.length} thread${items.length === 1 ? "" : "s"}</div><div id="threads"></div>`;
  if (!items.length) { $("threads").innerHTML = "<p>Nothing matches.</p>"; return; }
  showMore($("threads"), items, INDEX_CHUNK, (t) => {
    const all = [t.op, ...t.replies];
    const byUri = new Map(all.map((p) => [p.uri, p]));
    const bl = backlinkMap(all);
    const shownReplies = t.replies.slice(-INDEX_PREVIEW);
    const omitted = t.replies.length - shownReplies.length;
    const open = `[<a href="#/${esc(handle)}/t/${esc(t.op.rkey)}">Reply</a>]`;
    return `<div class="thread">
      <hr>
      ${postHtml(t.op, { owner: board.profile, byUri, backlinks: bl, op: true, extra: open })}
      ${omitted ? `<div class="omitted">${omitted} post${omitted === 1 ? "" : "s"} omitted. Click Reply to view.</div>` : ""}
      ${shownReplies.map((r) => postHtml(r, { owner: board.profile, byUri, backlinks: bl, op: false })).join("")}
    </div>`;
  }, $("threads").parentNode);
}

function renderThread(th, handle, owner) {
  const { posts } = th;
  const byUri = new Map(posts.map((p) => [p.uri, p]));
  const bl = backlinkMap(posts);
  const imgs = posts.reduce((n, p) => n + p.images.length, 0);
  view.innerHTML = `<div class="thead">[<a href="#/${esc(handle)}">Return</a>] [<a href="#/${esc(handle)}/index">Index</a>] — ${posts.length} post${posts.length === 1 ? "" : "s"}, ${imgs} image${imgs === 1 ? "" : "s"}</div>
    <div class="thread">
      ${posts.map((p, i) => postHtml(p, { owner, byUri, backlinks: bl, op: i === 0 })).join("")}
    </div>
    <div class="thead">[<a href="#/${esc(handle)}">Return</a>] [<a href="#top" onclick="window.scrollTo(0,0);return false">Top</a>]</div>`;
  const focus = view.querySelector(`[data-uri="${CSS.escape(th.focus)}"]`);
  if (focus && focus !== view.querySelector(".post")) {
    focus.classList.add("hl");
    focus.scrollIntoView({ block: "center" });
  }
}

// ---- routing --------------------------------------------------------------

function showBar(board, handle, mode) {
  $("bar").hidden = false;
  $("boardName").textContent = board ? `/${board.profile.handle}/ — ${board.profile.displayName}` : `/${handle}/`;
  $("vCatalog").href = `#/${handle}`;
  $("vIndex").href = `#/${handle}/index`;
  $("catOpts").hidden = mode === "thread";
}

function setShare(handle) {
  const url = `https://pseudochan.bisks.net/${location.hash || "#/" + handle}`;
  const text = `@${handle} as an imageboard`;
  $("shareSlot").innerHTML = handle
    ? `<a href="https://bsky.app/intent/compose?text=${encodeURIComponent(text + "\n" + url)}" target="_blank" rel="noopener">post this board to Bluesky</a> · `
    : "";
}

async function getBoard(handle, my) {
  const key = handle.toLowerCase();
  if (boards.has(key)) return boards.get(key);
  const b = await loadBoard(handle, (s) => { if (my === token) say(s); });
  boards.set(key, b);
  return b;
}

async function route() {
  const my = ++token;
  const parts = decodeURIComponent(location.hash.replace(/^#\/?/, "")).split("/").filter(Boolean);
  if (!parts.length) {
    $("bar").hidden = true;
    setShare("");
    return;
  }
  const handle = cleanActor(parts[0]);
  $("handle").value = handle;
  setShare(handle);
  try {
    if (parts[1] === "t" && parts[2]) {
      showBar(boards.get(handle.toLowerCase()), handle, "thread");
      say("loading thread…");
      const did = await resolveDid(handle);
      const key = did + "/" + parts[2];
      let th = threadsCache.get(key);
      if (!th) { th = await loadThread(did, parts[2]); threadsCache.set(key, th); }
      if (my !== token) return;
      const b = boards.get(handle.toLowerCase());
      if (b) { // sequence numbers exist for posts the loaded board knows about
        const seq = new Map(b.posts.map((p) => [p.uri, p.seq]));
        th.posts.forEach((p) => { p.seq = seq.get(p.uri) || null; });
      }
      say("");
      renderThread(th, handle, b ? b.profile : null);
      return;
    }
    showBar(null, handle, "list");
    say("loading…");
    const board = await getBoard(handle, my);
    if (my !== token) return;
    say("");
    showBar(board, handle, "list");
    (parts[1] === "index" ? renderIndex : renderCatalog)(board, handle);
  } catch (e) {
    if (my !== token) return;
    say(e.status === 400 ? `couldn't find "${handle}"` : e.message || String(e), true);
  }
}

// ---- wiring ---------------------------------------------------------------

$("goForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const h = cleanActor($("handle").value);
  if (!h) { say("type a handle first", true); return; }
  const target = "#/" + h;
  if (location.hash === target) route();
  else location.hash = target;
});

window.addEventListener("hashchange", route);
$("idMode").addEventListener("change", () => {
  idMode = $("idMode").value;
  try { localStorage.setItem("pseudochan.idmode", idMode); } catch (_) {}
  route();
});
for (const id of ["sort", "withReplies", "imgOnly"]) $(id).addEventListener("change", route);
let ft;
$("filter").addEventListener("input", () => { clearTimeout(ft); ft = setTimeout(route, 250); });

view.addEventListener("click", (e) => {
  const q = e.target.closest(".quotelink");
  if (q) {
    const el = view.querySelector(`[data-uri="${CSS.escape(q.dataset.target)}"]`);
    if (el) {
      view.querySelectorAll(".hl").forEach((n) => n.classList.remove("hl"));
      el.classList.add("hl");
      el.scrollIntoView({ block: "center", behavior: "smooth" });
    }
    return;
  }
  const c = e.target.closest(".card");
  if (c) location.hash = c.dataset.href;
});

route();
