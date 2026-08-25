// graycart — the engine. Assembles a fresh "cartridge" (palette, mechanic,
// sprites, sounds) from one random seed on every page load, runs the loop,
// and hands input from keyboard/touch to whichever mechanic is active.
(function () {
  "use strict";

  const { GC } = window;
  const W = GC.SCREEN_W,
    H = GC.SCREEN_H;

  const ALL_SHADES = ["#0f0f0f", "#4d4d4d", "#a6a6a6", "#f5f5f5"];

  const canvas = document.getElementById("screen");
  const g = canvas.getContext("2d");
  g.imageSmoothingEnabled = false;

  const els = {
    frame: document.getElementById("frame"),
    prompt: document.getElementById("prompt"),
    newCart: document.getElementById("newCartBtn"),
    shareBtn: document.getElementById("shareBtn"),
    copyLinkBtn: document.getElementById("copyLinkBtn"),
    shareStatus: document.getElementById("shareStatus"),
    cartCode: document.getElementById("cartCode"),
  };

  function seedFromUrl() {
    const raw = new URLSearchParams(location.search).get("seed");
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n >>> 0 : null;
  }
  let pendingSeed = seedFromUrl();

  function fitScreen() {
    const wrap = document.getElementById("screenWrap");
    const rect = wrap.getBoundingClientRect();
    const scale = Math.max(1, Math.floor(Math.min(rect.width / W, rect.height / H)));
    canvas.style.width = W * scale + "px";
    canvas.style.height = H * scale + "px";
  }
  window.addEventListener("resize", fitScreen);

  // --- input -------------------------------------------------------------
  const KEY_MAP = {
    ArrowUp: "up",
    KeyW: "up",
    ArrowDown: "down",
    KeyS: "down",
    ArrowLeft: "left",
    KeyA: "left",
    ArrowRight: "right",
    KeyD: "right",
    KeyX: "a",
    KeyK: "a",
    KeyZ: "b",
    KeyJ: "b",
  };
  const held = { up: false, down: false, left: false, right: false, a: false, b: false };
  const prevHeld = { ...held };
  const input = { held, pressed: { ...held } };

  window.addEventListener("keydown", (e) => {
    const k = KEY_MAP[e.code];
    if (k) {
      held[k] = true;
      e.preventDefault();
    }
  });
  window.addEventListener("keyup", (e) => {
    const k = KEY_MAP[e.code];
    if (k) held[k] = false;
  });

  function bindTouchButton(el, key) {
    if (!el) return;
    const on = (e) => {
      e.preventDefault();
      held[key] = true;
      el.classList.add("held");
      resumeAudio();
    };
    const off = (e) => {
      e.preventDefault();
      held[key] = false;
      el.classList.remove("held");
    };
    el.addEventListener("pointerdown", on);
    el.addEventListener("pointerup", off);
    el.addEventListener("pointerleave", off);
    el.addEventListener("pointercancel", off);
    el.addEventListener("contextmenu", (e) => e.preventDefault());
  }
  ["up", "down", "left", "right", "a", "b"].forEach((k) => {
    bindTouchButton(document.querySelector(`[data-btn="${k}"]`), k);
  });

  function resumeAudio() {
    if (cartridge) cartridge.audio.resume();
  }
  window.addEventListener("pointerdown", resumeAudio, { once: true });
  window.addEventListener("keydown", resumeAudio, { once: true });

  // --- cartridge assembly --------------------------------------------------
  let cartridge = null;
  let state = "playing"; // playing | ended
  let endedAt = 0;
  let flashKind = null;

  function buildCartridge(seedOverride) {
    const seed = seedOverride != null ? seedOverride : GC.freshSeed();
    const rng = GC.makeRng(seed);
    const perm = rng.shuffle([0, 1, 2, 3]);
    const shades = perm.map((i) => ALL_SHADES[i]);
    const kind = rng.pick(GC.MECHANIC_KINDS);
    const audio = GC.makeAudio(rng);
    const sprites = { makeSprite: GC.makeSprite };
    const mechanic = GC.createMechanic(kind, rng, sprites, audio);
    return { seed, rng, shades, kind, audio, mechanic };
  }

  function newCartridge() {
    const seed = pendingSeed;
    pendingSeed = null;
    cartridge = buildCartridge(seed);
    state = "playing";
    flashKind = null;
    els.prompt.hidden = true;
    els.shareStatus.textContent = "";
    if (els.cartCode) els.cartCode.textContent = "#" + cartridge.seed;
  }

  function cartridgeUrl() {
    return location.origin + location.pathname + "?seed=" + cartridge.seed;
  }

  // --- loop ----------------------------------------------------------------
  let lastT = performance.now();
  function frame(t) {
    const dt = Math.min(0.05, (t - lastT) / 1000);
    lastT = t;

    input.pressed = {
      up: held.up && !prevHeld.up,
      down: held.down && !prevHeld.down,
      left: held.left && !prevHeld.left,
      right: held.right && !prevHeld.right,
      a: held.a && !prevHeld.a,
      b: held.b && !prevHeld.b,
    };

    if (state === "playing") {
      cartridge.mechanic.update(dt, input);
      if (cartridge.mechanic.status !== "playing") {
        state = "ended";
        endedAt = t;
        flashKind = cartridge.mechanic.status;
        els.prompt.hidden = false;
        els.prompt.textContent =
          flashKind === "win" ? "o  o  o" : "x  x  x";
        els.prompt.className = "prompt " + flashKind;
      }
    }

    g.fillStyle = cartridge.shades[0];
    g.fillRect(0, 0, W, H);
    cartridge.mechanic.render(g, cartridge.shades);

    if (state === "ended") {
      const since = (t - endedAt) / 1000;
      if (flashKind === "win") {
        const a = Math.max(0, 0.6 - since * 1.2);
        if (a > 0) {
          g.fillStyle = cartridge.shades[3];
          g.globalAlpha = a;
          g.fillRect(0, 0, W, H);
          g.globalAlpha = 1;
        }
      } else {
        const a = Math.max(0, 0.55 - since * 1.0);
        if (a > 0) {
          g.fillStyle = cartridge.shades[0];
          g.globalAlpha = a;
          g.fillRect(0, 0, W, H);
          g.globalAlpha = 1;
        }
      }
    }

    Object.assign(prevHeld, held);
    requestAnimationFrame(frame);
  }

  // --- restart / new cartridge ----------------------------------------------
  function tryRestart() {
    if (state === "ended") newCartridge();
  }
  els.newCart.addEventListener("click", () => {
    resumeAudio();
    newCartridge();
  });
  window.addEventListener("keydown", (e) => {
    if (KEY_MAP[e.code] && state === "ended") tryRestart();
  });
  ["up", "down", "left", "right", "a", "b"].forEach((k) => {
    const el = document.querySelector(`[data-btn="${k}"]`);
    if (el)
      el.addEventListener("pointerdown", () => {
        if (state === "ended") tryRestart();
      });
  });

  // --- share -----------------------------------------------------------------
  function buildShareCard() {
    const scale = 4;
    const pad = 24;
    const card = document.createElement("canvas");
    card.width = W * scale + pad * 2;
    card.height = H * scale + pad * 2 + 90;
    const cg = card.getContext("2d");
    cg.fillStyle = "#1a1a1a";
    cg.fillRect(0, 0, card.width, card.height);
    cg.imageSmoothingEnabled = false;
    cg.drawImage(canvas, pad, pad, W * scale, H * scale);
    cg.strokeStyle = "#555";
    cg.lineWidth = 4;
    cg.strokeRect(pad, pad, W * scale, H * scale);
    cg.fillStyle = "#f5f5f5";
    cg.font = "bold 34px monospace";
    cg.fillText("graycart.bisks.net", pad, card.height - 34);
    cg.fillStyle = "#999";
    cg.font = "20px monospace";
    cg.fillText("no manual included", pad, card.height - 10);
    return card;
  }

  function shareText() {
    const outcome = flashKind === "win" ? "cleared a cartridge" : flashKind === "lose" ? "got got by a cartridge" : "poking at a cartridge";
    return `${outcome}, no idea what the rules were — try the same one: ${cartridgeUrl()}`;
  }

  function canShareFiles() {
    if (!navigator.share || !navigator.canShare) return false;
    try {
      const probe = new File([""], "probe.png", { type: "image/png" });
      return navigator.canShare({ files: [probe] });
    } catch {
      return false;
    }
  }

  els.shareBtn.addEventListener("click", async () => {
    const card = buildShareCard();
    card.toBlob(async (blob) => {
      if (!blob) return;
      if (canShareFiles()) {
        const file = new File([blob], "graycart.png", { type: "image/png" });
        try {
          await navigator.share({ files: [file], text: shareText(), title: "graycart" });
          return;
        } catch {
          // fall through to download + compose link
        }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "graycart.png";
      a.click();
      URL.revokeObjectURL(url);
      window.open(
        "https://bsky.app/intent/compose?text=" + encodeURIComponent(shareText()),
        "_blank"
      );
      els.shareStatus.textContent = "saved a screenshot — attach it to the post";
    }, "image/png");
  });

  if (els.copyLinkBtn) {
    els.copyLinkBtn.addEventListener("click", async () => {
      const url = cartridgeUrl();
      try {
        await navigator.clipboard.writeText(url);
        els.shareStatus.textContent = "link copied — same cartridge for whoever opens it";
      } catch {
        window.prompt("copy this cartridge's link:", url);
      }
    });
  }

  fitScreen();
  newCartridge();
  requestAnimationFrame(frame);
})();
