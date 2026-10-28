import { World } from "./lib/world.js";
import { builtins } from "./lib/plugins.js";
import { runCommand } from "./lib/commands.js";
import { createRenderer } from "./lib/render.js";

const $ = (id) => document.getElementById(id);
const world = new World();
for (const p of builtins) world.use(p);

// ---- terminal ----
const out = $("termout");
const input = $("termin");
function print(line) {
  out.textContent += line + "\n";
  out.scrollTop = out.scrollHeight;
}
const ctx = { print };
world.log = print;
print("welcome to hyperstreet. type `help`.");
const history = [];
let hi = 0;
input.addEventListener("keydown", async (ev) => {
  if (ev.key === "ArrowUp") { hi = Math.max(0, hi - 1); input.value = history[hi] ?? ""; ev.preventDefault(); }
  else if (ev.key === "ArrowDown") { hi = Math.min(history.length, hi + 1); input.value = history[hi] ?? ""; ev.preventDefault(); }
  else if (ev.key === "Enter") {
    const line = input.value.trim();
    input.value = "";
    if (!line) return;
    history.push(line);
    hi = history.length;
    print("> " + line);
    for (const l of await runCommand(world, line, ctx)) print(l);
    renderPlugins();
    syncCruise();
  }
});

// ---- renderer ----
const canvas = $("view");
const renderer = createRenderer(canvas, world);
const info = $("info");
renderer.onSelect(async (e) => {
  if (!e) { info.className = "off"; return; }
  info.className = "";
  info.textContent = `${world.label(e)}\n${e.sword.name} · ${e.sword.rarity} · power ${e.sword.power}\n${e.posts} posts · ${e.given} likes received`;
  if (!e.handle) { await world.flushHandles([e]); info.textContent = info.textContent.replace(/^[^\n]*/, world.label(e)); }
});
renderer.start();
world.connect();

// ---- buttons ----
for (const b of document.querySelectorAll("[data-hold]")) {
  const name = b.dataset.hold;
  b.addEventListener("pointerdown", (e) => { b.setPointerCapture(e.pointerId); renderer.press(name, true); syncCruise(); });
  for (const t of ["pointerup", "pointercancel", "lostpointercapture"]) b.addEventListener(t, () => renderer.press(name, false));
}
const cruise = $("cruise");
function syncCruise() { cruise.classList.toggle("on", world.me.auto); }
cruise.addEventListener("click", () => { world.me.auto = !world.me.auto; syncCruise(); });
setInterval(syncCruise, 500);
$("vr").addEventListener("click", async () => {
  const on = !renderer.stereo;
  await renderer.setStereo(on);
  document.body.classList.toggle("vr", on);
  $("vr").textContent = on ? "exit VR" : "cardboard VR";
  $("vr").classList.toggle("on", on);
  if (on && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
  if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {});
});
// the exit button is hidden along with the rest of the bar in VR; keep it reachable
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && renderer.stereo) $("vr").click();
});

$("share").href = "https://bsky.app/intent/compose?text=" + encodeURIComponent("walking hyperstreet: every account on atproto right now is a building with a sword forged from its DID\n\nhttps://hyperstreet.bisks.net");

// ---- plugins panel ----
function renderPlugins() {
  const box = $("plugs");
  box.textContent = "";
  for (const p of world.plugins.values()) {
    const row = document.createElement("label");
    row.className = "plug";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = p.enabled;
    cb.addEventListener("change", () => { world.setEnabled(p.id, cb.checked); renderPlugins(); });
    const name = document.createElement("span");
    name.textContent = p.name || p.id;
    const small = document.createElement("small");
    small.textContent = p.error ? "crashed: " + p.error : p.desc || "";
    if (p.error) small.className = "err";
    row.append(cb, name, small);
    box.append(row);
  }
}
renderPlugins();
setInterval(renderPlugins, 3000);

// ---- user plugins ----
const KEY = "hyperstreet.plugin";
const EXAMPLE = `// ring every building whose latest sign mentions "sword"
world.use({
  id: "swordwatch",
  name: "sword watch",
  desc: "rings buildings whose latest post mentions swords",
  drawEnt(g, view, e, box) {
    const s = e.signs[e.signs.length - 1];
    if (!s || !/sword|katana|blade/i.test(s.text)) return;
    g.strokeStyle = "#ff3030";
    g.lineWidth = 3;
    g.strokeRect(box.cx - box.w / 2 - 4, box.top - 4, box.w + 8, box.h + 8);
  },
  commands: {
    swords: { help: "swords  — how many buildings are talking about swords",
      run(args, w) { return [...w.ents.values()].filter(e => e.signs.some(s => /sword/i.test(s.text))).length + " buildings"; } },
  },
});`;
const src = $("src");
const msg = $("srcmsg");
const fromHash = location.hash.startsWith("#plugin=") ? safeDecode(location.hash.slice(8)) : null;
src.value = fromHash ?? localStorage.getItem(KEY) ?? EXAMPLE;
function safeDecode(s) { try { return decodeURIComponent(escape(atob(s))); } catch (e) { return null; } }
function runSource(code) {
  try {
    new Function("world", code)(world);
    msg.textContent = "plugin loaded.";
    renderPlugins();
    return true;
  } catch (err) {
    msg.textContent = "error: " + err.message;
    return false;
  }
}
$("runsrc").addEventListener("click", () => {
  if (runSource(src.value)) localStorage.setItem(KEY, src.value);
});
$("clearsrc").addEventListener("click", () => { localStorage.removeItem(KEY); msg.textContent = "forgotten; reload to unload it."; });
// A plugin you saved yourself reloads. One that arrived in a #plugin= link only
// fills the box: running someone else's code is a decision, not a side effect.
if (!fromHash && localStorage.getItem(KEY)) runSource(localStorage.getItem(KEY));
