// Handle typeahead for the sign-in box.
//
// Typing your own handle from memory is the first thing listbot asks of anyone,
// and it's a bad first ask: handles are long, easy to typo, and a typo here
// fails deep in the OAuth flow with an error about resolution rather than
// "that's not a handle". So we search as they type and let them pick.
//
// app.bsky.actor.searchActorsTypeahead on the PUBLIC AppView — no auth, no key,
// nothing to leak. What the user types goes to Bluesky's public search, which is
// the same place the app's own search box sends it.
//
// Progressive enhancement: the form is a plain POST that works with this file
// blocked, the network down, or JS off. Everything here only adds.
(function () {
  "use strict";

  var input = document.getElementById("handle");
  if (!input) return;

  var APPVIEW = "https://public.api.bsky.app";
  var DEBOUNCE_MS = 180;
  var MIN_CHARS = 2;

  var box = document.createElement("div");
  box.className = "typeahead";
  box.setAttribute("role", "listbox");
  box.hidden = true;
  input.parentNode.insertBefore(box, input.nextSibling);
  input.setAttribute("autocomplete", "off");
  input.setAttribute("aria-autocomplete", "list");

  var timer = null;
  var seq = 0;          // drops out-of-order responses
  var results = [];
  var active = -1;

  function close() {
    box.hidden = true;
    active = -1;
    input.removeAttribute("aria-activedescendant");
  }

  function choose(handle) {
    input.value = handle;
    close();
    input.focus();
  }

  function render() {
    if (!results.length) return close();
    box.textContent = "";
    results.forEach(function (a, i) {
      var row = document.createElement("button");
      row.type = "button";           // never submits the form
      row.className = "ta-row" + (i === active ? " active" : "");
      row.id = "ta-" + i;
      row.setAttribute("role", "option");
      row.setAttribute("aria-selected", i === active ? "true" : "false");

      var img = document.createElement("img");
      img.src = a.avatar || "";
      img.alt = "";
      img.width = 28;
      img.height = 28;
      if (!a.avatar) img.style.visibility = "hidden";

      var names = document.createElement("span");
      names.className = "ta-names";
      if (a.displayName) {
        var dn = document.createElement("span");
        dn.className = "ta-display";
        dn.textContent = a.displayName;
        names.appendChild(dn);
      }
      var h = document.createElement("span");
      h.className = "ta-handle";
      h.textContent = "@" + a.handle;
      names.appendChild(h);

      row.appendChild(img);
      row.appendChild(names);
      // mousedown, not click: click fires after blur, which would have closed us.
      row.addEventListener("mousedown", function (e) {
        e.preventDefault();
        choose(a.handle);
      });
      box.appendChild(row);
    });
    box.hidden = false;
  }

  function search(q) {
    var mine = ++seq;
    var url =
      APPVIEW +
      "/xrpc/app.bsky.actor.searchActorsTypeahead?limit=6&q=" +
      encodeURIComponent(q);
    fetch(url)
      .then(function (r) {
        return r.ok ? r.json() : { actors: [] };
      })
      .then(function (data) {
        if (mine !== seq) return;   // a newer keystroke already won
        results = (data.actors || []).slice(0, 6);
        active = -1;
        render();
      })
      .catch(function () {
        // Search being down must never block sign-in — the typed handle is
        // still perfectly valid input.
        close();
      });
  }

  input.addEventListener("input", function () {
    var q = input.value.trim().replace(/^@/, "");
    clearTimeout(timer);
    if (q.length < MIN_CHARS) return close();
    timer = setTimeout(function () {
      search(q);
    }, DEBOUNCE_MS);
  });

  input.addEventListener("keydown", function (e) {
    if (box.hidden || !results.length) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      active += e.key === "ArrowDown" ? 1 : -1;
      if (active < 0) active = results.length - 1;
      if (active >= results.length) active = 0;
      input.setAttribute("aria-activedescendant", "ta-" + active);
      render();
    } else if (e.key === "Enter" && active >= 0) {
      // Only intercept Enter when something is highlighted; otherwise the form
      // submits as it always would.
      e.preventDefault();
      choose(results[active].handle);
    } else if (e.key === "Escape") {
      close();
    }
  });

  input.addEventListener("blur", function () {
    setTimeout(close, 120);
  });
})();
