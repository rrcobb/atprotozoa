// postcid — the actual composer + CID math. Everything here runs in the
// browser; the only server involvement is the two tiny proxies in
// ../../src/index.ts (unfurl a link, re-fetch an image with CORS on).
//
// The record CID is computed the same way a PDS computes it: dag-cbor encode
// the exact record object, sha2-256 the bytes, wrap as a CIDv1 with the
// dag-cbor codec. Blob refs (image bytes, link-card thumbs) get the same
// treatment with the *raw* codec, because that's what a PDS's uploadBlob
// actually hashes: the literal bytes you send it, untouched. That means blob
// CIDs computed here are byte-for-byte the CID you'd get back from a real
// uploadBlob call, with no upload required — checked against real posts
// pulled from the AppView while building this.
import { RichText, AtpAgent } from "@atproto/api";
import * as dagCBOR from "@ipld/dag-cbor";
import { CID } from "multiformats/cid";
import { sha256 } from "multiformats/hashes/sha2";
import * as raw from "multiformats/codecs/raw";

const MAX_GRAPHEMES = 300;
const MAX_BYTES = 3000;
const MAX_IMAGES = 4;

const COMMON_LANGS = [
  ["en", "English"],
  ["ja", "Japanese"],
  ["es", "Spanish"],
  ["pt", "Portuguese"],
  ["de", "German"],
  ["fr", "French"],
  ["ko", "Korean"],
  ["zh", "Chinese"],
];

const agent = new AtpAgent({ service: "https://public.api.bsky.app" });

// Cache handle -> did/error so re-typing the same @mention doesn't refire a
// network call on every keystroke of an unrelated part of the post.
const handleCache = new Map();
const cachingAgent = {
  com: {
    atproto: {
      identity: {
        async resolveHandle({ handle }) {
          if (handleCache.has(handle)) {
            const cached = handleCache.get(handle);
            if (cached.error) throw new Error("not found");
            return { data: cached };
          }
          try {
            const res = await agent.com.atproto.identity.resolveHandle({ handle });
            handleCache.set(handle, res.data);
            return res;
          } catch (e) {
            handleCache.set(handle, { error: true });
            throw e;
          }
        },
      },
    },
  },
};

// ---------- state ----------
const state = {
  text: "",
  langs: new Set(),
  createdAt: new Date().toISOString(),
  via: "",
  embedKind: "none", // none | images | external | record
  images: [], // { bytes, alt, width, height, mimeType, size, cid, previewUrl }
  external: { uri: "", title: "", description: "", thumb: null, includeThumb: true },
  record: { input: "", resolved: null, status: "" },
};

let richText = null;
let computeToken = 0;
let lastRecord = null;
let lastCid = null;
let lastCborBytes = null;

// ---------- hashing ----------
async function blobCidForBytes(bytes) {
  const hash = await sha256.digest(bytes);
  return CID.createV1(raw.code, hash);
}

async function recordCidFor(record) {
  const bytes = dagCBOR.encode(record);
  const hash = await sha256.digest(bytes);
  return { cid: CID.createV1(dagCBOR.code, hash), bytes };
}

function utf8Len(str) {
  return new TextEncoder().encode(str).length;
}

// ---------- record assembly ----------
function buildEmbed() {
  if (state.embedKind === "images" && state.images.length) {
    return {
      $type: "app.bsky.embed.images",
      images: state.images.map((img) => {
        const entry = {
          image: { $type: "blob", ref: img.cid, mimeType: img.mimeType, size: img.size },
          alt: img.alt || "",
        };
        if (img.width && img.height) entry.aspectRatio = { width: img.width, height: img.height };
        return entry;
      }),
    };
  }
  if (state.embedKind === "external" && state.external.uri) {
    const external = {
      uri: state.external.uri,
      title: state.external.title || "",
      description: state.external.description || "",
    };
    if (state.external.thumb && state.external.includeThumb) {
      external.thumb = {
        $type: "blob",
        ref: state.external.thumb.cid,
        mimeType: state.external.thumb.mimeType,
        size: state.external.thumb.size,
      };
    }
    return { $type: "app.bsky.embed.external", external };
  }
  if (state.embedKind === "record" && state.record.resolved) {
    return {
      $type: "app.bsky.embed.record",
      record: { uri: state.record.resolved.uri, cid: state.record.resolved.cid },
    };
  }
  return null;
}

function buildRecord() {
  const record = { $type: "app.bsky.feed.post", text: state.text, createdAt: state.createdAt };
  if (richText && richText.facets && richText.facets.length) record.facets = richText.facets;
  if (state.langs.size) record.langs = [...state.langs];
  const embed = buildEmbed();
  if (embed) record.embed = embed;
  if (state.via.trim()) record.via = state.via.trim();
  return record;
}

