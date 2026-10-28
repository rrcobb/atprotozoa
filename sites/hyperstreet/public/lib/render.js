// First-person canvas renderer for the Street, plus the input that drives it.
// Draws only sky, road and bare buildings; everything else is a plugin hook
// (see plugins.js). `stereo` renders the scene twice side by side for a
// phone-in-a-cardboard-viewer; head turns come from deviceorientation.

import { L, STREET_HALF, wrap, fnv } from "./world.js";

const CAM_H = 3; // eye height, world units
const FAR = 260; // draw distance; fog hides the cut. Buildings beyond are sub-pixel.
const NEAR = 0.8;
const IPD = 1.0; // eye separation in world units for stereo

export function buildingHeight(e) {
  return e.floors * 3 + Math.min(24, e.posts * 0.6 + e.given * 0.15);
}

export function createRenderer(canvas, world) {
  const g = canvas.getContext("2d");
  const keys = new Set();
  const held = new Set();
  let stereo = false;
  let hits = [];
  let onSelect = () => {};
  let last = performance.now();
  let handleAt = 0;
  let selected = null;
  let gyro = null;

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = canvas.getBoundingClientRect();
    canvas.width = Math.max(2, Math.floor(r.width * dpr));
    canvas.height = Math.max(2, Math.floor(r.height * dpr));
  }

  // ---- input ----
  const down = (e) => {
    if (/^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName)) return;
    const k = e.key.toLowerCase();
    if ("wasdqe".includes(k) && k.length === 1 || k.startsWith("arrow")) { keys.add(k); world.me.auto = false; e.preventDefault(); }
  };
  const up = (e) => keys.delete(e.key.toLowerCase());
  window.addEventListener("keydown", down);
  window.addEventListener("keyup", up);

  let drag = null;
  canvas.addEventListener("pointerdown", (e) => {
    drag = { x: e.clientX, yaw: world.me.yaw, moved: false, id: e.pointerId };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    if (Math.abs(dx) > 4) drag.moved = true;
    if (drag.moved) { world.me.auto = false; world.me.yaw = drag.yaw - dx * 0.006; }
  });
  canvas.addEventListener("pointerup", (e) => {
    if (drag && !drag.moved) pick(e);
    drag = null;
  });

  function pick(e) {
    const r = canvas.getBoundingClientRect();
    const sx = ((e.clientX - r.left) / r.width) * canvas.width;
    const sy = ((e.clientY - r.top) / r.height) * canvas.height;
    // hits are in draw order far→near, so the last containing one is frontmost
    for (let i = hits.length - 1; i >= 0; i--) {
      const h = hits[i];
      if (sx >= h.x && sx <= h.x + h.w && sy >= h.y && sy <= h.y + h.h) {
        selected = h.e;
        onSelect(h.e);
        return;
      }
    }
    selected = null;
    onSelect(null);
  }

  function onOrient(ev) {
    if (ev.alpha == null) return;
    if (!gyro) gyro = { a0: ev.alpha, yaw0: world.me.yaw };
    world.me.auto = false;
    world.me.yaw = gyro.yaw0 - ((ev.alpha - gyro.a0) * Math.PI) / 180;
  }

  // ---- camera ----
  function step(dt, now) {
    const me = world.me;
    if (me.auto) {
      me.x = (me.x + 14 * dt) % L;
      me.y = Math.sin(now / 4000) * 5;
      me.yaw = Math.sin(now / 7000) * 0.35;
    } else {
      const fwd = (keys.has("w") || keys.has("arrowup") || held.has("fwd") ? 1 : 0) - (keys.has("s") || keys.has("arrowdown") || held.has("back") ? 1 : 0);
      const turn = (keys.has("d") || keys.has("arrowright") || held.has("right") ? 1 : 0) - (keys.has("a") || keys.has("arrowleft") || held.has("left") ? 1 : 0);
      const strafe = (keys.has("e") ? 1 : 0) - (keys.has("q") ? 1 : 0);
      me.yaw += turn * 1.8 * dt;
      const v = 22 * dt;
      me.x = (((me.x + Math.cos(me.yaw) * fwd * v + Math.sin(me.yaw) * strafe * v) % L) + L) % L;
      me.y += Math.sin(me.yaw) * fwd * v - Math.cos(me.yaw) * strafe * v;
      // stay near the road; past this you're inside the buildings
      me.y = Math.max(-STREET_HALF - 2, Math.min(STREET_HALF + 2, me.y));
    }
    for (const e of world.ents.values()) if (e.flash > 0) e.flash = Math.max(0, e.flash - dt * 1.2);
  }

  // ---- drawing ----
  function drawScene(vp, now, dt) {
    const { x0, w, h, eye } = vp;
    const me = world.me;
    const cos = Math.cos(me.yaw), sin = Math.sin(me.yaw);
    // right vector is (sin, -cos); shift the camera for this eye
    const cam = { x: me.x + sin * eye * IPD * 0.5, y: me.y - cos * eye * IPD * 0.5 };
    const cx = x0 + w / 2;
    const horizon = h * 0.46;
    const f = Math.min(w, h * 1.4) * 0.9;

    // world → camera space: z forward, r right
    const toCam = (wx, wy) => {
      const dx = wrap(wx - cam.x), dy = wy - cam.y;
      return { z: dx * cos + dy * sin, r: dx * sin - dy * cos };
    };
    const proj = (z, r, hgt) => {
      const k = f / z;
      return { sx: cx + r * k, sy: horizon + (CAM_H - hgt) * k, k, z };
    };
    const project = (wx, wy, hgt = 0) => {
      const c = toCam(wx, wy);
      return c.z < NEAR ? null : proj(c.z, c.r, hgt);
    };
    const view = {
      g, now, dt, w, h, project, eye,
      entXY: (e) => ({ x: e.x, y: e.side * (STREET_HALF + e.off) }),
      entTop: (e) => project(e.x, e.side * (STREET_HALF + e.off), buildingHeight(e)),
    };

    g.save();
    g.beginPath();
    g.rect(x0, 0, w, h);
    g.clip();

    // sky + ground
    let grad = g.createLinearGradient(0, 0, 0, horizon);
    grad.addColorStop(0, "#05030d");
    grad.addColorStop(1, "#2a0b3d");
    g.fillStyle = grad;
    g.fillRect(x0, 0, w, horizon);
    grad = g.createLinearGradient(0, horizon, 0, h);
    grad.addColorStop(0, "#1a0626");
    grad.addColorStop(1, "#050208");
    g.fillStyle = grad;
    g.fillRect(x0, horizon, w, h - horizon);
    // a fixed star field that slides with yaw
    g.fillStyle = "rgba(255,255,255,0.7)";
    for (let i = 0; i < 70; i++) {
      const a = fnv("star" + i);
      const ang = ((a % 6283) / 1000) - me.yaw * 1.0;
      const sx = cx + (((ang + 9.42) % 6.283) - 3.14) * f * 0.6;
      const sy = ((a >>> 12) % 1000) / 1000 * horizon * 0.85;
      g.fillRect(sx, sy, 1.5, 1.5);
    }

    // road grid, clipped to the near plane
    const seg = (ax, ay, bx, by) => {
      let a = toCam(ax, ay), b = toCam(bx, by);
      if (a.z < NEAR && b.z < NEAR) return;
      if (a.z < NEAR) { const t = (NEAR - a.z) / (b.z - a.z); a = { z: NEAR, r: a.r + (b.r - a.r) * t }; }
      if (b.z < NEAR) { const t = (NEAR - b.z) / (a.z - b.z); b = { z: NEAR, r: b.r + (a.r - b.r) * t }; }
      const p = proj(a.z, a.r, 0), q = proj(b.z, b.r, 0);
      g.beginPath();
      g.moveTo(p.sx, p.sy);
      g.lineTo(q.sx, q.sy);
      g.stroke();
    };
    g.lineWidth = 1;
    g.strokeStyle = "rgba(255,60,200,0.35)";
    for (const y of [-STREET_HALF, 0, STREET_HALF]) seg(cam.x - 240, y, cam.x + 240, y);
    g.strokeStyle = "rgba(60,220,255,0.22)";
    for (const y of [-STREET_HALF / 2, STREET_HALF / 2]) seg(cam.x - 240, y, cam.x + 240, y);
    g.strokeStyle = "rgba(255,60,200,0.2)";
    const base = Math.floor(cam.x / 12) * 12;
    for (let i = -20; i <= 20; i++) seg(base + i * 12, -STREET_HALF, base + i * 12, STREET_HALF);

    // buildings, far to near
    const vis = [];
    for (const e of world.ents.values()) {
      const ey = e.side * (STREET_HALF + e.off);
      const c = toCam(e.x, ey);
      if (c.z < NEAR || c.z > FAR) continue;
      const k = f / c.z;
      const sx = cx + c.r * k;
      if (sx + e.w * k < x0 || sx - e.w * k > x0 + w) continue;
      vis.push({ e, c, k, sx });
    }
    vis.sort((a, b) => b.c.z - a.c.z);

    const active = vis.slice(-PROFILE_WANT);
    if (eye <= 0 && now - handleAt > 1500) {
      handleAt = now;
      world.flushHandles(active.map((v) => v.e).reverse());
    }

    if (eye <= 0) hits = [];
    for (const { e, c, k, sx } of vis) {
      const H = buildingHeight(e);
      const baseY = horizon + CAM_H * k;
      const topY = horizon + (CAM_H - H) * k;
      const pw = e.w * k;
      const fog = Math.max(0, 1 - c.z / FAR);
      const box = { cx: sx, base: baseY, top: topY, h: baseY - topY, w: pw, k, z: c.z, fog };
      const fillGrad = g.createLinearGradient(0, topY, 0, baseY);
      fillGrad.addColorStop(0, `hsla(${e.hue},50%,14%,${0.55 + fog * 0.4})`);
      fillGrad.addColorStop(1, `hsla(${e.hue},60%,5%,${0.7 + fog * 0.3})`);
      g.fillStyle = fillGrad;
      g.fillRect(sx - pw / 2, topY, pw, baseY - topY);
      g.strokeStyle = `hsla(${e.hue},90%,${e === selected ? 85 : 58}%,${0.25 + fog * 0.7})`;
      g.lineWidth = e === selected ? 2.5 : 1;
      g.strokeRect(sx - pw / 2, topY, pw, baseY - topY);
      // lit windows
      if (pw > 14) {
        e.bits ??= fnv(e.did + "w");
        const rows = e.floors * 2;
        g.fillStyle = `hsla(${(e.hue + 40) % 360},100%,72%,${0.2 + fog * 0.6})`;
        for (let i = 0; i < rows; i++) {
          for (let j = 0; j < 3; j++) {
            if ((e.bits >>> ((i * 3 + j + i) % 32)) & 1) continue;
            g.fillRect(sx - pw / 2 + pw * (0.12 + j * 0.3), topY + (box.h * (i + 0.3)) / rows, pw * 0.18, (box.h / rows) * 0.45);
          }
        }
      }
      // name plate
      if (k > 3.2) {
        g.font = `${Math.min(15, 8 + k * 0.12)}px "JetBrains Mono", ui-monospace, monospace`;
        g.textAlign = "center";
        g.fillStyle = `hsla(${e.hue},100%,85%,${Math.min(1, fog + 0.3)})`;
        g.fillText(world.label(e).slice(0, 26), sx, baseY + Math.min(18, 8 + k * 0.1));
      }
      for (const p of world.plugins.values()) {
        if (!p.enabled || !p.drawEnt) continue;
        try { g.save(); p.drawEnt(g, view, e, box); g.restore(); } catch (err) { g.restore(); world.fail(p, err); }
      }
      if (eye <= 0) hits.push({ e, x: sx - pw / 2, y: topY, w: pw, h: baseY - topY });
    }
    for (const p of world.plugins.values()) {
      if (!p.enabled || !p.drawOverlay) continue;
      try { g.save(); p.drawOverlay(g, view, world); g.restore(); } catch (err) { g.restore(); world.fail(p, err); }
    }

    // HUD
    g.font = `${Math.max(11, h * 0.022)}px "JetBrains Mono", ui-monospace, monospace`;
    g.textAlign = "left";
    g.fillStyle = "rgba(255,220,255,0.85)";
    const hud = `${world.status} · ${world.rate().toFixed(0)} ev/s · ${world.ents.size} bldgs · x ${me.x.toFixed(0)}${me.auto ? " · cruising" : ""}`;
    g.fillText(hud, x0 + 10, 20);
    if (!world.ents.size) {
      g.textAlign = "center";
      g.fillStyle = "rgba(255,255,255,0.7)";
      g.fillText("the Street is empty until the firehose delivers somebody…", cx, horizon + 40);
    }
    g.restore();
  }

  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    step(dt, now);
    const W = canvas.width, H = canvas.height;
    g.fillStyle = "#000";
    g.fillRect(0, 0, W, H);
    if (stereo) {
      drawScene({ x0: 0, w: W / 2, h: H, eye: -1 }, Date.now(), dt);
      drawScene({ x0: W / 2, w: W / 2, h: H, eye: 1 }, Date.now(), dt);
      g.fillStyle = "#000";
      g.fillRect(W / 2 - 1, 0, 2, H);
    } else {
      drawScene({ x0: 0, w: W, h: H, eye: 0 }, Date.now(), dt);
    }
    requestAnimationFrame(frame);
  }

  return {
    start() {
      resize();
      window.addEventListener("resize", resize);
      requestAnimationFrame(frame);
    },
    press(name, on) { on ? (held.add(name), (world.me.auto = false)) : held.delete(name); },
    onSelect(fn) { onSelect = fn; },
    select(e) { selected = e; },
    async setStereo(on) {
      stereo = on;
      gyro = null;
      if (on) {
        try {
          if (typeof DeviceOrientationEvent !== "undefined" && DeviceOrientationEvent.requestPermission) {
            if ((await DeviceOrientationEvent.requestPermission()) !== "granted") return;
          }
          window.addEventListener("deviceorientation", onOrient);
        } catch (err) {}
      } else {
        window.removeEventListener("deviceorientation", onOrient);
      }
    },
    get stereo() { return stereo; },
  };
}

// Handles are looked up for the nearest buildings on screen first; the API
// takes 25 actors per call.
const PROFILE_WANT = 25;
