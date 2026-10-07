import { EXAMPLES } from "./lib/examples.js";

const $ = (id) => document.getElementById(id);
const src = $("src"), out = $("out"), summary = $("summary"), statusEl = $("status");
const sel = $("examples");

for (const ex of EXAMPLES) {
  const o = document.createElement("option");
  o.value = ex.id; o.textContent = ex.label; sel.appendChild(o);
}

// ── share link: the source rides in the URL hash ──
const enc = (s) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const dec = (b) => decodeURIComponent(escape(atob(b.replace(/-/g, "+").replace(/_/g, "/"))));
const shareUrl = () => "https://littlelean.bisks.net/#c=" + enc(src.value);

// ── worker plumbing: kill and respawn on overrun ──
let worker = null, runId = 0, timer = null;
function spawn() {
  worker = new Worker("lib/worker.js", { type: "module" });
  worker.onmessage = (e) => { if (e.data.id === runId) { clearTimeout(timer); render(e.data.msgs); } };
  worker.onerror = () => { clearTimeout(timer); statusEl.textContent = "worker failed to load"; };
}
function run() {
  const id = ++runId;
  statusEl.textContent = "checking…";
  clearTimeout(timer);
  if (!worker) spawn();
  worker.postMessage({ id, src: src.value });
  // Wall-clock backstop on top of the interpreter's own step budget: 30s.
  timer = setTimeout(() => {
    worker.terminate(); worker = null;
    statusEl.textContent = "gave up after 30s";
    out.replaceChildren(msgEl({ kind: "error", line: 1, text: "timed out — something is looping or too heavy for a browser interpreter" }));
  }, 30000);
}

function msgEl(m) {
  const d = document.createElement("div");
  d.className = "msg " + m.kind;
  const ln = document.createElement("span"); ln.className = "ln"; ln.textContent = m.line;
  ln.title = "jump to line";
  ln.addEventListener("click", () => jump(m.line));
  const tx = document.createElement("span"); tx.className = "tx"; tx.textContent = m.text;
  d.append(ln, tx);
  return d;
}
function jump(line) {
  const lines = src.value.split("\n");
  let pos = 0;
  for (let i = 0; i < line - 1 && i < lines.length; i++) pos += lines[i].length + 1;
  src.focus(); src.setSelectionRange(pos, pos + (lines[line - 1] || "").length);
}

let last = [];
function render(msgs) {
  last = msgs;
  out.replaceChildren(...(msgs.length ? msgs.map(msgEl) : [Object.assign(document.createElement("div"), { className: "empty", textContent: "no output — add an #eval or a theorem" })]));
  const c = (k) => msgs.filter((m) => m.kind === k).length;
  const parts = [];
  if (c("proved")) parts.push(`${c("proved")} decided`);
  if (c("tested")) parts.push(`${c("tested")} tested only`);
  if (c("failed")) parts.push(`${c("failed")} false`);
  if (c("warn")) parts.push(`${c("warn")} sorry`);
  if (c("unknown")) parts.push(`${c("unknown")} undecidable here`);
  if (c("error")) parts.push(`${c("error")} error${c("error") > 1 ? "s" : ""}`);
  summary.textContent = parts.join(" · ");
  statusEl.textContent = "checked " + new Date().toLocaleTimeString();
  updatePost();
}

function updatePost() {
  const c = (k) => last.filter((m) => m.kind === k).length;
  const bits = [];
  if (c("proved")) bits.push(`${c("proved")} theorem${c("proved") > 1 ? "s" : ""} decided`);
  if (c("tested")) bits.push(`${c("tested")} tested`);
  if (c("failed")) bits.push(`${c("failed")} false`);
  const text = `λ I ran some Lean in a browser tab${bits.length ? ": " + bits.join(", ") : ""}.\n\n${shareUrl().length < 1500 ? shareUrl() : "https://littlelean.bisks.net/"}`;
  $("post").href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(text);
}

// ── wiring ──
let debounce;
src.addEventListener("input", () => { clearTimeout(debounce); debounce = setTimeout(run, 500); });
src.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); run(); }
  if (e.key === "Tab") { e.preventDefault(); document.execCommand("insertText", false, "  "); }
});
$("run").addEventListener("click", run);
$("share").addEventListener("click", async (e) => {
  const url = shareUrl();
  history.replaceState(null, "", "#c=" + enc(src.value));
  try { await navigator.clipboard.writeText(url); e.target.textContent = "copied ✓"; } catch { e.target.textContent = "see address bar"; }
  setTimeout(() => (e.target.textContent = "copy share link"), 1800);
});
async function loadExample(id) {
  const ex = EXAMPLES.find((x) => x.id === id) || EXAMPLES[0];
  if (ex.file) {
    try { src.value = await (await fetch(ex.file)).text(); } catch (err) { src.value = "-- couldn't load " + ex.file + ": " + err.message; }
  } else src.value = ex.src;
  run();
}
sel.addEventListener("change", () => loadExample(sel.value));

const m = /^#c=(.+)$/.exec(location.hash);
let shared = null;
if (m) { try { shared = dec(m[1]); } catch { /* bad hash: fall through to default example */ } }
if (shared !== null) { src.value = shared; sel.insertAdjacentHTML("afterbegin", '<option value="" selected>shared code</option>'); run(); }
else loadExample("hello");
