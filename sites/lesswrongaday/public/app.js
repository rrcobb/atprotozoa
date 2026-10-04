import { replayDate, shift, clamp, ymd } from "./clock.js";

const $ = (id) => document.getElementById(id);
const todayReal = ymd(Date.now());
const liveDay = () => clamp(replayDate(ymd(Date.now())), todayReal);
const FIRST = "2007-01-01"; // matches the date picker's min; LessWrong has nothing earlier
const PAGE = 20; // comments revealed per click; purely a rendering choice, all are fetched
let cur = null;
let comments = [];
let shown = 0;
let seq = 0;

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
const lw = (slug, id) => `https://www.lesswrong.com/posts/${id}/${slug}`;

function renderComments() {
  const box = $("comments");
  const end = Math.min(comments.length, shown + PAGE);
  for (; shown < end; shown++) {
    const c = comments[shown];
    const it = el("div", "item");
    it.append(el("div", "on-post", `${c.by} on “${c.post}”`));
    it.append(el("p", "ex", c.text));
    const m = el("div", "meta");
    const a = el("a", null, `${new Date(c.at).toISOString().slice(11, 16)} UTC · ${c.score} points ↗`);
    a.href = `${lw(c.postSlug, c.postId)}?commentId=${c.id}`;
    a.target = "_blank"; a.rel = "noopener";
    m.append(a);
    it.append(m);
    box.append(it);
  }
  $("more").hidden = shown >= comments.length;
}

async function load(day) {
  const mine = ++seq;
  cur = clamp(day, todayReal);
  if (cur < FIRST) cur = FIRST;
  $("date").textContent = new Date(cur + "T00:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long", year: "numeric", month: "long", day: "numeric" });
  $("pick").value = cur;
  $("live").classList.toggle("on", cur === liveDay());
  $("next").disabled = cur >= todayReal;
  $("prev").disabled = cur <= FIRST;
  $("posts").textContent = ""; $("comments").textContent = "";
  $("ph").hidden = $("ch").hidden = $("more").hidden = true;
  $("sub").textContent = "";
  const st = $("status");
  st.className = "status"; st.textContent = "loading…";
  const text = `LessWrong, ${$("date").textContent}`;
  $("share").href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(`${text}\nhttps://lesswrongaday.bisks.net/?d=${cur}`);
  try {
    const r = await fetch(`/api/day?date=${cur}`);
    if (!r.ok) throw new Error("server said " + r.status);
    const d = await r.json();
    if (mine !== seq) return;
    st.textContent = "";
    const posts = d.posts.slice().sort((a, b) => b.score - a.score);
    $("sub").textContent = `${posts.length} post${posts.length === 1 ? "" : "s"}, ${d.comments.length} comment${d.comments.length === 1 ? "" : "s"}`;
    if (!posts.length && !d.comments.length) st.textContent = "nothing was posted on this day.";
    $("ph").hidden = !posts.length;
    for (const p of posts) {
      const it = el("div", "item");
      const a = el("a", "t", p.title);
      a.href = lw(p.slug, p.id); a.target = "_blank"; a.rel = "noopener";
      it.append(a);
      it.append(el("div", "meta", `${p.by} · ${p.score} points · ${p.comments} comments · ${new Date(p.at).toISOString().slice(11, 16)} UTC`));
      if (p.excerpt) it.append(el("p", "ex", p.excerpt + (p.excerpt.length >= 700 ? "…" : "")));
      $("posts").append(it);
    }
    comments = d.comments.slice().sort((a, b) => b.score - a.score || a.at.localeCompare(b.at));
    shown = 0;
    $("ch").hidden = !comments.length;
    renderComments();
  } catch (e) {
    if (mine !== seq) return;
    st.className = "status err";
    st.textContent = "couldn't load that day (" + (e.message || e) + "). try again?";
  }
}

function go(day) {
  history.replaceState(null, "", day === liveDay() ? location.pathname : `?d=${day}`);
  load(day);
}

$("prev").addEventListener("click", () => go(shift(cur, -1)));
$("next").addEventListener("click", () => go(shift(cur, 1)));
$("live").addEventListener("click", () => go(liveDay()));
$("rand").addEventListener("click", () => {
  const a = Date.parse(FIRST), b = Date.parse(todayReal);
  go(ymd(a + Math.floor(Math.random() * (b - a))));
});
document.addEventListener("keydown", (e) => {
  if (e.target.closest && e.target.closest("input")) return;
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  if (e.key === "ArrowLeft" && !$("prev").disabled) go(shift(cur, -1));
  if (e.key === "ArrowRight" && !$("next").disabled) go(shift(cur, 1));
});
$("more").addEventListener("click", renderComments);
$("pick").addEventListener("change", (e) => { if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) go(e.target.value); });

const q = new URLSearchParams(location.search).get("d");
load(q && /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : liveDay());
