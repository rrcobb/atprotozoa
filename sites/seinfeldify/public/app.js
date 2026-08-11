import { resolveDid, jget } from "./lib/identity.js";
import { scanAllPosts } from "./lib/posts.js";
import { sampleForAnalysis, analyze } from "./lib/analyze.js";
import { encodeCard } from "./lib/card.js";
import { charMeta } from "./lib/characters.js";

if (window.attachHandleTypeahead) window.attachHandleTypeahead(document.getElementById("handle"));

const PUB = "https://api.bsky.app/xrpc";

const els = {
  form: document.getElementById("form"),
  handle: document.getElementById("handle"),
  go: document.getElementById("go"),
  status: document.getElementById("status"),
  result: document.getElementById("result"),
  shareCanvas: document.getElementById("shareCanvas"),
};

function esc(s) {
  return (s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function setStatus(msg, isError) {
  els.status.textContent = msg || "";
  els.status.classList.toggle("error", !!isError);
}

async function getProfile(did) {
  return jget(`${PUB}/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`);
}

function evidenceHtml(e) {
  return `<li><p>"${esc(e.text)}"</p><span>${esc(e.note)}</span> <a class="cite" href="${esc(e.permalink)}" target="_blank" rel="noopener">view post ↗</a></li>`;
}

function shareTextFor(card, shareUrl) {
  return `AI says my Bluesky posts read like ${card.character}: ${card.tagline}\n\nseinfeldify yourself → ${shareUrl}`;
}

function renderResult(card, shareUrl) {
  const meta = charMeta(card.character);
  const evidenceBlock = card.evidence.length
    ? `<section><h2>the receipts</h2><ul class="evidence">${card.evidence.map(evidenceHtml).join("")}</ul></section>`
    : "";
  const scanNote =
    card.method === "car"
      ? `every post in their repo (${card.totalPostCount}), sampled down to ${card.postCount} for the AI`
      : `their last ${card.totalPostCount} posts (full-repo scan wasn't available), sampled down to ${card.postCount} for the AI`;

  const text = shareTextFor(card, shareUrl);
  const blueskyHref = "https://bsky.app/intent/compose?text=" + encodeURIComponent(text.slice(0, 300));

  els.result.innerHTML = `
    <div class="verdict-card" style="--accent: ${meta.color}">
      <p class="verdict-label">the verdict for @${esc(card.handle)}</p>
      <h1 class="verdict">${meta.emoji} ${esc(card.character)}</h1>
      <p class="tagline-big">${esc(card.tagline)}</p>
      <p class="reasoning">${esc(card.reasoning)}</p>
      ${card.runnerUp ? `<p class="runner-up">runner-up: <strong>${esc(card.runnerUp)}</strong></p>` : ""}
    </div>
    ${evidenceBlock}
    <p class="meta">scanned ${esc(scanNote)}</p>
    <div class="share-row">
      <a class="build-own" href="${esc(shareUrl)}">${esc(shareUrl.replace(/^https?:\/\//, ""))}</a>
      <button id="copyLink" type="button" class="secondary">copy link</button>
      <a id="shareBluesky" href="${blueskyHref}" target="_blank" rel="noopener"><button type="button">share on Bluesky</button></a>
      <button id="shareNative" type="button" class="secondary" style="display:none">share image</button>
      <a id="shareDownload" download="seinfeldify-${esc(card.handle)}.png"><button type="button" class="secondary">download card</button></a>
    </div>
  `;

  document.getElementById("copyLink").addEventListener("click", async () => {
    const btn = document.getElementById("copyLink");
    try {
      await navigator.clipboard.writeText(shareUrl);
      btn.textContent = "copied!";
      setTimeout(() => (btn.textContent = "copy link"), 1500);
    } catch {
      setStatus("couldn't copy — select and copy the link above", true);
    }
  });

  buildShareCard(card, meta, text);
}

// ---- share card (canvas) ----------------------------------------------
// See notes/45-sharing-and-virality.md tier 3: draw a downloadable/shareable
// result image client-side, hand it to the OS share sheet where supported.

function wrapCanvasText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
  const words = (text || "").split(" ");
  let line = "";
  let lines = 0;
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, y);
      line = w;
      y += lineHeight;
      lines++;
      if (maxLines && lines >= maxLines - 1) {
        ctx.fillText(line + "…", x, y);
        return y + lineHeight;
      }
    } else {
      line = test;
    }
  }
  if (line) {
    ctx.fillText(line, x, y);
    y += lineHeight;
  }
  return y;
}

