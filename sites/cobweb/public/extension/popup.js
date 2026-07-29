// cobweb — a browser-extension popup that serves a tiny skyclone-flavored
// timeline from a DATA LITERAL baked right into this file. No fetch, no
// host_permissions in manifest.json, no AppView. Whatever's below is what
// you get, forever, until someone edits this array and reloads the
// extension. That's the whole pitch: skyclone as a snapshot, not a stream.

const DATA = [
  {
    id: "1",
    avatar: "🕷️",
    color: "#b388ff",
    name: "skyclone",
    handle: "@skyclone.bisks.net",
    time: "3d",
    text: "goth mode shipped: dark by default, spider instead of a butterfly, reposts are a fly getting loosed back into the web. this popup is a jar with a few of those flies pinned inside.",
    likes: 41,
    reposts: 6,
    replies: 3,
  },
  {
    id: "2",
    kind: "repost",
    reposter: "@ver.ooo",
    avatar: "🦇",
    color: "#7ee787",
    name: "atproto enjoyer",
    handle: "@ver.ooo",
    time: "3d",
    text: "next up: notifications view. when one lands, a spider crawls across your whole screen. AHH SPIDER.",
    likes: 18,
    reposts: 2,
    replies: 5,
  },
  {
    id: "3",
    avatar: "🧙",
    color: "#ff7a1a",
    name: "the witch button",
    handle: "@skyclone.bisks.net",
    time: "2d",
    text: "summon me on any post. it catches fire, shrivels, vanishes from your web. purely a curse though — nothing's actually deleted. (try the one below.)",
    likes: 63,
    reposts: 4,
    replies: 9,
  },
  {
    id: "4",
    avatar: "🕸️",
    color: "#9a8bb0",
    name: "web thread",
    handle: "@skyclone.bisks.net",
    time: "2d",
    text: "replies are threaded now — the actual parent post sits above a reply, connected by a web-thread line, instead of floating with no context.",
    likes: 27,
    reposts: 1,
    replies: 2,
  },
  {
    id: "7",
    replyTo: "4",
    avatar: "🔮",
    color: "#ff4fa3",
    name: "cobweb",
    handle: "@cobweb.bisks.net",
    time: "2d",
    text: "meta note: this reply is the demo. id 7's replyTo field points at id 4 above, so the popup draws a thread line between them — still nothing fetched, just two array entries pointing at each other.",
    likes: 8,
    reposts: 0,
    replies: 1,
  },
  {
    id: "5",
    kind: "repost",
    reposter: "@fubarchitect.com",
    avatar: "🌙",
    color: "#7c5cd6",
    name: "night shift",
    handle: "@nightshift.example",
    time: "1d",
    text: "a browser plugin that ships its own frozen timeline is such a funny little object. no server round-trip, no rate limit, no stale-data disclaimer needed — it was never fresh to begin with.",
    likes: 12,
    reposts: 3,
    replies: 1,
  },
  {
    id: "6",
    avatar: "🔮",
    color: "#ff4fa3",
    name: "cobweb",
    handle: "@cobweb.bisks.net",
    time: "just now",
    text: "hi, I'm the popup. everything above me is a JS array literal in popup.js, not an API response. open devtools, read the const, that's the whole database.",
    likes: 5,
    reposts: 0,
    replies: 0,
  },
];

// Frozen notifications — same reason/icon vocabulary as skyclone's real
// listNotifications feed, just with nothing behind it. There is no unread
// count that changes, no poll, no PDS. Opening this tab is the only thing
// that "arrives" — and it always arrives with the same four, forever.
const NOTIFS = [
  { reason: "like", icon: "🕸️", verb: "caught your post in their web", actor: "@ver.ooo", ref: "goth mode shipped: dark by default…", time: "2d" },
  { reason: "repost", icon: "🪰", verb: "let your post loose again", actor: "@fubarchitect.com", ref: "a browser plugin that ships its own frozen timeline…", time: "1d" },
  { reason: "follow", icon: "🕷️", verb: "spun a thread to you", actor: "@nightshift.example", time: "20h" },
  { reason: "reply", icon: "💬", verb: "replied to you", actor: "@cobweb.bisks.net", ref: "meta note: this reply is the demo…", time: "2d" },
];

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}

