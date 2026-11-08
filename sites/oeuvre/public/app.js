// oeuvre — page glue. The engine lives in lib/remix.js (pure, tested).
import { fetchRepoRecordsWithKeys } from "./lib/car.js";
import { resolvePds } from "./lib/identity.js";
import { cleanText, harvest, fingerprint } from "./lib/remix.js";

const PUB = "https://public.api.bsky.app/xrpc";
const $ = (id) => document.getElementById(id);
const msg = (t, err) => { $("msg").textContent = t || ""; $("msg").className = err ? "err" : ""; };

const normHandle = (v) =>
  (v || "").trim().replace(/^@/, "").replace(/^at:\/\//, "").replace(/^https?:\/\/(bsky\.app\/profile\/)?/, "").split("/")[0].trim();

async function resolve(handle) {
  if (!handle) throw new Error("enter both handles");
  if (handle.startsWith("did:")) return { did: handle, handle };
  const r = await fetch(`${PUB}/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`);
  const d = await r.json().catch(() => ({}));
  if (!d.did) throw new Error(`couldn't resolve "${handle}"`);
  return { did: d.did, handle };
}

// Whole repo in one getRepo request; no page walk. Original posts are the
// material; replies are used only if an account has too few originals to work with.
const cache = new Map();
async function postsOf(who, label) {
  if (cache.has(who.did)) return cache.get(who.did);
  const pds = await resolvePds(who.did);
  if (!pds) throw new Error(`couldn't find ${who.handle}'s PDS`);
  const { records } = await fetchRepoRecordsWithKeys(pds, who.did, "app.bsky.feed.post", (s) => msg(`${label}: ${s}`));
  const clean = (rs) => rs.map((r) => cleanText(r.value.text)).filter((t) => t.length > 0);
  const originals = clean(records.filter((r) => !r.value.reply));
  const texts = originals.length >= 40 ? originals : clean(records);
  cache.set(who.did, texts);
  return texts;
}

let state = null;

function esc(s) { const d = document.createElement("div"); d.textContent = s; return d.innerHTML; }

function render() {
  const { a, b, result, seed } = state;
  $("title").textContent = `The Collected Works of @${a.handle}, on the subject of @${b.handle}`;
  $("titleSub").textContent = `batch ${seed} · ${result.skeletons} usable skeletons · ${result.substance.total} subject phrases`;
  const box = $("works");
  box.textContent = "";
  result.works.forEach((w, i) => {
    const el = document.createElement("div");
    el.className = "work";
    el.innerHTML = `<div class="n">no. ${i + 1}</div><div class="t"></div><div class="from"></div><button type="button" class="ghost">post this</button>`;
    el.querySelector(".t").textContent = w.text;
    el.querySelector(".from").textContent = w.from.length > 160 ? w.from.slice(0, 160) + "…" : w.from;
    el.querySelector("button").addEventListener("click", () => compose(`${w.text}\n\n— @${a.handle} × @${b.handle}\n${location.origin}/#${hash()}`));
    box.appendChild(el);
  });
  const f = state.fp;
  $("pa").textContent = `style kept — @${a.handle}`;
  $("pb").textContent = `substance taken — @${b.handle}`;
  const li = [
    `${f.posts.toLocaleString()} posts read, ~${f.avgWords.toFixed(1)} words each`,
    `${Math.round(f.lowerShare * 100)}% of posts have no capital letters`,
    f.openers.length ? `opens with: ${f.openers.map((o) => `“${o[0]}”`).join(", ")}` : "",
    f.endings.length ? `ends with: ${f.endings.map((o) => o[0]).join("  ")}` : "",
    f.emoji.length ? `emoji: ${f.emoji.map((o) => o[0]).join(" ")}` : "",
    `habit words kept in place: ${result.habits.size}`,
  ].filter(Boolean);
  $("styleList").innerHTML = li.map((x) => `<li>${esc(x)}</li>`).join("");
  const top = [...result.substance.counts].sort((x, y) => y[1] - x[1]).slice(0, 24);
  $("chips").innerHTML = top.map(([k, n]) => `<span title="${n}×">${esc(k)}</span>`).join("");
  $("out").hidden = false;
}

const hash = () => `a=${encodeURIComponent(state.a.handle)}&b=${encodeURIComponent(state.b.handle)}`;

function compose(text) {
  // Bluesky's limit is 300 graphemes; trim the work itself, never the credit line.
  let t = text;
  if ([...t].length > 300) {
    const tail = t.slice(t.indexOf("\n\n— @"));
    const head = t.slice(0, t.indexOf("\n\n— @"));
    t = [...head].slice(0, 300 - [...tail].length - 1).join("") + "…" + tail;
  }
  window.open("https://bsky.app/intent/compose?text=" + encodeURIComponent(t), "_blank", "noopener");
}

async function run(aHandle, bHandle) {
  $("go").disabled = true;
  try {
    msg("resolving handles…");
    const [a, b] = await Promise.all([resolve(aHandle), resolve(bHandle)]);
    const [styleTexts, subTexts] = await Promise.all([postsOf(a, `@${a.handle}`), postsOf(b, `@${b.handle}`)]);
    if (!styleTexts.length || !subTexts.length) throw new Error("one of them has no text posts");
    state = { a, b, styleTexts, subTexts, seed: 1 };
    state.fp = fingerprint(styleTexts);
    state.result = harvest({ styleTexts, substanceTexts: subTexts, count: 12, seed: state.seed });
    msg("");
    render();
    history.replaceState(null, "", "#" + hash());
  } catch (e) {
    msg(e.message || String(e), true);
  } finally {
    $("go").disabled = false;
  }
}

$("form").addEventListener("submit", (e) => {
  e.preventDefault();
  run(normHandle($("styleHandle").value), normHandle($("subHandle").value));
});
$("swap").addEventListener("click", () => {
  const a = $("styleHandle").value;
  $("styleHandle").value = $("subHandle").value;
  $("subHandle").value = a;
});
$("more").addEventListener("click", () => {
  state.seed += 1;
  state.result = harvest({ styleTexts: state.styleTexts, substanceTexts: state.subTexts, count: 12, seed: state.seed });
  render();
});
$("shareAll").addEventListener("click", () => {
  const w = state.result.works[0];
  compose(`${w.text}\n\n— @${state.a.handle} × @${state.b.handle}\n${location.origin}/#${hash()}`);
});

const h = new URLSearchParams(location.hash.slice(1));
if (h.get("a") && h.get("b")) {
  $("styleHandle").value = h.get("a");
  $("subHandle").value = h.get("b");
  run(normHandle(h.get("a")), normHandle(h.get("b")));
}
