import { findFirst } from "./lib/search.js";

const els = {
  form: document.getElementById("form"),
  phrase: document.getElementById("phrase"),
  go: document.getElementById("go"),
  cancel: document.getElementById("cancel"),
  status: document.getElementById("status"),
  result: document.getElementById("result"),
  kicker: document.getElementById("kicker"),
  avatar: document.getElementById("avatar"),
  displayName: document.getElementById("displayName"),
  handleLink: document.getElementById("handleLink"),
  quote: document.getElementById("quote"),
  when: document.getElementById("when"),
  count: document.getElementById("count"),
  caveat: document.getElementById("caveat"),
  permalink: document.getElementById("permalink"),
  shareBluesky: document.getElementById("shareBluesky"),
  shareDownload: document.getElementById("shareDownload"),
  shareNative: document.getElementById("shareNative"),
  empty: document.getElementById("empty"),
  claimLink: document.getElementById("claimLink"),
  shareCanvas: document.getElementById("shareCanvas"),
};

// A phrase this short (1-2 characters) would match essentially every post
// ever made — a full scan would never finish in a browser tab. This is an
// input-sanity floor, not a data-read cap: any phrase that clears it still
// gets paged to genuine exhaustion, no sampling.
const MIN_PHRASE_LEN = 3;

let controller = null;

function setStatus(text, isError) {
  els.status.textContent = text || "";
  els.status.classList.toggle("err", !!isError);
}

function postUrl(post) {
  const handle = post?.author?.handle;
  const rkey = (post?.uri || "").split("/").pop();
  if (!handle || !rkey) return "https://bsky.app/";
  return `https://bsky.app/profile/${handle}/post/${rkey}`;
}

function shareUrlFor(phrase) {
  return "https://dibs.bisks.net/s/" + encodeURIComponent(phrase);
}

function highlightPhrase(text, phrase) {
  const idx = text.toLowerCase().indexOf(phrase.toLowerCase());
  if (idx === -1) return escapeHtml(text);
  return (
    escapeHtml(text.slice(0, idx)) +
    "<mark>" +
    escapeHtml(text.slice(idx, idx + phrase.length)) +
    "</mark>" +
    escapeHtml(text.slice(idx + phrase.length))
  );
}

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

function formatWhen(post) {
  const iso = post?.record?.createdAt || post?.indexedAt;
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

let lastShareText = "";

function buildShareText(phrase, post) {
  const handle = post?.author?.handle ? "@" + post.author.handle : "someone";
  return `${handle} called dibs on "${phrase}" first, on ${formatWhen(post)}.\n\nwho said it first? → ${shareUrlFor(phrase)}`;
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

function wrapCanvasText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
  const words = text.split(" ");
  let line = "";
  let cy = y;
  let lines = 0;
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (line && ctx.measureText(test).width > maxWidth) {
      ctx.fillText(line, x, cy);
      line = w;
      cy += lineHeight;
      lines++;
      if (maxLines && lines >= maxLines - 1) {
        ctx.fillText(line + "…", x, cy);
        return cy;
      }
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, cy);
  return cy;
}

async function buildShareCard(phrase, post) {
  const canvas = els.shareCanvas;
  const ctx = canvas.getContext("2d");
  const W = canvas.width,
    H = canvas.height;
  const mono = "ui-monospace, monospace";
  const avatarUrl = post?.author?.avatar
    ? "/api/avatar?u=" + encodeURIComponent(post.author.avatar)
    : "";
  const avatar = await loadImg(avatarUrl);

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#0b0d10";
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W * 0.5, -H * 0.1, 0, W * 0.5, -H * 0.1, W * 0.6);
  glow.addColorStop(0, "#3a2f10");
  glow.addColorStop(1, "rgba(11,13,16,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = "left";
  ctx.fillStyle = "#f2c14e";
  ctx.font = `800 56px ${mono}`;
  ctx.fillText("dibs", 60, 100);

  ctx.strokeStyle = "#262b33";
  ctx.lineWidth = 1.5;
  const cardX = 60,
    cardY = 150,
    cardW = W - 120,
    cardH = H - 260;
  ctx.fillStyle = "#14171c";
  ctx.beginPath();
  ctx.roundRect(cardX, cardY, cardW, cardH, 18);
  ctx.fill();
  ctx.stroke();

  const who = "@" + (post?.author?.handle || "unknown");
  let textX = cardX + 40;
  if (avatar) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cardX + 68, cardY + 64, 28, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(avatar, cardX + 40, cardY + 36, 56, 56);
    ctx.restore();
    textX = cardX + 112;
  }
  ctx.fillStyle = "#f2f4f6";
  ctx.font = `700 26px ${mono}`;
  ctx.fillText(who, textX, cardY + 60);
  ctx.fillStyle = "#8d97a3";
  ctx.font = `400 16px ${mono}`;
  ctx.fillText(formatWhen(post) || "", textX, cardY + 84);

  ctx.fillStyle = "#f2c14e";
  ctx.fillRect(cardX + 40, cardY + 130, 4, 60);
  ctx.fillStyle = "#f2f4f6";
  ctx.font = `400 22px ${mono}`;
  wrapCanvasText(ctx, `"${post?.record?.text || phrase}"`, cardX + 60, cardY + 156, cardW - 120, 30, 4);

  ctx.fillStyle = "#8d97a3";
  ctx.font = `700 15px ${mono}`;
  ctx.fillText(`FIRST TO SAY "${phrase.toUpperCase()}"`, cardX + 40, cardY + cardH - 30);

  ctx.textAlign = "left";
  ctx.fillStyle = "#f2c14e";
  ctx.font = `700 20px ${mono}`;
  ctx.fillText("dibs.bisks.net", 60, H - 40);
}

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
    els.shareCanvas.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], "dibs.png", { type: "image/png" });
      try {
        await navigator.share({ files: [file], text: lastShareText, title: "dibs" });
      } catch (_) {
        // cancelled or unsupported — no-op
      }
    }, "image/png");
  });
}
els.shareDownload.addEventListener("click", () => {
  els.shareCanvas.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "dibs.png";
    a.click();
    URL.revokeObjectURL(a.href);
  }, "image/png");
});

