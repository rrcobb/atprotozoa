// app.js — mutedcheck.bisks.net client logic.
//
// Two atproto calls, both read-only:
//   1. app.bsky.actor.getPreferences, DPoP-authenticated, straight to the
//      signed-in user's own PDS (see lib/oauth.js's header comment for why
//      this needs no `aud` — muted words are PDS-private, never proxied to
//      the AppView). Pulls out every app.bsky.actor.defs#mutedWordsPref item.
//   2. app.bsky.feed.getPostThread against the public, unauthenticated
//      AppView, depth=0 — a post's text is public data, no session needed.

import { login, completeLoginIfCallback, getSession, clearSession, dpopFetch, resolveHandle } from "/lib/oauth.js";

const PUBLIC_API = "https://public.api.bsky.app";

let session = null;
let mutedWords = []; // [{ value, targets }]

const els = {
  authBar: document.getElementById("authBar"),
  authMsg: document.getElementById("authMsg"),
  wordsPanel: document.getElementById("wordsPanel"),
  wordsList: document.getElementById("wordsList"),
  wordsCount: document.getElementById("wordsCount"),
  checkPanel: document.getElementById("checkPanel"),
  postUrl: document.getElementById("postUrl"),
  checkBtn: document.getElementById("checkBtn"),
  checkMsg: document.getElementById("checkMsg"),
  result: document.getElementById("result"),
  shareBar: document.getElementById("shareBar"),
  shareLink: document.getElementById("shareLink"),
};

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function escRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// --- muted words -------------------------------------------------------

async function fetchMutedWords(sess) {
  const url = `${sess.pdsUrl.replace(/\/$/, "")}/xrpc/app.bsky.actor.getPreferences`;
  const res = await dpopFetch(sess, url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`getPreferences failed (${res.status})`);
  const data = await res.json();
  const now = Date.now();
  const words = [];
  for (const pref of data.preferences || []) {
    if (pref.$type !== "app.bsky.actor.defs#mutedWordsPref") continue;
    for (const item of pref.items || []) {
      if (!item.value) continue;
      if (item.expiresAt && Date.parse(item.expiresAt) < now) continue; // expired, no longer live
      words.push({ value: item.value, targets: item.targets && item.targets.length ? item.targets : ["content"] });
    }
  }
  // Longest first so a phrase like "bad news" reports before its substring "bad".
  words.sort((a, b) => b.value.length - a.value.length);
  return words;
}

function renderWordsPanel() {
  els.wordsCount.textContent = mutedWords.length
    ? `${mutedWords.length} muted word${mutedWords.length === 1 ? "" : "s"}/phrase${mutedWords.length === 1 ? "" : "s"} loaded`
    : "no muted words on this account";
  els.wordsList.innerHTML = mutedWords
    .map((w) => `<span class="chip" title="targets: ${esc(w.targets.join(", "))}">${esc(w.value)}</span>`)
    .join("");
  els.wordsPanel.hidden = false;
  els.checkPanel.hidden = false;
}

// --- post fetching -------------------------------------------------------

// Accepts a bsky.app post URL, a bare at:// URI, or just pasted text
// containing one of those — pulls out (actor, rkey) and resolves actor to a
// DID if it's a handle.
async function parsePostRef(raw) {
  const s = raw.trim();
  let actor, rkey;

  let m = s.match(/at:\/\/([^/]+)\/app\.bsky\.feed\.post\/([a-zA-Z0-9.\-_~]+)/);
  if (m) {
    actor = m[1];
    rkey = m[2];
  } else {
    m = s.match(/bsky\.app\/profile\/([^/]+)\/post\/([a-zA-Z0-9.\-_~]+)/);
    if (m) {
      actor = decodeURIComponent(m[1]);
      rkey = m[2];
    }
  }
  if (!actor || !rkey) return null;

  const did = actor.startsWith("did:") ? actor : await resolveHandle(actor);
  if (!did) throw new Error(`couldn't resolve "${actor}" to a DID`);
  return { uri: `at://${did}/app.bsky.feed.post/${rkey}` };
}

async function fetchPost(uri) {
  const url = new URL(`${PUBLIC_API}/xrpc/app.bsky.feed.getPostThread`);
  url.searchParams.set("uri", uri);
  url.searchParams.set("depth", "0");
  url.searchParams.set("parentHeight", "0");
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`couldn't load that post (${res.status})`);
  const data = await res.json();
  const post = data.thread?.post;
  if (!post) throw new Error("that post doesn't exist, or its thread is blocked/hidden");
  return post;
}

// Hashtags: both the explicit self-label `tags` array on the record, and
// inline #hashtags marked up as richtext facets — either can carry a tag a
// #tag-targeted muted word should catch.
function extractTags(post) {
  const tags = new Set(post.record?.tags || []);
  for (const facet of post.record?.facets || []) {
    for (const feature of facet.features || []) {
      if (feature.$type === "app.bsky.richtext.facet#tag" && feature.tag) tags.add(feature.tag);
    }
  }
  return [...tags];
}

function altTexts(post) {
  const embed = post.embed || post.record?.embed;
  const out = [];
  const imgs = embed?.images || embed?.media?.images || [];
  for (const img of imgs) if (img.alt) out.push(img.alt);
  return out;
}

// Case-insensitive; word-boundary matched when the muted phrase starts/ends
// with a word character (so "ai" doesn't fire on "said"), plain substring
// otherwise (so a muted "🙄" or "c/c++" still matches). Approximates
// Bluesky's own content-word matching, not a byte-exact reimplementation.
function findMatch(haystack, needle) {
  if (!haystack) return false;
  const pattern = escRegExp(needle);
  const startsWord = /^\w/.test(needle);
  const endsWord = /\w$/.test(needle);
  const withBounds = `${startsWord ? "\\b" : ""}${pattern}${endsWord ? "\\b" : ""}`;
  try {
    return new RegExp(withBounds, "iu").test(haystack);
  } catch {
    return haystack.toLowerCase().includes(needle.toLowerCase());
  }
}

