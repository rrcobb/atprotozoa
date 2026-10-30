import { TOPICS, makeCard, shareUrl } from "./gen.js";
import { freshModel, applyLike, pickTopic, pickHeat, topInterests } from "./algo.js";

const $ = id => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const keys = Object.keys(TOPICS);
const BATCH = 8; // one screenful-plus of posts per sentinel hit

const SKINS = {
  bluesky: { label: "🦋 bluesky", at: h => "@" + h, ico: { reply: "💬", quote: "🔁", like: "♡", liked: "♥", share: "↗" } },
  twitter: { label: "𝕏 twitter", at: h => "@" + h.replace(".bsky.social", ""), ico: { reply: "💬", quote: "🔁", like: "♡", liked: "♥", share: "⇪" } },
  reddit: { label: "👽 reddit", at: h => "u/" + h.replace(".bsky.social", ""), ico: { reply: "💬 comments", quote: "⤴ crossposts", like: "▲", liked: "▲", share: "share" } },
};

let model;
try { model = JSON.parse(localStorage.getItem("ragebait.model") || "null"); } catch { model = null; }
// drop topics that no longer exist and add new ones, so an old saved model never breaks a draw
const base = freshModel(keys);
model = model && model.w ? { ...base, ...model, w: { ...base.w, ...Object.fromEntries(Object.entries(model.w).filter(([k]) => k in base.w)) } } : base;
let skin = localStorage.getItem("ragebait.skin");
if (!SKINS[skin]) skin = "bluesky";

const posts = []; // { card, liked, node }
const save = () => localStorage.setItem("ragebait.model", JSON.stringify(model));
const nextSeed = () => (Math.random() * 2 ** 32) >>> 0;
const feed = $("feed");

function applySkin() {
  document.body.dataset.skin = skin;
  localStorage.setItem("ragebait.skin", skin);
  for (const b of $("skins").children) b.classList.toggle("on", b.dataset.s === skin);
  for (const p of posts) { const n = render(p); p.node.replaceWith(n); p.node = n; }
}

function updateTaste() {
  const top = topInterests(model);
  $("taste").textContent = model.likes
    ? `${model.likes} like${model.likes === 1 ? "" : "s"} → the algo thinks you want more: ${top.map(k => TOPICS[k].label).join("  ") || "…everything, equally"}`
    : "like something and the algo will start feeding you more of it.";
}

function render(p) {
  const { card } = p, S = SKINS[skin];
  const root = el("article", "post");
  const av = el("div", "av", card.author.name[0]);
  av.style.background = `hsl(${card.author.hue} 45% 38%)`;
  const body = el("div", "body");
  const head = el("div", "head");
  head.append(el("b", null, card.author.name + (card.author.badge ? " " + card.author.badge : "")), el("span", "dim", S.at(card.author.handle)), el("span", "tag", card.topicLabel));
  body.append(head, el("div", "txt", card.text));
  const act = el("div", "act");
  const btn = (cls, label, fn) => { const b = el("button", cls, label); if (fn) b.onclick = fn; return b; };
  const likeBtn = btn("like" + (p.liked ? " on" : ""), `${p.liked ? S.ico.liked : S.ico.like} ${card.stats.likes}${p.liked ? " +1" : ""}`, () => toggleLike(p));
  likeBtn.setAttribute("aria-pressed", String(!!p.liked));
  act.append(btn(null, `${S.ico.reply} ${card.stats.replies}`), btn(null, `${S.ico.quote} ${card.stats.quotes}`), likeBtn);
  const share = el("a", null, S.ico.share);
  share.href = shareUrl(card); share.target = "_blank"; share.rel = "noopener";
  act.append(share);
  body.append(act);
  const reps = el("div", "reps");
  for (const r of card.reps) reps.append(el("div", "rep", `${S.at(r.who.handle)}: ${r.text}`));
  body.append(reps);
  root.append(av, body);
  return root;
}

function toggleLike(p) {
  p.liked = !p.liked;
  model = applyLike(model, p.card.topic, p.card.heat, p.liked);
  save(); updateTaste();
  const n = render(p); p.node.replaceWith(n); p.node = n;
}

function more(n = BATCH) {
  for (let i = 0; i < n; i++) {
    const r = Math.random;
    const card = makeCard([pickTopic(model, r)], pickHeat(model, r), nextSeed());
    const p = { card, liked: false };
    p.node = render(p);
    posts.push(p);
    feed.append(p.node);
  }
}

for (const [s, v] of Object.entries(SKINS)) {
  const b = el("button", null, v.label); b.dataset.s = s;
  b.onclick = () => { skin = s; applySkin(); };
  $("skins").append(b);
}
$("reset").onclick = () => { model = freshModel(keys); save(); updateTaste(); };

more(); applySkin(); updateTaste();
// IntersectionObserver fires again each time the sentinel is pushed back into view by new posts
const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) more(); }, { rootMargin: "800px" });
io.observe($("sentinel"));