async function showResult(phrase, res) {
  const { first, count, exhausted } = res;

  if (!first) {
    els.result.classList.remove("show");
    els.empty.classList.add("show");
    els.claimLink.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(phrase);
    return;
  }

  els.empty.classList.remove("show");
  els.kicker.textContent = "first spotted";
  els.avatar.src = first.author?.avatar || "";
  els.avatar.style.visibility = first.author?.avatar ? "visible" : "hidden";
  els.displayName.textContent = first.author?.displayName || first.author?.handle || "someone";
  els.handleLink.textContent = "@" + (first.author?.handle || "unknown");
  els.handleLink.href = "https://bsky.app/profile/" + (first.author?.handle || "");
  els.quote.innerHTML = highlightPhrase(first.record?.text || "", phrase);
  els.when.textContent = formatWhen(first);
  els.count.textContent = count === 1 ? "only known sighting" : `${count}${exhausted ? "" : "+"} sightings found`;
  els.caveat.textContent = exhausted
    ? "Paged all the way back to the beginning of what Bluesky's search index has — this is the earliest it can find."
    : "The scan stopped early (rate limit or a very common phrase) — this is the earliest found so far, not confirmed as the true first.";
  els.permalink.href = postUrl(first);

  lastShareText = buildShareText(phrase, first);
  els.shareBluesky.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(lastShareText);
  await buildShareCard(phrase, first);

  els.result.classList.add("show");
}

async function run(rawPhrase) {
  const phrase = rawPhrase.trim();
  if (!phrase) {
    setStatus("type a phrase first.", true);
    return;
  }
  if (phrase.length < MIN_PHRASE_LEN) {
    setStatus(`try a slightly longer phrase (${MIN_PHRASE_LEN}+ characters) — anything shorter matches too much to ever finish scanning.`, true);
    return;
  }

  els.result.classList.remove("show");
  els.empty.classList.remove("show");
  els.go.disabled = true;
  els.cancel.style.display = "";
  controller = new AbortController();

  try {
    const res = await findFirst(phrase, {
      signal: controller.signal,
      onPage: (s) => {
        const soFar = s.oldest ? ` — earliest so far: ${formatWhen(s.oldest)}` : "";
        setStatus(`scanning page ${s.page}... ${s.count} match${s.count === 1 ? "" : "es"} found${soFar}`);
      },
    });
    setStatus("");
    await showResult(phrase, res);
    history.replaceState(null, "", "/s/" + encodeURIComponent(phrase));
  } catch (err) {
    setStatus("search failed: " + (err?.message || err), true);
  } finally {
    els.go.disabled = false;
    els.cancel.style.display = "none";
    controller = null;
  }
}

els.form.addEventListener("submit", (e) => {
  e.preventDefault();
  run(els.phrase.value);
});

els.cancel.addEventListener("click", () => {
  if (controller) controller.abort();
});

// If we arrived at /s/<phrase> (a shared link), prefill and run immediately.
const shareMatch = location.pathname.match(/^\/s\/([^/]+)\/?$/);
if (shareMatch) {
  const phrase = decodeURIComponent(shareMatch[1]);
  els.phrase.value = phrase;
  run(phrase);
}
