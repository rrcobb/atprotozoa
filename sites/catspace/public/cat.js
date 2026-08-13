// cat.js — guestbook interactivity for a rendered /cat/<handle> page.
// The profile fields themselves are server-rendered (src/index.ts); this
// only handles signing in (if needed) and posting a guestbook comment.

import { login, getSession } from "./lib/oauth.js";
import { postComment } from "./lib/records.js";
import { initSparkles } from "./lib/sparkles.js";

const card = document.getElementById("guestbookCard");
const subjectDid = card?.dataset.subject;

const els = {
  list: document.getElementById("guestbookList"),
  loginForm: document.getElementById("guestbookLoginForm"),
  handleInput: document.getElementById("guestbookHandleInput"),
  form: document.getElementById("guestbookForm"),
  input: document.getElementById("guestbookInput"),
  status: document.getElementById("guestbookStatus"),
};

function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function prependEntry(handle, text) {
  const row = document.createElement("p");
  row.className = "guestbook-entry";
  row.innerHTML = `<strong>@${esc(handle)}</strong>: ${esc(text)}`;
  const empty = els.list.querySelector(".empty");
  if (empty) empty.remove();
  els.list.prepend(row);
}

async function refreshLoginUi() {
  if (!subjectDid) return;
  const session = await getSession();
  if (session) {
    els.loginForm.classList.add("hidden");
    els.form.classList.remove("hidden");
  } else {
    els.form.classList.add("hidden");
    els.loginForm.classList.remove("hidden");
  }
}

els.loginForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const handle = els.handleInput.value.trim().replace(/^@/, "");
  if (!handle) return;
  els.status.textContent = "";
  try {
    await login(handle);
  } catch (err) {
    els.status.textContent = err.message || "couldn't start sign-in";
  }
});

els.form?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = els.input.value.trim();
  if (!text || !subjectDid) return;
  const session = await getSession();
  if (!session) {
    await refreshLoginUi();
    return;
  }
  els.status.textContent = "signing…";
  try {
    const uri = await postComment(session, subjectDid, text);
    await fetch("/api/guestbook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ uri }),
    });
    prependEntry(session.handle, text);
    els.input.value = "";
    els.status.textContent = "left a note!";
  } catch (err) {
    els.status.textContent = `couldn't post: ${err.message}`;
  }
});

initSparkles();
refreshLoginUi();
