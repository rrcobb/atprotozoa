// cobweb content script — the one part of this extension that isn't a data
// literal. Runs on the real bsky.app (and bsky.net, in case that's what you
// call it), finds real "Follow" buttons, and turns them into real "Block"
// buttons. Clicking one doesn't fake anything: it drives Bluesky's own
// overflow-menu → "Block account" → confirm flow, using the tab's already
// logged-in session. No fetch, no host_permissions beyond the page itself —
// we never talk to a server, we just click the buttons Bluesky already drew.
//
// This is best-effort DOM automation against someone else's React app, not a
// stable API. If bsky.app's markup changes, the fallback is always the
// site's own "•••" menu — this just automates that same path from one click.

(() => {
  const PROCESSED = "cobwebBlockified";
  const STYLE_ID = "cobweb-style";

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .cobweb-block-btn {
        background: #c8283c !important;
        border-color: #c8283c !important;
      }
      .cobweb-block-btn * { color: #fff !important; }
      #cobweb-toast {
        position: fixed;
        left: 50%;
        bottom: 28px;
        transform: translateX(-50%) translateY(12px);
        background: #150f1e;
        color: #ece7f5;
        border: 1px solid #c8283c;
        border-radius: 10px;
        padding: 10px 16px;
        font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        z-index: 2147483647;
        opacity: 0;
        pointer-events: none;
        transition: opacity .18s ease, transform .18s ease;
        box-shadow: 0 10px 30px rgba(0,0,0,.4);
      }
      #cobweb-toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
    `;
    document.documentElement.appendChild(style);
  }

  function toast(text) {
    injectStyle();
    let t = document.getElementById("cobweb-toast");
    if (!t) {
      t = document.createElement("div");
      t.id = "cobweb-toast";
      document.documentElement.appendChild(t);
    }
    t.textContent = "🕷️ " + text;
    t.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove("show"), 2600);
  }

  function visibleText(el) {
    return (el.innerText || el.textContent || "").trim();
  }

  function isFollowButton(el) {
    if (!el || el.dataset.cobwebIgnore) return false;
    const role = el.getAttribute && el.getAttribute("role");
    if (el.tagName !== "BUTTON" && role !== "button") return false;
    const text = visibleText(el);
    return text === "Follow" || text === "Follow Back";
  }

  // The overflow ("...") menu lives near the follow button in the same
  // profile-header row, not inside it — walk a few ancestors up and search
  // that subtree, rather than guessing a specific class name.
  function findMoreOptionsButton(followBtn) {
    let scope = followBtn;
    for (let i = 0; i < 5 && scope.parentElement; i++) {
      scope = scope.parentElement;
      const candidates = scope.querySelectorAll('button, [role="button"]');
      for (const c of candidates) {
        if (c === followBtn) continue;
        const label = (c.getAttribute("aria-label") || "").toLowerCase();
        if (label.includes("more options") || label.includes("options menu")) return c;
      }
      // Found a plausible header scope (has the follow button plus siblings) —
      // don't walk all the way to <body> once we've searched a real container.
      if (scope.querySelectorAll('button, [role="button"]').length >= 2 && i >= 1) break;
    }
    return null;
  }

  function waitFor(check, { timeout = 2500, interval = 80 } = {}) {
    return new Promise((resolve) => {
      const start = Date.now();
      const tick = () => {
        const found = check();
        if (found) return resolve(found);
        if (Date.now() - start > timeout) return resolve(null);
        setTimeout(tick, interval);
      };
      tick();
    });
  }

  function findMenuItem(pattern) {
    const items = document.querySelectorAll('[role="menuitem"], [role="button"], button');
    for (const item of items) {
      const text = visibleText(item);
      const label = (item.getAttribute("aria-label") || "").trim();
      if (pattern.test(text) || pattern.test(label)) return item;
    }
    return null;
  }

  async function runRealBlockFlow(followBtn) {
    const moreBtn = findMoreOptionsButton(followBtn);
    if (!moreBtn) {
      toast("couldn't find the ••• menu — block this one by hand");
      return;
    }
    moreBtn.click();

    const blockMenuItem = await waitFor(() => findMenuItem(/^block(?!ed)/i));
    if (!blockMenuItem) {
      toast("menu opened but no \"Block\" item — try it by hand");
      document.body.click(); // best-effort: close whatever menu opened
      return;
    }
    blockMenuItem.click();

    // Bluesky shows a confirm dialog before an actual block write happens.
    const confirmBtn = await waitFor(() => {
      const dialog = document.querySelector('[role="dialog"], [role="alertdialog"]');
      const root = dialog || document;
      const buttons = root.querySelectorAll('button, [role="button"]');
      for (const b of buttons) {
        const text = visibleText(b);
        if (/^block/i.test(text) && !/cancel/i.test(text)) return b;
      }
      return null;
    });
    if (!confirmBtn) {
      toast("no confirm dialog found — finish the block by hand");
      return;
    }
    confirmBtn.click();
    toast("blocked, for real");
  }

  function blockify(followBtn) {
    if (followBtn.dataset[PROCESSED]) return;
    followBtn.dataset[PROCESSED] = "1";
    followBtn.dataset.cobwebIgnore = "1"; // never treat our own button as a target
    followBtn.classList.add("cobweb-block-btn");
    followBtn.title = "cobweb: this used to say Follow. Click blocks for real.";

    // Re-skin every text node without touching React's own child structure,
    // so re-renders that only swap text (e.g. hover states) don't fight us.
    for (const node of followBtn.childNodes) {
      if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
        node.textContent = node.textContent.replace(/Follow( Back)?/, "Block");
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        for (const inner of node.childNodes) {
          if (inner.nodeType === Node.TEXT_NODE && inner.textContent.trim()) {
            inner.textContent = inner.textContent.replace(/Follow( Back)?/, "Block");
          }
        }
      }
    }

    // Capture-phase intercept: fires before bsky.app's own delegated click
    // handler, so the real "follow" write never happens — only ours does.
    followBtn.addEventListener(
      "click",
      (e) => {
        e.preventDefault();
        e.stopImmediatePropagation();
        runRealBlockFlow(followBtn);
      },
      { capture: true }
    );
  }

  function scan(root) {
    const nodes = root.querySelectorAll('button, [role="button"]');
    for (const n of nodes) if (isFollowButton(n)) blockify(n);
  }

  scan(document.body);
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        if (isFollowButton(node)) blockify(node);
        scan(node);
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();
