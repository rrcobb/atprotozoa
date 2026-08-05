// hype up buddy — physics ragdoll toy, celebration edition.
//
// Formerly "beat up buddy": @isolyth.dev asked for a beat-up-a-buddy game
// with @mfzx.net's real face on it, we built it, and once it was live
// @mfzx.net said they weren't sure how they felt about it — @bisks.net then
// asked us to turn it into something more positive. So: no more damage, no
// more pain cries quoting their real posts, no more choke mechanic. Same
// ragdoll physics toy, but every tool now showers buddy in confetti and
// love, a "hype" meter climbs instead of hp draining, and the reaction
// bubbles are canned warm lines — not their own words repurposed as
// suffering.
//
// @mfzx.net's real avatar is still the ragdoll's head (fetched client-side
// straight from the public AppView, same as sites/skyclone / didscope — no
// server round trip needed for read-only app.bsky.* calls). Physics is
// Matter.js (CDN, physics-only — rendering is a hand-rolled canvas loop
// below so the head can be a clipped avatar image instead of a sprite
// texture). The ragdoll's body is a neutral tan/stitched dummy, not a skin
// tone — only the head is really them.
(function () {
  "use strict";

  const APPVIEW = "https://public.api.bsky.app";
  const HANDLE = "mfzx.net";
  const MAX_HYPE = 100;
  const ENOUGH_HITS = 5; // eris' law of fives: five is always enough to start sharing

  const HYPE_LINES = [
    "aw stop it 🥹", "okay i love this actually", "we're doing this now? okay",
    "not the confetti cannon", "10/10 vibes", "this is so nice", "i'm saving this",
    "best day honestly", "keep going", "screenshotting this one for good reasons",
    "certified good time", "big same", "real ones know", "no notes",
  ];

  // ---- AppView fetch: avatar only, no auth needed -------------------------

  async function xrpc(method, params) {
    const qs = new URLSearchParams(params).toString();
    const res = await fetch(`${APPVIEW}/xrpc/${method}${qs ? "?" + qs : ""}`);
    if (!res.ok) throw new Error(`${method} ${res.status}`);
    return res.json();
  }

  async function loadBuddyProfile() {
    try {
      return await xrpc("app.bsky.actor.getProfile", { actor: HANDLE });
    } catch (_) {
      return null;
    }
  }

  // cdn.bsky.app doesn't send Access-Control-Allow-Origin, so a
  // crossOrigin="anonymous" load of it fails outright (onerror, no image at
  // all) rather than just tainting the canvas. Plain <img> rendering onto
  // the live game canvas never needs pixel readback, so it loads that way —
  // untainted only matters for the share-card canvas's toBlob(), which
  // requests its own CORS copy separately and just skips the avatar circle
  // if that one comes back null (same tolerated gap as sites/didscope).
  function loadImage(url, cors) {
    return new Promise((resolve) => {
      if (!url) return resolve(null);
      const img = new Image();
      if (cors) img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = url;
    });
  }

  // ---- tiny synthesized cheer chime, no external asset ---------------------

  let audioCtx = null;
  function chime(strength) {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const t0 = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(420 + strength * 8, t0);
      osc.frequency.exponentialRampToValueAtTime(720 + strength * 6, t0 + 0.09);
      gain.gain.setValueAtTime(0.16, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.16);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.17);
    } catch (_) {}
  }

  // ---- tools ----------------------------------------------------------------

  const TOOLS = {
    confetti: { emoji: "\u{1F389}", label: "confetti", hype: 10, speed: 13 },
    popper: { emoji: "\u{1F38A}", label: "popper", hype: 12, speed: 15 },
    horn: { emoji: "\u{1F4E3}", label: "airhorn", hype: 11, speed: 14 },
    crown: { emoji: "\u{1F451}", label: "crown", hype: 16, speed: 18 },
    trophy: { emoji: "\u{1F3C6}", label: "trophy", hype: 15, speed: 17 },
    flowers: { emoji: "\u{1F490}", label: "flowers", hype: 8, speed: 12 },
    heart: { emoji: "\u{1FAF6}", label: "heart hands", hype: 7, speed: 11 },
  };
  const TOOL_ORDER = ["confetti", "popper", "horn", "crown", "trophy", "flowers", "heart"];

  const PARTICLE_COLORS = ["#ffcf4d", "#5ee6a8", "#ff6ec7", "#7fbfff", "#ffffff"];

  // ---- arena / physics setup -------------------------------------------------

  const ARENA_W = 420;
  const ARENA_H = 680;
  const FLOOR_Y = ARENA_H - 40; // matches the floor strip drawn in drawBackdrop
  const ROPE_LEN = 70; // invisible — never drawn. A short pivot keeps hits a tight
                        // in-place wobble/dance, instead of a big pendulum swing.

  const HEAD_R = 32;
  const TORSO_W = 46, TORSO_H = 86;
  const U_ARM_W = 16, U_ARM_H = 46;
  const L_ARM_W = 14, L_ARM_H = 42;
  const U_LEG_W = 20, U_LEG_H = 52;
  const L_LEG_W = 17, L_LEG_H = 48;

  // standing layout, built up from the floor so feet land near the floor line
  // rather than dangling mid-air the way a rope-hung figure would.
  const FEET_Y = FLOOR_Y - 6;
  const L_LEG_Y = FEET_Y - L_LEG_H / 2;
  const U_LEG_Y = L_LEG_Y - L_LEG_H / 2 - U_LEG_H / 2;
  const HIP_Y = U_LEG_Y - U_LEG_H / 2;
  const TORSO_Y = HIP_Y - TORSO_H / 2 + 6;
  const SHOULDER_Y = TORSO_Y - TORSO_H / 2 + 6;
  const U_ARM_Y = SHOULDER_Y + U_ARM_H / 2;
  const L_ARM_Y = U_ARM_Y + U_ARM_H / 2 + L_ARM_H / 2;
  const HEAD_Y = TORSO_Y - TORSO_H / 2 - 8 - HEAD_R;

  // fixed, invisible pivot the head hangs from — stable "hangs straight down
  // from a fixed point" pendulum so it's self-righting and can't fly off,
  // never rendered as a rope, positioned so at rest the figure's feet land
  // on the floor instead of swinging clear of it.
  const ANCHOR = { x: ARENA_W / 2, y: HEAD_Y - ROPE_LEN };

  const DUMMY_FILL = "#caa06a";
  const DUMMY_STROKE = "#8a6a42";
  const STITCH = "#5c4326";

  const { Engine, World, Bodies, Body, Constraint, Query, Runner } = Matter;

  const engine = Engine.create();
  engine.gravity.y = 1;
  const world = engine.world;

  const NOGROUP = Body.nextGroup(true);

  const PART_DEFAULTS = { friction: 0.5, frictionAir: 0.02, restitution: 0.35 };

  function circlePart(x, y, r, extra) {
    const b = Bodies.circle(x, y, r, Object.assign({}, PART_DEFAULTS, extra));
    b.collisionFilter.group = NOGROUP;
    return b;
  }

  function rectPart(x, y, w, h, extra) {
    const b = Bodies.rectangle(x, y, w, h, Object.assign({}, PART_DEFAULTS, extra));
    b.collisionFilter.group = NOGROUP;
    return b;
  }

  function makeBounds() {
    const t = 60;
    return [
      Bodies.rectangle(ARENA_W / 2, ARENA_H + t / 2 - 20, ARENA_W + 200, t, { isStatic: true }),
      Bodies.rectangle(-t / 2, ARENA_H / 2, t, ARENA_H + 200, { isStatic: true }),
      Bodies.rectangle(ARENA_W + t / 2, ARENA_H / 2, t, ARENA_H + 200, { isStatic: true }),
      Bodies.rectangle(ARENA_W / 2, -t / 2, ARENA_W + 200, t, { isStatic: true }),
    ];
  }
  World.add(world, makeBounds());

  let rag = null;
  let tether = null;

  function buildRagdoll() {
    const cx = ANCHOR.x;
    const armX = TORSO_W / 2 + U_ARM_W / 2 - 2;
    const legX = TORSO_W / 4;

    const parts = {
      head: circlePart(cx, HEAD_Y, HEAD_R, { density: 0.007 }),
      torso: rectPart(cx, TORSO_Y, TORSO_W, TORSO_H, { density: 0.009 }),
      upperArmL: rectPart(cx - armX, U_ARM_Y, U_ARM_W, U_ARM_H, { density: 0.006 }),
      lowerArmL: rectPart(cx - armX, L_ARM_Y, L_ARM_W, L_ARM_H, { density: 0.006 }),
      upperArmR: rectPart(cx + armX, U_ARM_Y, U_ARM_W, U_ARM_H, { density: 0.006 }),
      lowerArmR: rectPart(cx + armX, L_ARM_Y, L_ARM_W, L_ARM_H, { density: 0.006 }),
      upperLegL: rectPart(cx - legX, U_LEG_Y, U_LEG_W, U_LEG_H, { density: 0.007 }),
      lowerLegL: rectPart(cx - legX, L_LEG_Y, L_LEG_W, L_LEG_H, { density: 0.007 }),
      upperLegR: rectPart(cx + legX, U_LEG_Y, U_LEG_W, U_LEG_H, { density: 0.007 }),
      lowerLegR: rectPart(cx + legX, L_LEG_Y, L_LEG_W, L_LEG_H, { density: 0.007 }),
    };

    function j(bodyA, bodyB, pointA, pointB, stiffness) {
      return Constraint.create({ bodyA, bodyB, pointA, pointB, stiffness: stiffness, damping: 0.25, length: 2 });
    }

    const constraints = [
      j(parts.head, parts.torso, { x: 0, y: HEAD_R * 0.7 }, { x: 0, y: -TORSO_H / 2 }, 0.6),
      j(parts.torso, parts.upperArmL, { x: -TORSO_W / 2 + 4, y: -TORSO_H / 2 + 6 }, { x: 0, y: -U_ARM_H / 2 }, 0.5),
      j(parts.upperArmL, parts.lowerArmL, { x: 0, y: U_ARM_H / 2 }, { x: 0, y: -L_ARM_H / 2 }, 0.55),
      j(parts.torso, parts.upperArmR, { x: TORSO_W / 2 - 4, y: -TORSO_H / 2 + 6 }, { x: 0, y: -U_ARM_H / 2 }, 0.5),
      j(parts.upperArmR, parts.lowerArmR, { x: 0, y: U_ARM_H / 2 }, { x: 0, y: -L_ARM_H / 2 }, 0.55),
      j(parts.torso, parts.upperLegL, { x: -legX, y: TORSO_H / 2 - 6 }, { x: 0, y: -U_LEG_H / 2 }, 0.55),
      j(parts.upperLegL, parts.lowerLegL, { x: 0, y: U_LEG_H / 2 }, { x: 0, y: -L_LEG_H / 2 }, 0.6),
      j(parts.torso, parts.upperLegR, { x: legX, y: TORSO_H / 2 - 6 }, { x: 0, y: -U_LEG_H / 2 }, 0.55),
      j(parts.upperLegR, parts.lowerLegR, { x: 0, y: U_LEG_H / 2 }, { x: 0, y: -L_LEG_H / 2 }, 0.6),
    ];

    tether = Constraint.create({
      pointA: ANCHOR,
      bodyB: parts.head,
      pointB: { x: 0, y: -HEAD_R * 0.75 },
      stiffness: 0.35,
      damping: 0.15,
      length: ROPE_LEN - HEAD_R * 0.75,
    });

    World.add(world, [...Object.values(parts), ...constraints, tether]);
    return { parts, constraints };
  }

  function tearDownRagdoll() {
    if (!rag) return;
    World.remove(world, Object.values(rag.parts));
    World.remove(world, rag.constraints);
    if (tether) World.remove(world, tether);
    rag = null;
    tether = null;
  }

  function respawn() {
    tearDownRagdoll();
    rag = buildRagdoll();
  }

  // ---- state -----------------------------------------------------------------

  const state = {
    hype: 0,
    hits: 0,
    startedAt: null,
    koAt: null,
    tool: "confetti",
    toolCounts: {},
    gameOver: false,
    avatar: null,
    avatarCORS: null,
    profile: null,
    lastLine: -1,
    bubbles: [],
    particles: [],
    sparkles: [],
    shake: 0,
    autoRate: 0, // 0-100, "auto-hype" slider — passive regen, no clicking required
    autoHypeAccum: 0, // hype accrued since the last auto pulse (visual/audio beat)
  };

  // quadratic ramp: most of the slider feels like a gentle trickle, but the
  // top end blows well past anything a thumb can do — riziles asked for a
  // regen slider that at max "regenerates faster than I could possibly
  // click," so max needs to clear the fastest realistic manual throughput
  // (best tool is crown at 16 hype/hit, and nobody's landing 10 clean taps/sec
  // on a ragdoll) by a comfortable margin.
  const AUTO_MAX_HYPE_PER_SEC = 260;
  const AUTO_PULSE_HYPE = 10; // one visual/audio beat per this much accrued hype

  function autoHypePerMs() {
    if (state.autoRate <= 0) return 0;
    return (state.autoRate / 100) ** 2 * (AUTO_MAX_HYPE_PER_SEC / 1000);
  }

  // ---- canvas / camera -----------------------------------------------------

  const canvas = document.getElementById("stage");
  const ctx = canvas.getContext("2d");
  let cssScale = 1, offX = 0, offY = 0, dpr = 1;

  function fitCanvas() {
    const wrap = document.getElementById("stage-wrap");
    const rect = wrap.getBoundingClientRect();
    dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    cssScale = Math.min(rect.width / ARENA_W, rect.height / ARENA_H);
    offX = (rect.width - ARENA_W * cssScale) / 2;
    offY = (rect.height - ARENA_H * cssScale) / 2;
  }
  window.addEventListener("resize", fitCanvas);
  // mobile browsers don't reliably fire plain "resize" when the address bar
  // hides/shows on scroll — visualViewport does, and without this the
  // canvas keeps the stale letterboxed size from the moment the page loaded
  // (chrome visible) so taps land offset from where the ragdoll is drawn.
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", fitCanvas);
  }
  fitCanvas();

  function clientToArena(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const cssX = clientX - rect.left;
    const cssY = clientY - rect.top;
    return { x: (cssX - offX) / cssScale, y: (cssY - offY) / cssScale };
  }

  // ---- drawing helpers -------------------------------------------------

  function drawRoundedRect(x, y, w, h, angle, fill, stroke) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.beginPath();
    const r = Math.min(w, h) * 0.35;
    ctx.roundRect(-w / 2, -h / 2, w, h, r);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = stroke;
    ctx.stroke();
    // stitch line down the middle, ragdoll-sack flavor
    ctx.strokeStyle = STITCH;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(0, -h / 2 + 4);
    ctx.lineTo(0, h / 2 - 4);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  function drawLimb(body, w, h) {
    drawRoundedRect(body.position.x, body.position.y, w, h, body.angle, DUMMY_FILL, DUMMY_STROKE);
  }

  function drawHead(body) {
    const { x, y } = body.position;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(body.angle);
    ctx.beginPath();
    ctx.arc(0, 0, HEAD_R, 0, Math.PI * 2);
    ctx.closePath();
    ctx.save();
    ctx.clip();
    if (state.avatar) {
      ctx.drawImage(state.avatar, -HEAD_R, -HEAD_R, HEAD_R * 2, HEAD_R * 2);
    } else {
      ctx.fillStyle = "#3a3a5b";
      ctx.fillRect(-HEAD_R, -HEAD_R, HEAD_R * 2, HEAD_R * 2);
      ctx.fillStyle = "#f4f7fb";
      ctx.font = "700 26px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("M", 0, 2);
    }
    ctx.restore();
    ctx.lineWidth = 3;
    ctx.strokeStyle = STITCH;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // sparkles accumulate as hype climbs, drawn in head-local unrotated space —
    // a little celebratory shimmer, not a mark of harm.
    for (const s of state.sparkles) {
      ctx.save();
      ctx.translate(x + s.dx, y + s.dy);
      ctx.rotate(s.angle);
      ctx.font = `${s.size}px serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("✨", 0, 0);
      ctx.restore();
    }
  }

  function drawBase() {
    ctx.save();
    ctx.fillStyle = "#1a2130";
    ctx.strokeStyle = "#2c3752";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(ANCHOR.x, FLOOR_Y + 6, 42, 15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function drawBackdrop() {
    const g = ctx.createLinearGradient(0, 0, 0, ARENA_H);
    g.addColorStop(0, "#221c38");
    g.addColorStop(1, "#12151c");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, ARENA_W, ARENA_H);
    ctx.fillStyle = "#171b26";
    ctx.fillRect(0, ARENA_H - 40, ARENA_W, 40);
    ctx.strokeStyle = "#2c3752";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, ARENA_H - 40);
    ctx.lineTo(ARENA_W, ARENA_H - 40);
    ctx.stroke();
  }

  function drawBubbles(dt) {
    for (let i = state.bubbles.length - 1; i >= 0; i--) {
      const b = state.bubbles[i];
      b.life -= dt;
      if (b.life <= 0) {
        state.bubbles.splice(i, 1);
        continue;
      }
      const alpha = Math.min(1, b.life / 300);
      const rise = (1 - Math.min(1, b.life / b.total)) * 30;
      const bx = b.x, by = b.y - 60 - rise;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = "700 13px ui-monospace, monospace";
      const maxW = 190;
      const words = b.text.split(" ");
      const lines = [];
      let line = "";
      for (const w of words) {
        const test = line ? line + " " + w : w;
        if (line && ctx.measureText(test).width > maxW) {
          lines.push(line);
          line = w;
        } else {
          line = test;
        }
      }
      if (line) lines.push(line);
      const lh = 17;
      const padX = 10, padY = 8;
      let w = 0;
      for (const l of lines) w = Math.max(w, ctx.measureText(l).width);
      w += padX * 2;
      const h = lines.length * lh + padY * 2;
      const bx0 = Math.max(8, Math.min(ARENA_W - w - 8, bx - w / 2));
      const by0 = by - h;
      ctx.beginPath();
      ctx.roundRect(bx0, by0, w, h, 10);
      ctx.fillStyle = "#fff8ec";
      ctx.fill();
      ctx.strokeStyle = "#2c3752";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(bx - 6, by0 + h);
      ctx.lineTo(bx + 6, by0 + h);
      ctx.lineTo(bx, by0 + h + 10);
      ctx.closePath();
      ctx.fillStyle = "#fff8ec";
      ctx.fill();
      ctx.fillStyle = "#1a1a2e";
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      lines.forEach((l, idx) => ctx.fillText(l, bx0 + padX, by0 + padY + (idx + 1) * lh - 4));
      ctx.restore();
    }
  }

  function drawParticles(dt) {
    for (let i = state.particles.length - 1; i >= 0; i--) {
      const p = state.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        state.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * (dt / 16);
      p.y += p.vy * (dt / 16);
      p.vy += 0.25 * (dt / 16);
      p.angle += p.spin * (dt / 16);
      const a = Math.max(0, p.life / p.total);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.r, -p.r * 0.6, p.r * 2, p.r * 1.2);
      ctx.restore();
    }
  }

  let lastFrame = null;
  function draw(now) {
    if (lastFrame == null) lastFrame = now;
    const dt = Math.min(48, now - lastFrame);
    lastFrame = now;

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    ctx.translate(offX, offY);
    ctx.scale(cssScale, cssScale);

    if (state.shake > 0.5) {
      ctx.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);
      state.shake *= 0.85;
    } else {
      state.shake = 0;
    }

    stepAuto(dt);

    drawBackdrop();
    drawBase();

    if (rag) {
      const p = rag.parts;
      drawLimb(p.lowerLegL, L_LEG_W, L_LEG_H);
      drawLimb(p.upperLegL, U_LEG_W, U_LEG_H);
      drawLimb(p.lowerLegR, L_LEG_W, L_LEG_H);
      drawLimb(p.upperLegR, U_LEG_W, U_LEG_H);
      drawRoundedRect(p.torso.position.x, p.torso.position.y, TORSO_W, TORSO_H, p.torso.angle, "#9b7a4a", "#6a4e2c");
      drawLimb(p.lowerArmL, L_ARM_W, L_ARM_H);
      drawLimb(p.upperArmL, U_ARM_W, U_ARM_H);
      drawLimb(p.lowerArmR, L_ARM_W, L_ARM_H);
      drawLimb(p.upperArmR, U_ARM_W, U_ARM_H);
      drawHead(p.head);
    }

    drawParticles(dt);
    drawBubbles(dt);

    ctx.restore();
    requestAnimationFrame(draw);
  }

  // ---- idle dance: gentle alternating nudges so it sways in place instead
  // of hanging dead-still before you start hitting it -----------------------

  let danceDir = 1;
  setInterval(() => {
    if (!rag || state.gameOver) return;
    danceDir *= -1;
    Body.applyForce(rag.parts.torso, rag.parts.torso.position, { x: danceDir * 0.0018, y: -0.0008 });
    const leg = danceDir > 0 ? rag.parts.upperLegL : rag.parts.upperLegR;
    Body.applyForce(leg, leg.position, { x: -danceDir * 0.0006, y: 0 });
  }, 1400);

  // ---- hit detection + resolution ---------------------------------------

  function nearestPart(point) {
    if (!rag) return null;
    const hits = Query.point(Object.values(rag.parts), point);
    if (hits.length) return hits[0];
    let best = null, bestDist = 60;
    for (const b of Object.values(rag.parts)) {
      const d = Matter.Vector.magnitude(Matter.Vector.sub(b.position, point));
      if (d < bestDist) {
        bestDist = d;
        best = b;
      }
    }
    return best;
  }

  function spawnParticles(x, y) {
    const n = 10;
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 3;
      state.particles.push({
        x, y,
        vx: Math.cos(ang) * speed,
        vy: Math.sin(ang) * speed - 2,
        angle: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 0.3,
        r: 2.5 + Math.random() * 2.5,
        life: 320 + Math.random() * 220,
        total: 540,
        color: PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)],
      });
    }
  }

  function nextLine() {
    let i = Math.floor(Math.random() * HYPE_LINES.length);
    if (HYPE_LINES.length > 1 && i === state.lastLine) i = (i + 1) % HYPE_LINES.length;
    state.lastLine = i;
    return HYPE_LINES[i];
  }

  function updateHud() {
    document.getElementById("hypefill").style.width = Math.min(100, state.hype) + "%";
    document.getElementById("hypepct").textContent = Math.round(Math.min(100, state.hype)) + "%";
    document.getElementById("hits").textContent = state.hits + (state.hits === 1 ? " cheer" : " cheers");
  }

  function handleHit(point) {
    if (state.gameOver || !rag) return;
    const body = nearestPart(point);
    if (!body) return;
    if (state.startedAt == null) state.startedAt = performance.now();

    const tool = TOOLS[state.tool];
    const torso = rag.parts.torso.position;
    let dir = Matter.Vector.sub(point, torso);
    const mag = Matter.Vector.magnitude(dir);
    dir = mag > 2 ? Matter.Vector.normalise(dir) : { x: Math.random() - 0.5, y: -1 };

    const kick = {
      x: body.velocity.x + dir.x * tool.speed,
      y: body.velocity.y + dir.y * tool.speed - tool.speed * 0.3,
    };
    Body.setVelocity(body, kick);
    Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.4 * (tool.speed / 15));

    state.hype = Math.min(MAX_HYPE, state.hype + tool.hype);
    state.hits += 1;
    state.toolCounts[state.tool] = (state.toolCounts[state.tool] || 0) + 1;
    state.shake = Math.min(14, state.shake + tool.speed * 0.4);
    chime(tool.speed);
    spawnParticles(point.x, point.y);

    const head = rag.parts.head.position;
    state.bubbles.push({ text: nextLine(), x: head.x, y: head.y, life: 1500, total: 1500 });

    if (state.sparkles.length < 18 && Math.random() < 0.6) {
      state.sparkles.push({
        dx: (Math.random() - 0.5) * HEAD_R * 1.6,
        dy: (Math.random() - 0.5) * HEAD_R * 1.6,
        angle: Math.random() * Math.PI * 2,
        size: 8 + Math.random() * 8,
      });
    }

    updateHud();
    updateEarlyShare();

    if (state.hype >= MAX_HYPE && !state.gameOver) {
      state.gameOver = true;
      state.koAt = performance.now();
      hideEarlyShare();
      setTimeout(showKO, 800);
    }
  }

  // ---- auto-hype: passive regen driven by the slider, not taps ------------

  let lastAutoChime = 0;
  function autoPulse() {
    if (state.startedAt == null) state.startedAt = performance.now();
    state.hits += 1;
    const head = rag.parts.head.position;
    // a shimmer, not a kick — auto-hype is ambient joy climbing on its own,
    // so it nudges the ragdoll rather than launching it like a real tool hit.
    const jiggle = 2 + (state.autoRate / 100) * 4;
    Body.applyForce(rag.parts.torso, rag.parts.torso.position, {
      x: (Math.random() - 0.5) * jiggle * 0.001,
      y: -Math.random() * jiggle * 0.0006,
    });
    state.shake = Math.min(10, state.shake + 2);
    spawnParticles(head.x, head.y + HEAD_R * 0.6);
    state.bubbles.push({ text: nextLine(), x: head.x, y: head.y, life: 900, total: 900 });
    if (state.sparkles.length < 18 && Math.random() < 0.7) {
      state.sparkles.push({
        dx: (Math.random() - 0.5) * HEAD_R * 1.6,
        dy: (Math.random() - 0.5) * HEAD_R * 1.6,
        angle: Math.random() * Math.PI * 2,
        size: 8 + Math.random() * 8,
      });
    }
    const now = performance.now();
    if (now - lastAutoChime > 90) {
      chime(10 + (state.autoRate / 100) * 10);
      lastAutoChime = now;
    }
  }

  function stepAuto(dt) {
    if (state.gameOver || !rag) return;
    const perMs = autoHypePerMs();
    if (perMs <= 0) return;
    const gain = perMs * dt;
    state.hype = Math.min(MAX_HYPE, state.hype + gain);
    state.autoHypeAccum += gain;
    while (state.autoHypeAccum >= AUTO_PULSE_HYPE) {
      state.autoHypeAccum -= AUTO_PULSE_HYPE;
      autoPulse();
    }
    updateHud();
    updateEarlyShare();
    if (state.hype >= MAX_HYPE && !state.gameOver) {
      state.gameOver = true;
      state.koAt = performance.now();
      hideEarlyShare();
      setTimeout(showKO, 800);
    }
  }

  const autoSlider = document.getElementById("autoSlider");
  const autoPct = document.getElementById("autopct");
  autoSlider.addEventListener("input", () => {
    state.autoRate = Number(autoSlider.value);
    autoPct.textContent = state.autoRate === 0 ? "off" : state.autoRate + "%";
  });

  canvas.addEventListener("pointerdown", (e) => {
    handleHit(clientToArena(e.clientX, e.clientY));
  });
  canvas.addEventListener("pointermove", (e) => {
    const cur = document.getElementById("cursor-tool");
    cur.style.left = e.clientX + "px";
    cur.style.top = e.clientY + "px";
  });

  // ---- toolbar ------------------------------------------------------------

  const toolbar = document.getElementById("toolbar");
  TOOL_ORDER.forEach((key) => {
    const t = TOOLS[key];
    const btn = document.createElement("button");
    btn.className = "tool-btn" + (key === state.tool ? " active" : "");
    btn.innerHTML = `${t.emoji}<small>${t.label}</small>`;
    btn.addEventListener("click", () => {
      state.tool = key;
      document.querySelectorAll(".tool-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById("cursor-tool").textContent = t.emoji;
    });
    toolbar.appendChild(btn);
  });

  // ---- celebration screen + sharing -------------------------------------------------

  function favoriteTool() {
    let best = null, bestN = -1;
    for (const k of Object.keys(state.toolCounts)) {
      if (state.toolCounts[k] > bestN) {
        bestN = state.toolCounts[k];
        best = k;
      }
    }
    return best ? TOOLS[best].emoji + " " + TOOLS[best].label : "—";
  }

  function shareUrlFor(hits) {
    return "https://beatupbuddy.bisks.net/s/" + hits;
  }

  function buildShareText(hits, seconds) {
    return (
      `I hyped up @mfzx.net's ragdoll ${hits} time${hits === 1 ? "" : "s"} in ${seconds}s and gave them the best day.\n\n` +
      `your turn → ${shareUrlFor(hits)}`
    );
  }

  function buildProgressShareText(hits) {
    return (
      `I've cheered on @mfzx.net's ragdoll ${hits} time${hits === 1 ? "" : "s"} so far and they're having a great time.\n\n` +
      `pick up a tool → ${shareUrlFor(hits)}`
    );
  }

  function updateEarlyShare() {
    if (state.gameOver || state.hits < ENOUGH_HITS) return;
    document.getElementById("share-bsky-early").href =
      "https://bsky.app/intent/compose?text=" + encodeURIComponent(buildProgressShareText(state.hits));
    document.getElementById("early-share").classList.add("show");
  }

  function hideEarlyShare() {
    document.getElementById("early-share").classList.remove("show");
  }

  function showKO() {
    const seconds = Math.max(1, Math.round((state.koAt - (state.startedAt || state.koAt)) / 1000));
    document.getElementById("stat-hits").textContent = state.hits;
    document.getElementById("stat-time").textContent = seconds + "s";
    document.getElementById("stat-tool").textContent = favoriteTool();

    const text = buildShareText(state.hits, seconds);
    document.getElementById("share-bsky").href =
      "https://bsky.app/intent/compose?text=" + encodeURIComponent(text);

    document.getElementById("ko").classList.add("show");
  }

  function hideKO() {
    document.getElementById("ko").classList.remove("show");
  }

  function resetGame() {
    state.hype = 0;
    state.hits = 0;
    state.startedAt = null;
    state.koAt = null;
    state.toolCounts = {};
    state.gameOver = false;
    state.bubbles = [];
    state.particles = [];
    state.sparkles = [];
    state.shake = 0;
    state.autoHypeAccum = 0;
    // autoRate itself carries over — if you maxed the slider, "hype them up
    // again" keeps it maxed instead of silently resetting your setting.
    updateHud();
    respawn();
    hideKO();
    hideEarlyShare();
  }

  document.getElementById("again-btn").addEventListener("click", resetGame);

  // ---- share card image (canvas -> download / native share sheet) -------

  function canShareFiles() {
    if (!navigator.share || !navigator.canShare) return false;
    try {
      const probe = new File([""], "probe.png", { type: "image/png" });
      return navigator.canShare({ files: [probe] });
    } catch (_) {
      return false;
    }
  }

  async function buildShareCard() {
    const canvasEl = document.getElementById("shareCanvas");
    const c = canvasEl.getContext("2d");
    const W = canvasEl.width, H = canvasEl.height;
    const mono = "ui-monospace, monospace";

    c.fillStyle = "#12151c";
    c.fillRect(0, 0, W, H);
    const g = c.createRadialGradient(W * 0.5, -H * 0.1, 0, W * 0.5, -H * 0.1, W * 0.6);
    g.addColorStop(0, "#2a2242");
    g.addColorStop(1, "rgba(18,21,28,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);

    c.textAlign = "left";
    c.fillStyle = "#ffcf4d";
    c.font = "800 50px " + mono;
    c.fillText("hype up buddy", 60, 100);

    let textX = 60;
    if (state.avatarCORS) {
      c.save();
      c.beginPath();
      c.arc(88, 152, 30, 0, Math.PI * 2);
      c.closePath();
      c.clip();
      c.drawImage(state.avatarCORS, 58, 122, 60, 60);
      c.restore();
      textX = 136;
    }
    c.fillStyle = "#5ee6a8";
    c.font = "700 30px " + mono;
    c.fillText("@mfzx.net had the best day", textX, 162);

    const seconds = Math.max(1, Math.round((state.koAt - (state.startedAt || state.koAt)) / 1000));
    c.strokeStyle = "#2c3752";
    c.lineWidth = 1.5;
    const cardX = 60, cardY = 230, cardW = W - 120, cardH = H - 300;
    c.fillStyle = "#1a2130";
    c.beginPath();
    c.roundRect(cardX, cardY, cardW, cardH, 18);
    c.fill();
    c.stroke();

    const stats = [
      [String(state.hits), "cheers"],
      [seconds + "s", "celebrating"],
      [favoriteTool(), "favorite tool"],
    ];
    const colW = cardW / stats.length;
    stats.forEach(([n, l], i) => {
      const cx = cardX + colW * i + colW / 2;
      c.textAlign = "center";
      c.fillStyle = "#f4f7fb";
      c.font = "800 46px " + mono;
      c.fillText(n, cx, cardY + cardH / 2 + 4);
      c.fillStyle = "#9aa6c2";
      c.font = "600 16px " + mono;
      c.fillText(l, cx, cardY + cardH / 2 + 34);
    });

    c.textAlign = "left";
    c.fillStyle = "#9aa6c2";
    c.font = "600 20px " + mono;
    c.fillText("beatupbuddy.bisks.net", 60, H - 50);

    return new Promise((resolve) => canvasEl.toBlob(resolve, "image/png"));
  }

  document.getElementById("share-card-btn").addEventListener("click", async () => {
    const blob = await buildShareCard();
    if (!blob) return;
    const seconds = Math.max(1, Math.round((state.koAt - (state.startedAt || state.koAt)) / 1000));
    const file = new File([blob], "hypeupbuddy.png", { type: "image/png" });
    if (canShareFiles()) {
      try {
        await navigator.share({ files: [file], text: buildShareText(state.hits, seconds), title: "hype up buddy" });
        return;
      } catch (_) {
        // fall through to download
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "hypeupbuddy.png";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  });

  // ---- boot ---------------------------------------------------------------

  async function boot() {
    respawn();
    updateHud();
    requestAnimationFrame(draw);
    Runner.run(Runner.create(), engine);

    document.getElementById("cursor-tool").textContent = TOOLS[state.tool].emoji;

    const profile = await loadBuddyProfile();
    state.profile = profile;
    if (profile && profile.avatar) {
      state.avatar = await loadImage(profile.avatar, false);
      state.avatarCORS = await loadImage(profile.avatar, true);
    }
    const handle = (profile && profile.handle) || HANDLE;
    document.getElementById("handle").textContent = "@" + handle;
    document.getElementById("loading").style.display = "none";
  }

  boot();
})();
