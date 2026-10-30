import { TOPICS, makeCard, shareUrl } from "./gen.js";

const $ = id => document.getElementById(id);
const chips = $("chips"), feed = $("feed");
const picked = new Set();
let heat = 2;
let mad = Number(localStorage.getItem("ragebait.mad") || 0) || 0;
$("mad").textContent = mad;

for (const [k, t] of Object.entries(TOPICS)) {
  const b = document.createElement("button");
  b.textContent = t.label;
  b.dataset.k = k;
  b.onclick = () => {
    picked.has(k) ? picked.delete(k) : picked.add(k);
    b.classList.toggle("on", picked.has(k));
  };
  chips.appendChild(b);
}

$("heat").onclick = e => {
  const b = e.target.closest("button");
  if (!b) return;
  heat = Number(b.dataset.h);
  for (const x of $("heat").children) x.classList.toggle("on", x === b);
};

const NOTES = [[5, "warming up"], [15, "visibly annoyed"], [30, "typing a reply you will delete"], [60, "log off, hero"]];
function bumpMad(n) {
  mad += n;
  localStorage.setItem("ragebait.mad", String(mad));
  $("mad").textContent = mad;
  $("madNote").textContent = "— " + ([...NOTES].reverse().find(([t]) => mad >= t)?.[1] || "calm, for now");
}

const nextSeed = () => (Math.random() * 2 ** 32) >>> 0;
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const av = (p, size) => { const a = el("div", "av", p.name[0]); a.style.background = `hsl(${p.hue} 45% 38%)`; if (size) { a.style.width = a.style.height = size + "px"; a.style.fontSize = "14px"; } return a; };

function render(card) {
  const root = el("article", "card");
  const who = el("div", "who");
  who.appendChild(av(card.author));
  const nm = el("div");
  nm.appendChild(el("div", "nm", card.author.name + (card.author.badge ? " " + card.author.badge : "")));
  nm.appendChild(el("div", "hd", "@" + card.author.handle));
  who.appendChild(nm);
  who.appendChild(el("span", "tag", card.topicLabel));
  root.appendChild(who);
  root.appendChild(el("p", "bio", card.author.bio));
  root.appendChild(el("div", "txt", card.text));
  const meta = el("div", "meta");
  meta.appendChild(el("span", null, `💬 ${card.stats.replies}`));
  meta.appendChild(el("span", null, `🔁 ${card.stats.quotes} quotes`));
  meta.appendChild(el("span", null, `♥ ${card.stats.likes}`));
  root.appendChild(meta);
  for (const r of card.reps) {
    const rep = el("div", "rep");
    rep.appendChild(el("span", "nm", r.who.name));
    rep.appendChild(el("span", "hd", "@" + r.who.handle));
    rep.appendChild(el("div", null, r.text + "  ♥ " + r.likes));
    root.appendChild(rep);
  }
  const act = el("div", "act");
  const madBtn = el("button", "mad", "😡 I'm mad");
  madBtn.onclick = () => { if (madBtn.classList.contains("pressed")) return; madBtn.classList.add("pressed"); madBtn.textContent = "😡 mad. noted."; bumpMad(1); };
  const again = el("button", null, "↻ worse");
  again.onclick = () => root.replaceWith(render(makeCard(card.topic ? [card.topic] : [], Math.min(3, card.heat + 1), nextSeed())));
  const share = el("a", null, "share on bluesky");
  share.href = shareUrl(card);
  share.target = "_blank";
  share.rel = "noopener";
  act.append(madBtn, again, share);
  root.appendChild(act);
  return root;
}

$("go").onclick = () => {
  if (feed.querySelector(".empty")) feed.textContent = "";
  const card = makeCard([...picked], heat, nextSeed());
  feed.prepend(render(card));
};
bumpMad(0);
