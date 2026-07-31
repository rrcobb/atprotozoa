import { loadThread } from "./lib/thread.js";
import { distill } from "./lib/distill.js";
import { encodeCard } from "./lib/card.js";

const MOUNT = location.pathname.startsWith("/thread-heirloom") ? "/thread-heirloom" : "";

const els = {
  form: document.getElementById("form"),
  url: document.getElementById("url"),
  go: document.getElementById("go"),
  status: document.getElementById("status"),
  result: document.getElementById("result"),
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

function citeHtml(c) {
  if (!c) return "";
  return ` <a class="cite" href="${esc(c.permalink)}" target="_blank" rel="noopener">— @${esc(c.handle)}</a>`;
}

function renderCard(card, shareUrl) {
  const referentsHtml = card.referents.length
    ? `<section><h2>named</h2><ul class="referents">${card.referents
        .map((r) => `<li><strong>${esc(r.name)}</strong><span>${esc(r.note)}</span></li>`)
        .join("")}</ul></section>`
    : "";

  const claimsHtml = card.claims.length
    ? `<section><h2>claims</h2><ol class="claims">${card.claims
        .map((c) => `<li>${esc(c.text)}${citeHtml(c.cite)}</li>`)
        .join("")}</ol></section>`
    : "";

  const disagreementHtml = card.disagreement
    ? `<section><h2>strongest disagreement</h2><p>${esc(card.disagreement.summary)}</p><div class="sides"><div>${citeHtml(
        card.disagreement.a,
      )}</div><div>${citeHtml(card.disagreement.b)}</div></div></section>`
    : "";

  const unresolvedHtml = card.unresolved
    ? `<section><h2>unresolved</h2><p>${esc(card.unresolved.text)}${citeHtml(card.unresolved.cite)}</p></section>`
    : "";

  const shareText = `Distilled a Bluesky thread into a context card: ${card.claims[0]?.text || "named referents, claims, and the unresolved question"} ${shareUrl}`;
  const blueskyHref = "https://bsky.app/intent/compose?text=" + encodeURIComponent(shareText.slice(0, 300));

  els.result.innerHTML = `
    <p class="meta">${card.postCount} posts · ${card.participantCount} voices${card.truncated ? " · truncated to the first 90 posts" : ""} · <a href="${esc(card.root)}" target="_blank" rel="noopener">original thread ↗</a></p>
    ${referentsHtml}
    ${claimsHtml}
    ${disagreementHtml}
    ${unresolvedHtml}
    <div class="share-row">
      <a class="build-own" href="${esc(shareUrl)}">${esc(shareUrl.replace(/^https?:\/\//, ""))}</a>
      <button id="copyLink" type="button" class="secondary">copy link</button>
      <a id="shareBluesky" href="${blueskyHref}" target="_blank" rel="noopener"><button type="button">share on Bluesky</button></a>
    </div>
    <p class="examples">This card is baked into its own URL — no database — so it reads the same even if the thread above goes away.</p>
  `;

  const copyBtn = document.getElementById("copyLink");
  copyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      copyBtn.textContent = "copied!";
      setTimeout(() => (copyBtn.textContent = "copy link"), 1500);
    } catch {
      setStatus("couldn't copy — select and copy the link above", true);
    }
  });
}

async function run(input) {
  els.go.disabled = true;
  els.result.innerHTML = "";
  try {
    setStatus("reading the thread…");
    const { posts, participantCount, truncated, rootPermalink } = await loadThread(input);

    setStatus(`read ${posts.length} posts, ${participantCount} voices — reading between the lines…`);
    const distilled = await distill(MOUNT, posts);

    const card = {
      v: 1,
      root: rootPermalink,
      postCount: posts.length,
      participantCount,
      truncated,
      generatedAt: new Date().toISOString(),
      ...distilled,
    };

    const code = encodeCard(card);
    const shareUrl = `${location.origin}${MOUNT}/c/${code}`;

    setStatus("");
    renderCard(card, shareUrl);
    history.replaceState(null, "", `${MOUNT}/c/${code}`);
  } catch (err) {
    setStatus(err.message || String(err), true);
  } finally {
    els.go.disabled = false;
  }
}

els.form.addEventListener("submit", (e) => {
  e.preventDefault();
  const val = els.url.value.trim();
  if (!val) return setStatus("paste a thread URL first", true);
  run(val);
});