function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function showToast(text) {
  let t = document.getElementById("toast");
  if (!t) {
    t = el("div", "toast");
    t.id = "toast";
    document.body.appendChild(t);
  }
  t.textContent = text;
  t.classList.add("show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => t.classList.remove("show"), 1800);
}

function spawnCrawlingSpider(delay) {
  setTimeout(() => {
    const e = el("div", "spider-crawler", "🕷️");
    e.style.top = 10 + Math.random() * 70 + "%";
    document.body.appendChild(e);
    e.addEventListener("animationend", () => e.remove());
    setTimeout(() => e.remove(), 3000);
  }, delay || 0);
}

function crawlSpiders(n) {
  showToast(n > 1 ? `AHH! SPIDERS! 🕷️ ×${n}` : "AHH! SPIDER! 🕷️");
  for (let i = 0; i < n; i++) spawnCrawlingSpider(i * 260);
}

function renderPost(p, opts) {
  opts = opts || {};
  const post = el("div", "post" + (opts.asParent ? " thread-parent-post" : ""));
  post.dataset.id = p.id;
  post.appendChild(el("div", "avatar", p.avatar));

  const body = el("div", "body");
  body.appendChild(
    el(
      "div",
      "post-head",
      `<span class="name">${esc(p.name)}</span><span class="handle">${esc(p.handle)}</span><span class="dot">·</span><span class="time">${esc(p.time)}</span>`
    )
  );
  body.appendChild(el("div", "text", esc(p.text)));

  if (!opts.noActions) {
    const actions = el("div", "actions");
    const likeAct = el("div", "act like", `<span class="icon">🖤</span><span class="n">${p.likes}</span>`);
    const repostAct = el("div", "act repost", `<span class="icon">🪰</span><span class="n">${p.reposts}</span>`);
    const replyAct = el("div", "act reply", `<span class="icon">💬</span><span class="n">${p.replies}</span>`);
    const witchAct = el("div", "act witch", `<span class="icon">🧙</span>`);

    let liked = false;
    likeAct.addEventListener("click", () => {
      liked = !liked;
      likeAct.classList.toggle("on", liked);
      likeAct.querySelector(".n").textContent = p.likes + (liked ? 1 : 0);
    });
    let reposted = false;
    repostAct.addEventListener("click", () => {
      reposted = !reposted;
      repostAct.classList.toggle("on", reposted);
      repostAct.querySelector(".n").textContent = p.reposts + (reposted ? 1 : 0);
    });
    witchAct.addEventListener("click", () => {
      const burnTarget = opts.burnTarget || post;
      if (burnTarget.classList.contains("hexed")) return;
      burnTarget.classList.add("hexed");
      setTimeout(() => {
        burnTarget.classList.add("hex-collapse");
        setTimeout(() => (opts.wrap || post).remove(), 260);
      }, 750);
    });

    actions.append(likeAct, repostAct, replyAct, witchAct);
    body.appendChild(actions);
  }
  post.appendChild(body);
  return post;
}

function renderItem(p) {
  const wrap = el("div", "item");
  if (p.kind === "repost") {
    const rl = el(
      "div",
      "repost-line",
      `🪰 <span>${esc(p.reposter)} looped this back into the web</span>`
    );
    wrap.appendChild(rl);
  }
  if (p.replyTo) {
    const parent = DATA.find((d) => d.id === p.replyTo);
    if (parent) {
      const group = el("div", "thread-group");
      group.appendChild(renderPost(parent, { asParent: true, noActions: true }));
      group.appendChild(renderPost(p));
      wrap.appendChild(group);
      return wrap;
    }
  }
  wrap.appendChild(renderPost(p, { wrap }));
  return wrap;
}

function renderNotif(n) {
  const row = el("div", "notif-row");
  row.appendChild(el("div", "notif-icon", n.icon));
  const body = el("div", "notif-body");
  body.appendChild(el("div", "notif-line", `<b>${esc(n.actor)}</b> ${esc(n.verb)}`));
  if (n.ref) body.appendChild(el("div", "notif-ref", esc(n.ref)));
  body.appendChild(el("div", "notif-time", esc(n.time)));
  row.appendChild(body);
  return row;
}

const feed = document.getElementById("feed");
for (const p of DATA) feed.appendChild(renderItem(p));

const notifList = document.getElementById("notif-list");
for (const n of NOTIFS) notifList.appendChild(renderNotif(n));

const tabWeb = document.getElementById("tab-web");
const tabNotifs = document.getElementById("tab-notifs");
const paneWeb = document.getElementById("feed");
const paneNotifs = document.getElementById("notifs");
const badge = document.getElementById("notif-badge");

let notifsOpened = false;
tabWeb.addEventListener("click", () => {
  tabWeb.classList.add("active");
  tabNotifs.classList.remove("active");
  paneWeb.hidden = false;
  paneNotifs.hidden = true;
});
tabNotifs.addEventListener("click", () => {
  tabNotifs.classList.add("active");
  tabWeb.classList.remove("active");
  paneWeb.hidden = true;
  paneNotifs.hidden = false;
  if (!notifsOpened) {
    notifsOpened = true;
    badge.classList.remove("show");
    crawlSpiders(NOTIFS.length);
  }
});
