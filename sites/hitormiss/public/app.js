import { ENTRIES } from "./data.js";

const LABEL = { hit: "got it right", mixed: "half right", miss: "missed it" };
const state = { verdict: "all", q: "" };

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function matches(e) {
  if (state.verdict !== "all" && e.verdict !== state.verdict) return false;
  const q = state.q.trim().toLowerCase();
  if (!q) return true;
  return `${e.title} ${e.by} ${e.text} ${e.year}`.toLowerCase().includes(q);
}

function shareUrl(e) {
  const t = `${e.title} (${e.year}): ${LABEL[e.verdict]}. ${e.text}`.slice(0, 240);
  return "https://bsky.app/intent/compose?text=" + encodeURIComponent(t + "\nhttps://hitormiss.bisks.net/");
}

function render() {
  const list = document.getElementById("list");
  list.textContent = "";
  const shown = ENTRIES.filter(matches).sort((a, b) => a.year - b.year);
  for (const e of shown) {
    const card = el("article", "card " + e.verdict);
    const head = el("div", "head");
    head.append(el("span", "badge " + e.verdict, LABEL[e.verdict]), el("span", "year", String(e.year)));
    card.append(head, el("h3", null, e.title), el("p", "by", `${e.by} · ${e.kind}`), el("p", null, e.text));
    const a = el("a", "share", "post this →");
    a.href = shareUrl(e);
    a.target = "_blank";
    a.rel = "noopener";
    card.append(a);
    list.append(card);
  }
  document.getElementById("empty").hidden = shown.length > 0;
  document.getElementById("count").textContent = `${shown.length} of ${ENTRIES.length}`;
}

function tally() {
  const c = { hit: 0, mixed: 0, miss: 0 };
  for (const e of ENTRIES) c[e.verdict]++;
  document.getElementById("tally").textContent =
    `${c.hit} hits · ${c.mixed} half-right · ${c.miss} misses`;
}

for (const b of document.querySelectorAll("[data-verdict]")) {
  b.addEventListener("click", () => {
    state.verdict = b.dataset.verdict;
    for (const o of document.querySelectorAll("[data-verdict]")) {
      o.setAttribute("aria-pressed", String(o === b));
    }
    render();
  });
}
document.getElementById("q").addEventListener("input", (ev) => {
  state.q = ev.target.value;
  render();
});

tally();
render();
