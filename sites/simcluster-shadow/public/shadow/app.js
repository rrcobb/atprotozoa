import { getSession } from "../lib/oauth.js";
import { moots } from "../lib/moots.js";
import { scanShadowPosts, postUrl } from "../lib/search.js";
import { decryptText, decryptBytes, base64ToBytes } from "../lib/crypto.js";
import { extractFromCanvas, loadImageToCanvas } from "../lib/stego.js";
import { TAG } from "../lib/post.js";

const $ = (id) => document.getElementById(id);

function setStatus(el, msg, cls) {
  el.textContent = msg;
  el.className = "status" + (cls ? ` ${cls}` : "");
}

function extractBase64(text) {
  const matches = text.match(/[A-Za-z0-9+/]{20,}={0,2}/g);
  if (!matches || !matches.length) return null;
  return matches.reduce((a, b) => (b.length > a.length ? b : a));
}

async function boot() {
  const session = await getSession();
  if (session) $("actorInput").value = session.handle;
}
boot();

$("revealBtn").addEventListener("click", () => reveal());
$("actorInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") reveal();
});

async function reveal() {
  const actor = $("actorInput").value.trim();
  if (!actor) return setStatus($("revealStatus"), "enter a handle first", "err");

  $("resultsPanel").classList.add("hidden");
  $("results").innerHTML = "";
  setStatus($("revealStatus"), "mapping your simcluster…", "pending");

  let m;
  try {
    m = await moots(actor);
  } catch (e) {
    return setStatus($("revealStatus"), e.message, "err");
  }

  setStatus($("revealStatus"), `scanning for #${TAG} transmissions…`, "pending");
  const posts = await scanShadowPosts({ maxPages: 8 });

  const clusterDids = new Set([m.did, ...m.pool.map((p) => p.did)]);
  const clusterInfo = new Map(m.pool.map((p) => [p.did, p]));
  clusterInfo.set(m.did, m.self);

  const fromCluster = posts.filter((p) => clusterDids.has(p.author.did));

  if (!fromCluster.length) {
    setStatus(
      $("revealStatus"),
      `mapped ${m.pool.length} moots — none of them have posted a cipher yet. be the first.`,
      "ok",
    );
    return;
  }

  setStatus(
    $("revealStatus"),
    `${fromCluster.length} cipher${fromCluster.length === 1 ? "" : "s"} from ${new Set(fromCluster.map((p) => p.author.did)).size} of your ${m.pool.length} moots.`,
    "ok",
  );
  $("resultsPanel").classList.remove("hidden");
  render(fromCluster);
}

function render(posts) {
  const container = $("results");
  container.innerHTML = "";
  for (const p of posts) {
    const card = document.createElement("div");
    card.className = "post-card";

    const head = document.createElement("div");
    head.className = "head";
    head.innerHTML = `
      <img class="avatar" src="${p.author.avatar || ""}" alt="" onerror="this.style.visibility='hidden'" />
      <div>
        <div class="name">${escapeHtml(p.author.displayName || p.author.handle)}</div>
        <div class="handle">@${escapeHtml(p.author.handle)}</div>
      </div>
    `;
    card.appendChild(head);

    const text = document.createElement("div");
    text.className = "text";
    text.textContent = p.text;
    card.appendChild(text);

    const hasImage = !!p.embed?.images?.length;
    if (hasImage) {
      const img = document.createElement("img");
      img.className = "preview-img";
      img.src = p.embed.images[0].thumb || p.embed.images[0].fullsize;
      img.alt = p.embed.images[0].alt || "hidden cipher image";
      card.appendChild(img);
    }

    const link = document.createElement("a");
    link.className = "permalink";
    link.href = postUrl(p.uri);
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = "view on bluesky →";
    card.appendChild(link);

    // inline decode widget
    const decodeRow = document.createElement("div");
    decodeRow.className = "row";
    decodeRow.style.marginTop = "10px";
    const passInput = document.createElement("input");
    passInput.type = "password";
    passInput.placeholder = "passphrase";
    const decodeBtn = document.createElement("button");
    decodeBtn.className = "btn small";
    decodeBtn.textContent = "crack it";
    decodeRow.appendChild(passInput);
    decodeRow.appendChild(decodeBtn);
    card.appendChild(decodeRow);

    const decodeStatus = document.createElement("div");
    decodeStatus.className = "status";
    card.appendChild(decodeStatus);
    const decodedBox = document.createElement("div");
    decodedBox.className = "cipher-blob hidden";
    card.appendChild(decodedBox);

    decodeBtn.addEventListener("click", async () => {
      const pass = passInput.value;
      if (!pass) return setStatus(decodeStatus, "enter a passphrase", "err");
      setStatus(decodeStatus, "decoding…", "pending");
      decodedBox.classList.add("hidden");
      try {
        let plaintext;
        if (hasImage) {
          const fullsize = p.embed.images[0].fullsize;
          const res = await fetch(fullsize);
          if (!res.ok) throw new Error(`couldn't fetch the image (${res.status})`);
          const blob = await res.blob();
          const canvas = await loadImageToCanvas(blob);
          const payload = extractFromCanvas(canvas);
          plaintext = new TextDecoder().decode(await decryptBytes(payload, pass));
        } else {
          const b64 = extractBase64(p.text);
          if (!b64) throw new Error("no cipher blob found in this post");
          plaintext = await decryptText(base64ToBytes(b64), pass);
        }
        decodedBox.textContent = plaintext;
        decodedBox.classList.remove("hidden");
        setStatus(decodeStatus, "cracked.", "ok");
      } catch (e) {
        const msg = /decrypt|tag|operation-specific/i.test(e.message)
          ? "wrong passphrase"
          : /fetch|CORS|network/i.test(e.message)
            ? "couldn't load the image cross-origin — open it and re-download, then decode it on the home page"
            : e.message;
        setStatus(decodeStatus, msg, "err");
      }
    });

    container.appendChild(card);
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
}
