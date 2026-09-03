// upload.js — sign in, pick a bookshelf photo, upload it as a blob, and save
// a net.bisks.shelfguessr.shelf "self" record pointing at it.

import { getSession, clearSession, completeLoginIfCallback, login } from "./lib/oauth.js";
import { uploadImage } from "./lib/blob.js";
import { getMyShelf, saveShelf } from "./lib/records.js";
import { resolvePds } from "./lib/oauth.js";

const els = {
  sessionBar: document.getElementById("sessionBar"),
  signedOutCard: document.getElementById("signedOutCard"),
  uploadCard: document.getElementById("uploadCard"),
  photoInput: document.getElementById("photoInput"),
  preview: document.getElementById("preview"),
  captionInput: document.getElementById("captionInput"),
  saveBtn: document.getElementById("saveBtn"),
  uploadStatus: document.getElementById("uploadStatus"),
  uploadErr: document.getElementById("uploadErr"),
};

let session = null;
let pickedFile = null;

function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function blobUrl(pdsUrl, did, blob) {
  const cid = blob?.ref?.$link || blob?.ref?.toString?.();
  if (!cid || !pdsUrl) return null;
  const params = new URLSearchParams({ did, cid });
  return `${pdsUrl.replace(/\/$/, "")}/xrpc/com.atproto.sync.getBlob?${params}`;
}

function renderSessionBar() {
  if (session) {
    els.sessionBar.innerHTML = `
      <span>signed in as <strong>@${esc(session.handle)}</strong></span>
      <button id="signOutBtn">sign out</button>
    `;
    document.getElementById("signOutBtn").onclick = async () => {
      await clearSession();
      session = null;
      renderSessionBar();
      showSignedOut();
    };
    showSignedIn();
  } else {
    els.sessionBar.innerHTML = "";
    showSignedOut();
  }
}

function showSignedOut() {
  els.signedOutCard.style.display = "block";
  els.uploadCard.style.display = "none";
  document.getElementById("signInBtnUp").onclick = async () => {
    const h = document.getElementById("loginHandleUp").value.trim();
    if (!h) return;
    try {
      await login(h);
    } catch (err) {
      alert(`sign in failed: ${err.message}`);
    }
  };
}

async function showSignedIn() {
  els.signedOutCard.style.display = "none";
  els.uploadCard.style.display = "block";
  try {
    const existing = await getMyShelf(session);
    if (existing?.value) {
      const pdsUrl = await resolvePds(session.did);
      const src = blobUrl(pdsUrl, session.did, existing.value.photo);
      if (src) {
        els.preview.src = src;
        els.preview.style.display = "block";
      }
      if (existing.value.caption) els.captionInput.value = existing.value.caption;
      els.uploadStatus.textContent = "you already have a shelf up — pick a new photo to replace it.";
    }
  } catch {
    // no existing shelf yet; nothing to prefill
  }
}

els.photoInput.addEventListener("change", () => {
  const file = els.photoInput.files?.[0];
  pickedFile = file || null;
  els.saveBtn.disabled = !pickedFile;
  if (pickedFile) {
    const reader = new FileReader();
    reader.onload = () => {
      els.preview.src = reader.result;
      els.preview.style.display = "block";
    };
    reader.readAsDataURL(pickedFile);
  }
});

els.saveBtn.addEventListener("click", async () => {
  if (!pickedFile || !session) return;
  els.uploadErr.style.display = "none";
  els.saveBtn.disabled = true;
  try {
    els.uploadStatus.textContent = "uploading photo…";
    const bytes = new Uint8Array(await pickedFile.arrayBuffer());
    const blob = await uploadImage(session, bytes, pickedFile.type || "image/jpeg");
    els.uploadStatus.textContent = "saving shelf record…";
    await saveShelf(session, { photo: blob, caption: els.captionInput.value.trim() });
    els.uploadStatus.textContent = "your shelf is live! ";
    els.uploadStatus.innerHTML = `your shelf is live — <a href="/">go play →</a>`;
  } catch (err) {
    els.uploadErr.textContent = err.message || String(err);
    els.uploadErr.style.display = "block";
    els.uploadStatus.textContent = "";
  } finally {
    els.saveBtn.disabled = false;
  }
});

(async function boot() {
  try {
    const cb = await completeLoginIfCallback();
    if (cb) session = cb;
  } catch (err) {
    console.warn("oauth callback failed", err);
  }
  if (!session) session = await getSession();
  renderSessionBar();
})();
