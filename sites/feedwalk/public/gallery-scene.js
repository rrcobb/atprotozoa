// gallery-scene.js — the 3D viewport for feedwalk.bisks.net.
//
// Pure rendering + movement + procedural generation: a first-person walk
// down an endless museum corridor that forks and widens into rooms as you
// go, built segment by segment as the player approaches the frontier. app.js
// (the UI/data layer) hands this a pool of real posts once, then this file
// owns everything about turning that pool into a walkable space.
//
// Same CDN-importmap "three" pattern as sites/hypertower, sites/mootcraft.
//
// --- how the endless corridor stays correct without ever being visually
// tested in a headless build environment ---
// Every wall/floor/ceiling piece is a THREE.BoxGeometry (6 well-defined
// faces, correct normals no matter how it's rotated/positioned) rather than
// a single-sided Plane — that removes an entire class of "invisible
// backface" bug. Every exhibit picture is a DoubleSide plane for the same
// reason: a sign error in which way it should face costs a mirrored image,
// never a blank wall.
//
// The player's position is tracked in path-relative coordinates
// (segmentIndex, localT along the segment, lateral offset u across it) and
// converted to world space with the *exact* formula used to place that
// segment's group (position + rotation.y), so movement and geometry can
// never disagree about where the walls are — see localToWorld() below and
// its use in both buildSegmentGroup() and updateCamera().
import * as THREE from "three";

