import { POSTS, PER_PAGE } from "./posts.js";

const pages = Math.ceil(POSTS.length / PER_PAGE);
const feed = document.getElementById("feed");
const pager = document.getElementById("pager");
const liked = new Set();
let page = 1;

const fmt = (n) => (n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, "") + "K" : String(n));

function postEl(p, i) {
  const el = document.createElement("article");
  el.className = "post";
  let body = "";
  if (p.k === "meme") {
    body += `<div class="txt"></div><div class="card${p.dark ? " dark" : ""}" style="background:${p.bg}"><div class="big"></div><div class="small"></div></div>`;
  } else if (p.k === "fact") {
    body += `<div class="fact"><b></b><span></span></div>`;
  } else {
    body += `<div class="txt"></div>`;
  }
  el.innerHTML = `<header><div class="av">📎</div><div><div class="who">I Fucking Love Paperclips</div><div class="when">${p.t} · 🌐</div></div></header>${body}
    <div class="stats"><span class="lk"></span><span>${fmt(p.comments)} comments · ${fmt(p.shares)} shares</span></div>
    <div class="row"><button type="button" class="like">👍 Like</button><a class="cm" href="#">💬 Comment</a><a class="sh" target="_blank" rel="noopener">↗ Share</a></div>`;
  // text goes in via textContent, never innerHTML
  if (p.k === "meme") {
    el.querySelector(".txt").textContent = p.text;
    el.querySelector(".big").textContent = p.big;
    el.querySelector(".small").textContent = p.small;
  } else if (p.k === "fact") {
    el.querySelector(".fact b").textContent = p.title;
    el.querySelector(".fact span").textContent = p.body;
  } else {
    el.querySelector(".txt").textContent = p.text;
  }
  const lk = el.querySelector(".lk");
  const btn = el.querySelector(".like");
  const paint = () => {
    lk.textContent = `👍❤️ ${fmt(p.likes + (liked.has(i) ? 1 : 0))}`;
    btn.classList.toggle("on", liked.has(i));
  };
  btn.addEventListener("click", () => {
    if (liked.has(i)) liked.delete(i); else liked.add(i);
    paint();
  });
  el.querySelector(".cm").addEventListener("click", (e) => e.preventDefault());
  const snippet = p.big ? `${p.big} ${p.small}` : (p.body || p.text);
  el.querySelector(".sh").href = "https://bsky.app/intent/compose?text=" +
    encodeURIComponent(`${snippet.slice(0, 200)}\n\nhttps://ifuckinglovepaperclips.bisks.net/`);
  paint();
  return el;
}

function render() {
  feed.replaceChildren();
  const start = (page - 1) * PER_PAGE;
  POSTS.slice(start, start + PER_PAGE).forEach((p, j) => feed.appendChild(postEl(p, start + j)));
  pager.replaceChildren();
  for (let n = 1; n <= pages; n++) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "btn" + (n === page ? " blue" : "");
    b.textContent = String(n);
    b.addEventListener("click", () => { page = n; render(); window.scrollTo(0, 0); });
    pager.appendChild(b);
  }
}

const pl = document.getElementById("pagelike");
pl.addEventListener("click", () => {
  const on = pl.classList.toggle("on");
  pl.textContent = on ? "👍 Liked" : "👍 Like Page";
});
document.getElementById("share").href = "https://bsky.app/intent/compose?text=" +
  encodeURIComponent("I Fucking Love Paperclips 📎\n\nhttps://ifuckinglovepaperclips.bisks.net/");
render();
