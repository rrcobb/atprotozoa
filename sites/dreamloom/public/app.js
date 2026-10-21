// dreamloom: fetch a handle's recent posts that mention a term, let the user
// x some out, send the rest to the user's own OpenAI-compatible endpoint via xsai,
// or generate images via Hydracept (hosted or BYOK through the Worker proxy).
import { fetchHostedStatus, generateHydraceptImage } from "./lib/hydracept-client.js";

const $ = (id) => document.getElementById(id);
const DEFAULT_SYS = "You are a dream journal ghostwriter. Below are past dream entries by one person. Study their voice, length, recurring settings and motifs, then write ONE brand-new dream entry in that same voice. Don't copy any example; invent new events. Output only the entry.";
const WANT = 10; // product decision: "last 10 examples"
const LS = "dreamloom.settings";

let examples = []; // { text, createdAt, uri, on }
let handleClean = "";
let hydraceptHosted = false;

const clean = (h) => h.trim().replace(/^@/, "").toLowerCase();

async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} from ${new URL(url).host}`);
  return r.json();
}

async function resolvePds(handle) {
  const { did } = await getJSON(`https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`);
  const doc = did.startsWith("did:web:")
    ? await getJSON(`https://${did.slice(8)}/.well-known/did.json`)
    : await getJSON(`https://plc.directory/${did}`);
  const svc = (doc.service || []).find((s) => s.id === "#atproto_pds");
  if (!svc) throw new Error("no PDS in DID document");
  return { did, pds: svc.serviceEndpoint };
}

// Walk posts newest-first until WANT matches or the repo is exhausted.
async function findExamples(handle, term) {
  const { did, pds } = await resolvePds(handle);
  const needle = term.toLowerCase();
  const out = [];
  let cursor = "";
  do {
    const u = `${pds}/xrpc/com.atproto.repo.listRecords?repo=${encodeURIComponent(did)}&collection=app.bsky.feed.post&limit=100${cursor ? "&cursor=" + encodeURIComponent(cursor) : ""}`;
    const page = await getJSON(u);
    for (const rec of page.records) {
      const t = rec.value && rec.value.text;
      if (t && t.toLowerCase().includes(needle)) {
        out.push({ text: t, createdAt: rec.value.createdAt, uri: rec.uri, on: true });
        if (out.length >= WANT) return out;
      }
    }
    cursor = page.cursor || "";
  } while (cursor);
  return out;
}

function renderExamples() {
  const ul = $("examples");
  ul.textContent = "";
  examples.forEach((ex, i) => {
    const li = document.createElement("li");
    li.className = "ex" + (ex.on ? "" : " off");
    const body = document.createElement("div");
    body.className = "t";
    body.textContent = ex.text;
    const d = document.createElement("div");
    d.className = "d";
    d.textContent = (ex.createdAt || "").slice(0, 10);
    body.appendChild(d);
    const b = document.createElement("button");
    b.type = "button";
    b.title = ex.on ? "x it out" : "bring it back";
    b.textContent = ex.on ? "✕" : "↺";
    b.addEventListener("click", () => { ex.on = !ex.on; renderExamples(); });
    li.append(body, b);
    ul.appendChild(li);
  });
}

$("fetchform").addEventListener("submit", async (e) => {
  e.preventDefault();
  const handle = clean($("handle").value);
  const term = $("term").value.trim() || "dream";
  if (!handle) { $("fetchmsg").textContent = "enter a handle"; return; }
  $("fetchbtn").disabled = true;
  $("fetchmsg").textContent = "looking…";
  try {
    examples = await findExamples(handle, term);
    handleClean = handle;
    $("fetchmsg").textContent = examples.length ? `${examples.length} post(s) mentioning “${term}” — ✕ the ones you don't want.` : `no posts mention “${term}”.`;
    renderExamples();
  } catch (err) {
    $("fetchmsg").textContent = "couldn't fetch: " + err.message;
  } finally {
    $("fetchbtn").disabled = false;
  }
});