function buildShareCard(card, meta, text) {
  const canvas = els.shareCanvas;
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  const mono = "ui-monospace, monospace";

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#fdf6e3";
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = meta.color;
  ctx.fillRect(0, 0, W, 14);

  ctx.textAlign = "left";
  ctx.fillStyle = "#1a1a1a";
  ctx.font = `800 44px ${mono}`;
  ctx.fillText("seinfeldify", 60, 100);

  ctx.fillStyle = "#6b6b6b";
  ctx.font = `20px ${mono}`;
  ctx.fillText(`@${card.handle}`, 60, 140);

  ctx.textAlign = "center";
  ctx.font = `120px sans-serif`;
  ctx.fillText(meta.emoji, W / 2, 300);

  ctx.fillStyle = meta.color;
  ctx.font = `800 56px ${mono}`;
  ctx.fillText(card.character, W / 2, 380);

  ctx.fillStyle = "#1a1a1a";
  ctx.font = `italic 24px ${mono}`;
  wrapCanvasText(ctx, `"${card.tagline}"`, W / 2, 430, W - 200, 32, 2);

  ctx.fillStyle = "#1a1a1a";
  ctx.font = `18px ${mono}`;
  ctx.textAlign = "left";
  wrapCanvasText(ctx, card.reasoning, 80, 520, W - 160, 26, 3);

  ctx.fillStyle = "#6b6b6b";
  ctx.font = `600 20px ${mono}`;
  ctx.fillText("seinfeldify.bisks.net", 60, H - 40);

  document.getElementById("shareDownload").href = canvas.toDataURL("image/png");

  function canShareFiles() {
    if (!navigator.share || !navigator.canShare) return false;
    try {
      const probe = new File([""], "probe.png", { type: "image/png" });
      return navigator.canShare({ files: [probe] });
    } catch {
      return false;
    }
  }

  if (canShareFiles()) {
    const shareBtn = document.getElementById("shareNative");
    shareBtn.style.display = "";
    shareBtn.addEventListener("click", () => {
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        const file = new File([blob], `seinfeldify-${card.handle}.png`, { type: "image/png" });
        try {
          await navigator.share({ files: [file], text, title: "seinfeldify" });
        } catch {
          // user cancelled the share sheet, or it failed silently — no-op
        }
      }, "image/png");
    });
  }
}

// ---- run ------------------------------------------------------------------

async function run(rawHandle) {
  els.go.disabled = true;
  els.result.innerHTML = "";
  try {
    setStatus("resolving handle…");
    const did = await resolveDid(rawHandle);
    const profile = await getProfile(did);
    const handle = profile.handle || rawHandle;

    const onProgress = (msg) => setStatus(msg);
    setStatus("downloading their repo…");
    const { posts, method } = await scanAllPosts(did, handle, onProgress);
    if (!posts.length) throw new Error("couldn't find any posts to judge");

    const sample = sampleForAnalysis(posts);
    setStatus(`read ${posts.length} posts — asking the AI about ${sample.length} of them…`);

    const verdict = await analyze(sample);

    const card = {
      v: 1,
      handle,
      postCount: sample.length,
      totalPostCount: posts.length,
      method,
      character: verdict.character,
      tagline: verdict.tagline,
      reasoning: verdict.reasoning,
      runnerUp: verdict.runnerUp,
      evidence: verdict.evidence,
      generatedAt: new Date().toISOString(),
    };

    const code = encodeCard(card);
    const shareUrl = `${location.origin}/c/${code}`;

    setStatus("");
    renderResult(card, shareUrl);
    history.replaceState(null, "", `/c/${code}`);
  } catch (err) {
    setStatus(err.message || String(err), true);
  } finally {
    els.go.disabled = false;
  }
}

els.form.addEventListener("submit", (e) => {
  e.preventDefault();
  const val = els.handle.value.trim();
  if (!val) return setStatus("enter a handle first", true);
  run(val);
});
