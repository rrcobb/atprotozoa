import { THEORIES } from "./theories.js";

const KEY = "ceetheories.votes";
const listEl = document.getElementById("list");
const emptyEl = document.getElementById("empty");
let filter = "all";
let votes = {};
try { votes = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { votes = {}; }

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(votes)); } catch {}
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function shareUrl(t) {
  const text = `Fan theory about @cee.wtf: "${t.title}" https://ceetheories.bisks.net/#${t.id}`;
  return "https://bsky.app/intent/compose?text=" + encodeURIComponent(text);
}

function card(t) {
  const v = votes[t.id];
  const c = el("article", "card" + (v ? " " + v : ""));
  c.id = t.id;
  c.appendChild(el("h2", "", t.title));
  c.appendChild(el("p", "", t.body));
  for (const e of t.evidence) {
    const d = el("div", "ev");
    const a = el("a", "", "“" + e.text + "”");
    a.href = `https://bsky.app/profile/cee.wtf/post/${e.rkey}`;
    a.target = "_blank";
    a.rel = "noopener";
    d.appendChild(a);
    c.appendChild(d);
  }
  const row = el("div", "votes");
  for (const [k, label] of [["canon", "✅ canon"], ["debunked", "❌ debunked"]]) {
    const b = el("button", v === k ? "on" : "", label);
    b.addEventListener("click", () => {
      if (votes[t.id] === k) delete votes[t.id]; else votes[t.id] = k;
      save();
      render();
    });
    row.appendChild(b);
  }
  const s = el("a", "btn", "share");
  s.href = shareUrl(t);
  s.target = "_blank";
  s.rel = "noopener";
  row.appendChild(s);
  c.appendChild(row);
  return c;
}

function render() {
  listEl.textContent = "";
  const shown = THEORIES.filter((t) => filter === "all" || votes[t.id] === filter);
  for (const t of shown) listEl.appendChild(card(t));
  emptyEl.hidden = shown.length > 0;
  document.querySelectorAll("[data-filter]").forEach((b) =>
    b.classList.toggle("on", b.dataset.filter === filter));
}

document.querySelectorAll("[data-filter]").forEach((b) =>
  b.addEventListener("click", () => { filter = b.dataset.filter; render(); }));

document.getElementById("shuffle").addEventListener("click", () => {
  filter = "all";
  render();
  const t = THEORIES[Math.floor(Math.random() * THEORIES.length)];
  const c = document.getElementById(t.id);
  c.scrollIntoView({ behavior: "smooth", block: "center" });
  c.style.outline = "2px solid #ff9bd2";
  setTimeout(() => { c.style.outline = ""; }, 1800);
});

document.getElementById("submit").href = "https://bsky.app/intent/compose?text=" +
  encodeURIComponent("My fan theory about @cee.wtf: ");

render();
if (location.hash.length > 1) {
  const t = document.getElementById(decodeURIComponent(location.hash.slice(1)));
  if (t) t.scrollIntoView();
}
