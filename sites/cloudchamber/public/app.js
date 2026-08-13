// cloud chamber — the live Bluesky firehose rendered as cosmic-ray tracks.
//
// Every "app.bsky.feed.post" create event on Jetstream is a detection event.
// classify() sorts it into one of 8 particle species by what its record
// actually contains (embed type, reply, facets), then spawnParticle() gives
// it a track shaped like its physical namesake. Nothing is stored — trails
// are drawn with an additive blend and erased a little every frame, so the
// whole scene evaporates within a few seconds, same as a real chamber.

(function () {
  "use strict";

  const canvas = document.getElementById("tank");
  const ctx = canvas.getContext("2d", { alpha: true });
  let W = 0, H = 0, DPR = 1;

  function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.floor(W * DPR);
    canvas.height = Math.floor(H * DPR);
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  window.addEventListener("resize", resize);
  resize();

  // ---- particle species ---------------------------------------------------
  // color: [r,g,b]. width/glow in px. speed in px/s. curve in rad/s (sign
  // randomized per spawn unless noted). life in seconds (track duration
  // before the head stops advancing — the drawn ink keeps fading after).
  const SPECIES = {
    muon: { label: "muon", color: [214, 228, 255], width: 1.3, glow: 5, speed: 230, curve: 0.18, life: 1.5, alpha: 0.85 },
    electron: { label: "electron", color: [255, 150, 210], width: 0.9, glow: 7, speed: 175, curve: 2.7, life: 1.7, alpha: 0.8 },
    positron: { label: "positron", color: [150, 255, 214], width: 0.9, glow: 7, speed: 175, curve: 2.7, life: 1.7, alpha: 0.8 },
    proton: { label: "proton", color: [255, 205, 120], width: 2.6, glow: 9, speed: 150, curve: 0.4, life: 1.4, alpha: 0.9 },
    alpha: { label: "alpha", color: [255, 140, 110], width: 4.4, glow: 11, speed: 78, curve: 0.1, life: 0.75, alpha: 1 },
    gamma: { label: "gamma", color: [255, 255, 255], width: 1.1, glow: 16, speed: 360, curve: 0, life: 1.0, alpha: 1 },
    neutrino: { label: "neutrino", color: [130, 175, 255], width: 0.5, glow: 2, speed: 270, curve: 0, life: 1.6, alpha: 0.26, dashed: true },
    kaon: { label: "kaon", color: [230, 190, 255], width: 1.4, glow: 8, speed: 195, curve: 0.22, life: 1.9, alpha: 0.9, decays: true, decayFrac: 0.32 },
  };
  const ORDER = ["muon", "electron", "positron", "proton", "alpha", "gamma", "neutrino", "kaon"];

  // ---- classification -------------------------------------------------------
  function embedMediaType(embed) {
    if (!embed) return null;
    if (embed.$type === "app.bsky.embed.recordWithMedia") {
      return embed.media && embed.media.$type;
    }
    return embed.$type;
  }

  function classify(record) {
    const embed = record.embed;
    const mt = embedMediaType(embed);
    const t = embed && embed.$type;

    if (mt === "app.bsky.embed.video") return "proton";
    if (mt === "app.bsky.embed.images") return "alpha";
    if (t === "app.bsky.embed.record" || t === "app.bsky.embed.recordWithMedia") return "positron";
    if (record.reply) return "electron";
    if (mt === "app.bsky.embed.external") return "neutrino";

    let hasTag = false, hasMention = false;
    const facets = record.facets || [];
    for (const f of facets) {
      for (const feat of f.features || []) {
        if (feat.$type === "app.bsky.richtext.facet#tag") hasTag = true;
        if (feat.$type === "app.bsky.richtext.facet#mention") hasMention = true;
      }
    }
    if (hasTag) return "gamma";
    if (hasMention) return "kaon";
    return "muon";
  }

  // ---- particles --------------------------------------------------------
  let particles = [];
  const stats = { counts: Object.fromEntries(ORDER.map((k) => [k, 0])), dropped: 0 };

  function spawnParticle(kind, opts) {
    opts = opts || {};
    const sp = SPECIES[kind];
    const margin = 60;
    let x, y, heading;
    if (opts.x != null) {
      x = opts.x;
      y = opts.y;
      heading = opts.heading;
    } else {
      const edge = Math.floor(Math.random() * 4);
      if (edge === 0) { x = Math.random() * W; y = -margin; heading = Math.PI / 2 + (Math.random() - 0.5) * 1.5; }
      else if (edge === 1) { x = W + margin; y = Math.random() * H; heading = Math.PI + (Math.random() - 0.5) * 1.5; }
      else if (edge === 2) { x = Math.random() * W; y = H + margin; heading = -Math.PI / 2 + (Math.random() - 0.5) * 1.5; }
      else { x = -margin; y = Math.random() * H; heading = 0 + (Math.random() - 0.5) * 1.5; }
    }
    const curveSign = opts.curveSign != null ? opts.curveSign : Math.random() < 0.5 ? 1 : -1;
    particles.push({
      sp,
      x, y, heading,
      curve: sp.curve * curveSign * (0.7 + Math.random() * 0.6),
      speed: sp.speed * (0.82 + Math.random() * 0.36),
      born: performance.now(),
      life: sp.life * 1000 * (0.85 + Math.random() * 0.3),
      decays: !!sp.decays,
      decayed: false,
      decayFrac: sp.decayFrac || 0.35,
      faintAlpha: opts.faintAlpha,
    });
    if (!opts.silent) {
      stats.counts[kind] = (stats.counts[kind] || 0) + 1;
      updateLegend();
    }
  }

  function spawnKaonChildren(p) {
    const kids = [
      { sp: SPECIES.electron, sign: 1 },
      { sp: SPECIES.positron, sign: -1 },
    ];
    for (const kid of kids) {
      const dh = kid.sign * (0.45 + Math.random() * 0.25);
      particles.push({
        sp: kid.sp,
        x: p.x, y: p.y, heading: p.heading + dh,
        curve: kid.sp.curve * kid.sign * (0.8 + Math.random() * 0.4),
        speed: kid.sp.speed * 0.62,
        born: performance.now(),
        life: 420 + Math.random() * 320,
        decays: false,
        decayed: true,
        faintAlpha: 0.42,
      });
    }
  }

  function drawSegment(x0, y0, x1, y1, sp, faintAlpha) {
    const [r, g, b] = sp.color;
    const a = faintAlpha != null ? faintAlpha : sp.alpha;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = `rgba(${r},${g},${b},${a})`;
    ctx.lineWidth = sp.width;
    ctx.lineCap = "round";
    ctx.shadowColor = `rgba(${r},${g},${b},${Math.min(1, a + 0.25)})`;
    ctx.shadowBlur = sp.glow;
    if (sp.dashed) ctx.setLineDash([3, 6]);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.restore();
  }

  function step(dt) {
    const now = performance.now();
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      const age = now - p.born;
      if (age > p.life || p.x < -100 || p.x > W + 100 || p.y < -100 || p.y > H + 100) {
        particles.splice(i, 1);
        continue;
      }
      const px = p.x, py = p.y;
      p.heading += p.curve * dt;
      p.x += Math.cos(p.heading) * p.speed * dt;
      p.y += Math.sin(p.heading) * p.speed * dt;
      drawSegment(px, py, p.x, p.y, p.sp, p.faintAlpha);
      if (p.decays && !p.decayed && age / p.life > p.decayFrac) {
        p.decayed = true;
        spawnKaonChildren(p);
      }
    }
  }

  // ---- render loop --------------------------------------------------------
  const FADE = 0.028;
  let paused = false;
  let lastT = null;

  function frame(t) {
    requestAnimationFrame(frame);
    if (paused) { lastT = t; return; }
    if (lastT == null) lastT = t;
    let dt = (t - lastT) / 1000;
    lastT = t;
    dt = Math.min(dt, 0.05);

    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = `rgba(0,0,0,${FADE})`;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    step(dt);
  }
  requestAnimationFrame(frame);

  // ---- legend ---------------------------------------------------------------
  const legendEl = document.getElementById("legend");
  legendEl.innerHTML = ORDER.map((k) => {
    const sp = SPECIES[k];
    const [r, g, b] = sp.color;
    return `<div class="row"><span class="sw" style="background:rgb(${r},${g},${b})"></span><span class="name">${sp.label}</span><span class="count" id="cnt-${k}">0</span></div>`;
  }).join("");
  function updateLegend() {
    for (const k of ORDER) {
      const el = document.getElementById("cnt-" + k);
      if (el) el.textContent = stats.counts[k] || 0;
    }
  }

  // ---- rate control ---------------------------------------------------------
  const rateSlider = document.getElementById("rateSlider");
  const rateVal = document.getElementById("rateVal");
  rateSlider.addEventListener("input", () => {
    rateVal.textContent = rateSlider.value;
  });

  let nextAllowedAt = 0;
  function maybeSpawn(kind) {
    const now = performance.now();
    if (now < nextAllowedAt) {
      stats.dropped++;
      return;
    }
    const rate = Number(rateSlider.value) || 6;
    const spacing = 1000 / rate;
    nextAllowedAt = now + spacing * (0.5 + Math.random() * 0.9);
    spawnParticle(kind);
  }

  // ---- pause ------------------------------------------------------------
  const pauseBtn = document.getElementById("pauseBtn");
  pauseBtn.addEventListener("click", () => {
    paused = !paused;
    pauseBtn.textContent = paused ? "resume" : "pause";
  });

  // ---- about modal --------------------------------------------------------
  const about = document.getElementById("about");
  document.getElementById("aboutBtn").addEventListener("click", () => about.classList.add("open"));
  document.getElementById("closeAbout").addEventListener("click", () => about.classList.remove("open"));
  about.addEventListener("click", (e) => {
    if (e.target === about) about.classList.remove("open");
  });

  // ---- snapshot / share -----------------------------------------------------
  document.getElementById("snapBtn").addEventListener("click", async () => {
    const off = document.createElement("canvas");
    off.width = canvas.width;
    off.height = canvas.height;
    const octx = off.getContext("2d");
    const w = off.width, h = off.height;
    const grad = octx.createRadialGradient(w * 0.5, h * 0.4, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.75);
    grad.addColorStop(0, "#0d1830");
    grad.addColorStop(1, "#05070c");
    octx.fillStyle = grad;
    octx.fillRect(0, 0, w, h);
    octx.drawImage(canvas, 0, 0);

    off.toBlob(async (blob) => {
      if (!blob) return;
      const shareText = "live cosmic-ray detections on the bluesky firehose — cloudchamber.bisks.net";
      const file = new File([blob], "cloudchamber.png", { type: "image/png" });
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], text: shareText, title: "cloud chamber" });
          return;
        } catch (e) {
          // fall through to download + compose
        }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "cloudchamber.png";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      window.open("https://bsky.app/intent/compose?text=" + encodeURIComponent(shareText), "_blank", "noopener");
    }, "image/png");
  });

  // ---- jetstream ----------------------------------------------------------
  const JETSTREAM = "wss://jetstream2.us-east.bsky.network/subscribe?wantedCollections=app.bsky.feed.post";
  const dot = document.getElementById("dot");
  const statusEl = document.getElementById("status");
  let ws = null;
  let retry = 0;
  let manualClose = false;
  let windowCount = 0;

  function setStatus(live, text) {
    dot.classList.toggle("off", !live);
    statusEl.textContent = text;
  }

  function connect() {
    manualClose = false;
    try {
      ws = new WebSocket(JETSTREAM);
    } catch (e) {
      scheduleReconnect();
      return;
    }
    ws.onopen = () => {
      retry = 0;
      setStatus(true, "live · watching the firehose");
    };
    ws.onmessage = (ev) => {
      if (paused) return;
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      const c = msg.commit;
      if (msg.kind === "commit" && c && c.operation === "create" && c.collection === "app.bsky.feed.post" && c.record) {
        windowCount++;
        const kind = classify(c.record);
        maybeSpawn(kind);
      }
    };
    ws.onclose = () => {
      if (manualClose) return;
      setStatus(false, "reconnecting…");
      scheduleReconnect();
    };
    ws.onerror = () => {
      try {
        ws.close();
      } catch {}
    };
  }
  function scheduleReconnect() {
    retry = Math.min(retry + 1, 6);
    setTimeout(connect, 400 * retry + Math.random() * 400);
  }
  connect();

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (ws) {
        manualClose = true;
        ws.close();
        ws = null;
      }
    } else if (!ws) {
      connect();
    }
  });

  setInterval(() => {
    if (!dot.classList.contains("off") && !paused) {
      statusEl.textContent = `${windowCount} posts/s on the wire · ${particles.length} tracks live`;
    } else if (paused) {
      statusEl.textContent = "paused";
    }
    windowCount = 0;
  }, 1000);
})();
