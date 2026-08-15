import {
  login,
  completeLoginIfCallback,
  getSession,
  clearSession,
} from "./lib/oauth.js";
import { firePost, uploadImage, TAG } from "./lib/post.js";
import {
  encryptText,
  decryptText,
  encryptBytes,
  decryptBytes,
  bytesToBase64,
  base64ToBytes,
} from "./lib/crypto.js";
import {
  embedInCanvas,
  extractFromCanvas,
  makeCoverCanvas,
  loadImageToCanvas,
  canvasToPngBlob,
} from "./lib/stego.js";

const $ = (id) => document.getElementById(id);

let session = null;
let mode = "text";
let pending = null; // { mode, text, blob?, width?, height? }

function setStatus(el, msg, cls) {
  el.textContent = msg;
  el.className = "status" + (cls ? ` ${cls}` : "");
}

function renderAuth() {
  if (session) {
    $("loggedOut").classList.add("hidden");
    $("loggedIn").classList.remove("hidden");
    $("whoAmI").textContent = "@" + session.handle;
  } else {
    $("loggedOut").classList.remove("hidden");
    $("loggedIn").classList.add("hidden");
  }
}

async function boot() {
  try {
    const cb = await completeLoginIfCallback();
    if (cb) session = cb;
  } catch (e) {
    setStatus($("authStatus"), `login failed: ${e.message}`, "err");
  }
  if (!session) session = await getSession();
  renderAuth();
}
boot();

$("loginBtn").addEventListener("click", async () => {
  const handle = $("handleInput").value.trim();
  if (!handle) return setStatus($("authStatus"), "enter a handle first", "err");
  setStatus($("authStatus"), "redirecting to your PDS…", "pending");
  try {
    await login(handle);
  } catch (e) {
    setStatus($("authStatus"), e.message, "err");
  }
});

$("logoutBtn").addEventListener("click", async () => {
  await clearSession();
  session = null;
  renderAuth();
});

// --- mode toggle ---------------------------------------------------------

function setMode(m) {
  mode = m;
  $("modeTextBtn").classList.toggle("active", m === "text");
  $("modeImageBtn").classList.toggle("active", m === "image");
  $("imageOptions").classList.toggle("hidden", m !== "image");
  resetPreview();
}
$("modeTextBtn").addEventListener("click", () => setMode("text"));
$("modeImageBtn").addEventListener("click", () => setMode("image"));

function resetPreview() {
  pending = null;
  $("textPreview").classList.add("hidden");
  $("imagePreview").classList.add("hidden");
  $("postBtn").classList.add("hidden");
  setStatus($("encodeStatus"), "", "");
  setStatus($("postStatus"), "", "");
}

// --- encode ---------------------------------------------------------------

const MAX_GRAPHEMES = 300;
function graphemeLen(s) {
  return Array.from(s).length;
}

$("encodeBtn").addEventListener("click", async () => {
  resetPreview();
  const secret = $("secretInput").value;
  const pass = $("passInput").value;
  if (!secret) return setStatus($("encodeStatus"), "enter a message to hide", "err");
  if (!pass) return setStatus($("encodeStatus"), "enter a passphrase", "err");

  setStatus($("encodeStatus"), "encrypting…", "pending");
  try {
    if (mode === "text") {
      const cipherBytes = await encryptText(secret, pass);
      const b64 = bytesToBase64(cipherBytes);
      const text = `🕶️ #${TAG}\n${b64}`;
      if (graphemeLen(text) > MAX_GRAPHEMES) {
        return setStatus(
          $("encodeStatus"),
          `too long for one post (${graphemeLen(text)}/${MAX_GRAPHEMES} — shorten the message)`,
          "err",
        );
      }
      $("cipherBlob").textContent = text;
      $("textPreview").classList.remove("hidden");
      pending = { mode: "text", text };
      setStatus($("encodeStatus"), "encoded. review, then post.", "ok");
    } else {
      const cipherBytes = await encryptBytes(secret, pass);
      const coverFile = $("coverInput").files[0];
      let canvas;
      if (coverFile) {
        canvas = await loadImageToCanvas(coverFile);
      } else {
        canvas = makeCoverCanvas(cipherBytes.length);
      }
      embedInCanvas(canvas, cipherBytes);
      const blob = await canvasToPngBlob(canvas);
      const url = URL.createObjectURL(blob);
      $("coverPreviewImg").src = url;
      $("imagePreview").classList.remove("hidden");

      const caption = $("captionInput").value.trim() || "a shadow transmission";
      const text = `${caption} #${TAG}`.trim();
      if (graphemeLen(text) > MAX_GRAPHEMES) {
        return setStatus($("encodeStatus"), "caption too long", "err");
      }
      pending = { mode: "image", text, blob, width: canvas.width, height: canvas.height };
      setStatus($("encodeStatus"), "hidden in the image. review, then post.", "ok");
    }
    $("postBtn").classList.remove("hidden");
  } catch (e) {
    setStatus($("encodeStatus"), e.message, "err");
  }
});

