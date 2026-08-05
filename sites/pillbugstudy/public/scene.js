// pillbugstudy — a keyhole peek into @isolyth.dev's study.
//
// @isolyth.dev's real avatar becomes the pillbug's head and every "sin" is
// one of their real recent posts, both fetched client-side straight from
// the public AppView (same no-server-round-trip trick as sites/beatupbuddy
// and sites/skyclone — read-only app.bsky.* calls don't need auth or a
// worker in the loop). No physics engine here: the pillbug's hunch, sob,
// and tears are hand-rolled CSS keyframes plus a couple of timed DOM tweaks,
// there's nothing to simulate.
(function () {
  "use strict";

  const APPVIEW = "https://public.api.bsky.app";
  const HANDLE = "isolyth.dev";
  const CYCLE_MS = 7000;

  const FALLBACK_SINS = [
    "I subtweeted and then panicked",
    "I liked my own reply",
    "I said 'per my last post' unprompted",
    "I posted at 3am again",
    "I quote-posted just to add 'lol'",
    "I never finished that thread",
    "I said I'd log off and didn't",
    "I screenshotted my own post to feel something",
    "I checked the like count four times",
    "I subposted about a subpost",
  ];

  const els = {
    keyhole: document.getElementById("keyhole"),
    pillbug: document.getElementById("pillbug"),
    face: document.getElementById("pbface"),
    confession: document.getElementById("confession"),
    sinN: document.getElementById("sin-n"),
    sinText: document.getElementById("sin-text"),
    sinsCount: document.getElementById("sins-count"),
    loading: document.getElementById("loading"),
    loadingText: document.getElementById("loading-text"),
    hint: document.getElementById("hint"),
    scene: document.getElementById("scene"),
    shareBsky: document.getElementById("share-bsky"),
  };

  async function xrpc(method, params) {
    const qs = new URLSearchParams(params).toString();
    const res = await fetch(`${APPVIEW}/xrpc/${method}${qs ? "?" + qs : ""}`);
    if (!res.ok) throw new Error(`${method} ${res.status}`);
    return res.json();
  }

  function cleanPostText(text) {
    return text.replace(/https?:\/\/\S+/g, "").replace(/\s+/g, " ").trim();
  }

  async function loadStudyData() {
    let profile = null;
    let sins = [];
    try {
      profile = await xrpc("app.bsky.actor.getProfile", { actor: HANDLE });
    } catch (_) {}
    try {
      const feed = await xrpc("app.bsky.feed.getAuthorFeed", {
        actor: HANDLE,
        limit: "50",
        filter: "posts_no_replies",
      });
      const seen = new Set();
      for (const item of feed.feed || []) {
        const rec = item.post && item.post.record;
        if (!rec || typeof rec.text !== "string") continue;
        const text = cleanPostText(rec.text);
        if (!text || text.length < 3 || seen.has(text)) continue;
        seen.add(text);
        sins.push(text.length > 140 ? text.slice(0, 139) + "…" : text);
        if (sins.length >= 40) break;
      }
    } catch (_) {}
    if (sins.length < 5) sins = sins.concat(FALLBACK_SINS);
    return { profile, sins };
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // ---- tiny synthesized sniffle, no external asset ----------------------
  let audioCtx = null;
  function sniffle() {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const t0 = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(420, t0);
      osc.frequency.exponentialRampToValueAtTime(260, t0 + 0.22);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.09, t0 + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.3);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.32);
    } catch (_) {}
  }

  function spawnTear() {
    const tear = document.createElement("div");
    tear.className = "tear";
    const startX = 42 + Math.random() * 10; // near the head, in % of scene width
    tear.style.left = startX + "%";
    tear.style.bottom = "34%";
    els.scene.appendChild(tear);
    const fall = tear.animate(
      [
        { transform: "translateY(0) rotate(45deg)", opacity: 0 },
        { transform: "translateY(6px) rotate(45deg)", opacity: 1, offset: 0.15 },
        { transform: "translateY(90px) rotate(45deg)", opacity: 0 },
      ],
      { duration: 900 + Math.random() * 300, easing: "cubic-bezier(.4,0,.7,1)" }
    );
    fall.onfinish = () => tear.remove();
  }

  let sins = [];
  let order = [];
  let idx = 0;
  let confessed = 0;
  let cycleTimer = null;

  function nextOrder() {
    order = shuffle(sins.map((_, i) => i));
    idx = 0;
  }

  function showSin(bump) {
    if (!sins.length) return;
    if (idx >= order.length) nextOrder();
    const sinIndex = order[idx++];
    confessed++;
    els.sinN.textContent = String(confessed);
    els.sinText.textContent = '"' + sins[sinIndex] + '"';
    els.sinsCount.textContent = String(confessed);
    els.confession.classList.add("show");

    els.pillbug.classList.remove("sob");
    void els.pillbug.offsetWidth; // restart animation
    els.pillbug.classList.add("sob");
    spawnTear();
    if (Math.random() < 0.6) setTimeout(spawnTear, 180);
    if (bump) {
      sniffle();
      if (els.hint) els.hint.style.opacity = "0";
    }

    els.shareBsky.href =
      "https://bsky.app/intent/compose?text=" +
      encodeURIComponent(
        `I peeked through the keyhole and watched @isolyth.dev confess ${confessed} sin${confessed === 1 ? "" : "s"} today. https://pillbugstudy.bisks.net/s/${confessed}`
      );
  }

  function scheduleCycle() {
    clearInterval(cycleTimer);
    cycleTimer = setInterval(() => showSin(false), CYCLE_MS);
  }

  els.keyhole.addEventListener("click", () => {
    showSin(true);
    scheduleCycle();
  });

  (async function init() {
    const { profile, sins: fetchedSins } = await loadStudyData();
    sins = fetchedSins;
    nextOrder();

    if (profile && profile.avatar) {
      els.face.src = profile.avatar;
    } else {
      els.face.style.display = "none";
    }

    els.loading.style.opacity = "0";
    els.loading.style.transition = "opacity 0.35s ease";
    setTimeout(() => { els.loading.style.display = "none"; }, 380);

    // one free confession up front so the scene isn't static on arrival
    setTimeout(() => showSin(false), 900);
    scheduleCycle();
  })().catch(() => {
    els.loadingText.textContent = "couldn't reach the AppView — the study is a little quieter than usual.";
    setTimeout(() => { els.loading.style.display = "none"; }, 1600);
    sins = FALLBACK_SINS;
    nextOrder();
    setTimeout(() => showSin(false), 900);
    scheduleCycle();
  });
})();
