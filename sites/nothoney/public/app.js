// nothoney — paste a Bluesky post link, get a "that's not honey" (well,
// "that's not 'for you'") meme back with the actual skeet embedded in the
// speech box. Resolution logic is the same shape as trigrams' post.js
// resolvePostRef: bsky.app URL -> resolve handle to did -> getPostThread.

const APPVIEW = "https://public.api.bsky.app";

const els = {
  form: document.getElementById("f"),
  input: document.getElementById("url"),
  go: document.getElementById("go"),
  status: document.getElementById("status"),
  result: document.getElementById("result"),
  canvas: document.getElementById("canvas"),
  shareNative: document.getElementById("shareNative"),
  shareBluesky: document.getElementById("shareBluesky"),
  download: document.getElementById("download"),
};

function setStatus(msg, isErr) {
  els.status.textContent = msg || "";
  els.status.className = "status" + (isErr ? " err" : "");
}

async function xrpc(method, params) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${APPVIEW}/xrpc/${method}${qs ? "?" + qs : ""}`);
  if (!res.ok) {
    let msg = res.statusText;
    try { msg = (await res.json()).message || msg; } catch (_) {}
    throw new Error(msg);
  }
  return res.json();
}

// A lot of skeets have no text at all — image posts, link shares, bare quote
// posts. Falling through to an empty speech bubble reads as broken, so when
// record.text is blank, describe whatever's actually in the post's embed
// instead (alt text first — plenty of posters write real alt text and never
// see it surface anywhere useful).
function describeEmbed(embed) {
  if (!embed) return "";
  switch (embed.$type) {
    case "app.bsky.embed.images#view": {
      const imgs = embed.images || [];
      const alt = imgs.map((i) => i.alt).find((a) => a && a.trim());
      if (alt) return `[image: ${alt.trim()}]`;
      return imgs.length > 1 ? "[posted images, no caption]" : "[posted an image, no caption]";
    }
    case "app.bsky.embed.video#view":
      return embed.alt && embed.alt.trim() ? `[video: ${embed.alt.trim()}]` : "[posted a video, no caption]";
    case "app.bsky.embed.external#view":
      return `[link: ${embed.external?.title || embed.external?.uri || "shared link"}]`;
    case "app.bsky.embed.record#view": {
      const qa = embed.record?.author?.handle;
      const qt = embed.record?.value?.text;
      if (qt && qt.trim()) return `[quoting @${qa}: "${qt.trim()}"]`;
      return qa ? `[quote-posted @${qa}]` : "[quote post]";
    }
    case "app.bsky.embed.recordWithMedia#view":
      return describeEmbed(embed.media) || describeEmbed(embed.record);
    default:
      return "";
  }
}

function captionFor(post) {
  const text = (post.record?.text || "").trim();
  if (text) return text;
  return describeEmbed(post.embed) || "(said nothing at all)";
}

// Resolve a bsky.app post URL (or at:// uri) to its text + author.
async function resolvePost(urlOrUri) {
  let atUri = urlOrUri.trim();
  const m = atUri.match(/bsky\.app\/profile\/([^/]+)\/post\/([^/?#]+)/);
  if (m) {
    let did = m[1];
    if (!did.startsWith("did:")) {
      const r = await xrpc("com.atproto.identity.resolveHandle", { handle: did });
      did = r.did;
    }
    atUri = `at://${did}/app.bsky.feed.post/${m[2]}`;
  }
  if (!atUri.startsWith("at://")) throw new Error("that doesn't look like a bsky.app post link");

  const t = await xrpc("app.bsky.feed.getPostThread", { uri: atUri, depth: 0 });
  const post = t?.thread?.post;
  if (!post) throw new Error("couldn't find that post");
  const rkey = m ? m[2] : atUri.split("/").pop();
  return {
    text: captionFor(post),
    handle: post.author?.handle || "unknown",
    avatar: post.author?.avatar || null,
    permalink: `https://bsky.app/profile/${post.author?.handle}/post/${rkey}`,
    // the site's own distinct per-post URL (src/index.ts's /s/<handle>/<rkey>
    // route) — this is what gets shared, not the bare root, so a remix's
    // Bluesky unfurl carries the actual quoted skeet instead of one generic
    // "fancy pooh + FOR YOU jar" card for every share.
    shareUrl: `https://nothoney.bisks.net/s/${encodeURIComponent(post.author?.handle || "unknown")}/${encodeURIComponent(rkey)}`,
  };
}

function loadImg(url) {
  if (!url) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

let lastShareText = "";
let lastPermalink = "";

function buildShareText(shareUrl, permalink) {
  const base = `made a "that's not 'for you'" out of this one → `;
  // keep the original post's link too when there's room under bsky's 300
  // grapheme cap; the site's own (per-post) URL always wins if something has
  // to give — it's what actually unfurls into this specific meme.
  const withOriginal = `${base}${shareUrl} (from ${permalink})`;
  return withOriginal.length <= 300 ? withOriginal : `${base}${shareUrl}`;
}

async function makeMeme(rawUrl) {
  const url = rawUrl.trim();
  if (!url) { setStatus("paste a bsky.app post link first.", true); return; }

  els.go.disabled = true;
  els.result.classList.remove("show");
  setStatus("fetching that skeet...");

  try {
    const post = await resolvePost(url);
    setStatus("drawing...");
    const avatarImg = await loadImg(post.avatar);

    const ctx = els.canvas.getContext("2d");
    ctx.clearRect(0, 0, els.canvas.width, els.canvas.height);
    drawMeme(ctx, { handle: post.handle, text: post.text, avatarImg });

    lastPermalink = post.permalink;
    lastShareText = buildShareText(post.shareUrl, post.permalink);
    els.shareBluesky.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(lastShareText);

    setStatus("");
    els.result.classList.add("show");
    els.result.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch (err) {
    setStatus("couldn't build that: " + err.message, true);
  } finally {
    els.go.disabled = false;
  }
}

els.form.addEventListener("submit", (e) => {
  e.preventDefault();
  makeMeme(els.input.value);
});

els.download.addEventListener("click", () => {
  els.canvas.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "nothoney.png";
    a.click();
    URL.revokeObjectURL(a.href);
  }, "image/png");
});

function canShareFiles() {
  if (!navigator.share || !navigator.canShare) return false;
  try {
    const probe = new File([""], "probe.png", { type: "image/png" });
    return navigator.canShare({ files: [probe] });
  } catch (_) {
    return false;
  }
}
if (canShareFiles()) {
  els.shareNative.style.display = "";
  els.shareNative.addEventListener("click", () => {
    els.canvas.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], "nothoney.png", { type: "image/png" });
      try {
        await navigator.share({ files: [file], text: lastShareText, title: "nothoney" });
      } catch (_) {
        // cancelled or unsupported mid-flow — no-op
      }
    }, "image/png");
  });
}

// A shared link auto-builds the same meme on load: either the older ?u=<bsky
// url> form, or /s/<handle>/<rkey> (src/index.ts's per-post share route,
// which also carries personalized OG tags for the unfurl).
const pathShare = location.pathname.match(/^\/s\/([^/]+)\/([^/]+)\/?$/);
const sharedUrl = new URLSearchParams(location.search).get("u")
  || (pathShare && `https://bsky.app/profile/${decodeURIComponent(pathShare[1])}/post/${decodeURIComponent(pathShare[2])}`);
if (sharedUrl) {
  els.input.value = sharedUrl;
  makeMeme(sharedUrl);
}