// CID instances -> {"$link": "..."} for the pretty-printed JSON pane, so it
// reads the same way com.atproto.repo.getRecord would show it back to you.
function toDisplayRecord(value) {
  if (value instanceof CID) return { $link: value.toString() };
  if (Array.isArray(value)) return value.map(toDisplayRecord);
  if (value && typeof value === "object") {
    const out = {};
    for (const k of Object.keys(value)) out[k] = toDisplayRecord(value[k]);
    return out;
  }
  return value;
}

// ---------- recompute pipeline ----------
let debounceHandle = null;
function scheduleRecompute(delay = 250) {
  clearTimeout(debounceHandle);
  debounceHandle = setTimeout(recompute, delay);
  setStale(true);
}

async function recompute() {
  const token = ++computeToken;
  const rt = new RichText({ text: state.text });
  try {
    await rt.detectFacets(cachingAgent);
  } catch {
    // detectFacets swallows per-mention errors; a thrown error here means
    // something else broke (offline, etc) — fall back to unresolved facets.
  }
  if (token !== computeToken) return;
  richText = rt;
  const record = buildRecord();
  const { cid, bytes } = await recordCidFor(record);
  if (token !== computeToken) return;
  lastRecord = record;
  lastCid = cid;
  lastCborBytes = bytes;
  render();
  setStale(false);
}

// ---------- rendering ----------
const els = {};
function q(id) {
  return document.getElementById(id);
}

function setStale(stale) {
  els.cidValue?.classList.toggle("stale", stale);
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function renderCounter() {
  const graphemes = richText ? richText.graphemeLength : [...new Intl.Segmenter().segment(state.text)].length;
  const bytes = utf8Len(state.text);
  const over = graphemes > MAX_GRAPHEMES || bytes > MAX_BYTES;
  els.counter.textContent = `${graphemes} / ${MAX_GRAPHEMES} graphemes · ${bytes} / ${MAX_BYTES} bytes`;
  els.counter.classList.toggle("over", over);
}

function facetKindLabel(feature) {
  if (feature.$type === "app.bsky.richtext.facet#mention") return "mention";
  if (feature.$type === "app.bsky.richtext.facet#link") return "link";
  if (feature.$type === "app.bsky.richtext.facet#tag") return "tag";
  return "facet";
}

function renderFacets() {
  const facets = richText?.facets || [];
  if (!facets.length) {
    els.facetList.innerHTML = `<p class="empty">no facets detected yet — try @mention.bsky.social, #hashtag, or a bare https:// link.</p>`;
    return;
  }
  els.facetList.innerHTML = facets
    .map((f) => {
      const bytes = new TextEncoder().encode(state.text);
      const slice = new TextDecoder().decode(bytes.slice(f.index.byteStart, f.index.byteEnd));
      return f.features
        .map((feature) => {
          const kind = facetKindLabel(feature);
          let val = slice;
          let cls = "";
          if (kind === "mention") {
            if (!feature.did) {
              cls = "err";
              val = `${slice} — couldn't resolve this handle`;
            } else {
              val = `${slice} → ${feature.did}`;
            }
          } else if (kind === "link") {
            val = feature.uri;
          }
          return `<div class="facet-item ${cls}"><span class="facet-kind">${kind}</span><span class="facet-val">${escapeHtml(val)}</span></div>`;
        })
        .join("");
    })
    .join("");
}

function renderLangChips() {
  const customLangs = [...state.langs].filter((l) => !COMMON_LANGS.some(([code]) => code === l));
  els.langChips.innerHTML =
    COMMON_LANGS.map(
      ([code, name]) =>
        `<label class="chip${state.langs.has(code) ? " on" : ""}" data-lang="${code}"><input type="checkbox" ${state.langs.has(code) ? "checked" : ""} />${name}</label>`
    ).join("") +
    customLangs
      .map(
        (code) => `<span class="chip on custom-chip" data-custom-lang="${escapeHtml(code)}">${escapeHtml(code)}<button type="button" class="chip-remove" data-custom-lang="${escapeHtml(code)}" aria-label="remove ${escapeHtml(code)}">&times;</button></span>`
      )
      .join("") +
    `<span class="chip"><input type="text" class="custom-input" id="customLangInput" placeholder="+ code" maxlength="8" /></span>`;

  // A <label> wrapping its <input> gets a click fired on the label itself
  // AND a second, synthetic click forwarded to (and bubbled back up from)
  // the input for every physical click — so a listener on the label toggles
  // twice per click and net-cancels. Listen for the checkbox's own "change"
  // instead; that fires exactly once regardless of whether the label or the
  // checkbox was clicked.
  els.langChips.querySelectorAll(".chip[data-lang]").forEach((chip) => {
    const checkbox = chip.querySelector("input[type=checkbox]");
    checkbox.addEventListener("change", () => {
      const lang = chip.dataset.lang;
      if (checkbox.checked) state.langs.add(lang);
      else state.langs.delete(lang);
      renderLangChips();
      scheduleRecompute();
    });
  });
  els.langChips.querySelectorAll(".chip-remove").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.langs.delete(btn.dataset.customLang);
      renderLangChips();
      scheduleRecompute();
    });
  });
  q("customLangInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const v = e.target.value.trim().toLowerCase();
      if (v && !state.langs.has(v)) {
        state.langs.add(v);
        renderLangChips();
        scheduleRecompute();
      } else {
        e.target.value = "";
      }
    }
  });
}

