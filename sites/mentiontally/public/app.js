// mentiontally — tally @-mentions under a Bluesky post. All client-side, public AppView.
const API = "https://public.api.bsky.app/xrpc/";
const $ = (id) => document.getElementById(id);
const MENTION = "app.bsky.richtext.facet#mention";

async function xrpc(method, params) {
  const r = await fetch(API + method + "?" + new URLSearchParams(params));
  if (!r.ok) {
    let msg = "";
    try { msg = (await r.json()).message || ""; } catch (_) {}
    throw new Error(msg || method + " failed (" + r.status + ")");
  }
  return r.json();
}

function setStatus(msg, err) {
  const s = $("status");
  s.hidden = !msg;
  s.textContent = msg || "";
  s.className = err ? "err" : "";
}

// Accepts bsky.app / other client post URLs, or an at:// URI.
async function parsePost(input) {
  let s = input.trim();
  if (!s) throw new Error("paste a post link first");
  let m = s.match(/^at:\/\/([^/]+)\/app\.bsky\.feed\.post\/([^/?#]+)/);
  let actor, rkey;
  if (m) { actor = m[1]; rkey = m[2]; }
  else {
    m = s.match(/\/profile\/([^/?#]+)\/post\/([^/?#]+)/);
    if (!m) throw new Error("that doesn't look like a Bluesky post link");
    actor = decodeURIComponent(m[1]); rkey = m[2];
  }
  actor = actor.replace(/^@/, "").trim();
  if (!actor.startsWith("did:")) {
    actor = (await xrpc("com.atproto.identity.resolveHandle", { handle: actor })).did;
  }
  return "at://" + actor + "/app.bsky.feed.post/" + rkey;
}

async function getThread(uri, parentHeight) {
  // 1000 is the lexicon's maximum depth; the AppView returns the whole reply tree up to it.
  const d = await xrpc("app.bsky.feed.getPostThread", { uri, depth: "1000", parentHeight: String(parentHeight) });
  if (d.thread?.$type !== "app.bsky.feed.defs#threadViewPost") throw new Error("couldn't read that post (deleted, blocked, or not found)");
  return d.thread;
}

// Count mentions in every reply beneath `node` (and node itself if includeSelf).
// One count per mention facet feature, so a repeated mention counts repeatedly.
function tally(node, includeSelf) {
  const counts = new Map();
  let posts = 0;
  const stack = includeSelf ? [node] : [...(node.replies || [])];
  while (stack.length) {
    const n = stack.pop();
    if (n.$type !== "app.bsky.feed.defs#threadViewPost") continue;
    posts++;
    for (const f of n.post.record?.facets || []) {
      for (const ft of f.features || []) {
        if (ft.$type === MENTION && ft.did) counts.set(ft.did, (counts.get(ft.did) || 0) + 1);
      }
    }
    if (n.replies) stack.push(...n.replies);
  }
  return { counts, posts };
}

async function loadProfiles(dids) {
  const out = new Map();
  for (let i = 0; i < dids.length; i += 25) {
    const qs = new URLSearchParams();
    for (const d of dids.slice(i, i + 25)) qs.append("actors", d);
    try {
      const r = await fetch(API + "app.bsky.actor.getProfiles?" + qs);
      if (!r.ok) continue;
      for (const p of (await r.json()).profiles || []) out.set(p.did, p);
    } catch (_) { /* leave those rows with the bare DID */ }
  }
  return out;
}

function el(tag, props, ...kids) {
  const e = document.createElement(tag);
  Object.assign(e, props || {});
  for (const k of kids) e.append(k);
  return e;
}

async function run(input) {
  $("go").disabled = true;
  $("out").hidden = true;
  try {
    setStatus("finding the post…");
    const uri = await parsePost(input);
    setStatus("reading the thread…");
    const thread = await getThread(uri, 1000);
    const includeSelf = $("self").checked;
    const rootUri = thread.post.record?.reply?.root?.uri;
    const isRoot = !rootUri || rootUri === uri;

    const here = tally(thread, includeSelf);
    let rootT = null;
    if (!isRoot) {
      setStatus("reading the root thread…");
      rootT = tally(await getThread(rootUri, 0), includeSelf);
    }

    const all = new Set([...here.counts.keys(), ...(rootT ? rootT.counts.keys() : [])]);
    setStatus(all.size ? "looking up " + all.size + " people…" : "");
    const profs = await loadProfiles([...all]);

    const rows = [...all].map((did) => ({
      did, post: here.counts.get(did) || 0, root: rootT ? rootT.counts.get(did) || 0 : 0,
      p: profs.get(did),
    }));
    const handleOf = (r) => r.p?.handle || r.did;
    rows.sort((a, b) => b.post - a.post || b.root - a.root || handleOf(a).localeCompare(handleOf(b)));

    $("h-root").hidden = !rootT;
    const tb = $("rows");
    tb.replaceChildren();
    for (const r of rows) {
      const who = el("div", { className: "who" });
      const img = el("img", { alt: "", loading: "lazy" });
      if (r.p?.avatar) img.src = r.p.avatar;
      const link = el("a", { href: "https://bsky.app/profile/" + (r.p?.handle || r.did), target: "_blank", rel: "noopener" });
      link.append(el("span", { className: "dn", textContent: r.p?.displayName || handleOf(r) }));
      if (r.p?.displayName) link.append(el("span", { className: "hd", textContent: "@" + handleOf(r) }));
      who.append(img, link);
      const tr = el("tr", null, el("td", null, who), el("td", { className: "n", textContent: String(r.post) }));
      if (rootT) tr.append(el("td", { className: "n", textContent: String(r.root) }));
      tb.append(tr);
    }

    const sum = (m) => [...m.values()].reduce((a, b) => a + b, 0);
    let text = sum(here.counts) + " mentions of " + here.counts.size + " people across " + here.posts + (includeSelf ? " posts" : " replies");
    if (rootT) text += "; " + sum(rootT.counts) + " mentions of " + rootT.counts.size + " people across " + rootT.posts + " posts under the root";
    $("summary").textContent = text + ".";
    if (!rows.length) $("summary").textContent = "no mentions found " + (includeSelf ? "in" : "under") + " that post.";

    const link = location.origin + "/?post=" + encodeURIComponent(input.trim());
    const top = rows[0] && rows[0].post ? " Most mentioned: @" + handleOf(rows[0]) + " (" + rows[0].post + "×)." : "";
    $("share").href = "https://bsky.app/intent/compose?text=" + encodeURIComponent("Mention tally for a thread:" + top + "\n" + link);
    setStatus("");
    $("out").hidden = false;
  } catch (e) {
    setStatus(e.message || String(e), true);
  } finally {
    $("go").disabled = false;
  }
}

$("form").addEventListener("submit", (e) => { e.preventDefault(); run($("post").value); });
$("self").addEventListener("change", () => { if ($("post").value.trim() && !$("out").hidden) run($("post").value); });

const q = new URLSearchParams(location.search).get("post");
if (q) { $("post").value = q; run(q); }
