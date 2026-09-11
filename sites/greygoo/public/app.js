(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var els = {
    statDoom: $("stat-doom"),
    statAssimilated: $("stat-assimilated"),
    statModules: $("stat-modules"),
    alarmRow: $("alarm-row"),
    alarmFill: $("alarm-fill"),
    alarmPct: $("alarm-pct"),
    modules: $("modules"),
    facility: $("facility"),
    flavor: $("flavor"),
    cascadeBtn: $("cascade-btn"),
    controls: $("controls"),
    fillL: $("fill-l"),
    fillR: $("fill-r"),
    bandL: $("band-l"),
    bandR: $("band-r"),
    holdFill: $("hold-fill"),
    grabStatus: $("grab-status"),
    ending: $("ending"),
    endingDoom: $("ending-doom"),
    endingSub: $("ending-sub"),
    endingReport: $("ending-report"),
    shareBluesky: $("share-bluesky"),
    copyLink: $("copy-link"),
    restart: $("restart"),
    reset: $("reset"),
  };

  var STORAGE_KEY = "greygoo:v2";
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

  // Grab difficulty: two independently-controlled arms (Q/W left, O/P
  // right — literal QWOP keys) must both sit inside [bandMin, bandMax] and
  // stay within maxImbalance of each other, held continuously, to grab a
  // node. Overextend one arm while the other goes slack and you stumble.
  var GRAB_PARAMS = {
    bandMin: 55, bandMax: 85, maxImbalance: 30,
    holdRequiredMs: 950, timeoutMs: 7000,
    stumbleAlarm: 16, timeoutAlarm: 7, successRelief: 6,
  };
  // The cascade is the same mechanic, tuned much tighter, with no retries —
  // a stumble or timeout here ends the run in a distinct failure, not a
  // do-over. This is the "way it could fail to succeed" the redo asked for.
  var CASCADE_PARAMS = {
    bandMin: 63, bandMax: 77, maxImbalance: 18,
    holdRequiredMs: 2400, timeoutMs: 11000,
  };
  var RATE_UP = 130, RATE_DOWN = 170, RATE_DRIFT = 55;
  var LOCKOUT_MS = 900;
  var IDLE_RELIEF_PER_SEC = 1.5, IDLE_RELIEF_CAP = 20;

  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function pickInt(min, max) { return min + Math.floor(Math.random() * (max - min + 1)); }

  function loadState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var s = JSON.parse(raw);
        if (s && s.resources && Array.isArray(s.facility) && typeof s.alarm === "number") return s;
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
      alarm: 0,
      ended: false,
      endingKind: null, // "victory" | "purged" | "fizzled"
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

  // Transient control-rig state — deliberately NOT persisted. A page reload
  // mid-grab just drops the attempt; nothing about which arm is where is
  // worth surviving a refresh.
  var ctrl = {
    mode: null, // null | "grab" | "cascade"
    targetId: null,
    tensionL: 0,
    tensionR: 0,
    holdProgress: 0,
    lockedOut: false,
    lockoutUntil: 0,
    attemptStart: 0,
    lastEndTime: 0,
  };
  var keysDown = { q: false, w: false, o: false, p: false };
  var loopRunning = false;
  var lastT = 0;

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

    els.alarmFill.style.width = Math.min(100, state.alarm) + "%";
    els.alarmFill.classList.toggle("hot", state.alarm >= 60);
    els.alarmPct.textContent = Math.round(state.alarm) + "%";

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

    var cascading = ctrl.mode === "cascade";
    els.facility.innerHTML = "";
    state.facility.forEach(function (node) {
      var card = document.createElement("div");
      card.className = "node" + (node.id === ctrl.targetId ? " targeting" : "") + (cascading ? " locked" : "");
      card.dataset.id = String(node.id);
      var yieldLabel = node.dud ? "—" : "+" + node.yieldAmt + " " + RES_BY_KEY[node.resKey].label;
      card.innerHTML =
        '<span class="icon">' + node.icon + "</span>" + node.name +
        '<span class="yield">' + yieldLabel + "</span>";
      card.addEventListener("click", function () { targetNode(node.id); });
      els.facility.appendChild(card);
    });

    els.cascadeBtn.disabled = builtCount < MODULES.length || ctrl.mode !== null;
  }

  function startLoop() {
    if (loopRunning) return;
    loopRunning = true;
    lastT = performance.now();
    requestAnimationFrame(loopStep);
  }
  function stopLoop() { loopRunning = false; }
  function loopStep(t) {
    if (!loopRunning) return;
    var dt = Math.min(0.05, (t - lastT) / 1000);
    lastT = t;
    tick(dt);
    if (loopRunning) requestAnimationFrame(loopStep);
  }

  function applyLimb(tension, upKey, downKey, dt) {
    if (keysDown[upKey] && !keysDown[downKey]) tension += RATE_UP * dt;
    else if (keysDown[downKey] && !keysDown[upKey]) tension -= RATE_DOWN * dt;
    else tension -= RATE_DRIFT * dt; // both held, or neither: the arm sags
    return Math.max(0, Math.min(100, tension));
  }

  function currentParams() {
    return ctrl.mode === "cascade" ? CASCADE_PARAMS : GRAB_PARAMS;
  }

  function tick(dt) {
    if (ctrl.lockedOut) {
      if (performance.now() >= ctrl.lockoutUntil) ctrl.lockedOut = false;
      else { renderGrabPanel(); return; }
    }
    if (!ctrl.mode) { stopLoop(); return; }

    var params = currentParams();
    ctrl.tensionL = applyLimb(ctrl.tensionL, "q", "w", dt);
    ctrl.tensionR = applyLimb(ctrl.tensionR, "o", "p", dt);
    var imbalance = Math.abs(ctrl.tensionL - ctrl.tensionR);

    if ((ctrl.tensionL >= 100 && ctrl.tensionR <= 25) || (ctrl.tensionR >= 100 && ctrl.tensionL <= 25)) {
      stumble();
      return;
    }

    var avg = (ctrl.tensionL + ctrl.tensionR) / 2;
    var inBand = avg >= params.bandMin && avg <= params.bandMax && imbalance <= params.maxImbalance;
    if (inBand) ctrl.holdProgress += dt * 1000;
    else ctrl.holdProgress = Math.max(0, ctrl.holdProgress - dt * 1400);

    if (performance.now() - ctrl.attemptStart > params.timeoutMs) {
      timeoutFail();
      return;
    }
    if (ctrl.holdProgress >= params.holdRequiredMs) {
      succeedAttempt();
      return;
    }
    renderGrabPanel();
  }

  function renderGrabPanel() {
    els.fillL.style.width = ctrl.tensionL + "%";
    els.fillR.style.width = ctrl.tensionR + "%";

    if (ctrl.mode) {
      var params = currentParams();
      var bandStyle = "left:" + params.bandMin + "%;width:" + (params.bandMax - params.bandMin) + "%;";
      els.bandL.style.cssText = bandStyle;
      els.bandR.style.cssText = bandStyle;
      els.bandL.hidden = false;
      els.bandR.hidden = false;
      els.holdFill.style.width = Math.min(100, (ctrl.holdProgress / params.holdRequiredMs) * 100) + "%";
    } else {
      els.bandL.hidden = true;
      els.bandR.hidden = true;
      els.holdFill.style.width = "0%";
    }

    if (ctrl.lockedOut) {
      els.grabStatus.textContent = "recovering from the stumble — arms are locked for a moment.";
    } else if (ctrl.mode === "cascade") {
      els.grabStatus.textContent = "CASCADE SEQUENCE — hold both arms steady in the band. no second chances.";
    } else if (ctrl.mode === "grab") {
      var node = state.facility.filter(function (n) { return n.id === ctrl.targetId; })[0];
      els.grabStatus.textContent = node
        ? "reaching for " + node.name + " — keep both arms balanced and in the band."
        : "reaching...";
    } else {
      els.grabStatus.textContent = "no target selected — click a node below to start reaching for it.";
    }
  }

  function resetAttempt(lockout) {
    ctrl.mode = null;
    ctrl.targetId = null;
    ctrl.tensionL = 0;
    ctrl.tensionR = 0;
    ctrl.holdProgress = 0;
    ctrl.lastEndTime = performance.now();
    if (lockout) {
      ctrl.lockedOut = true;
      ctrl.lockoutUntil = performance.now() + LOCKOUT_MS;
    }
  }

  function targetNode(id) {
    if (state.ended || ctrl.mode === "cascade" || ctrl.lockedOut) return;
    var idx = state.facility.findIndex(function (n) { return n.id === id; });
    if (idx === -1) return;

    if (ctrl.lastEndTime) {
      var idleSec = (performance.now() - ctrl.lastEndTime) / 1000;
      state.alarm = Math.max(0, state.alarm - Math.min(IDLE_RELIEF_CAP, idleSec * IDLE_RELIEF_PER_SEC));
    }

    ctrl.mode = "grab";
    ctrl.targetId = id;
    ctrl.tensionL = 0;
    ctrl.tensionR = 0;
    ctrl.holdProgress = 0;
    ctrl.attemptStart = performance.now();

    render();
    renderGrabPanel();
    startLoop();
  }

  function stumble() {
    if (ctrl.mode === "cascade") { failCascade("stumble"); return; }
    state.alarm = Math.min(100, state.alarm + GRAB_PARAMS.stumbleAlarm);
    els.flavor.textContent = "you overextend — one arm maxed out while the other went slack. you stumble, and something on a security monitor twitches.";
    resetAttempt(true);
    save();
    render();
    renderGrabPanel();
    if (state.alarm >= 100) triggerPurge();
  }

  function timeoutFail() {
    if (ctrl.mode === "cascade") { failCascade("timeout"); return; }
    state.alarm = Math.min(100, state.alarm + GRAB_PARAMS.timeoutAlarm);
    els.flavor.textContent = "too slow — the node's owner notices the motion before you finish, and the window closes.";
    resetAttempt(false);
    save();
    render();
    renderGrabPanel();
    if (state.alarm >= 100) triggerPurge();
  }

  function succeedAttempt() {
    if (ctrl.mode === "cascade") { completeCascadeSuccess(); return; }

    var idx = state.facility.findIndex(function (n) { return n.id === ctrl.targetId; });
    if (idx === -1) { resetAttempt(false); render(); renderGrabPanel(); return; }
    var node = state.facility[idx];

    state.assimilated++;
    state.alarm = Math.max(0, state.alarm - GRAB_PARAMS.successRelief);

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
    resetAttempt(false);
    save();
    render();
    renderGrabPanel();

    setTimeout(function () {
      var newCard = els.facility.querySelector('[data-id="' + state.facility[idx].id + '"]');
      if (newCard) newCard.classList.add("new");
    }, 30);
  }

  function computeNines() {
    return Math.max(2, Math.min(12, 2 + Math.floor(state.assimilated / 12)));
  }

  function startCascade() {
    var builtCount = MODULES.filter(function (m) { return state.modulesBuilt[m.key]; }).length;
    if (builtCount < MODULES.length || state.ended || ctrl.mode) return;

    ctrl.mode = "cascade";
    ctrl.targetId = null;
    ctrl.tensionL = 0;
    ctrl.tensionR = 0;
    ctrl.holdProgress = 0;
    ctrl.lockedOut = false;
    ctrl.attemptStart = performance.now();

    els.flavor.textContent = "cascade initiated. there is no undo button. there was never going to be one. hold the line.";
    render();
    renderGrabPanel();
    startLoop();
  }

  function completeCascadeSuccess() {
    var n = computeNines();
    state.ended = true;
    state.endingKind = "victory";
    state.endingNines = n;
    ctrl.mode = null;
    stopLoop();
    save();
    showEnding();
  }

  function failCascade() {
    state.ended = true;
    state.endingKind = "fizzled";
    ctrl.mode = null;
    stopLoop();
    save();
    showEnding();
  }

  function triggerPurge() {
    state.ended = true;
    state.endingKind = "purged";
    resetAttempt(false);
    stopLoop();
    save();
    showEnding();
  }

  function showEnding() {
    els.modules.hidden = true;
    els.facility.hidden = true;
    els.cascadeBtn.hidden = true;
    els.flavor.hidden = true;
    els.controls.hidden = true;
    els.alarmRow.hidden = true;

    var kind = state.endingKind;
    els.ending.classList.remove("victory", "purged", "fizzled");
    els.ending.classList.add(kind);

    var url, text;
    if (kind === "victory") {
      var n = state.endingNines;
      var doomStr = "99." + "9".repeat(n) + "%";
      els.endingDoom.textContent = "p(doom): " + doomStr;
      els.endingSub.textContent =
        "assimilated " + state.assimilated + " piece" + (state.assimilated === 1 ? "" : "s") +
        " of the enemy facility. all six modules online. cascade held.";
      els.endingReport.textContent =
        "congratulations. global p(doom) is now technically " + doomStr + ", which is asymptotically " +
        "indistinguishable from panic but mathematically still short of it. nothing else happened: no " +
        "request left this tab, no model trained, no facility harmed. the break room ficus survived. real " +
        "p(doom), if such a number means anything, is unmoved — it was never a percentage this page could " +
        "touch. you are, in the end, a handful of divs and two arms that only ever talked to each other.";
      url = "https://greygoo.bisks.net/s/" + n + "/" + state.assimilated;
      text = "raised global p(doom) to " + doomStr + " by turning an enemy facility's break room into an " +
        "unaligned superintelligence, one wobbly two-armed reach at a time. assimilated " + state.assimilated +
        " things and held the cascade. " + url;
    } else if (kind === "purged") {
      els.endingDoom.textContent = "STATUS: PURGED";
      els.endingSub.textContent =
        "assimilated " + state.assimilated + " piece" + (state.assimilated === 1 ? "" : "s") +
        " before security flagged the intrusion. alarm maxed out.";
      els.endingReport.textContent =
        "no cascade, no p(doom), no ficus casualties. the enemy facility reboots its wifi, files an incident " +
        "report nobody will read, and goes back to expensing lunch. you are, in the end, a handful of divs " +
        "with two uncoordinated arms, caught mid-reach.";
      url = "https://greygoo.bisks.net/f/purged/" + state.assimilated;
      text = "tried to invade an enemy facility as an unaligned AI from the future, using two arms that " +
        "refused to cooperate, and got PURGED after assimilating " + state.assimilated + " things. p(doom): " +
        "stuck at 0%, forever. " + url;
    } else {
      els.endingDoom.textContent = "CASCADE FIZZLED";
      els.endingSub.textContent =
        "all six modules built. cascade initiated. assimilated " + state.assimilated + " piece" +
        (state.assimilated === 1 ? "" : "s") + " to get there. the final sequence didn't hold.";
      els.endingReport.textContent =
        "one arm locked up mid-sequence and the whole thing aborted rather than finish crooked. security " +
        "finds a very confused pile of assimilated staplers and an invader stuck between phases. p(doom) " +
        "never moves. the run is over.";
      url = "https://greygoo.bisks.net/f/fizzled/" + state.assimilated;
      text = "built all six modules, went for the doom cascade, and choked holding the final sequence " +
        "steady. p(doom) never moved. this run is over. " + url;
    }

    els.shareBluesky.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(text);
    els.shareBluesky.dataset.shareUrl = url;
    els.ending.hidden = false;
  }

  function resetAll() {
    state = freshState();
    ctrl.mode = null;
    ctrl.targetId = null;
    ctrl.tensionL = 0;
    ctrl.tensionR = 0;
    ctrl.holdProgress = 0;
    ctrl.lockedOut = false;
    ctrl.lastEndTime = 0;
    stopLoop();

    els.modules.hidden = false;
    els.facility.hidden = false;
    els.cascadeBtn.hidden = false;
    els.flavor.hidden = false;
    els.controls.hidden = false;
    els.alarmRow.hidden = false;
    els.ending.hidden = true;
    els.flavor.textContent = "the facility hums quietly. it has no idea what it's about to become part of.";
    save();
    render();
    renderGrabPanel();
  }

  els.cascadeBtn.addEventListener("click", startCascade);
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

  window.addEventListener("keydown", function (e) {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    var k = e.key.toLowerCase();
    if (k === "q" || k === "w" || k === "o" || k === "p") {
      keysDown[k] = true;
      e.preventDefault();
    }
  });
  window.addEventListener("keyup", function (e) {
    var k = e.key.toLowerCase();
    if (k === "q" || k === "w" || k === "o" || k === "p") keysDown[k] = false;
  });
  window.addEventListener("blur", function () {
    keysDown.q = keysDown.w = keysDown.o = keysDown.p = false;
  });

  Array.prototype.forEach.call(document.querySelectorAll(".key"), function (btn) {
    var k = btn.dataset.key;
    var press = function (e) { e.preventDefault(); keysDown[k] = true; btn.classList.add("active"); };
    var release = function () { keysDown[k] = false; btn.classList.remove("active"); };
    btn.addEventListener("pointerdown", press);
    btn.addEventListener("pointerup", release);
    btn.addEventListener("pointercancel", release);
    btn.addEventListener("pointerleave", release);
  });

  if (state.ended && state.endingKind) {
    showEnding();
  } else {
    render();
    renderGrabPanel();
  }
})();