function renderImages() {
  if (!state.images.length) {
    els.imageGrid.innerHTML = "";
    els.imageAddRow.querySelector(".hint").textContent = `up to ${MAX_IMAGES} images. each blob's CID is the real sha2-256 of its exact bytes — the same CID a PDS's uploadBlob would hand back.`;
    return;
  }
  els.imageGrid.innerHTML = state.images
    .map(
      (img, i) => `
    <div class="image-card">
      <img src="${img.previewUrl}" alt="" />
      <div class="body">
        <input type="text" class="alt-input" data-i="${i}" placeholder="alt text" value="${escapeHtml(img.alt)}" />
        <div class="meta">${img.mimeType} · ${img.size.toLocaleString()}b${img.width ? ` · ${img.width}×${img.height}` : ""}</div>
        <div class="meta">${img.cid.toString()}</div>
        <div class="row">
          <button class="tiny danger remove-image" data-i="${i}">remove</button>
        </div>
      </div>
    </div>`
    )
    .join("");
  els.imageGrid.querySelectorAll(".alt-input").forEach((inp) => {
    inp.addEventListener("input", (e) => {
      state.images[Number(e.target.dataset.i)].alt = e.target.value;
      scheduleRecompute();
    });
  });
  els.imageGrid.querySelectorAll(".remove-image").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const i = Number(e.target.dataset.i);
      URL.revokeObjectURL(state.images[i].previewUrl);
      state.images.splice(i, 1);
      renderImages();
      scheduleRecompute();
    });
  });
}

function renderExternal() {
  const ext = state.external;
  if (!ext.title && !ext.uri) {
    els.linkCardPreview.innerHTML = "";
    return;
  }
  els.linkCardPreview.innerHTML = `
    <div class="link-card">
      ${ext.thumb ? `<img src="${ext.thumb.previewUrl}" alt="" />` : ""}
      <div class="body">
        <div class="domain">${ext.uri ? new URL(ext.uri).hostname : ""}</div>
        <input type="text" id="extTitleInput" value="${escapeHtml(ext.title || "")}" placeholder="title" />
        <input type="text" id="extDescInput" value="${escapeHtml(ext.description || "")}" placeholder="description" />
        ${ext.thumb ? `<label style="display:flex;align-items:center;gap:0.4rem;font-size:0.72rem;color:var(--muted);margin-top:0.3rem;"><input type="checkbox" id="extThumbToggle" ${ext.includeThumb ? "checked" : ""}/> include thumbnail blob (${ext.thumb.cid.toString().slice(0, 20)}…)</label>` : ""}
      </div>
    </div>`;
  q("extTitleInput").addEventListener("input", (e) => {
    ext.title = e.target.value;
    scheduleRecompute();
  });
  q("extDescInput").addEventListener("input", (e) => {
    ext.description = e.target.value;
    scheduleRecompute();
  });
  const toggle = q("extThumbToggle");
  if (toggle) {
    toggle.addEventListener("change", (e) => {
      ext.includeThumb = e.target.checked;
      scheduleRecompute();
    });
  }
}

function renderQuote() {
  const r = state.record.resolved;
  if (!r) {
    els.quoteCardPreview.innerHTML = "";
    return;
  }
  els.quoteCardPreview.innerHTML = `
    <div class="quote-card">
      <div class="who">${escapeHtml(r.author?.displayName || r.author?.handle || "")} <span style="color:var(--muted);font-weight:400;">@${escapeHtml(r.author?.handle || "")}</span></div>
      <div class="body-text">${escapeHtml(r.text || "")}</div>
      <div class="uri">${r.uri}<br/>${r.cid}</div>
    </div>`;
}

