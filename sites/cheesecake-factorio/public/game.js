// Cheesecake factorio: an idle/automation game. All state is local.
const KEY = "cheesecake-factorio-v1";

// Each machine adds `cps` cakes/s. Cost grows 1.15x per owned (the usual idle curve).
const MACHINES = [
  { id: "mixer", icon: "🥣", name: "batter mixer", cps: 0.2, base: 15 },
  { id: "oven", icon: "🔥", name: "oven", cps: 1, base: 100 },
  { id: "belt", icon: "➡️", name: "conveyor belt", cps: 8, base: 1100 },
  { id: "assembler", icon: "🤖", name: "assembler", cps: 47, base: 12000 },
  { id: "cow", icon: "🐄", name: "cream cheese cow", cps: 260, base: 130000 },
  { id: "reactor", icon: "☢️", name: "nuclear oven", cps: 1400, base: 1400000 },
];
const GROWTH = 1.15;

let state = load();

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && typeof s.cakes === "number") return { cakes: s.cakes, total: s.total || s.cakes, owned: s.owned || {}, at: s.at || Date.now() };
  } catch {}
  return { cakes: 0, total: 0, owned: {}, at: Date.now() };
}
const save = () => { state.at = Date.now(); try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} };

const count = (m) => state.owned[m.id] || 0;
const cost = (m) => Math.ceil(m.base * Math.pow(GROWTH, count(m)));
const rate = () => MACHINES.reduce((a, m) => a + m.cps * count(m), 0);

function fmt(n) {
  if (n < 1000) return n < 10 && n % 1 ? n.toFixed(1) : String(Math.floor(n));
  const u = ["k", "M", "B", "T", "Qa"];
  let i = -1;
  while (n >= 1000 && i < u.length - 1) { n /= 1000; i++; }
  return n.toFixed(n < 10 ? 2 : 1) + u[i];
}

const $ = (id) => document.getElementById(id);

function gain(n) { state.cakes += n; state.total += n; }

function buy(id) {
  const m = MACHINES.find((x) => x.id === id);
  const c = cost(m);
  if (!m || state.cakes < c) return;
  state.cakes -= c;
  state.owned[id] = count(m) + 1;
  buildShop();
  render();
  save();
}

function buildShop() {
  const shop = $("shop");
  shop.textContent = "";
  for (const m of MACHINES) {
    const row = document.createElement("div");
    row.className = "item";
    const info = document.createElement("div");
    const t = document.createElement("div");
    t.textContent = `${m.icon} ${m.name} ×${count(m)}`;
    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = `+${m.cps} cakes/s each`;
    info.append(t, meta);
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.id = m.id;
    b.addEventListener("click", () => buy(m.id));
    row.append(info, b);
    shop.append(row);
  }
}

function renderLine() {
  const line = $("line");
  line.textContent = "";
  let any = false;
  for (const m of MACHINES) {
    // Show up to 12 icons per machine type so a huge factory stays on screen;
    // the true count is in the shop.
    const n = Math.min(count(m), 12);
    for (let i = 0; i < n; i++) {
      any = true;
      const s = document.createElement("span");
      s.textContent = m.icon;
      line.append(s);
    }
    if (n) { const b = document.createElement("span"); b.className = "belt"; b.textContent = "▸"; line.append(b); }
  }
  line.append(Object.assign(document.createElement("span"), { textContent: any ? "🍰" : "empty floor. bake something.", className: any ? "" : "empty" }));
}

let lastSig = "";
function render() {
  $("cakes").textContent = fmt(state.cakes);
  $("rate").textContent = fmt(rate());
  for (const b of document.querySelectorAll("#shop button")) {
    const m = MACHINES.find((x) => x.id === b.dataset.id);
    const c = cost(m);
    b.textContent = `${fmt(c)} 🍰`;
    b.disabled = state.cakes < c;
    b.previousSibling.firstChild.textContent = `${m.icon} ${m.name} ×${count(m)}`;
  }
  const sig = JSON.stringify(state.owned);
  if (sig !== lastSig) { lastSig = sig; renderLine(); }
  if (state.total > 100) $("hint").textContent = "the factory must grow.";
}

$("bake").addEventListener("click", () => { gain(1); render(); });

$("reset").addEventListener("click", () => {
  if (!confirm("tear down the whole factory?")) return;
  state = { cakes: 0, total: 0, owned: {}, at: Date.now() };
  buildShop(); render(); save();
});

$("share").addEventListener("click", () => {
  const text = `my cheesecake factorio makes ${fmt(rate())} cakes/s (${fmt(state.total)} baked so far). the factory must grow. https://cheesecake-factorio.bisks.net/`;
  window.open("https://bsky.app/intent/compose?text=" + encodeURIComponent(text), "_blank", "noopener");
});

// Offline progress: credit time away at the current rate (capped at 8h so a
// forgotten tab doesn't skip the whole game; a product decision, not a data limit).
const away = Math.min((Date.now() - state.at) / 1000, 8 * 3600);
if (away > 5 && rate() > 0) gain(rate() * away);

let prev = performance.now();
setInterval(() => {
  const now = performance.now();
  const dt = (now - prev) / 1000;
  prev = now;
  gain(rate() * dt);
  render();
}, 100);
setInterval(save, 5000);
addEventListener("beforeunload", save);

buildShop();
render();
