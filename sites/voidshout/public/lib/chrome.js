// chrome.js — shared header/nav/session widget + demo-mode banner, mounted
// on every voidshout page into a `<header id="chrome-header"></header>`
// placeholder. Not a cross-site abstraction (that's still forbidden by
// house style) — just avoiding re-typing the same nav markup and sign-in
// wiring across eleven pages of ONE site.

import { getSession, clearSession, login, completeLoginIfCallback } from "./oauth.js";
import { homeFor } from "./voidlogic.mjs";

export const DEMO_KEY = "voidshout-demo";

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
      el.querySelector("#chrome-signin").addEventListener("click", async () => {
        const handle = prompt("Your Bluesky handle (e.g. you.bsky.social):");
        if (!handle) return;
        try {
          await login(handle.trim());
        } catch (e) {
          alert("sign-in failed: " + e.message);
        }
      });
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
