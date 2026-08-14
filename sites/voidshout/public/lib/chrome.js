// chrome.js — shared header/nav/session widget + demo-mode banner, mounted
// on every voidshout page into a `<header id="chrome-header"></header>`
// placeholder. Not a cross-site abstraction (that's still forbidden by
// house style) — just avoiding re-typing the same nav markup and sign-in
// wiring across eleven pages of ONE site.

import { getSession, clearSession, login, completeLoginIfCallback } from "./oauth.js";
import { homeFor } from "./voidlogic.mjs";

export const DEMO_KEY = "voidshout-demo";

// The header's "sign in" button used to just window.prompt() for a handle —
// plain text, no confirmation you typed a real one. Every other voidshout
// page with a handle field (compose's mention box, etc.) uses the same
// Bluesky actor-search dropdown; sign-in should feel the same. That widget
// (handle-typeahead.js) is a plain <script> global, not an ES module, and
// most pages never load it — so pull it in lazily, once, the first time
// someone actually opens the sign-in popover.
let htPromise = null;
function loadHandleTypeahead() {
  if (htPromise) return htPromise;
  htPromise = new Promise((resolve, reject) => {
    if (window.attachHandleTypeahead) { resolve(window.attachHandleTypeahead); return; }
    const script = document.createElement("script");
    script.src = "/lib/handle-typeahead.js";
    script.onload = () => resolve(window.attachHandleTypeahead);
    script.onerror = () => reject(new Error("couldn't load handle search"));
    document.head.appendChild(script);
  });
  return htPromise;
}

let signinStylesInjected = false;
function injectSigninStyles() {
  if (signinStylesInjected) return;
  signinStylesInjected = true;
  const style = document.createElement("style");
  style.textContent = `
    .signin-pop { position: fixed; z-index: 2147482900; background: var(--panel-solid, #fff); border: 1px solid var(--faint, #e1e8ed); border-radius: 12px; box-shadow: 0 12px 32px rgba(0,0,0,0.18); padding: 0.7rem; display: flex; flex-direction: column; gap: 0.5rem; width: min(280px, 90vw); }
    .signin-pop input { width: 100%; box-sizing: border-box; }
    .signin-pop .signin-row { display: flex; gap: 0.4rem; }
    .signin-pop .signin-row button { flex: none; }
    .signin-pop .signin-err { color: var(--bad, #e0245e); font-size: 0.76rem; }
  `;
  document.head.appendChild(style);
}

function openSigninPopover(anchor) {
  injectSigninStyles();
  const existing = document.querySelector(".signin-pop");
  if (existing) { existing.remove(); return; }

  const pop = document.createElement("div");
  pop.className = "signin-pop";
  pop.innerHTML = `
    <input id="signin-handle" placeholder="your handle (e.g. you.bsky.social)" autocomplete="off" />
    <div class="signin-row">
      <button type="button" id="signin-go" class="btn primary">sign in</button>
    </div>
    <div class="signin-err" id="signin-err"></div>
  `;
  document.body.appendChild(pop);

  function position() {
    const r = anchor.getBoundingClientRect();
    const w = pop.offsetWidth;
    pop.style.top = r.bottom + 6 + "px";
    pop.style.left = Math.max(8, r.right - w) + "px";
  }
  position();
  window.addEventListener("resize", position);
  window.addEventListener("scroll", position, true);

  function close() {
    window.removeEventListener("resize", position);
    window.removeEventListener("scroll", position, true);
    pop.remove();
    document.removeEventListener("mousedown", onOutside);
  }
  function onOutside(e) {
    if (!pop.contains(e.target) && e.target !== anchor) close();
  }
  // deferred so the click that opened the popover doesn't immediately close it
  setTimeout(() => document.addEventListener("mousedown", onOutside), 0);

  const input = pop.querySelector("#signin-handle");
  const goBtn = pop.querySelector("#signin-go");
  const errEl = pop.querySelector("#signin-err");
  input.focus();
  loadHandleTypeahead()
    .then((attach) => attach && attach(input))
    .catch(() => {}); // typeahead is a nicety — plain typing still works if the CDN script fails

  async function trySignin() {
    const handle = input.value.trim();
    if (!handle) return;
    goBtn.disabled = true;
    errEl.textContent = "";
    try {
      await login(handle);
    } catch (e) {
      errEl.textContent = e.message;
      goBtn.disabled = false;
    }
  }
  goBtn.addEventListener("click", trySignin);
  input.addEventListener("keydown", (e) => {
    // A visible .ht-dropdown means handle-typeahead.js owns this Enter
    // press (it'll pick the highlighted suggestion) — don't race it by
    // also submitting the not-yet-corrected raw text on the same keypress.
    if (e.key === "Enter" && !document.querySelector(".ht-dropdown")) { e.preventDefault(); trySignin(); }
    else if (e.key === "Escape") close();
  });
}

