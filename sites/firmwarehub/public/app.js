// firmwarehub: static catalogue (data/firmware.json) rendered client-side.
// Latest release tags are fetched from the GitHub API per repo and cached in
// localStorage for an hour. Unauthenticated GitHub API allows 60 req/hour per
// IP and the catalogue has ~30 repos, so the cache is what keeps repeat visits free.
const CACHE_MS = 3600e3;
const CATS = { music: "music", esp32: "esp32 gadgets", home: "smart home", radio: "radio", tools: "tools", camera: "cameras", network: "networking", printer: "3d printers", drone: "drones", handheld: "handhelds" };
const FLASH = { web: "browser install", usb: "usb / dfu", sd: "sd card", patch: "patch your own OS" };

const $ = (id) => document.getElementById(id);
const state = { q: "", cat: null, flash: null };
let items = [];

function chips(box, map, key) {
  const mk = (val, label) => {
    const b = document.createElement("button");
    b.className = "chip"; b.textContent = label; b.setAttribute("aria-pressed", String(state[key] === val));
    b.addEventListener("click", () => { state[key] = val; refreshChips(); apply(); });
    b.dataset.val = val ?? ""; return b;
  };
  box.append(mk(null, "all"), ...Object.entries(map).map(([v, l]) => mk(v, l)));
}
function refreshChips() {
  for (const [box, key] of [[$("cats"), "cat"], [$("flashes"), "flash"]])
    for (const b of box.children) b.setAttribute("aria-pressed", String((b.dataset.val || null) === state[key]));
}

function card(f) {
  const el = document.createElement("article");
  el.className = "card"; el.dataset.id = f.id;
  const h = document.createElement("h2"), a = document.createElement("a");
  a.href = f.url; a.textContent = f.name; a.rel = "noopener"; h.append(a);
  const dev = document.createElement("p"); dev.className = "dev"; dev.textContent = f.device;
  const what = document.createElement("p"); what.className = "what"; what.textContent = f.what;
  const meta = document.createElement("div"); meta.className = "meta";
  for (const t of [CATS[f.cat] || f.cat, FLASH[f.flash] || f.flash]) {
    const s = document.createElement("span"); s.className = "tag"; s.textContent = t; meta.append(s);
  }
  const rel = document.createElement("span"); rel.className = "rel"; rel.id = "rel-" + f.id; meta.append(rel);
  el.append(h, dev, what, meta);
  return el;
}

function apply() {
  const q = state.q.trim().toLowerCase();
  let n = 0;
  for (const f of items) {
    const el = document.querySelector(`[data-id="${f.id}"]`);
    const hay = `${f.name} ${f.device} ${f.what} ${CATS[f.cat]}`.toLowerCase();
    const ok = (!q || hay.includes(q)) && (!state.cat || f.cat === state.cat) && (!state.flash || f.flash === state.flash);
    el.hidden = !ok; if (ok) n++;
  }
  $("count").textContent = `${n} of ${items.length} firmware projects`;
}

async function latest(repo) {
  const key = "fwhub:" + repo;
  try {
    const c = JSON.parse(localStorage.getItem(key) || "null");
    if (c && Date.now() - c.t < CACHE_MS) return c.v;
  } catch {}
  let v = null;
  try {
    const r = await fetch(`https://api.github.com/repos/${repo}/releases/latest`);
    if (r.ok) { const j = await r.json(); v = { tag: j.tag_name, date: (j.published_at || "").slice(0, 10), url: j.html_url }; }
    else if (r.status === 403) return null; // rate limited: don't cache the miss
  } catch { return null; }
  try { localStorage.setItem(key, JSON.stringify({ t: Date.now(), v })); } catch {}
  return v;
}

async function main() {
  const r = await fetch("data/firmware.json");
  items = await r.json();
  chips($("cats"), CATS, "cat"); chips($("flashes"), FLASH, "flash");
  $("grid").append(...items.map(card));
  $("q").addEventListener("input", (e) => { state.q = e.target.value; apply(); });
  apply();
  const text = "Found a custom firmware that should be in the firmware hub? @buildthis.bisks.net add ";
  $("suggest").href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(text);
  for (const f of items) if (f.repo) latest(f.repo).then((v) => {
    if (!v) return;
    const el = $("rel-" + f.id), a = document.createElement("a");
    a.href = v.url; a.textContent = `${v.tag}${v.date ? " · " + v.date : ""}`; a.rel = "noopener"; el.append(a);
  });
}
main().catch((e) => { $("count").textContent = "couldn't load the catalogue: " + e.message; });
