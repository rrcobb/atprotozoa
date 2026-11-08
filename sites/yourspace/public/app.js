// app.js — yourspace: render any atproto account as a customisable profile
// page, and let the signed-in owner edit their net.bisks.yourspace.page record.
import { resolveDid, resolvePds, getRecord, resolveHandleForDid } from "./lib/atproto.js";
import { login, completeLoginIfCallback, getSession, clearSession, dpopFetch } from "./lib/oauth.js";
import {
  PAGE_COLLECTION, WIDGET_COLLECTION, PRESETS, FONTS, SECTIONS, BUILTIN_WIDGETS,
  normalizePage, toRecord, parseTrackRef, parsePostRef, parseAtUri, widgetFrame, safeHttps,
} from "./lib/page.js";

const APPVIEW = "https://public.api.bsky.app/xrpc";
const PLYR = "https://api.plyr.fm";
const $ = (id) => document.getElementById(id);

function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

async function api(path, params) {
  const r = await fetch(`${APPVIEW}/${path}?${new URLSearchParams(params)}`);
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  return r.json();
}

const cleanHandle = (s) => (s || "").trim().replace(/^@/, "");

let session = null;
let current = null; // { did, handle, pds, profile, page, rec }
let draft = null;
let renderToken = 0;

// ---------- boot ----------
async function boot() {
  try {
    session = (await completeLoginIfCallback()) || (await getSession());
  } catch (e) {
    console.error(e);
  }
  drawAuth();
  attachHandleTypeahead($("who"));
  $("who").addEventListener("input", () => {}); // typeahead dispatches input; keep value in sync
  $("secret").addEventListener("click", () => {
    const w = $("who");
    w.value = "@cee.wtf";
    w.dispatchEvent(new Event("input", { bubbles: true }));
    w.dispatchEvent(new Event("change", { bubbles: true }));
    w.focus();
  });
  $("lookup").addEventListener("submit", (e) => {
    e.preventDefault();
    const v = cleanHandle($("who").value);
    if (v) go(v);
  });
  window.addEventListener("popstate", route);
  route();
}

function go(actor) {
  history.pushState({}, "", `/?u=${encodeURIComponent(actor)}`);
  route();
}

function route() {
  const u = new URLSearchParams(location.search).get("u");
  if (u) return showPage(cleanHandle(u));
  if (session) return showPage(session.did);
  showWelcome();
}

function showWelcome() {
  current = null;
  $("welcome").hidden = false;
  $("page").hidden = true;
  $("usercss").textContent = "";
  closeEditor();
}

function drawAuth() {
  const box = $("authbox");
  box.replaceChildren();
  if (session) {
    box.append(
      h("span", {}, "@" + session.handle + " "),
      h("button", { class: "btn", onclick: () => (current && current.did === session.did ? openEditor() : go(session.handle)) }, "edit my page"),
      " ",
      h("button", { class: "btn", onclick: async () => { await clearSession(); session = null; drawAuth(); route(); } }, "sign out"),
    );
  } else {
    box.append(
      h("button", { class: "btn primary", onclick: async () => {
        const hdl = cleanHandle($("who").value);
        if (!hdl) { $("who").focus(); $("who").placeholder = "type YOUR handle here, then sign in"; return; }
        try { await login(hdl); } catch (e) { alert("sign-in failed: " + e.message); }
      } }, "sign in to build yours"),
    );
  }
}

// ---------- load + render ----------
async function showPage(actor) {
  const token = ++renderToken;
  $("welcome").hidden = true;
  $("page").hidden = false;
  $("left").replaceChildren(h("div", { class: "panel" }, h("div", { class: "body" }, "loading…")));
  $("right").replaceChildren();
  try {
    const did = await resolveDid(actor);
    const [pds, profile] = await Promise.all([resolvePds(did), api("app.bsky.actor.getProfile", { actor: did })]);
    let rec = null;
    if (pds) {
      try { rec = (await getRecord(pds, did, PAGE_COLLECTION, "self")).value; } catch (_) { /* no page record yet: default page */ }
    }
    if (token !== renderToken) return;
    current = { did, handle: profile.handle, pds, profile, rec, page: normalizePage(rec) };
    draw();
  } catch (e) {
    console.error(e);
    $("left").replaceChildren(h("div", { class: "panel" }, h("div", { class: "body err" }, `couldn't load "${actor}": ${e.message}`)));
  }
}