// --- post ------------------------------------------------------------------

$("postBtn").addEventListener("click", async () => {
  if (!pending) return;
  if (!session) return setStatus($("postStatus"), "sign in first", "err");
  setStatus($("postStatus"), "posting…", "pending");
  $("postBtn").disabled = true;
  try {
    let result;
    if (pending.mode === "text") {
      result = await firePost(session, { text: pending.text });
    } else {
      const bytes = new Uint8Array(await pending.blob.arrayBuffer());
      const image = await uploadImage(session, bytes, "image/png");
      result = await firePost(session, {
        text: pending.text,
        image: { blob: image, width: pending.width, height: pending.height },
      });
    }
    const rkey = result.uri.split("/").pop();
    const permalink = `https://bsky.app/profile/${session.handle}/post/${rkey}`;
    setStatus(
      $("postStatus"),
      `posted. `,
      "ok",
    );
    const a = document.createElement("a");
    a.href = permalink;
    a.textContent = "view on bluesky →";
    a.target = "_blank";
    a.rel = "noopener";
    $("postStatus").appendChild(a);
  } catch (e) {
    setStatus($("postStatus"), e.message, "err");
  } finally {
    $("postBtn").disabled = false;
  }
});

// --- decode ------------------------------------------------------------------

function extractBase64(text) {
  const matches = text.match(/[A-Za-z0-9+/]{20,}={0,2}/g);
  if (!matches || !matches.length) return null;
  return matches.reduce((a, b) => (b.length > a.length ? b : a));
}

$("decodeMode").addEventListener("change", () => {
  const isImage = $("decodeMode").value === "image";
  $("decodeTextWrap").classList.toggle("hidden", isImage);
  $("decodeImageWrap").classList.toggle("hidden", !isImage);
});

$("decodeBtn").addEventListener("click", async () => {
  const pass = $("decodePassInput").value;
  $("decodedText").classList.add("hidden");
  if (!pass) return setStatus($("decodeStatus"), "enter the passphrase", "err");

  setStatus($("decodeStatus"), "decoding…", "pending");
  try {
    let plaintext;
    if ($("decodeMode").value === "text") {
      const raw = $("decodeTextInput").value;
      const b64 = extractBase64(raw);
      if (!b64) throw new Error("couldn't find a cipher blob in that text");
      plaintext = await decryptText(base64ToBytes(b64), pass);
    } else {
      const file = $("decodeImageInput").files[0];
      if (!file) throw new Error("choose an image file first");
      const canvas = await loadImageToCanvas(file);
      const payload = extractFromCanvas(canvas);
      plaintext = new TextDecoder().decode(await decryptBytes(payload, pass));
    }
    $("decodedText").textContent = plaintext;
    $("decodedText").classList.remove("hidden");
    setStatus($("decodeStatus"), "decoded.", "ok");
  } catch (e) {
    setStatus(
      $("decodeStatus"),
      /decrypt|tag|operation-specific/i.test(e.message)
        ? "wrong passphrase (or not a Shadow Simcluster cipher)"
        : e.message,
      "err",
    );
  }
});

setMode("text");