export function demoModeOn() {
  try {
    return localStorage.getItem(DEMO_KEY) !== "0"; // demo ON by default until a real signed-in visit turns it off
  } catch {
    return true;
  }
}
export function setDemoMode(on) {
  try {
    localStorage.setItem(DEMO_KEY, on ? "1" : "0");
  } catch {}
  const banner = document.getElementById("demo-banner");
  if (banner) banner.classList.toggle("on", on);
}

const NAV = [
  ["/", "Home"],
  ["/map/", "Map"],
  ["/place/", "Places"],
  ["/compose/", "Shout"],
  ["/import/", "Import"],
  ["/profile/", "Profile"],
  ["/settings/", "Settings"],
  ["/audit/", "Audit"],
];

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/**
 * @param {{active?: string, onSession?: (session: object|null) => void}} opts
 * @returns {Promise<object|null>} the current session, if any
 */
export async function mountChrome(opts = {}) {
  const header = document.getElementById("chrome-header");
  const banner = document.getElementById("demo-banner");
  if (banner) {
    banner.classList.toggle("on", demoModeOn());
    banner.innerHTML =
      `you're viewing <b>seeded demo data</b> — sample shouts, not the real network. ` +
      `<a href="#" id="demo-toggle-off">show real data</a> (or <a href="/onboarding/">sign in</a> to shout for real)`;
    banner.querySelector("#demo-toggle-off")?.addEventListener("click", (e) => {
      e.preventDefault();
      setDemoMode(false);
      location.reload();
    });
  }

  let session = null;
  try {
    session = (await completeLoginIfCallback()) || (await getSession());
  } catch (e) {
    console.warn("voidshout oauth:", e.message);
  }
  if (session) setDemoMode(false);

  if (header) {
    header.innerHTML = `
      <a class="brand" href="/">Shout Into the <span class="void">Void</span></a>
      <nav>${NAV.map(([href, label]) => `<a href="${href}"${opts.active === href ? ' class="active"' : ""}>${label}</a>`).join("")}</nav>
      <span class="spacer"></span>
      <div id="chrome-session"></div>
    `;
    await renderSession(session);
  }

  opts.onSession?.(session);
  return session;

  async function renderSession(s) {
    const el = document.getElementById("chrome-session");
    if (!el) return;
    if (!s) {
      el.innerHTML = `<button id="chrome-signin" class="btn">sign in</button>`;
      el.querySelector("#chrome-signin").addEventListener("click", (e) => openSigninPopover(e.currentTarget));
      return;
    }
    const home = await homeFor(s.did);
    el.innerHTML = `
      <a class="home-tag" href="/profile/" title="${esc(home.explanation)}">${esc(home.name)}</a>
      <span class="did-tag">@${esc(s.handle)}</span>
      <button id="chrome-signout" class="btn">sign out</button>
    `;
    el.querySelector("#chrome-signout").addEventListener("click", async () => {
      await clearSession();
      location.reload();
    });
  }
}

export async function requireSession(redirectTo = "/onboarding/") {
  const s = await getSession();
  if (!s) {
    location.href = redirectTo + "?next=" + encodeURIComponent(location.pathname);
    return null;
  }
  return s;
}

export { esc };