function checkPost(post) {
  const text = post.record?.text || "";
  const tags = extractTags(post);
  const alts = altTexts(post);
  const hits = [];
  for (const w of mutedWords) {
    const checkContent = w.targets.includes("content");
    const checkTag = w.targets.includes("tag");
    let where = null;
    if (checkContent && findMatch(text, w.value)) where = "post text";
    else if (checkContent && alts.some((a) => findMatch(a, w.value))) where = "image alt text";
    else if (checkTag && tags.some((t) => findMatch(t, w.value))) where = "hashtag";
    if (where) hits.push({ value: w.value, where });
  }
  return hits;
}

// --- rendering -------------------------------------------------------

function renderResult(post, hits) {
  const authorLine = `@${post.author?.handle || "unknown"}${post.author?.displayName ? ` (${esc(post.author.displayName)})` : ""}`;
  const textHtml = esc(post.record?.text || "(no text)").replace(/\n/g, "<br>");

  const hitsHtml = hits.length
    ? `<div class="verdict bad">⚠️ ${hits.length} muted word${hits.length === 1 ? "" : "s"} found</div>
       <ul class="hits">${hits.map((h) => `<li><b>${esc(h.value)}</b> <span class="dim">— ${esc(h.where)}</span></li>`).join("")}</ul>`
    : `<div class="verdict good">✓ none of your muted words show up here</div>`;

  els.result.innerHTML = `
    <div class="post-card">
      <div class="post-author">${esc(authorLine)}</div>
      <div class="post-text">${textHtml}</div>
    </div>
    ${hitsHtml}
  `;
  els.result.hidden = false;

  const shareText = hits.length
    ? `mutedcheck says this post trips ${hits.length} of my muted word${hits.length === 1 ? "" : "s"} 👀\n\nmutedcheck.bisks.net`
    : `mutedcheck gave this post a clean bill of health — none of my muted words in here.\n\nmutedcheck.bisks.net`;
  els.shareLink.href = `https://bsky.app/intent/compose?text=${encodeURIComponent(shareText)}`;
  els.shareBar.hidden = false;
}

async function runCheck() {
  const raw = els.postUrl.value.trim();
  if (!raw) return;
  setCheckMsg("looking that post up…");
  els.result.hidden = true;
  els.shareBar.hidden = true;
  els.checkBtn.disabled = true;
  try {
    const ref = await parsePostRef(raw);
    if (!ref) throw new Error("couldn't find a post URL or at:// URI in that");
    const post = await fetchPost(ref.uri);
    const hits = checkPost(post);
    setCheckMsg("");
    renderResult(post, hits);
  } catch (e) {
    setCheckMsg(e.message || String(e), true);
  } finally {
    els.checkBtn.disabled = false;
  }
}

async function loadMutedWords() {
  setAuthMsg("loading your muted words…");
  try {
    mutedWords = await fetchMutedWords(session);
    setAuthMsg("");
    renderWordsPanel();
  } catch (e) {
    setAuthMsg("couldn't load muted words: " + (e.message || e), true);
  }
}

// --- auth bar --------------------------------------------------------------

function renderAuthBar() {
  if (session) {
    els.authBar.innerHTML = `signed in as <b>@${esc(session.handle)}</b> · <a id="signOutLink">sign out</a>`;
    document.getElementById("signOutLink").onclick = async () => {
      await clearSession();
      session = null;
      mutedWords = [];
      renderAuthBar();
      els.wordsPanel.hidden = true;
      els.checkPanel.hidden = true;
      els.result.hidden = true;
      els.shareBar.hidden = true;
    };
  } else {
    els.authBar.innerHTML = `
      <input id="signinHandle" placeholder="you.bsky.social" autocomplete="username" />
      <button id="signInBtn" class="btn primary">sign in to load your muted words</button>
    `;
    const handleInput = document.getElementById("signinHandle");
    const go = async () => {
      const h = handleInput.value.trim();
      if (!h) return;
      setAuthMsg("redirecting to your PDS…");
      try {
        await login(h);
      } catch (e) {
        setAuthMsg(e.message || String(e), true);
      }
    };
    document.getElementById("signInBtn").onclick = go;
    handleInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") go();
    });
    if (window.attachHandleTypeahead) window.attachHandleTypeahead(handleInput);
  }
}

function setAuthMsg(text, isErr) {
  els.authMsg.textContent = text || "";
  els.authMsg.style.color = isErr ? "var(--bad)" : "var(--dim)";
}
function setCheckMsg(text, isErr) {
  els.checkMsg.textContent = text || "";
  els.checkMsg.style.color = isErr ? "var(--bad)" : "var(--dim)";
}

// --- boot --------------------------------------------------------------

async function boot() {
  document.getElementById("ceeHook")?.addEventListener("click", () => {
    const input = document.getElementById("signinHandle");
    if (!input) return;
    input.value = "@cee.wtf";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.focus();
  });

  els.checkBtn.addEventListener("click", runCheck);
  els.postUrl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") runCheck();
  });

  try {
    const fromCallback = await completeLoginIfCallback();
    session = fromCallback || (await getSession());
  } catch (e) {
    setAuthMsg(e.message || String(e), true);
    session = await getSession();
  }

  renderAuthBar();
  if (session) await loadMutedWords();
}

boot();