function applyTheme(p) {
  const r = document.documentElement.style;
  r.setProperty("--bg", p.bg);
  r.setProperty("--text", p.text);
  r.setProperty("--link", p.link);
  r.setProperty("--panel", p.panel);
  r.setProperty("--panel-a", String(p.panelAlpha));
  r.setProperty("--font", FONTS[p.font]);
  document.body.style.backgroundImage = p.bgImage ? `url("${p.bgImage}")` : "";
  document.body.style.backgroundRepeat = p.bgRepeat ? "repeat" : "no-repeat";
  document.body.style.backgroundSize = p.bgRepeat ? "auto" : "cover";
  document.body.style.backgroundAttachment = "fixed";
  $("usercss").textContent = p.css;
}

function panel(title, ...body) {
  return h("div", { class: "panel" }, h("h2", {}, title), h("div", { class: "body" }, ...body));
}

function draw() {
  const { profile, page } = current;
  applyTheme(page);
  document.title = `${page.title || profile.displayName || profile.handle} — yourspace`;
  $("shareLink").href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(
    `my yourspace page: https://yourspace.bisks.net/?u=${profile.handle}`);

  const left = $("left"), right = $("right");
  left.replaceChildren(
    h("div", { class: "panel hero" },
      profile.banner ? h("img", { class: "banner", src: profile.banner, alt: "" }) : null,
      h("div", { class: "body" },
        profile.avatar ? h("img", { class: "avatar", src: profile.avatar, alt: "" }) : null,
        h("h1", {}, page.title || profile.displayName || profile.handle),
        h("div", { class: "handle" }, "@" + profile.handle),
        page.tagline ? h("p", {}, page.tagline) : null,
        page.mood ? h("div", { class: "mood" }, "mood: " + page.mood) : null,
        h("p", { class: "muted" }, `${profile.followersCount ?? 0} followers · ${profile.followsCount ?? 0} following · ${profile.postsCount ?? 0} posts`),
        h("a", { href: `https://bsky.app/profile/${profile.handle}`, target: "_blank", rel: "noopener" }, "view on bluesky"),
        session && session.did === current.did ? h("p", {}, h("button", { class: "btn primary", onclick: openEditor }, "customise this page")) : null,
      )),
  );
  right.replaceChildren();
  const slots = {};
  for (const s of page.sections) {
    const slot = h("div", {});
    slots[s] = slot;
    // about + music live in the sidebar, the rest in the main column.
    (s === "about" || s === "music" || s === "friends" ? left : right).append(slot);
  }
  const t = renderToken;
  const fill = (name, fn) => {
    const slot = slots[name];
    if (!slot) return;
    fn(slot, t).catch((e) => { console.error(name, e); if (t === renderToken) slot.replaceChildren(panel(name, h("span", { class: "err" }, "couldn't load: " + e.message))); });
  };
  fill("about", sectionAbout);
  fill("music", sectionMusic);
  fill("skeets", sectionSkeets);
  fill("blog", sectionBlog);
  fill("photos", sectionPhotos);
  fill("friends", sectionFriends);
  fill("widgets", sectionWidgets);
}

async function sectionAbout(slot) {
  const d = current.profile.description;
  slot.replaceChildren(panel("about me", h("div", { style: "white-space:pre-wrap" }, d || "this person hasn't written a bio.")));
}