(function () {
  "use strict";

  const SEG_LEN = 8;
  const WIDTH = 6;
  const HEIGHT = 4;
  const ROOM_LEN = 12;
  const ROOM_WIDTH = 10;
  const ROOM_HEIGHT = 5.6;
  const ROOM_EVERY = 5;
  const TURN_MIN_GAP = 2;
  const TURN_CHANCE = 0.4;
  const FLOOR_TH = 0.2;

  const RAMP_CHANCE = 0.16;
  const RAMP_MIN_GAP = 3;
  const RAMP_RISE = 0.85;

  const STOOL_CHANCE = 0.14;

  const EYE_HEIGHT = 1.65;
  const PLAYER_R = 0.38;
  const WALK_SPEED = 3.3;
  const RUN_MULT = 1.7;
  const LOOK_SENS = 0.0022;
  const TOUCH_LOOK_SENS = 0.0062;

  const RENDER_AHEAD = 6;
  const RENDER_BEHIND = 2;

  const WALL_TH = 0.2;
  const PIC_W = 1.7;
  const PIC_H = 1.25;
  const PIC_Y = 1.68;

  // ---- deterministic-ish helpers ---------------------------------------
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffled(arr, rng) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  // string -> 32-bit seed, so each exhibit gets a *stable* rng (same post
  // always hangs the same way, across rebuilds/laps) without threading a
  // counter through the pool.
  function hashSeed(str) {
    let h = 2166136261;
    str = String(str || "");
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function truncate(s, n) {
    s = (s || "").replace(/\s+/g, " ").trim();
    return s.length > n ? s.slice(0, n - 1) + "…" : s;
  }
  function imgReady(img) {
    return img && img.complete && img.naturalWidth > 0;
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function wrapLines(ctx, text, maxWidth, maxLines) {
    const words = (text || "").split(/\s+/).filter(Boolean);
    const lines = [];
    let line = "";
    for (const w of words) {
      const test = line ? line + " " + w : w;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = w;
        if (lines.length >= maxLines) break;
      } else {
        line = test;
      }
    }
    if (line && lines.length < maxLines) lines.push(line);
    if (lines.length === maxLines) {
      const last = lines[maxLines - 1];
      let cut = last;
      while (ctx.measureText(cut + "…").width > maxWidth && cut.length > 1) cut = cut.slice(0, -1);
      lines[maxLines - 1] = cut + "…";
    }
    return lines;
  }
  function timeAgo(iso) {
    if (!iso) return "";
    const ms = Date.now() - new Date(iso).getTime();
    if (!(ms > 0)) return "";
    const s = ms / 1000;
    if (s < 90) return "just now";
    const m = s / 60;
    if (m < 90) return Math.round(m) + "m ago";
    const h = m / 60;
    if (h < 48) return Math.round(h) + "h ago";
    return Math.round(h / 24) + "d ago";
  }

  // ---- exported controller -----------------------------------------------
  const Feedwalk = {
    ready: false,
    onTarget: null, // callback(post|null)
    _pool: [],
  };

  Feedwalk.init = function init(canvas, opts) {
    opts = opts || {};

    let webgl = false;
    try {
      const probe = document.createElement("canvas");
      webgl = !!(probe.getContext("webgl2") || probe.getContext("webgl"));
    } catch {}
    if (!webgl) {
      Feedwalk.noWebgl = true;
      return Feedwalk;
    }

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    if ("outputColorSpace" in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    const FOG_COLOR = 0x120e18;
    scene.background = new THREE.Color(FOG_COLOR);
    scene.fog = new THREE.Fog(FOG_COLOR, 10, 30);

    const camera = new THREE.PerspectiveCamera(66, 16 / 10, 0.05, 60);

    scene.add(new THREE.HemisphereLight(0xe9dfff, 0x1a1420, 0.75));
    const sun = new THREE.DirectionalLight(0xfff2d8, 0.55);
    sun.position.set(4, 10, 6);
    scene.add(sun);
    const headlamp = new THREE.PointLight(0xfff4e0, 0.9, 9, 2);
    scene.add(headlamp);

    // ---- procedural path ---------------------------------------------
    const segments = []; // metadata, append-only, never removed once made
    const segGroups = new Map(); // index -> THREE.Group currently in the scene
    let lastTurnIndex = -99;
    let lastRampIndex = -99;
    let nextRoomIndex = ROOM_EVERY;
    const globalSeed = (opts.seed >>> 0) || 1337;
    const pathRng = mulberry32(globalSeed ^ 0x9e3779b9);

    function segFrameHeading(prevHeading, index) {
      if (index < 3 || index - lastTurnIndex < TURN_MIN_GAP) return prevHeading;
      if (pathRng() < TURN_CHANCE) {
        lastTurnIndex = index;
        return prevHeading + (pathRng() < 0.5 ? -1 : 1) * (Math.PI / 2);
      }
      return prevHeading;
    }

    function localToWorld(seg, lx, lz) {
      const c = Math.cos(seg.heading), s = Math.sin(seg.heading);
      return { x: seg.start.x + c * lx + s * lz, z: seg.start.z - s * lx + c * lz };
    }
    // inverse of localToWorld: a world-space point -> this segment's local
    // (lx, lz). Rotation matrices built from cos/sin are orthogonal, so the
    // inverse is just the transpose — used to carry the player's position
    // across a segment boundary that changed heading (a turn) without the
    // old local offsets (meant for the old axes) silently getting reused as
    // if they were the new segment's axes.
    function worldToLocal(seg, wx, wz) {
      const dx = wx - seg.start.x, dz = wz - seg.start.z;
      const c = Math.cos(seg.heading), s = Math.sin(seg.heading);
      return { lx: c * dx - s * dz, lz: s * dx + c * dz };
    }

    // ---- exhibit pool + assignment (sequential, shuffled, laps) --------
    let pool = [];
    let order = [];
    let cursor = 0;
    let lap = 0;

    function refillOrder() {
      lap += 1;
      order = pool.length ? shuffled(pool, mulberry32(globalSeed + lap * 7919 + 17)) : [];
      cursor = 0;
    }
    function nextExhibit() {
      if (!pool.length) return null;
      if (cursor >= order.length) refillOrder();
      const post = order[cursor++];
      return { post, lap };
    }

    Feedwalk.loadPool = function loadPool(posts) {
      pool = posts.slice();
      Feedwalk._pool = pool;
      order = [];
      cursor = 0;
      lap = 0;
    };
    Feedwalk.poolSize = function () {
      return pool.length;
    };

    function ensureSegment(i) {
      if (segments[i]) return segments[i];
      let seg;
      if (i === 0) {
        // heading = PI, not 0: the camera's default forward is world -Z
        // (see updateCamera/frame()'s yaw math), so segment 0 must treat
        // "increasing local t" (walking further into the gallery) as
        // heading toward -Z too, or the player would spawn facing the
        // entrance wall instead of the corridor.
        seg = {
          index: 0, start: { x: 0, z: 0 }, heading: Math.PI, turned: false, room: false,
          length: SEG_LEN, width: WIDTH, height: HEIGHT, prevWidth: WIDTH, baseY: 0, rise: 0,
        };
      } else {
        const prev = ensureSegment(i - 1);
        const heading = segFrameHeading(prev.heading, i);
        const start = localToWorld(prev, 0, prev.length);
        // rooms land on a slightly irregular cadence (4-6 segments apart,
        // not a fixed modulo) so the gallery doesn't read as mechanically
        // repeating — part of "more branching" per feedback.
        const room = i === nextRoomIndex;
        if (room) nextRoomIndex = i + 4 + Math.floor(pathRng() * 3);
        const turned = heading !== prev.heading;
        // ramps only happen on straight corridors — combining a slope with
        // a turn's corner geometry, or with a room's bench/seating, isn't
        // worth the added risk for a bot pass that can't be visually tested.
        const rampEligible = !room && !turned && i - lastRampIndex >= RAMP_MIN_GAP;
        const rise = rampEligible && pathRng() < RAMP_CHANCE ? (pathRng() < 0.5 ? -1 : 1) * RAMP_RISE : 0;
        if (rise) lastRampIndex = i;
        const sizeJ = room ? 0.82 + pathRng() * 0.5 : 1;
        seg = {
          index: i,
          start,
          heading,
          turned,
          room,
          length: room ? ROOM_LEN * sizeJ : SEG_LEN,
          width: room ? ROOM_WIDTH * (0.9 + pathRng() * 0.3) : WIDTH,
          height: room ? ROOM_HEIGHT : HEIGHT,
          prevWidth: prev.width,
          baseY: prev.baseY + prev.rise,
          rise,
        };
      }
      const slots = seg.room ? 4 : 2;
      const fracs = seg.room ? [0.28, 0.28, 0.72, 0.72] : [0.5, 0.5];
      const sides = seg.room ? [-1, 1, -1, 1] : [-1, 1];
      seg.exhibits = [];
      for (let k = 0; k < slots; k++) {
        const ex = nextExhibit();
        if (!ex) break;
        seg.exhibits.push({ side: sides[k], atT: fracs[k], post: ex.post, lap: ex.lap });
      }
      const hue = (i * 47) % 360;
      seg.accentHue = hue;
      segments[i] = seg;
      return seg;
    }

    // ---- exhibit texture drawing ----------------------------------------
    const imgCache = new Map(); // url -> HTMLImageElement
    function loadImg(url) {
      if (!url) return null;
      if (imgCache.has(url)) return imgCache.get(url);
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = url;
      imgCache.set(url, img);
      return img;
    }

    function drawExhibit(ctx, w, h, post, lap) {
      ctx.clearRect(0, 0, w, h);
      // museum-card background
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, "#f6f1e6");
      grad.addColorStop(1, "#e9e0cd");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      const pad = 18;
      const avatarR = 26;
      const headerH = 66;
      const footerH = 46;
      const imgArea = { x: pad, y: headerH, w: w - pad * 2, h: h - headerH - footerH };

      const img = post.images && post.images[0] ? loadImg(post.images[0].thumb) : null;
      if (img && imgReady(img)) {
        ctx.save();
        roundRect(ctx, imgArea.x, imgArea.y, imgArea.w, imgArea.h, 8);
        ctx.clip();
        const ir = img.naturalWidth / img.naturalHeight;
        const ar = imgArea.w / imgArea.h;
        let dw, dh, dx, dy;
        if (ir > ar) {
          dh = imgArea.h;
          dw = dh * ir;
          dx = imgArea.x - (dw - imgArea.w) / 2;
          dy = imgArea.y;
        } else {
          dw = imgArea.w;
          dh = dw / ir;
          dx = imgArea.x;
          dy = imgArea.y - (dh - imgArea.h) / 2;
        }
        ctx.drawImage(img, dx, dy, dw, dh);
        ctx.restore();
        if (post.text.trim()) {
          ctx.font = "italic 15px ui-monospace, 'JetBrains Mono', monospace";
          ctx.fillStyle = "#3a3226";
          const lines = wrapLines(ctx, post.text, imgArea.w - 8, 1);
          ctx.fillText(lines[0] || "", imgArea.x + 4, imgArea.y + imgArea.h - 8);
        }
      } else {
        ctx.save();
        roundRect(ctx, imgArea.x, imgArea.y, imgArea.w, imgArea.h, 8);
        ctx.clip();
        ctx.fillStyle = "#efe7d4";
        ctx.fillRect(imgArea.x, imgArea.y, imgArea.w, imgArea.h);
        ctx.fillStyle = "#4a4030";
        ctx.font = "600 22px Georgia, 'Times New Roman', serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const lines = wrapLines(ctx, `"${post.text}"`, imgArea.w - 40, 6);
        const lh = 30;
        const startY = imgArea.y + imgArea.h / 2 - ((lines.length - 1) * lh) / 2;
        lines.forEach((l, i) => ctx.fillText(l, imgArea.x + imgArea.w / 2, startY + i * lh));
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
        ctx.restore();
      }

      // header: avatar + name/handle
      const avImg = loadImg(post.avatar);
      ctx.save();
      ctx.beginPath();
      ctx.arc(pad + avatarR, pad + avatarR, avatarR, 0, Math.PI * 2);
      ctx.clip();
      if (avImg && imgReady(avImg)) {
        ctx.drawImage(avImg, pad, pad, avatarR * 2, avatarR * 2);
      } else {
        ctx.fillStyle = "#c9b98f";
        ctx.fillRect(pad, pad, avatarR * 2, avatarR * 2);
        ctx.fillStyle = "#fff";
        ctx.font = "700 22px ui-monospace, monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText((post.displayName || post.handle || "?")[0].toUpperCase(), pad + avatarR, pad + avatarR + 2);
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
      }
      ctx.restore();

      ctx.fillStyle = "#241f14";
      ctx.font = "700 19px ui-monospace, 'JetBrains Mono', monospace";
      ctx.fillText(truncate(post.displayName || post.handle, 24), pad + avatarR * 2 + 12, pad + 22);
      ctx.fillStyle = "#7a6f52";
      ctx.font = "14px ui-monospace, 'JetBrains Mono', monospace";
      ctx.fillText("@" + truncate(post.handle, 28), pad + avatarR * 2 + 12, pad + 42);

      // footer: like/repost + relative time + lap tint
      ctx.fillStyle = "rgba(36,31,20,0.08)";
      ctx.fillRect(0, h - footerH, w, footerH);
      ctx.fillStyle = "#4a4030";
      ctx.font = "700 15px ui-monospace, 'JetBrains Mono', monospace";
      ctx.fillText(`♥ ${post.likeCount}   ⟲ ${post.repostCount}`, pad, h - 16);
      ctx.font = "13px ui-monospace, 'JetBrains Mono', monospace";
      ctx.fillStyle = "#7a6f52";
      const ago = timeAgo(post.createdAt);
      const label = lap > 1 ? `lap ${lap}${ago ? " · " + ago : ""}` : ago;
      if (label) {
        ctx.textAlign = "right";
        ctx.fillText(label, w - pad, h - 16);
        ctx.textAlign = "left";
      }

      // frame hairline
      ctx.strokeStyle = "rgba(36,31,20,0.35)";
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, w - 2, h - 2);
    }

    // ---- geometry builders (all boxes — correct normals regardless of
    // rotation, see file header) -------------------------------------------
    // Shared across every segment's frame bars/bench, so disposeGroup() must
    // never dispose() these — a single streamed-out segment would otherwise
    // free the GPU material every other still-visible frame/bench uses too.
    const benchMat = new THREE.MeshStandardMaterial({ color: 0x2e2620, roughness: 0.8 });
    benchMat.userData.shared = true;

    // a few frame finishes instead of one uniform wood bar everywhere —
    // weighted so classic wood still dominates but the wall reads as hung
    // over time, not stamped from one mold. Shared + never disposed, same
    // reasoning as benchMat above.
    const FRAME_FINISHES = [
      { color: 0x3a2c1a, roughness: 0.6, metalness: 0.15, weight: 0.55 }, // wood
      { color: 0x9c7a2e, roughness: 0.35, metalness: 0.55, weight: 0.18 }, // gilt
      { color: 0x14110f, roughness: 0.5, metalness: 0.1, weight: 0.17 },  // black
      { color: 0xdcd2ba, roughness: 0.7, metalness: 0.02, weight: 0.1 },  // ivory
    ];
    const frameMats = FRAME_FINISHES.map((f) => {
      const m = new THREE.MeshStandardMaterial({ color: f.color, roughness: f.roughness, metalness: f.metalness });
      m.userData.shared = true;
      return m;
    });
    function pickFrameMat(rng) {
      const r = rng();
      let acc = 0;
      for (let i = 0; i < FRAME_FINISHES.length; i++) {
        acc += FRAME_FINISHES[i].weight;
        if (r < acc) return frameMats[i];
      }
      return frameMats[0];
    }

    // ramp treads: a faint horizontal-line texture on a sloped floor so it
    // reads as shallow stairs rather than a plain wedge — decorative only,
    // the walking surface underneath is still a smooth slope (see
    // buildRampFloor), so it stays cheap and collision-free.
    let treadTexture = null;
    function getTreadTexture() {
      if (treadTexture) return treadTexture;
      const cnv = document.createElement("canvas");
      cnv.width = 64;
      cnv.height = 64;
      const ctx = cnv.getContext("2d");
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, 64, 64);
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.lineWidth = 2;
      const rows = 8;
      for (let i = 0; i <= rows; i++) {
        const y = (i / rows) * 64;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(64, y);
        ctx.stroke();
      }
      treadTexture = new THREE.CanvasTexture(cnv);
      treadTexture.wrapS = treadTexture.wrapT = THREE.RepeatWrapping;
      return treadTexture;
    }

    function wallMaterial(hue, parity) {
      const c = new THREE.Color().setHSL(hue / 360, 0.28, 0.22);
      const m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.92, metalness: 0.02 });
      m.polygonOffset = true;
      m.polygonOffsetFactor = parity ? 1 : -1;
      m.polygonOffsetUnits = parity ? 1 : -1;
      return m;
    }
    function floorMaterial(hue, parity) {
      const c = new THREE.Color().setHSL(((hue + 40) % 360) / 360, 0.22, 0.16);
      const m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.96, metalness: 0.0 });
      // turns make adjacent segments' floor/ceiling boxes overlap at the
      // inner corner (two coplanar coincident top faces) — without this,
      // that overlap flickers between the two segments' colors every
      // frame. Alternating the offset by index parity means whichever of
      // the two ALWAYS wins the depth test there, so it reads as one
      // clean corner instead of a fight.
      m.polygonOffset = true;
      m.polygonOffsetFactor = parity ? 1 : -1;
      m.polygonOffsetUnits = parity ? 1 : -1;
      return m;
    }

    // a sloped floor slab, exact — not an approximation. cz/cy/hyp solve
    // the box's rotated-length and center exactly so its TOP face passes
    // through local (x,0,0) at z=0 and (x,rise,length) at z=length for any
    // slab thickness th, keeping the seam flush with the flat floors on
    // either side of a ramp segment.
    function buildRampFloor(length, rise, width, th, mat) {
      const hyp = Math.hypot(rise, length);
      const theta = Math.atan2(-rise, length);
      const cz = length / 2 + (rise * th) / (2 * hyp);
      const cy = rise / 2 - (length * th) / (2 * hyp);
      const geo = new THREE.BoxGeometry(width, th, hyp);
      const tex = getTreadTexture();
      const treadMat = mat.clone();
      treadMat.map = tex.clone();
      treadMat.map.needsUpdate = true;
      treadMat.map.repeat.set(1, Math.max(1, Math.round(hyp / 0.55)));
      const mesh = new THREE.Mesh(geo, treadMat);
      mesh.position.set(0, cy, cz);
      mesh.rotation.x = theta;
      return mesh;
    }

    function buildExhibitFrame(seg, ex) {
      const rng = mulberry32(hashSeed(ex.post.uri || `${seg.index}:${ex.side}:${ex.atT}`) ^ 0x51ed270b);
      const scale = 0.92 + rng() * 0.22;
      const tilt = (rng() - 0.5) * 0.06;
      const yJitter = (rng() - 0.5) * 0.26;
      const fancy = (ex.post.likeCount || 0) >= 15;

      const group = new THREE.Group();
      const lx = (seg.width / 2 - 0.05) * ex.side;
      const lz = ex.atT * seg.length;
      const picY = PIC_Y + seg.rise * ex.atT + yJitter;
      group.position.set(lx, picY, lz);
      group.rotation.y = ex.side < 0 ? Math.PI / 2 : -Math.PI / 2;
      group.rotation.z = tilt;
      group.scale.setScalar(scale);

      const cnv = document.createElement("canvas");
      cnv.width = 640;
      cnv.height = Math.round((640 * PIC_H) / PIC_W);
      const ctx = cnv.getContext("2d");
      drawExhibit(ctx, cnv.width, cnv.height, ex.post, ex.lap);
      const tex = new THREE.CanvasTexture(cnv);
      tex.anisotropy = 4;

      const picGeo = new THREE.PlaneGeometry(PIC_W, PIC_H);
      const picMat = new THREE.MeshStandardMaterial({
        map: tex,
        roughness: 0.85,
        metalness: 0.0,
        side: THREE.DoubleSide,
        emissiveMap: tex,
        emissive: new THREE.Color(0xffffff),
        emissiveIntensity: 0.08,
      });
      const pic = new THREE.Mesh(picGeo, picMat);
      pic.userData.post = ex.post;
      group.add(pic);

      const frameMat = pickFrameMat(rng);
      const bw = fancy ? 0.13 : 0.08;
      const fw = PIC_W + bw * 2, fh = PIC_H + bw * 2;
      const bars = [
        [fw, bw, 0, fh / 2 - bw / 2],
        [fw, bw, 0, -(fh / 2 - bw / 2)],
        [bw, fh, fw / 2 - bw / 2, 0],
        [bw, fh, -(fw / 2 - bw / 2), 0],
      ];
      for (const [bw_, bh_, ox, oy] of bars) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(bw_, bh_, 0.05), frameMat);
        bar.position.set(ox, oy, -0.03);
        group.add(bar);
      }
      if (fancy) {
        // a well-liked post gets a second, thinner gilt mat around the
        // main frame — a little museum-label flex for the crowd favorites.
        const ow = 0.05, ofw = fw + ow * 2, ofh = fh + ow * 2;
        const outerBars = [
          [ofw, ow, 0, ofh / 2 - ow / 2],
          [ofw, ow, 0, -(ofh / 2 - ow / 2)],
          [ow, ofh, ofw / 2 - ow / 2, 0],
          [ow, ofh, -(ofw / 2 - ow / 2), 0],
        ];
        for (const [bw_, bh_, ox, oy] of outerBars) {
          const bar = new THREE.Mesh(new THREE.BoxGeometry(bw_, bh_, 0.04), frameMats[1]);
          bar.position.set(ox, oy, -0.02);
          group.add(bar);
        }
      }

      const refreshImg = () => {
        if (!img1 && !img2) return;
        drawExhibit(ctx, cnv.width, cnv.height, ex.post, ex.lap);
        tex.needsUpdate = true;
      };
      const img1 = ex.post.images && ex.post.images[0] ? loadImg(ex.post.images[0].thumb) : null;
      const img2 = ex.post.avatar ? loadImg(ex.post.avatar) : null;
      if (img1 && !imgReady(img1)) img1.addEventListener("load", refreshImg, { once: true });
      if (img2 && !imgReady(img2)) img2.addEventListener("load", refreshImg, { once: true });

      group.userData.pickable = pic;
      return group;
    }

    function buildSegmentGroup(seg) {
      const group = new THREE.Group();
      group.position.set(seg.start.x, seg.baseY, seg.start.z);
      group.rotation.y = seg.heading;

      const parity = seg.index % 2 === 0;
      const wMat = wallMaterial(seg.accentHue, parity);
      const fMat = floorMaterial(seg.accentHue, parity);

      const floor = seg.rise
        ? buildRampFloor(seg.length, seg.rise, seg.width, FLOOR_TH, fMat)
        : new THREE.Mesh(new THREE.BoxGeometry(seg.width, FLOOR_TH, seg.length), fMat);
      if (!seg.rise) floor.position.set(0, -FLOOR_TH / 2, seg.length / 2);
      group.add(floor);

      // ceiling stays flat even over a ramp (headroom just tightens toward
      // the top of the slope, like a real gallery stair run) — a tilted
      // ceiling isn't worth the extra geometry risk for a segment you only
      // walk under briefly.
      const ceil = new THREE.Mesh(new THREE.BoxGeometry(seg.width, 0.2, seg.length), wMat);
      ceil.position.set(0, seg.height + 0.1, seg.length / 2);
      group.add(ceil);

      // walls span from the LOWEST point the sloped floor reaches (0 for a
      // flat segment, or `rise` when the ramp dips below its start) up to
      // the flat ceiling — otherwise a downward ramp's far end would have
      // its floor drop out from under the wall, leaving a gap at the seam.
      const wallLo = Math.min(0, seg.rise);
      const wallH = seg.height - wallLo;
      const left = new THREE.Mesh(new THREE.BoxGeometry(WALL_TH, wallH, seg.length), wMat);
      left.position.set(-seg.width / 2 - WALL_TH / 2, wallLo + wallH / 2, seg.length / 2);
      group.add(left);

      const right = new THREE.Mesh(new THREE.BoxGeometry(WALL_TH, wallH, seg.length), wMat);
      right.position.set(seg.width / 2 + WALL_TH / 2, wallLo + wallH / 2, seg.length / 2);
      group.add(right);

      // jamb caps: when this segment is narrower than the one before it
      // (room -> corridor, no turn), the wider predecessor's floor extends
      // past this segment's walls with nothing closing the gap — a real
      // hole you could see/step into right at the doorway. Plug it with a
      // stub wall on each side that shrank.
      if (!seg.turned && seg.prevWidth > seg.width + 0.01) {
        const gap = (seg.prevWidth - seg.width) / 2;
        for (const side of [-1, 1]) {
          const jamb = new THREE.Mesh(new THREE.BoxGeometry(gap, seg.height, WALL_TH), wMat);
          jamb.position.set(side * (seg.width / 2 + gap / 2), seg.height / 2, WALL_TH / 2);
          group.add(jamb);
        }
      }

      if (seg.room) {
        const glow = new THREE.PointLight(0xfff2d0, 0.55, 9, 2);
        glow.position.set(0, seg.height - 0.6, seg.length / 2);
        group.add(glow);
        const bench = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.45, 0.5), benchMat);
        bench.position.set(0, 0.22, seg.length / 2);
        group.add(bench);
      } else if (!seg.turned && !seg.rise) {
        // a little seat along the wall now and then — corridors get them
        // too, not just rooms (the one piece of feedback that was pure
        // praise, so: more of it). Deterministic per segment index so it
        // doesn't flicker in/out as segments stream past.
        const stoolRng = mulberry32(hashSeed(`stool:${globalSeed}:${seg.index}`));
        if (stoolRng() < STOOL_CHANCE) {
          const stoolSide = stoolRng() < 0.5 ? -1 : 1;
          const stool = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), benchMat);
          stool.position.set(stoolSide * (seg.width / 2 - 0.35), 0.21, seg.length * 0.5);
          group.add(stool);
        }
      }

      const pickables = [];
      for (const ex of seg.exhibits) {
        const frame = buildExhibitFrame(seg, ex);
        group.add(frame);
        pickables.push(frame.userData.pickable);
      }
      group.userData.pickables = pickables;

      scene.add(group);
      return group;
    }

    function disposeGroup(group) {
      scene.remove(group);
      group.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          for (const m of mats) {
            if (m.userData && m.userData.shared) continue;
            if (m.map) m.map.dispose();
            if (m.emissiveMap && m.emissiveMap !== m.map) m.emissiveMap.dispose();
            m.dispose();
          }
        }
      });
    }

    // ---- player / movement ------------------------------------------------
    const player = { seg: 0, t: 0, u: 0, yaw: 0, pitch: 0 };
    let bobPhase = 0;

    function currentSeg() {
      return ensureSegment(player.seg);
    }
    function worldPosFor(p) {
      const seg = ensureSegment(p.seg);
      const w = localToWorld(seg, p.u, p.t * seg.length);
      return { x: w.x, z: w.z, y: seg.baseY + seg.rise * p.t, seg };
    }

    function moveBy(dx, dz) {
      // dx,dz: desired world-space delta (already speed*dt scaled).
      const seg = currentSeg();
      const c = Math.cos(seg.heading), s = Math.sin(seg.heading);
      // inverse of localToWorld's rotation: world delta -> local (lx,lz)
      const dlx = c * dx - s * dz;
      const dlz = s * dx + c * dz;
      let u = player.u + dlx;
      let t = player.t + dlz / seg.length;

      const half = seg.width / 2 - PLAYER_R;
      u = Math.max(-half, Math.min(half, u));

      if (t <= 1 && t >= 0) {
        player.t = t;
        player.u = u;
        return;
      }
      if (t < 0 && player.seg === 0) {
        player.t = 0;
        player.u = u;
        return;
      }
      // Crossing into a neighboring segment. u/t are offsets along THIS
      // segment's local axes — at a turn, the neighbor's axes are rotated
      // 90° from these, so naively carrying u/t across (as if axes always
      // stayed aligned) hands the new segment a lateral offset that was
      // actually a forward one, and vice versa: the player would appear to
      // teleport sideways right at the boundary. Instead, resolve the
      // (clamped) local position to world space, then re-localize into the
      // neighbor's own frame — correct regardless of whether it turned.
      const nextIndex = player.seg + (t > 1 ? 1 : -1);
      const nseg = ensureSegment(nextIndex);
      const w = localToWorld(seg, u, t * seg.length);
      const loc = worldToLocal(nseg, w.x, w.z);
      const halfNext = nseg.width / 2 - PLAYER_R;
      player.seg = nextIndex;
      player.u = Math.max(-halfNext, Math.min(halfNext, loc.lx));
      player.t = loc.lz / nseg.length;
    }

    // ---- streaming: keep [seg-BEHIND, seg+AHEAD] instantiated -----------
    function streamSegments() {
      const lo = Math.max(0, player.seg - RENDER_BEHIND);
      const hi = player.seg + RENDER_AHEAD;
      for (let i = lo; i <= hi; i++) {
        if (!segGroups.has(i)) {
          const seg = ensureSegment(i);
          segGroups.set(i, buildSegmentGroup(seg));
        }
      }
      for (const [i, group] of segGroups) {
        if (i < lo || i > hi) {
          disposeGroup(group);
          segGroups.delete(i);
        }
      }
    }

    // ---- raycast target ---------------------------------------------------
    const raycaster = new THREE.Raycaster();
    raycaster.far = 7;
    let currentTarget = null;
    function pickTarget() {
      const pickables = [];
      for (const group of segGroups.values()) pickables.push(...group.userData.pickables);
      raycaster.setFromCamera({ x: 0, y: 0 }, camera);
      const hits = raycaster.intersectObjects(pickables, false);
      const post = hits.length ? hits[0].object.userData.post : null;
      if (post !== currentTarget) {
        currentTarget = post;
        if (Feedwalk.onTarget) Feedwalk.onTarget(post);
      }
    }
    Feedwalk.getTarget = function () {
      return currentTarget;
    };

    // ---- camera update -----------------------------------------------------
    function updateCamera(dt, moving) {
      const w = worldPosFor(player);
      bobPhase += (moving ? dt * 7.5 : dt * 2.2);
      const bob = moving ? Math.sin(bobPhase) * 0.035 : Math.sin(bobPhase) * 0.006;
      camera.position.set(w.x, w.y + EYE_HEIGHT + bob, w.z);
      camera.rotation.set(player.pitch, player.yaw, 0, "YXZ");
      headlamp.position.set(w.x, w.y + EYE_HEIGHT + 0.3, w.z);
    }

    // ---- input --------------------------------------------------------
    const keys = { forward: false, back: false, left: false, right: false, run: false };
    const KEY_MAP = {
      w: "forward", W: "forward", ArrowUp: "forward",
      s: "back", S: "back", ArrowDown: "back",
      a: "left", A: "left", ArrowLeft: "left",
      d: "right", D: "right", ArrowRight: "right",
    };
    let inputEnabled = false;
    Feedwalk.setInputEnabled = function (v) {
      inputEnabled = v;
    };

    window.addEventListener("keydown", (e) => {
      if (!inputEnabled) return;
      if (e.key === "Shift") { keys.run = true; return; }
      const k = KEY_MAP[e.key];
      if (!k) return;
      e.preventDefault();
      keys[k] = true;
    });
    window.addEventListener("keyup", (e) => {
      if (e.key === "Shift") { keys.run = false; return; }
      const k = KEY_MAP[e.key];
      if (k) keys[k] = false;
    });

    canvas.addEventListener("click", () => {
      if (!inputEnabled) return;
      if (document.pointerLockElement !== canvas) canvas.requestPointerLock();
    });
    document.addEventListener("mousemove", (e) => {
      if (document.pointerLockElement !== canvas) return;
      player.yaw -= e.movementX * LOOK_SENS;
      player.pitch -= e.movementY * LOOK_SENS;
      player.pitch = THREE.MathUtils.clamp(player.pitch, -1.2, 1.2);
    });

    let lastTouch = null;
    canvas.addEventListener("touchstart", (e) => {
      if (!inputEnabled) return;
      const t = e.touches[0];
      lastTouch = { x: t.clientX, y: t.clientY };
    }, { passive: true });
    canvas.addEventListener("touchmove", (e) => {
      if (!inputEnabled || !lastTouch) return;
      const t = e.touches[0];
      const dx = t.clientX - lastTouch.x, dy = t.clientY - lastTouch.y;
      player.yaw -= dx * TOUCH_LOOK_SENS;
      player.pitch -= dy * TOUCH_LOOK_SENS;
      player.pitch = THREE.MathUtils.clamp(player.pitch, -1.2, 1.2);
      lastTouch = { x: t.clientX, y: t.clientY };
      e.preventDefault();
    }, { passive: false });
    canvas.addEventListener("touchend", () => { lastTouch = null; });

    Feedwalk.setKey = function (k, v) {
      keys[k] = v;
    };

    // ---- resize -------------------------------------------------------
    function resize() {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      const needed =
        Math.abs(renderer.domElement.width - w * (window.devicePixelRatio || 1)) > 1 ||
        Math.abs(renderer.domElement.height - h * (window.devicePixelRatio || 1)) > 1;
      if (needed) {
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      }
    }
    window.addEventListener("resize", resize);

    // ---- loop -----------------------------------------------------------
    let running = false;
    let rafId = null;
    let lastT = 0;
    function frame(t) {
      if (!running) return;
      const dt = Math.min((t - lastT) / 1000, 0.05) || 0;
      lastT = t;

      let mx = 0, mz = 0;
      const fx = Math.sin(player.yaw), fz = Math.cos(player.yaw);
      const rx = Math.cos(player.yaw), rz = -Math.sin(player.yaw);
      if (keys.forward) { mx -= fx; mz -= fz; }
      if (keys.back) { mx += fx; mz += fz; }
      if (keys.right) { mx += rx; mz += rz; }
      if (keys.left) { mx -= rx; mz -= rz; }
      const len = Math.hypot(mx, mz);
      const moving = len > 0.001;
      if (moving) {
        mx /= len;
        mz /= len;
        const speed = WALK_SPEED * (keys.run ? RUN_MULT : 1) * dt;
        moveBy(mx * speed, mz * speed);
      }

      streamSegments();
      updateCamera(dt, moving);
      pickTarget();
      resize();
      renderer.render(scene, camera);
      rafId = requestAnimationFrame(frame);
    }

    Feedwalk.start = function () {
      if (running) return;
      running = true;
      lastT = performance.now();
      streamSegments();
      updateCamera(0, false);
      resize();
      rafId = requestAnimationFrame(frame);
    };
    Feedwalk.stop = function () {
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
    };
    Feedwalk.reset = function () {
      player.seg = 0;
      player.t = 0;
      player.u = 0;
      player.yaw = 0;
      player.pitch = 0;
      for (const [, group] of segGroups) disposeGroup(group);
      segGroups.clear();
      segments.length = 0;
      lastTurnIndex = -99;
      lastRampIndex = -99;
      nextRoomIndex = ROOM_EVERY;
      streamSegments();
    };
    Feedwalk.progress = function () {
      return { segment: player.seg, lap };
    };

    Feedwalk.ready = true;
    return Feedwalk;
  };

  window.Feedwalk = Feedwalk;
})();
