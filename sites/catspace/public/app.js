// app.js — catspace editor: login, profile form, and save to the owner's PDS.

import { login, completeLoginIfCallback, getSession, clearSession } from "./lib/oauth.js";
import { uploadImage } from "./lib/blob.js";
import { getMyProfile, saveProfile } from "./lib/records.js";
import { initSparkles } from "./lib/sparkles.js";

export const THEMES = [
  { id: "bubblegum", label: "bubblegum" },
  { id: "midnight-disco", label: "midnight disco" },
  { id: "matrix-kitten", label: "matrix kitten" },
  { id: "static-tv", label: "static tv" },
  { id: "cosmic-cat", label: "cosmic cat" },
  { id: "cheddar", label: "cheddar" },
];
const DEFAULT_THEME = "bubblegum";

const els = {
  loggedOut: document.getElementById("loggedOut"),
  loggedIn: document.getElementById("loggedIn"),
  successCard: document.getElementById("successCard"),
  loginForm: document.getElementById("loginForm"),
  handleInput: document.getElementById("handleInput"),
  loginError: document.getElementById("loginError"),
  logoutBtn: document.getElementById("logoutBtn"),
  whoami: document.getElementById("whoami"),
  editorForm: document.getElementById("editorForm"),
  catName: document.getElementById("catName"),
  photoInput: document.getElementById("photoInput"),
  photoPreview: document.getElementById("photoPreview"),
  moodSelect: document.getElementById("moodSelect"),
  bioInput: document.getElementById("bioInput"),
  songInput: document.getElementById("songInput"),
  themePicker: document.getElementById("themePicker"),
  top8Fields: document.getElementById("top8Fields"),
  saveBtn: document.getElementById("saveBtn"),
  saveStatus: document.getElementById("saveStatus"),
  myProfileLink: document.getElementById("myProfileLink"),
  shareBtn: document.getElementById("shareBtn"),
  viewBtn: document.getElementById("viewBtn"),
};

let session = null;
let selectedTheme = DEFAULT_THEME;
let pendingPhotoBlob = null; // { $type, ref, mimeType, size } once uploaded

function show(el) {
  el.classList.remove("hidden");
}
function hide(el) {
  el.classList.add("hidden");
}

function buildThemePicker() {
  els.themePicker.innerHTML = "";
  for (const t of THEMES) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "swatch swatch-" + t.id;
    b.dataset.theme = t.id;
    b.title = t.label;
    b.textContent = t.label;
    b.addEventListener("click", () => {
      selectedTheme = t.id;
      [...els.themePicker.children].forEach((c) => c.classList.toggle("selected", c.dataset.theme === t.id));
      document.body.dataset.theme = t.id;
    });
    els.themePicker.appendChild(b);
  }
}

function buildTop8Fields(values = []) {
  els.top8Fields.innerHTML = "";
  for (let i = 0; i < 8; i++) {
    const input = document.createElement("input");
    input.type = "text";
    input.maxLength = 60;
    input.placeholder = `#${i + 1} handle.bsky.social`;
    input.className = "top8-input";
    input.value = values[i] || "";
    els.top8Fields.appendChild(input);
  }
}
function readTop8() {
  return [...els.top8Fields.querySelectorAll(".top8-input")]
    .map((i) => i.value.trim().replace(/^@/, ""))
    .filter(Boolean)
    .slice(0, 8);
}

function selectTheme(id) {
  selectedTheme = THEMES.some((t) => t.id === id) ? id : DEFAULT_THEME;
  document.body.dataset.theme = selectedTheme;
  [...els.themePicker.children].forEach((c) => c.classList.toggle("selected", c.dataset.theme === selectedTheme));
}

async function refreshUi() {
  if (!session) {
    hide(els.loggedIn);
    hide(els.successCard);
    show(els.loggedOut);
    els.whoami.textContent = "";
    return;
  }
  hide(els.loggedOut);
  show(els.loggedIn);
  els.whoami.textContent = `signed in as @${session.handle}`;

  els.saveStatus.textContent = "loading your cat…";
  let existing = null;
  try {
    existing = await getMyProfile(session);
  } catch {}
  els.saveStatus.textContent = "";

  const p = existing?.value;
  els.catName.value = p?.catName || "";
  els.moodSelect.value = p?.mood || "Purring";
  els.bioInput.value = p?.bio || "";
  els.songInput.value = p?.song || "";
  buildTop8Fields(p?.top8 || []);
  selectTheme(p?.theme || DEFAULT_THEME);

  if (p?.photo) {
    pendingPhotoBlob = p.photo;
    const cid = p.photo.ref?.$link || p.photo.ref?.toString?.();
    if (cid) {
      els.photoPreview.src = `${session.pdsUrl.replace(/\/$/, "")}/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(session.did)}&cid=${encodeURIComponent(cid)}`;
      show(els.photoPreview);
    }
  } else {
    pendingPhotoBlob = null;
    hide(els.photoPreview);
  }

  if (p?.catName) {
    showSuccess();
  }
}

function showSuccess() {
  const url = `https://catspace.bisks.net/cat/${encodeURIComponent(session.handle)}`;
  els.myProfileLink.href = url;
  els.myProfileLink.textContent = url;
  els.viewBtn.href = url;
  const shareText = `${els.catName.value || "my cat"} now has a catspace page 🐱✨ ${url}`;
  els.shareBtn.href = `https://bsky.app/intent/compose?text=${encodeURIComponent(shareText)}`;
  show(els.successCard);
}

els.loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  hide(els.loginError);
  const handle = els.handleInput.value.trim().replace(/^@/, "");
  if (!handle) return;
  try {
    await login(handle);
  } catch (err) {
    els.loginError.textContent = err.message || "couldn't start sign-in";
    show(els.loginError);
  }
});

els.logoutBtn.addEventListener("click", async () => {
  await clearSession();
  session = null;
  refreshUi();
});

els.photoInput.addEventListener("change", async () => {
  const file = els.photoInput.files?.[0];
  if (!file || !session) return;
  els.saveStatus.textContent = "uploading photo…";
  try {
    const bytes = await file.arrayBuffer();
    pendingPhotoBlob = await uploadImage(session, bytes, file.type || "image/jpeg");
    els.photoPreview.src = URL.createObjectURL(file);
    show(els.photoPreview);
    els.saveStatus.textContent = "photo uploaded — don't forget to save.";
  } catch (err) {
    els.saveStatus.textContent = `photo upload failed: ${err.message}`;
  }
});

els.editorForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!session) return;
  els.saveBtn.disabled = true;
  els.saveStatus.textContent = "saving…";
  try {
    const profile = {
      catName: els.catName.value.trim().slice(0, 40) || "Unnamed Cat",
      mood: els.moodSelect.value,
      bio: els.bioInput.value.trim().slice(0, 500),
      song: els.songInput.value.trim().slice(0, 80),
      theme: selectedTheme,
      top8: readTop8(),
      updatedAt: new Date().toISOString(),
    };
    if (pendingPhotoBlob) profile.photo = pendingPhotoBlob;
    await saveProfile(session, profile);
    els.saveStatus.textContent = "saved!";
    showSuccess();
  } catch (err) {
    els.saveStatus.textContent = `save failed: ${err.message}`;
  } finally {
    els.saveBtn.disabled = false;
  }
});

async function init() {
  buildThemePicker();
  buildTop8Fields();
  initSparkles();
  try {
    const cb = await completeLoginIfCallback();
    if (cb) session = cb;
  } catch (err) {
    els.loginError.textContent = err.message;
    show(els.loginError);
  }
  if (!session) session = await getSession();
  await refreshUi();
}

init();
