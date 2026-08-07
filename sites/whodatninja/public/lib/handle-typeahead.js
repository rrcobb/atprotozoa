// Bluesky handle typeahead. Copy this file into a site's public/lib/ dir and
// call attachHandleTypeahead(inputEl) on any text input where someone types a
// handle. Suggestions come from the public AppView's actor search (no auth,
// no API key) — same one bsky.app's own search box uses.
(function (global) {
  const API = "https://public.api.bsky.app/xrpc/app.bsky.actor.searchActorsTypeahead";
  const MIN_LEN = 2;
  const DEBOUNCE_MS = 200;

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  let styleInjected = false;
  function injectStyle() {
    if (styleInjected) return;
    styleInjected = true;
    const style = document.createElement("style");
    style.textContent = `
      .ht-dropdown {
        position: fixed;
        z-index: 2147483000;
        background: rgba(20, 20, 24, 0.97);
        color: #f2f2f2;
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 10px;
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.4);
        overflow-y: auto;
        max-height: 280px;
        font: 14px/1.3 ui-monospace, "SF Mono", Menlo, Consolas, monospace;
        -webkit-backdrop-filter: blur(6px);
        backdrop-filter: blur(6px);
      }
      .ht-item { display: flex; align-items: center; gap: 0.6em; padding: 0.5em 0.7em; cursor: pointer; }
      .ht-item.ht-active, .ht-item:hover { background: rgba(255, 255, 255, 0.14); }
      .ht-avatar { width: 28px; height: 28px; border-radius: 50%; background: rgba(255, 255, 255, 0.15); flex: none; object-fit: cover; }
      .ht-meta { min-width: 0; }
      .ht-name { font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .ht-handle { opacity: 0.65; font-size: 0.85em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .ht-empty { padding: 0.6em 0.7em; opacity: 0.6; }
    `;
    document.head.appendChild(style);
  }

  function attachHandleTypeahead(input, opts) {
    if (!input || input.__htAttached) return;
    input.__htAttached = true;
    injectStyle();
    opts = opts || {};

    let items = [];
    let activeIndex = -1;
    let debounceTimer = null;
    let abortCtrl = null;
    let dropdown = null;

    function closeDropdown() {
      if (dropdown) { dropdown.remove(); dropdown = null; }
      items = [];
      activeIndex = -1;
    }

    function positionDropdown() {
      if (!dropdown) return;
      const r = input.getBoundingClientRect();
      dropdown.style.left = r.left + "px";
      dropdown.style.top = r.bottom + 4 + "px";
      dropdown.style.width = Math.max(r.width, 220) + "px";
    }

    function renderDropdown() {
      if (!dropdown) {
        dropdown = document.createElement("div");
        dropdown.className = "ht-dropdown";
        document.body.appendChild(dropdown);
        positionDropdown();
      }
      if (!items.length) {
        dropdown.innerHTML = '<div class="ht-empty">no matches</div>';
        return;
      }
      dropdown.innerHTML = items
        .map(
          (a, i) => `
        <div class="ht-item${i === activeIndex ? " ht-active" : ""}" data-i="${i}">
          <img class="ht-avatar" ${a.avatar ? `src="${escapeHtml(a.avatar)}"` : ""} alt="" onerror="this.style.visibility='hidden'" />
          <div class="ht-meta">
            <div class="ht-name">${escapeHtml(a.displayName || a.handle)}</div>
            <div class="ht-handle">@${escapeHtml(a.handle)}</div>
          </div>
        </div>`
        )
        .join("");
      [...dropdown.querySelectorAll(".ht-item")].forEach((el) => {
        el.addEventListener("mousedown", (e) => {
          e.preventDefault();
          select(items[Number(el.dataset.i)]);
        });
      });
    }

    function select(actor) {
      input.value = actor.handle;
      closeDropdown();
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      if (opts.onSelect) opts.onSelect(actor);
    }

    async function search(q) {
      if (abortCtrl) abortCtrl.abort();
      abortCtrl = new AbortController();
      try {
        const res = await fetch(API + "?q=" + encodeURIComponent(q) + "&limit=8", { signal: abortCtrl.signal });
        if (!res.ok) throw new Error("search failed");
        const data = await res.json();
        items = data.actors || [];
        activeIndex = items.length ? 0 : -1;
        renderDropdown();
      } catch (err) {
        if (err.name !== "AbortError") closeDropdown();
      }
    }

    input.addEventListener("input", () => {
      const raw = input.value.trim().replace(/^@/, "");
      clearTimeout(debounceTimer);
      if (raw.length < MIN_LEN) { closeDropdown(); return; }
      debounceTimer = setTimeout(() => search(raw), DEBOUNCE_MS);
    });

    input.addEventListener("keydown", (e) => {
      if (!dropdown || !items.length) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        activeIndex = (activeIndex + 1) % items.length;
        renderDropdown();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        activeIndex = (activeIndex - 1 + items.length) % items.length;
        renderDropdown();
      } else if (e.key === "Enter") {
        if (activeIndex >= 0) {
          e.preventDefault();
          select(items[activeIndex]);
        }
      } else if (e.key === "Escape") {
        closeDropdown();
      }
    });

    input.addEventListener("blur", () => setTimeout(closeDropdown, 120));
    window.addEventListener("scroll", () => { if (dropdown) positionDropdown(); }, true);
    window.addEventListener("resize", () => { if (dropdown) positionDropdown(); });
  }

  global.attachHandleTypeahead = attachHandleTypeahead;
})(window);
