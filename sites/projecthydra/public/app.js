(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var els = {
    pit: $("pit"),
    statFinished: $("stat-finished"),
    statActive: $("stat-active"),
    statSpawned: $("stat-spawned"),
    statDeepest: $("stat-deepest"),
    emptyState: $("empty-state"),
    startNew: $("start-new"),
    shareBluesky: $("share-bluesky"),
    copyLink: $("copy-link"),
    reset: $("reset"),
  };

  var STORAGE_KEY = "projecthydra:v1";

  // Flavor names for project cards — a grab bag of the exact kind of
  // half-finished creative/life projects the original thread was about
  // (VNs, poems, novels, "one of these days" hobbies), not just "Project 4".
  var NAMES = [
    "the novel", "the VN", "learn bass", "the webcomic", "the podcast",
    "learn rust", "the album", "reorganize the garage", "the poem cycle",
    "learn to knit", "the indie game", "the zine", "learn welding",
    "the short story collection", "the mixtape", "the tattoo flash sheet",
    "learn to sail", "the group chat wiki", "the D&D campaign", "the garden",
    "the fanfic", "learn calligraphy", "the side quest engine", "the demo tape",
    "the cookbook", "learn to juggle", "the crochet blanket", "the memoir",
    "the browser extension", "learn morse code", "the puppet show",
    "the sourdough starter", "the home server", "the mural", "the escape room",
    "learn stick shift", "the choir", "the treehouse", "the tarot deck",
    "the sitcom pilot", "learn to whittle",
  ];
  var ICONS = ["📓", "🎸", "🖼️", "🎙️", "🦀", "💿", "🧶", "✍️", "🕹️", "🧵", "⛵", "🎲", "🌱", "🪡", "🍞", "🖥️", "🎭", "🃏"];

  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  function loadState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var s = JSON.parse(raw);
        if (s && Array.isArray(s.pit)) return s;
      }
    } catch (_) { /* corrupt/blocked storage — fall through to a fresh pit */ }
    return freshState();
  }

  function freshState() {
    return {
      pit: [{ id: 0, name: pick(NAMES), icon: pick(ICONS) }],
      finished: 0,
      spawned: 0,
      deepest: 1,
      nextId: 1,
    };
  }

  var state = loadState();
  // nextId may be missing on state loaded from a pre-id save shape — guard it.
  if (typeof state.nextId !== "number") state.nextId = state.pit.length + 1;

  function newProject() {
    return { id: state.nextId++, name: pick(NAMES), icon: pick(ICONS) };
  }

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) { /* private mode etc — just don't persist */ }
  }

  function render() {
    els.statFinished.textContent = String(state.finished);
    els.statActive.textContent = String(state.pit.length);
    els.statSpawned.textContent = String(state.spawned);
    els.statDeepest.textContent = String(state.deepest);

    els.pit.innerHTML = "";
    state.pit.forEach(function (proj) {
      var card = document.createElement("div");
      card.className = "project";
      card.dataset.id = String(proj.id);
      card.innerHTML = '<span class="icon">' + proj.icon + "</span>" + proj.name;
      card.addEventListener("click", function () { clickProject(proj.id); });
      els.pit.appendChild(card);
    });

    var empty = state.pit.length === 0;
    els.emptyState.hidden = !empty;
    els.startNew.hidden = !empty;
    updateShareLink();
  }

  function clickProject(id) {
    var idx = state.pit.findIndex(function (p) { return p.id === id; });
    if (idx === -1) return;
    var card = els.pit.querySelector('[data-id="' + id + '"]');

    var finishedIt = Math.random() < 0.5;

    if (finishedIt) {
      if (card) card.classList.add("finished");
      state.finished++;
      state.pit.splice(idx, 1);
    } else {
      if (card) card.classList.add("spawning");
      state.pit.splice(idx, 1);
      var spawn = [newProject(), newProject(), newProject()];
      state.pit.push.apply(state.pit, spawn);
      state.spawned += 3;
      if (state.pit.length > state.deepest) state.deepest = state.pit.length;
    }

    save();
    // Small delay so the finish/spawn animation on the clicked card is
    // visible before the whole pit re-renders under it.
    setTimeout(render, card ? 180 : 0);
  }

  function startNew() {
    state.pit.push(newProject());
    if (state.pit.length > state.deepest) state.deepest = state.pit.length;
    save();
    render();
  }

  function resetAll() {
    state = freshState();
    save();
    render();
  }

  function updateShareLink() {
    var url = "https://projecthydra.bisks.net/s/" + state.finished + "/" + state.pit.length;
    var text = state.pit.length === 0
      ? "finished all " + state.finished + " projects. the pit is, for one glorious moment, empty."
      : "finished " + state.finished + " project" + (state.finished === 1 ? "" : "s") + ". " + state.pit.length + " still piled up, unfinished. cut one head, three more grow.";
    els.shareBluesky.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(text + " " + url);
    els.shareBluesky.dataset.shareUrl = url;
  }

  els.startNew.addEventListener("click", startNew);
  els.reset.addEventListener("click", function () {
    if (state.finished === 0 && state.pit.length <= 1 && state.spawned === 0) { resetAll(); return; }
    if (confirm("abandon your entire pit and start over?")) resetAll();
  });
  els.copyLink.addEventListener("click", function () {
    var url = els.shareBluesky.dataset.shareUrl || location.href;
    navigator.clipboard && navigator.clipboard.writeText(url).catch(function () {});
    els.copyLink.textContent = "copied!";
    setTimeout(function () { els.copyLink.textContent = "copy link"; }, 1400);
  });

  render();
})();