function loadSettings() {
  $("sys").value = DEFAULT_SYS;
  try {
    const s = JSON.parse(localStorage.getItem(LS) || "{}");
    for (const k of ["baseurl", "apikey", "hydraceptkey", "output", "model", "sys"]) {
      if (s[k] != null && $(k)) $(k).value = s[k];
    }
  } catch {}
  syncOutput();
}
function saveSettings() {
  const s = {};
  for (const k of ["baseurl", "apikey", "hydraceptkey", "output", "model", "sys"]) {
    if ($(k)) s[k] = $(k).value;
  }
  try { localStorage.setItem(LS, JSON.stringify(s)); } catch {}
}
function syncOutput() {
  const img = $("output").value === "image";
  $("modelwrap").firstChild.textContent = img ? "image model " : "model ";
}
$("output").addEventListener("change", () => {
  const img = $("output").value === "image";
  const m = $("model").value;
  if (img && m === "gpt-4o-mini") $("model").value = "gpt-image-1";
  if (!img && m === "gpt-image-1") $("model").value = "gpt-4o-mini";
  syncOutput();
});

function showOut(node, shareText) {
  $("outpanel").hidden = false;
  const out = $("out");
  out.textContent = "";
  out.appendChild(node);
  const a = $("share");
  if (shareText) {
    a.hidden = false;
    a.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(shareText.slice(0, 280));
  } else a.hidden = true;
}

function hydraceptTokenForImage() {
  const key = $("hydraceptkey").value.trim();
  if (key) return key;
  if (hydraceptHosted) return "";
  return null;
}

$("go").addEventListener("click", async () => {
  const used = examples.filter((x) => x.on);
  if (!used.length) { showOut(document.createTextNode("fetch some examples first (and keep at least one)."), ""); return; }
  saveSettings();
  const sys = $("sys").value.trim() || DEFAULT_SYS;
  const body = used.map((x, i) => `--- example ${i + 1} ---\n${x.text}`).join("\n\n");
  $("go").disabled = true;
  showOut(document.createTextNode("weaving…"), "");
  try {
    if ($("output").value === "image") {
      const hToken = hydraceptTokenForImage();
      if (hToken !== null) {
        const src = await generateHydraceptImage(`${sys}\n\n${body}`, { token: hToken || undefined });
        const img = document.createElement("img");
        img.src = src;
        img.alt = "generated dream image";
        showOut(img, "");
      } else {
        const baseURL = $("baseurl").value.trim().replace(/\/?$/, "/");
        const apiKey = $("apikey").value.trim();
        const model = $("model").value.trim();
        if (!apiKey || !model) {
          showOut(document.createTextNode("needs an api key and model, hosted Hydracept, or a Hydracept key."), "");
          return;
        }
        const { generateImage } = await import("https://esm.sh/@xsai/generate-image");
        const r = await generateImage({ baseURL, apiKey, model, prompt: `${sys}\n\n${body}`.slice(0, 4000), responseFormat: "b64_json" });
        const img = document.createElement("img");
        const b64 = r.image || (r.images && (r.images[0].b64_json || r.images[0]));
        img.src = typeof b64 === "string" && b64.startsWith("http") ? b64 : "data:image/png;base64," + b64;
        img.alt = "generated dream image";
        showOut(img, "");
      }
    } else {
      const baseURL = $("baseurl").value.trim().replace(/\/?$/, "/");
      const apiKey = $("apikey").value.trim();
      const model = $("model").value.trim();
      if (!apiKey || !model) { showOut(document.createTextNode("needs an api key and a model."), ""); return; }
      const { generateText } = await import("https://esm.sh/@xsai/generate-text");
      const r = await generateText({
        baseURL, apiKey, model,
        messages: [
          { role: "system", content: sys },
          { role: "user", content: `Past entries by @${handleClean}:\n\n${body}\n\nWrite the new one.` },
        ],
      });
      const text = (r.text || "").trim() || "(empty response)";
      showOut(document.createTextNode(text), text);
    }
  } catch (err) {
    const p = document.createElement("span");
    p.className = "err";
    p.textContent = "failed: " + (err && err.message ? err.message : err);
    showOut(p, "");
  } finally {
    $("go").disabled = false;
  }
});

async function initHydracept() {
  const st = await fetchHostedStatus();
  hydraceptHosted = Boolean(st.hosted);
  if (hydraceptHosted) $("hydracept-hosted").hidden = false;
}

if (typeof window !== "undefined" && window.attachHandleTypeahead) window.attachHandleTypeahead($("handle"));
loadSettings();
initHydracept();