// ---- music (plyr.fm) ----
let audio = null;
let musicCache = null; // { key, node }: live-preview redraws must not restart the song
async function sectionMusic(slot, t) {
  const key = current.did + "|" + current.page.music + "|" + current.page.musicAutoplay;
  if (musicCache && musicCache.key === key) return slot.replaceChildren(musicCache.node);
  musicCache = null;
  if (audio) { audio.pause(); audio = null; }
  const ref = parseTrackRef(current.page.music);
  let track = null;
  if (ref) {
    const r = await fetch(`${PLYR}/tracks/${ref.id}`);
    if (r.ok) track = await r.json();
  } else if (!current.page.music) {
    // no track chosen: use their own latest plyr.fm upload, if they have one.
    const r = await fetch(`${PLYR}/tracks/?artist_did=${encodeURIComponent(current.did)}`);
    if (r.ok) track = ((await r.json()).tracks || []).find((x) => x.artist_did === current.did) || null;
  }
  if (t !== renderToken) return;
  if (!track || !track.r2_url) {
    slot.replaceChildren(current.page.music ? panel("now playing", h("span", { class: "muted" }, "couldn't find that plyr.fm track.")) : "");
    return;
  }
  audio = new Audio(track.r2_url);
  audio.loop = true;
  const btn = h("button", { class: "btn" }, "▶ play");
  const sync = () => { btn.textContent = audio && !audio.paused ? "⏸ pause" : "▶ play"; };
  btn.addEventListener("click", () => { if (audio.paused) audio.play().catch(() => {}); else audio.pause(); });
  audio.addEventListener("play", sync);
  audio.addEventListener("pause", sync);
  const node = panel("now playing",
    h("div", { class: "player" },
      track.image_url || track.thumbnail_url ? h("img", { src: track.image_url || track.thumbnail_url, alt: "" }) : null,
      h("div", { class: "meta" }, h("b", {}, track.title), h("span", { class: "muted" }, track.artist), h("br"), btn)),
    h("div", { class: "muted" }, h("a", { href: `https://plyr.fm/track/${track.id}`, target: "_blank", rel: "noopener" }, "on plyr.fm")));
  musicCache = { key, node };
  slot.replaceChildren(node);
  if (current.page.musicAutoplay) {
    // Browsers block sound before a user gesture, so try now and fall back
    // to starting on the first click/key/touch anywhere on the page.
    audio.play().catch(() => {
      const start = () => { if (audio && audio.paused) audio.play().catch(() => {}); };
      for (const ev of ["pointerdown", "keydown", "touchstart"]) window.addEventListener(ev, start, { once: true });
    });
  }
}

// ---- skeets ----
function skeetCard(p) {
  const rkey = p.uri.split("/").pop();
  const img = p.embed && p.embed.images && p.embed.images[0];
  return h("div", { class: "skeet" },
    h("div", { style: "white-space:pre-wrap" }, p.record.text || ""),
    img ? h("img", { class: "thumb", src: img.thumb, alt: img.alt || "" }) : null,
    h("div", { class: "stats" }, `♥ ${p.likeCount ?? 0} · ↻ ${p.repostCount ?? 0} · `,
      h("a", { href: `https://bsky.app/profile/${p.author.handle}/post/${rkey}`, target: "_blank", rel: "noopener" }, new Date(p.record.createdAt).toLocaleDateString())));
}

async function sectionSkeets(slot, t) {
  const { did, page } = current;
  let posts = [];
  let title = "best skeets";
  if (page.pinned.length) {
    const uris = [];
    for (const raw of page.pinned) {
      const ref = parsePostRef(raw);
      if (!ref) continue;
      try { uris.push(`at://${ref.actor.startsWith("did:") ? ref.actor : await resolveDid(ref.actor)}/app.bsky.feed.post/${ref.rkey}`); } catch (_) {}
    }
    for (let i = 0; i < uris.length; i += 25) {
      posts.push(...(await api("app.bsky.feed.getPosts", { uris: uris.slice(i, i + 25) })).posts.map((p) => p));
    }
    // getPosts is unordered; keep the owner's order.
    const rank = new Map(uris.map((u, i) => [u, i]));
    posts.sort((a, b) => rank.get(a.uri) - rank.get(b.uri));
    title = "pinned skeets";
  } else {
    // No pins: rank by likes over the SCAN_PAGES most recent original posts.
    // Deliberate product decision, not a data cap: "best skeets" is a
    // highlight reel and the AppView has no top-by-likes query, so we bound
    // the scan to keep the page loading in about a second.
    const SCAN_PAGES = 6;
    let cursor;
    for (let i = 0; i < SCAN_PAGES; i++) {
      const params = { actor: did, filter: "posts_no_replies", limit: "100" };
      if (cursor) params.cursor = cursor;
      const d = await api("app.bsky.feed.getAuthorFeed", params);
      posts.push(...d.feed.filter((f) => !f.reason && f.post.author.did === did).map((f) => f.post));
      cursor = d.cursor;
      if (!cursor) break;
    }
    posts.sort((a, b) => (b.likeCount ?? 0) - (a.likeCount ?? 0));
    posts = posts.slice(0, 8);
  }
  if (t !== renderToken) return;
  slot.replaceChildren(panel(title, posts.length ? posts.map(skeetCard) : h("span", { class: "muted" }, "nothing here yet.")));
}