function renderWarnings() {
  const warnings = [];
  const graphemes = richText ? richText.graphemeLength : 0;
  if (graphemes > MAX_GRAPHEMES) warnings.push(`text is ${graphemes} graphemes — over the ${MAX_GRAPHEMES} limit, a real PDS would reject this.`);
  if (utf8Len(state.text) > MAX_BYTES) warnings.push(`text is over the ${MAX_BYTES}-byte limit.`);
  const badMention = (richText?.facets || []).some((f) => f.features.some((ft) => ft.$type === "app.bsky.richtext.facet#mention" && !ft.did));
  if (badMention) warnings.push("one or more @mentions didn't resolve to a DID — that facet would be invalid.");
  if (!state.text.trim() && state.embedKind === "none") warnings.push("empty post — a real PDS requires either text or an embed.");
  els.warnList.innerHTML = warnings.map((w) => `<div class="warn">${escapeHtml(w)}</div>`).join("");
}

function jsonHighlight(obj) {
  const json = JSON.stringify(obj, null, 2);
  return escapeHtml(json)
    .replace(/(&quot;[^&]*?&quot;)(:)/g, '<span class="json-key">$1</span>$2')
    .replace(/: (&quot;[^&]*?&quot;)/g, ': <span class="json-str">$1</span>')
    .replace(/: (-?\d+(\.\d+)?)/g, ': <span class="json-num">$1</span>');
}

function render() {
  renderCounter();
  renderFacets();
  renderWarnings();
  if (!lastCid) return;
  els.cidValue.textContent = lastCid.toString();
  els.cidMeta.textContent = `${lastCborBytes.byteLength.toLocaleString()} bytes of dag-cbor · sha2-256 · CIDv1`;
  els.recordJson.innerHTML = jsonHighlight(toDisplayRecord(lastRecord));
  const shareText = `built with postcid — paste a post, watch its record CID compute live. https://postcid.bisks.net/`;
  els.shareBtn.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(shareText);
}

// ---------- image handling ----------
async function addImageFile(file) {
  if (state.images.length >= MAX_IMAGES) return;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const cid = await blobCidForBytes(bytes);
  let width, height;
  try {
    const bitmap = await createImageBitmap(file);
    width = bitmap.width;
    height = bitmap.height;
    bitmap.close?.();
  } catch {
    // non-decodable image (e.g. weird format) — aspectRatio just gets omitted
  }
  state.images.push({
    bytes,
    alt: "",
    mimeType: file.type || "application/octet-stream",
    size: bytes.byteLength,
    cid,
    width,
    height,
    previewUrl: URL.createObjectURL(file),
  });
  renderImages();
  scheduleRecompute();
}

// ---------- external link handling ----------
async function fetchUnfurl(url) {
  els.externalStatus.textContent = "fetching…";
  els.externalStatus.className = "status";
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("needs to be an http(s) url");
    state.external.uri = u.toString();
    const res = await fetch(`/api/unfurl?url=${encodeURIComponent(state.external.uri)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `failed (${res.status})`);
    state.external.title = data.title || "";
    state.external.description = data.description || "";
    state.external.thumb = null;
    if (data.image) {
      try {
        const imgRes = await fetch(`/api/img?url=${encodeURIComponent(data.image)}`);
        if (imgRes.ok) {
          const blob = await imgRes.blob();
          const bytes = new Uint8Array(await blob.arrayBuffer());
          const cid = await blobCidForBytes(bytes);
          state.external.thumb = {
            bytes,
            mimeType: blob.type || "image/jpeg",
            size: bytes.byteLength,
            cid,
            previewUrl: URL.createObjectURL(blob),
          };
        }
      } catch {
        // thumb is optional — a card with no image is still a valid embed
      }
    }
    state.external.includeThumb = true;
    els.externalStatus.textContent = "";
    renderExternal();
    scheduleRecompute();
  } catch (e) {
    els.externalStatus.textContent = e.message || "couldn't fetch that url";
    els.externalStatus.className = "status err";
  }
}

// ---------- quote / record embed handling ----------
function extractPostRef(rawInput) {
  const s = (rawInput || "").trim();
  let m = s.match(/bsky\.app\/profile\/([^/\s?#]+)\/post\/([a-zA-Z0-9]+)/i);
  if (m) return { actor: decodeURIComponent(m[1]), rkey: m[2] };
  m = s.match(/at:\/\/(did:[a-zA-Z0-9._:%-]+)\/app\.bsky\.feed\.post\/([a-zA-Z0-9]+)/i);
  if (m) return { actor: m[1], rkey: m[2] };
  return null;
}

async function resolveQuote(rawInput) {
  els.quoteStatus.textContent = "resolving…";
  els.quoteStatus.className = "status";
  try {
    const ref = extractPostRef(rawInput);
    if (!ref) throw new Error("that doesn't look like a bsky.app post url or an at:// uri");
    let did = ref.actor;
    if (!did.startsWith("did:")) {
      const { data } = await agent.com.atproto.identity.resolveHandle({ handle: ref.actor });
      did = data.did;
    }
    const uri = `at://${did}/app.bsky.feed.post/${ref.rkey}`;
    const { data } = await agent.app.bsky.feed.getPosts({ uris: [uri] });
    const post = data.posts?.[0];
    if (!post) throw new Error("couldn't find that post — it may be deleted, or the account blocks viewers.");
    state.record.resolved = { uri: post.uri, cid: post.cid, author: post.author, text: post.record?.text || "" };
    els.quoteStatus.textContent = "";
    renderQuote();
    scheduleRecompute();
  } catch (e) {
    els.quoteStatus.textContent = e.message || "couldn't resolve that post";
    els.quoteStatus.className = "status err";
  }
}

