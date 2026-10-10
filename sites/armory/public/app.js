import { buildArmory, CATS, PROTOTYPE, stats } from "./lib/armory.js";

const ALL = [{ ...PROTOTYPE, ...stats(PROTOTYPE.text) }, ...buildArmory()];
// Rendering is paged only to keep the DOM light; every grenade is reachable via "Show more".
const PAGE = 50;
const $ = (id) => document.getElementById(id);
let shown = PAGE;

for (const [k, v] of Object.entries(CATS)) $("cat").append(new Option(v, k));

function intent(g) {
  const t = `💣 grenade #${g.n}: ${g.text}\n\nhttps://armory.bisks.net/#${g.n}`;
  return "https://bsky.app/intent/compose?text=" + encodeURIComponent(t);
}
function statLine(g) {
  return `yield <b>${g.yieldKt} kt</b> · fuse <b>${g.fuseMin} min</b> · blast radius <b>~${g.radius} replies</b> · ${CATS[g.cat]}`;
}

function showPin(g) {
  $("pin-label").textContent = g.n === 0 ? `#0 — ${g.note}` : `grenade #${g.n}`;
  $("pin-text").textContent = g.text;
  $("pin-stats").innerHTML = statLine(g);
  $("pin-post").href = intent(g);
  $("pin-post").hidden = false;
  $("pin-copy").hidden = false;
  $("pin-copy").onclick = async () => {
    try { await navigator.clipboard.writeText(g.text); $("pin-copy").textContent = "Copied"; }
    catch { $("pin-copy").textContent = "Copy failed"; }
    setTimeout(() => ($("pin-copy").textContent = "Copy"), 1200);
  };
  history.replaceState(null, "", "#" + g.n);
}

function filtered() {
  const q = $("q").value.trim().toLowerCase();
  const c = $("cat").value;
  const s = $("sort").value;
  let r = ALL.filter((g) => (!c || g.cat === c) && (!q || g.text.toLowerCase().includes(q)));
  const key = { yield: (g) => -g.yieldKt, fuse: (g) => g.fuseMin, radius: (g) => -g.radius, n: (g) => g.n }[s];
  return r.sort((a, b) => key(a) - key(b));
}

function render() {
  const r = filtered();
  $("count").textContent = `${r.length} grenade${r.length === 1 ? "" : "s"} in stock`;
  const ol = $("list");
  ol.textContent = "";
  for (const g of r.slice(0, shown)) {
    const li = document.createElement("li");
    li.innerHTML = `<span class="n">#${g.n}</span><span class="t"></span><div class="meta">${statLine(g)}</div><div class="actions"><button class="ghost">Pull</button><a class="btn ghost" target="_blank" rel="noopener">Post</a></div>`;
    li.querySelector(".t").textContent = g.text;
    li.querySelector("a").href = intent(g);
    li.querySelector("button").onclick = () => { showPin(g); window.scrollTo({ top: 0, behavior: "smooth" }); };
    ol.append(li);
  }
  $("more").hidden = r.length <= shown;
}

$("pull").onclick = () => showPin(ALL[Math.floor(Math.random() * ALL.length)]);
$("more").onclick = () => { shown += PAGE; render(); };
for (const id of ["q", "cat", "sort"]) $(id).addEventListener("input", () => { shown = PAGE; render(); });

const m = /^#(\d+)$/.exec(location.hash);
if (m && ALL[+m[1]]) showPin(ALL[+m[1]]);
render();
