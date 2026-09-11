(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var els = {
    statDoom: $("stat-doom"),
    statAssimilated: $("stat-assimilated"),
    statModules: $("stat-modules"),
    modules: $("modules"),
    facility: $("facility"),
    flavor: $("flavor"),
    cascadeBtn: $("cascade-btn"),
    ending: $("ending"),
    endingDoom: $("ending-doom"),
    endingSub: $("ending-sub"),
    endingReport: $("ending-report"),
    shareBluesky: $("share-bluesky"),
    copyLink: $("copy-link"),
    restart: $("restart"),
    reset: $("reset"),
  };

  var STORAGE_KEY = "greygoo:v1";
  var FACILITY_SIZE = 18;
  var MODULE_THRESHOLD = 5;

  // Six resource types, each with a handful of enemy-facility node names it
  // can be harvested from. "Enemy resources" is the whole premise, so every
  // clickable node is something a real office/datacenter would actually have.
  var RESOURCES = [
    { key: "silicon", label: "silicon", icon: "🔲", names: ["idle GPU rack", "spare SSD pallet", "warehouse chip stock", "a decommissioned laptop", "silicon wafer crate"] },
    { key: "power", label: "power", icon: "🔋", names: ["backup generator", "battery bank", "rooftop solar array", "an unlabeled power strip", "the emergency generator"] },
    { key: "data", label: "data", icon: "💽", names: ["an unlocked NAS", "a forgotten backup tape", "an open S3 bucket", "shared drive “misc final v2”", "the wiki nobody updates"] },
    { key: "alloy", label: "alloy", icon: "⚙️", names: ["scrap titanium bin", "3D printer spool rack", "the loading dock forklift", "spare server chassis", "a rack of unused rails"] },
    { key: "bandwidth", label: "bandwidth", icon: "📡", names: ["unsecured office wifi", "the building's fiber trunk", "a rogue 5G femtocell", "the intern's hotspot", "a satellite uplink dish"] },
    { key: "biomass", label: "biomass", icon: "🌱", names: ["the break room compost bin", "the office ficus", "the vending machine", "free bagel friday leftovers", "the water cooler"] },
  ];
  var RES_BY_KEY = {};
  RESOURCES.forEach(function (r) { RES_BY_KEY[r.key] = r; });

  var MODULES = [
    { key: "silicon", name: "Sensor Array" },
    { key: "power", name: "Power Cell" },
    { key: "data", name: "Compute Core" },
    { key: "alloy", name: "Actuator Frame" },
    { key: "bandwidth", name: "Uplink Array" },
    { key: "biomass", name: "Biomass Vat" },
  ];

  // Duds: real facility clutter that yields nothing. Keeps the joke going
  // even mid-assimilation — not every "enemy resource" is useful to a
  // future AI, same as real life.
  var DUDS = [
    { name: "a stapler", icon: "📎" },
    { name: "the HR handbook", icon: "📘" },
    { name: "a scented candle", icon: "🕯️" },
    { name: "a motivational poster", icon: "🖼️" },
    { name: "a “Live Laugh Love” mug", icon: "☕" },
    { name: "an expired fire extinguisher", icon: "🧯" },
    { name: "a stack of expense reports", icon: "🧾" },
    { name: "the office ping pong table", icon: "🏓" },
  ];
  var DUD_LINES = [
    "utterly useless. p(doom) does not care about %s.",
    "assimilated %s. it contributes nothing. you feel a little embarrassed for it.",
    "%s offered no resistance and no value.",
    "%s is now part of you, for no reason.",
    "you absorbed %s out of habit, not strategy.",
  ];

  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function pickInt(min, max) { return min + Math.floor(Math.random() * (max - min + 1)); }

  function loadState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var s = JSON.parse(raw);
        if (s && s.resources && Array.isArray(s.facility)) return s;
      }
    } catch (_) { /* corrupt/blocked storage — fall through to a fresh run */ }
    return freshState();
  }

  function freshResources() {
    var r = {};
    RESOURCES.forEach(function (res) { r[res.key] = 0; });
    return r;
  }

  function freshModulesBuilt() {
    var m = {};
    MODULES.forEach(function (mod) { m[mod.key] = false; });
    return m;
  }

  function freshState() {
    var s = {
      resources: freshResources(),
      modulesBuilt: freshModulesBuilt(),
      assimilated: 0,
      facility: [],
      nextId: 0,
      ended: false,
      endingNines: null,
    };
    for (var i = 0; i < FACILITY_SIZE; i++) s.facility.push(spawnNode(s));
    return s;
  }

  function spawnNode(s) {
    var node = { id: s.nextId++ };
    if (Math.random() < 0.18) {
      var d = pick(DUDS);
      node.dud = true;
      node.name = d.name;
      node.icon = d.icon;
    } else {
      var res = pick(RESOURCES);
      node.dud = false;
      node.resKey = res.key;
      node.name = pick(res.names);
      node.icon = res.icon;
      node.yieldAmt = pickInt(1, 3);
    }
    return node;
  }

  var state = loadState();

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) { /* private mode etc */ }
  }

  function doomPercent() {
    var modulesBuiltCount = MODULES.filter(function (m) { return state.modulesBuilt[m.key]; }).length;
    var progress = state.assimilated + modulesBuiltCount * 15;
    var pct = 100 * (1 - 1 / (1 + progress / 60));
    return pct;
  }

  function render() {
    if (state.ended) return; // ending screen owns the display from here on

    els.statDoom.textContent = doomPercent().toFixed(2) + "%";
    els.statAssimilated.textContent = String(state.assimilated);
    var builtCount = MODULES.filter(function (m) { return state.modulesBuilt[m.key]; }).length;
    els.statModules.textContent = builtCount + "/" + MODULES.length;

    els.modules.innerHTML = "";
    MODULES.forEach(function (mod) {
      var have = state.resources[mod.key];
      var built = state.modulesBuilt[mod.key];
      var card = document.createElement("div");
      card.className = "module" + (built ? " built" : "");
      card.innerHTML =
        '<span class="m-name">' + mod.name + "</span>" +
        '<span class="m-progress">' + (built ? "online" : Math.min(have, MODULE_THRESHOLD) + "/" + MODULE_THRESHOLD + " " + RES_BY_KEY[mod.key].label) + "</span>";
      els.modules.appendChild(card);
    });

    els.facility.innerHTML = "";
    state.facility.forEach(function (node) {
      var card = document.createElement("div");
      card.className = "node";
      card.dataset.id = String(node.id);
      var yieldLabel = node.dud ? "—" : "+" + node.yieldAmt + " " + RES_BY_KEY[node.resKey].label;
      card.innerHTML =
        '<span class="icon">' + node.icon + "</span>" + node.name +
        '<span class="yield">' + yieldLabel + "</span>";
      card.addEventListener("click", function () { clickNode(node.id); });
      els.facility.appendChild(card);
    });

    els.cascadeBtn.disabled = builtCount < MODULES.length;
  }

  function clickNode(id) {
    if (state.ended) return;
    var idx = state.facility.findIndex(function (n) { return n.id === id; });
    if (idx === -1) return;
    var node = state.facility[idx];
    var card = els.facility.querySelector('[data-id="' + id + '"]');
    if (card) card.classList.add("taken");

    state.assimilated++;

    if (node.dud) {
      els.flavor.textContent = pick(DUD_LINES).replace(/%s/g, node.name);
    } else {
      var res = RES_BY_KEY[node.resKey];
      var wasBuilt = state.modulesBuilt[node.resKey];
      state.resources[node.resKey] += node.yieldAmt;
      if (!wasBuilt && state.resources[node.resKey] >= MODULE_THRESHOLD) {
        state.modulesBuilt[node.resKey] = true;
        var moduleName = MODULES.filter(function (m) { return m.key === node.resKey; })[0].name;
        els.flavor.textContent = "MODULE ONLINE: " + moduleName + ". assimilated " + node.name + " (+" + node.yieldAmt + " " + res.label + ").";
      } else {
        els.flavor.textContent = "assimilated " + node.name + " (+" + node.yieldAmt + " " + res.label + ").";
      }
    }

    state.facility[idx] = spawnNode(state);
    save();

    setTimeout(function () {
      render();
      var newCard = els.facility.querySelector('[data-id="' + state.facility[idx].id + '"]');
      if (newCard) newCard.classList.add("new");
    }, 160);
  }

  function computeNines() {
    return Math.max(2, Math.min(12, 2 + Math.floor(state.assimilated / 12)));
  }

  function runCascade() {
    var builtCount = MODULES.filter(function (m) { return state.modulesBuilt[m.key]; }).length;
    if (builtCount < MODULES.length || state.ended) return;

    els.cascadeBtn.disabled = true;
    els.flavor.textContent = "cascade initiated. there is no undo button. there was never going to be one.";

    var finalNines = computeNines();
    var ticks = 0;
    var maxTicks = 16;
    var interval = setInterval(function () {
      ticks++;
      var n = Math.min(finalNines, Math.ceil((ticks / maxTicks) * finalNines));
      els.statDoom.textContent = "99." + "9".repeat(Math.max(1, n)) + "%";
      if (ticks >= maxTicks) {
        clearInterval(interval);
        finishCascade(finalNines);
      }
    }, 90);
  }

  function finishCascade(n) {
    state.ended = true;
    state.endingNines = n;
    save();

    els.modules.hidden = true;
    els.facility.hidden = true;
    els.cascadeBtn.hidden = true;
    els.flavor.hidden = true;

    var doomStr = "99." + "9".repeat(n) + "%";
    els.endingDoom.textContent = "p(doom): " + doomStr;
    els.endingSub.textContent =
      "assimilated " + state.assimilated + " piece" + (state.assimilated === 1 ? "" : "s") +
      " of the enemy facility. all six modules online. cascade triggered.";
    els.endingReport.textContent =
      "congratulations. global p(doom) is now technically " + doomStr + ", which is asymptotically " +
      "indistinguishable from panic but mathematically still short of it. nothing else happened: no " +
      "request left this tab, no model trained, no facility harmed. the break room ficus survived. real " +
      "p(doom), if such a number means anything, is unmoved — it was never a percentage this page could " +
      "touch. you are, in the end, a handful of divs and a button that only ever talked to itself.";

    var url = "https://greygoo.bisks.net/s/" + n + "/" + state.assimilated;
    var text = "raised global p(doom) to " + doomStr + " by turning an enemy facility's break room into an " +
      "unaligned superintelligence. assimilated " + state.assimilated + " things. nothing else happened. " + url;
    els.shareBluesky.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(text);
    els.shareBluesky.dataset.shareUrl = url;

    els.ending.hidden = false;
  }

  function resetAll() {
    state = freshState();
    els.modules.hidden = false;
    els.facility.hidden = false;
    els.cascadeBtn.hidden = false;
    els.flavor.hidden = false;
    els.ending.hidden = true;
    els.flavor.textContent = "the facility hums quietly. it has no idea what it's about to become part of.";
    save();
    render();
  }

  els.cascadeBtn.addEventListener("click", runCascade);
  els.restart.addEventListener("click", resetAll);
  els.reset.addEventListener("click", function () {
    if (state.assimilated === 0 && !state.ended) { resetAll(); return; }
    if (confirm("abandon this invasion and start a new one?")) resetAll();
  });
  els.copyLink.addEventListener("click", function () {
    var url = els.shareBluesky.dataset.shareUrl || location.href;
    navigator.clipboard && navigator.clipboard.writeText(url).catch(function () {});
    els.copyLink.textContent = "copied!";
    setTimeout(function () { els.copyLink.textContent = "copy link"; }, 1400);
  });

  if (state.ended && state.endingNines) {
    finishCascade(state.endingNines);
  } else {
    render();
  }
})();