// ---- blog (whtwnd + standard.site) ----
async function listAll(pds, repo, collection) {
  const out = [];
  let cursor;
  do { // page to exhaustion: blog collections are small and the owner wants all of them
    const params = new URLSearchParams({ repo, collection, limit: "100" });
    if (cursor) params.set("cursor", cursor);
    const r = await fetch(`${pds.replace(/\/$/, "")}/xrpc/com.atproto.repo.listRecords?${params}`);
    if (!r.ok) break; // collection missing on this PDS
    const d = await r.json();
    out.push(...(d.records || []));
    cursor = d.cursor;
  } while (cursor);
  return out;
}

async function sectionBlog(slot, t) {
  const { did, pds } = current;
  if (!pds) return slot.replaceChildren();
  const [wht, std] = await Promise.all([
    listAll(pds, did, "com.whtwnd.blog.entry"),
    listAll(pds, did, "site.standard.document"),
  ]);
  const items = [];
  for (const r of wht) {
    const v = r.value || {};
    if (v.visibility && v.visibility !== "public") continue;
    items.push({ title: v.title || "(untitled)", date: v.createdAt, url: `https://whtwnd.com/${did}/${r.uri.split("/").pop()}`, snip: (v.content || "").replace(/[#*_`>\[\]]/g, "").slice(0, 160) });
  }
  for (const r of std) {
    const v = r.value || {};
    const site = typeof v.site === "string" && safeHttps(v.site);
    items.push({ title: v.title || "(untitled)", date: v.publishedAt || v.createdAt, url: site ? site.replace(/\/$/, "") + (v.path || "") : null, snip: v.description || "" });
  }
  items.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  if (t !== renderToken) return;
  if (!items.length) return slot.replaceChildren();
  slot.replaceChildren(panel("blog", items.map((i) =>
    h("div", { class: "blogentry" },
      i.url ? h("a", { href: i.url, target: "_blank", rel: "noopener" }, i.title) : h("b", {}, i.title),
      " ", h("small", {}, i.date ? new Date(i.date).toLocaleDateString() : ""),
      i.snip ? h("div", { class: "muted" }, i.snip) : null))));
}

// ---- photos ----
async function sectionPhotos(slot, t) {
  const { did } = current;
  const grid = h("div", { class: "photos" });
  const more = h("button", { class: "btn", style: "margin-top:.6rem" }, "load more");
  let cursor;
  let count = 0;
  const load = async () => {
    more.disabled = true;
    const params = { actor: did, filter: "posts_with_media", limit: "50" };
    if (cursor) params.cursor = cursor;
    const d = await api("app.bsky.feed.getAuthorFeed", params);
    if (t !== renderToken) return;
    for (const f of d.feed) {
      if (f.reason || f.post.author.did !== did) continue;
      const imgs = (f.post.embed && f.post.embed.images) || [];
      for (const im of imgs) {
        count++;
        grid.append(h("a", { href: `https://bsky.app/profile/${f.post.author.handle}/post/${f.post.uri.split("/").pop()}`, target: "_blank", rel: "noopener" },
          h("img", { src: im.thumb, alt: im.alt || "", loading: "lazy" })));
      }
    }
    cursor = d.cursor;
    more.hidden = !cursor; // pages until the cursor runs out
    more.disabled = false;
  };
  more.addEventListener("click", () => load().catch((e) => { more.disabled = false; more.textContent = "retry (" + e.message + ")"; }));
  await load();
  if (t !== renderToken) return;
  if (!count && !cursor) return slot.replaceChildren();
  slot.replaceChildren(panel("photos", grid, more));
}

// ---- top friends ----
async function sectionFriends(slot, t) {
  const names = current.page.friends;
  if (!names.length) {
    slot.replaceChildren(session && session.did === current.did ? panel("top friends", h("span", { class: "muted" }, "pick your top friends in the editor.")) : "");
    return;
  }
  const profiles = [];
  for (let i = 0; i < names.length; i += 25) {
    const d = await api("app.bsky.actor.getProfiles", { actors: names.slice(i, i + 25).map(cleanHandle) });
    profiles.push(...d.profiles);
  }
  const order = new Map(names.map((n, i) => [cleanHandle(n).toLowerCase(), i]));
  profiles.sort((a, b) => (order.get(a.handle.toLowerCase()) ?? order.get(a.did) ?? 99) - (order.get(b.handle.toLowerCase()) ?? order.get(b.did) ?? 99));
  if (t !== renderToken) return;
  slot.replaceChildren(panel(`${current.profile.displayName || current.handle}'s top ${profiles.length}`,
    h("div", { class: "friends" }, profiles.map((p) =>
      h("a", { href: `/?u=${encodeURIComponent(p.handle)}` , onclick: (e) => { e.preventDefault(); go(p.handle); } },
        p.avatar ? h("img", { src: p.avatar, alt: "" }) : h("div", { style: "aspect-ratio:1;background:#8884" }),
        h("div", {}, p.displayName || p.handle))))));
}

// ---- widgets ----
async function loadWidgetDef(ref) {
  if (BUILTIN_WIDGETS[ref]) return BUILTIN_WIDGETS[ref];
  const a = parseAtUri(ref);
  if (!a || a.collection !== WIDGET_COLLECTION) return null;
  const did = a.repo.startsWith("did:") ? a.repo : await resolveDid(a.repo);
  const pds = await resolvePds(did);
  return (await getRecord(pds, did, a.collection, a.rkey)).value;
}

async function sectionWidgets(slot, t) {
  const { widgets } = current.page;
  if (!widgets.length) return slot.replaceChildren();
  const panels = [];
  for (const ref of widgets) {
    try {
      const def = await loadWidgetDef(ref);
      const f = widgetFrame(def, { did: current.did, handle: current.handle }, location.origin);
      if (!f) continue;
      // sandbox without allow-same-origin: widget code runs, but in an opaque
      // origin, so it can't read our IndexedDB session or cookies.
      panels.push(panel(f.name, h("iframe", { class: "widget", src: f.src, height: String(f.height), sandbox: "allow-scripts", referrerpolicy: "no-referrer", loading: "lazy", title: f.name })));
    } catch (e) { console.error("widget", ref, e); }
  }
  if (t !== renderToken) return;
  slot.replaceChildren(...panels);
}

// ---------- editor ----------
function openEditor() {
  if (!session || !current || current.did !== session.did) return;
  draft = { ...current.page };
  drawEditor();
  $("editor").hidden = false;
}
function closeEditor() { $("editor").hidden = true; }

let liveTimer = 0;
function liveUpdate() {
  clearTimeout(liveTimer);
  liveTimer = setTimeout(() => { current.page = normalizePage(draft); draw(); }, 250);
}

function field(label, input) { return h("label", {}, label, input); }
function textInput(key, ph, max) {
  return h("input", { type: "text", value: draft[key] || "", placeholder: ph || "", maxlength: max, oninput: (e) => { draft[key] = e.target.value; liveUpdate(); } });
}
function colorInput(key, label) {
  return h("label", { class: "row" }, h("input", { type: "color", value: draft[key], oninput: (e) => { draft[key] = e.target.value; liveUpdate(); } }), label);
}
function listArea(key, ph, rows = 3) {
  const ta = h("textarea", { rows, placeholder: ph, oninput: (e) => { draft[key] = e.target.value.split("\n").map((s) => s.trim()).filter(Boolean); liveUpdate(); } });
  ta.value = (draft[key] || []).join("\n");
  return ta;
}

function drawEditor() {
  const ed = $("editor");
  const status = h("div", { class: "tiny", id: "edstatus" });
  const sectionList = h("ul", { class: "order" });
  const drawSections = () => {
    sectionList.replaceChildren(...SECTIONS.map((s) => {
      const on = draft.sections.includes(s);
      const i = draft.sections.indexOf(s);
      return h("li", {},
        h("input", { type: "checkbox", checked: on, onchange: (e) => {
          draft.sections = e.target.checked ? [...draft.sections, s] : draft.sections.filter((x) => x !== s);
          drawSections(); liveUpdate();
        } }),
        h("span", { style: "flex:1" }, s),
        on ? h("button", { class: "btn", onclick: () => { move(i, -1); } }, "↑") : null,
        on ? h("button", { class: "btn", onclick: () => { move(i, 1); } }, "↓") : null);
    }));
  };
  const move = (i, d) => {
    const j = i + d;
    if (j < 0 || j >= draft.sections.length) return;
    [draft.sections[i], draft.sections[j]] = [draft.sections[j], draft.sections[i]];
    drawSections(); liveUpdate();
  };
  drawSections();

  const presetSel = h("select", { onchange: (e) => {
    Object.assign(draft, PRESETS[e.target.value], { preset: e.target.value });
    drawEditor(); liveUpdate();
  } }, Object.entries(PRESETS).map(([k, v]) => h("option", { value: k, selected: draft.preset === k }, v.label)));
  const fontSel = h("select", { onchange: (e) => { draft.font = e.target.value; liveUpdate(); } },
    Object.keys(FONTS).map((k) => h("option", { value: k, selected: draft.font === k }, k)));

  const shelf = h("div", {});
  const authorInput = h("input", { type: "text", placeholder: "widget author's handle", autocapitalize: "off" });
  const findBtn = h("button", { class: "btn", onclick: async () => {
    shelf.replaceChildren("looking…");
    try {
      const did = await resolveDid(cleanHandle(authorInput.value));
      const pds = await resolvePds(did);
      const recs = await listAll(pds, did, WIDGET_COLLECTION);
      shelf.replaceChildren(...(recs.length ? recs.map((r) => h("div", { class: "row" },
        h("b", {}, r.value.name || "widget"), h("span", { class: "tiny", style: "flex:1" }, r.value.description || ""),
        h("button", { class: "btn", onclick: () => addWidget(r.uri) }, "add"))) : ["no widgets published there."]));
    } catch (e) { shelf.replaceChildren("error: " + e.message); }
  } }, "find");
  const widgetArea = listArea("widgets", "at://… widget URIs or builtin:clock, one per line", 3);
  const addWidget = (uri) => {
    if (!draft.widgets.includes(uri)) draft.widgets = [...draft.widgets, uri];
    widgetArea.value = draft.widgets.join("\n");
    if (!draft.sections.includes("widgets")) draft.sections = [...draft.sections, "widgets"];
    liveUpdate();
  };

  const pubName = h("input", { type: "text", placeholder: "widget name" });
  const pubDesc = h("input", { type: "text", placeholder: "one-line description" });
  const pubUrl = h("input", { type: "url", placeholder: "https://you.example/widget.html?did={did}" });
  const pubH = h("input", { type: "text", placeholder: "height px (60–800)", value: "200" });
  const pubStatus = h("div", { class: "tiny" });
  const publish = h("button", { class: "btn", onclick: async () => {
    try {
      if (!pubName.value.trim() || !safeHttps(pubUrl.value)) throw new Error("need a name and an https embed URL");
      const record = { $type: WIDGET_COLLECTION, name: pubName.value.trim(), description: pubDesc.value.trim(), embedUrl: safeHttps(pubUrl.value), height: Math.min(800, Math.max(60, Math.round(Number(pubH.value)) || 200)), createdAt: new Date().toISOString() };
      const res = await dpopFetch(session, `${session.pdsUrl.replace(/\/$/, "")}/xrpc/com.atproto.repo.createRecord`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ repo: session.did, collection: WIDGET_COLLECTION, record }),
      });
      if (!res.ok) throw new Error(await res.text());
      const out = await res.json();
      pubStatus.textContent = "published: " + out.uri;
      addWidget(out.uri);
    } catch (e) { pubStatus.textContent = "didn't publish: " + e.message.slice(0, 200); }
  } }, "publish widget");

  const save = h("button", { class: "btn primary", onclick: async () => {
    status.textContent = "saving…";
    try {
      const record = toRecord(draft);
      const res = await dpopFetch(session, `${session.pdsUrl.replace(/\/$/, "")}/xrpc/com.atproto.repo.putRecord`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ repo: session.did, collection: PAGE_COLLECTION, rkey: "self", record }),
      });
      if (!res.ok) throw new Error(await res.text());
      current.rec = record;
      status.textContent = "saved to your repo ✓ — share your link below";
    } catch (e) { console.error(e); status.textContent = "didn't save: " + e.message.slice(0, 200); status.className = "tiny err"; }
  } }, "save to my repo");

  ed.replaceChildren(
    h("div", { class: "row" }, h("b", { style: "flex:1;font-size:15px" }, "customise your space"), h("button", { class: "btn", onclick: closeEditor }, "close")),
    h("div", { class: "row", style: "margin-top:.5rem" }, save, h("span", { class: "tiny" }, "changes preview live; save to publish")),
    status,
    h("h3", {}, "look"),
    field("preset", presetSel),
    h("div", { class: "row" }, colorInput("bg", "background"), colorInput("text", "text"), colorInput("link", "links"), colorInput("panel", "panels")),
    field("panel opacity", h("input", { type: "range", min: "0", max: "1", step: "0.05", value: String(draft.panelAlpha), oninput: (e) => { draft.panelAlpha = Number(e.target.value); liveUpdate(); } })),
    field("font", fontSel),
    field("background image (https)", textInput("bgImage", "https://…", 400)),
    h("label", { class: "row" }, h("input", { type: "checkbox", checked: draft.bgRepeat, onchange: (e) => { draft.bgRepeat = e.target.checked; liveUpdate(); } }), "tile the background (off = cover)"),
    h("h3", {}, "words"),
    field("page title", textInput("title", "defaults to your display name", 120)),
    field("tagline", textInput("tagline", "", 200)),
    field("mood", textInput("mood", "🙂 hopeful", 80)),
    h("h3", {}, "music"),
    field("plyr.fm track link or id (blank = your latest upload)", textInput("music", "https://plyr.fm/track/1683", 300)),
    h("label", { class: "row" }, h("input", { type: "checkbox", checked: draft.musicAutoplay, onchange: (e) => { draft.musicAutoplay = e.target.checked; liveUpdate(); } }), "autoplay on page load"),
    h("div", { class: "tiny" }, "browsers block sound until a visitor interacts, so it starts on their first click or key if it can't start by itself."),
    h("h3", {}, "pinned skeets"),
    listArea("pinned", "bsky.app post links, one per line (blank = auto-pick your most-liked)", 3),
    h("h3", {}, "top friends"),
    listArea("friends", "handles, one per line", 4),
    h("h3", {}, "sections"),
    sectionList,
    h("h3", {}, "widgets"),
    widgetArea,
    h("div", { class: "row" }, authorInput, findBtn),
    shelf,
    h("details", {}, h("summary", {}, "publish a widget of your own"),
      pubName, pubDesc, pubUrl, pubH, publish, pubStatus,
      h("div", { class: "tiny" }, "your embedUrl loads in a sandboxed frame (scripts allowed, no access to this site). {did} and {handle} are filled in with the page owner's.")),
    h("h3", {}, "custom css"),
    h("textarea", { rows: "7", placeholder: ".panel { border-radius: 14px }\n.hero h1 { font-size: 30px }", oninput: (e) => { draft.css = e.target.value; liveUpdate(); } }),
    h("div", { class: "tiny" }, "url(), @import and anything that fetches is stripped. Your page: ",
      h("a", { href: `/?u=${session.handle}` }, `yourspace.bisks.net/?u=${session.handle}`)),
  );
  ed.querySelector("details ~ textarea").value = draft.css || "";
}

boot();
