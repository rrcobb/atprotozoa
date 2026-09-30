import { generate, analyzeAvatar } from "./lib/fakehub.js";

const API = "https://public.api.bsky.app/xrpc/";
const $ = (id) => document.getElementById(id);
const msg = (t, err) => { $("msg").textContent = t; $("msg").className = err ? "err" : ""; };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

async function xrpc(method, params) {
  const r = await fetch(API + method + "?" + new URLSearchParams(params));
  if (!r.ok) throw new Error(method + " " + r.status);
  return r.json();
}

function cleanHandle(raw) {
  let h = (raw || "").trim().replace(/^@/, "");
  const m = h.match(/bsky\.app\/profile\/([^/\s?#]+)/i);
  if (m) h = m[1];
  return h.trim();
}

// Draws the avatar into a 32x32 canvas and returns its pixels. Needs the CDN to
// send CORS headers; if the canvas is tainted or the image fails we return null
// and the profile is generated from the posts alone.
function avatarPixels(url) {
  return new Promise((resolve) => {
    if (!url) return resolve(null);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = c.height = 32;
        const ctx = c.getContext("2d");
        ctx.drawImage(img, 0, 0, 32, 32);
        resolve(ctx.getImageData(0, 0, 32, 32).data);
      } catch (_) { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function render(profile, m) {
  $("av").src = profile.avatar || "";
  $("dn").textContent = profile.displayName || profile.handle;
  $("lg").textContent = profile.handle.replace(/\./g, "-");
  $("bio").textContent = m.bio;
  $("arch").textContent = m.arch.name;
  $("archline").textContent = m.arch.line;
  $("meta").innerHTML = `${esc(m.followers)} followers · ${m.repos.length} repos · ${m.total} contributions this year`;
  $("gh").textContent = `${m.total} contributions in the last year`;
  const max = Math.max(1, ...m.counts);
  $("graph").innerHTML = m.counts.map((c) => {
    const l = c === 0 ? "" : "l" + Math.min(4, 1 + Math.floor((c / max) * 3.99));
    return `<i class="${l}" title="${c} contributions"></i>`;
  }).join("");
  $("pins").innerHTML = m.repos.map((r) => `<div class="pin"><b>${esc(r.name)}</b><div>${esc(r.desc)}</div><div><span class="dot" style="background:${r.color}"></span>${r.lang} · ★ ${r.stars} · ⑂ ${r.forks}</div></div>`).join("");
  $("prs").innerHTML = m.prs.map((p) => `<div class="row"><div><span class="st ${p.state}">${p.state}</span><span class="t">${esc(p.title)}</span></div>
    <div class="s">${esc(p.repo)}#${p.number} · <span class="add">+${p.add}</span> <span class="del">−${p.del}</span> · ${p.files} file${p.files === 1 ? "" : "s"} · ${p.comments} comments · ${p.daysAgo}d ago</div>
    ${p.body ? `<div class="body">${esc(p.body.heading).replace(/\n/g, "<br>")}<ul>${p.body.bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul></div>` : ""}</div>`).join("");
  $("commits").innerHTML = m.commits.map((c) => `<div class="row"><div class="t">${esc(c.msg)}</div><div class="s"><span class="hash">${c.hash}</span> · ${esc(c.repo)} · ${String(c.hour).padStart(2, "0")}:${String((c.hash.charCodeAt(0) * 7) % 60).padStart(2, "0")}</div></div>`).join("");
  $("issues").innerHTML = m.issues.map((i) => `<div class="row"><div class="t">${esc(i.title)}</div><div class="s">${esc(i.repo)}#${i.number}</div><div class="quote">${esc(i.comment)}</div></div>`).join("");
  const text = `fakehub says @${profile.handle} is ${m.arch.name}: "${m.arch.line}"\n\nhttps://fakehub.bisks.net/`;
  $("share").href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(text);
  $("intro").hidden = true;
  $("out").hidden = false;
}

async function run(raw) {
  const handle = cleanHandle(raw);
  if (!handle) return msg("type a handle first", true);
  $("go").disabled = true;
  msg("reading the avatar and the posts…");
  try {
    // getProfile accepts a handle or DID directly.
    const profile = await xrpc("app.bsky.actor.getProfile", { actor: handle });
    // "Recent" is the product: one page (100 posts) is the window the profile is
    // built from, not a truncated read of a full history.
    const feed = await xrpc("app.bsky.feed.getAuthorFeed", { actor: profile.did, limit: "100", filter: "posts_no_replies" });
    const posts = (feed.feed || [])
      .filter((f) => !f.reason && f.post && f.post.record)
      .map((f) => ({ text: f.post.record.text || "", createdAt: f.post.record.createdAt || f.post.indexedAt }));
    const px = await avatarPixels(profile.avatar);
    const m = generate({ profile, posts, avatar: px ? analyzeAvatar(px) : null });
    render(profile, m);
    history.replaceState(null, "", "#" + profile.handle);
    msg(px ? "" : "couldn't read the avatar's pixels, so this one is posts-only.");
  } catch (e) {
    msg("couldn't load that profile — check the handle.", true);
  } finally {
    $("go").disabled = false;
  }
}

$("f").addEventListener("submit", (e) => { e.preventDefault(); run($("handle").value); });
if (typeof attachHandleTypeahead === "function") attachHandleTypeahead($("handle"));
const initial = decodeURIComponent(location.hash.slice(1));
if (initial) { $("handle").value = initial; run(initial); }