// ---------- wiring ----------
function initEls() {
  [
    "text", "counter", "createdAt", "nowBtn", "langChips", "viaInput",
    "imageInput", "imageGrid", "imageAddRow", "externalUrl", "externalFetchBtn",
    "externalStatus", "linkCardPreview", "quoteInput", "quoteResolveBtn",
    "quoteStatus", "quoteCardPreview", "facetList", "cidValue", "cidMeta",
    "copyCidBtn", "copyJsonBtn", "recordJson", "warnList", "shareBtn",
  ].forEach((id) => (els[id] = q(id)));
}

function setEmbedKind(kind) {
  state.embedKind = kind;
  document.querySelectorAll(".segmented button[data-kind]").forEach((b) => b.classList.toggle("on", b.dataset.kind === kind));
  document.querySelectorAll(".embed-panel").forEach((p) => p.classList.toggle("hidden", p.dataset.panel !== kind));
  scheduleRecompute();
}

function init() {
  initEls();
  renderLangChips();

  els.text.addEventListener("input", (e) => {
    state.text = e.target.value;
    scheduleRecompute();
  });

  els.createdAt.value = toLocalInputValue(new Date(state.createdAt));
  els.createdAt.addEventListener("change", (e) => {
    const d = new Date(e.target.value);
    if (!isNaN(d.getTime())) {
      state.createdAt = d.toISOString();
      scheduleRecompute();
    }
  });
  els.nowBtn.addEventListener("click", () => {
    const now = new Date();
    state.createdAt = now.toISOString();
    els.createdAt.value = toLocalInputValue(now);
    scheduleRecompute();
  });

  els.viaInput.addEventListener("input", (e) => {
    state.via = e.target.value;
    scheduleRecompute();
  });

  document.querySelectorAll(".segmented button[data-kind]").forEach((btn) => {
    btn.addEventListener("click", () => setEmbedKind(btn.dataset.kind));
  });

  els.imageInput.addEventListener("change", async (e) => {
    for (const file of [...e.target.files].slice(0, MAX_IMAGES - state.images.length)) {
      await addImageFile(file);
    }
    e.target.value = "";
  });

  els.externalFetchBtn.addEventListener("click", () => {
    if (els.externalUrl.value.trim()) fetchUnfurl(els.externalUrl.value.trim());
  });
  els.externalUrl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && els.externalUrl.value.trim()) {
      e.preventDefault();
      fetchUnfurl(els.externalUrl.value.trim());
    }
  });

  els.quoteResolveBtn.addEventListener("click", () => {
    if (els.quoteInput.value.trim()) resolveQuote(els.quoteInput.value.trim());
  });
  els.quoteInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && els.quoteInput.value.trim()) {
      e.preventDefault();
      resolveQuote(els.quoteInput.value.trim());
    }
  });

  els.copyCidBtn.addEventListener("click", () => copyText(lastCid?.toString() || "", els.copyCidBtn));
  els.copyJsonBtn.addEventListener("click", () => copyText(JSON.stringify(toDisplayRecord(lastRecord), null, 2), els.copyJsonBtn));

  renderImages();
  recompute();
}

function toLocalInputValue(d) {
  const pad = (n) => String(n).padStart(2, "0");
  const ms = String(d.getMilliseconds()).padStart(3, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${ms}`;
}

async function copyText(text, btn) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    const orig = btn.textContent;
    btn.textContent = "copied!";
    setTimeout(() => (btn.textContent = orig), 1200);
  } catch {
    // clipboard permission denied — silently no-op, the text is still selectable
  }
}

init();
